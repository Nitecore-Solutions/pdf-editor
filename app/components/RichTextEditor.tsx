'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { TextElement, TextRun } from '../types/editor';
import {
  applyStyleToRange,
  baseStyleOf,
  compactIfUniform,
  domOffset,
  getRuns,
  normalizeRuns,
  readRunsFromDom,
  runsToHtml,
  setDomSelection,
  uniformStyleInRange,
} from '../lib/richText';
import {
  SelectionFormatter,
  clearActiveTextSelection,
  setActiveTextSelection,
} from '../lib/textSelection';
import { DEVANAGARI_FONT_STACK } from '../lib/devanagari';

const DEVANAGARI_FALLBACK = DEVANAGARI_FONT_STACK;

interface RichTextEditorProps {
  element: TextElement;
  isSelected: boolean;
  zoom: number;
  onChange: (id: string, updates: Partial<TextElement>) => void;
  onFocusSelect: (id: string) => void;
  onEmptyBlur: (id: string) => void;
}

type StylePatch = Partial<Omit<TextRun, 'text'>>;

const UNSYNCED = '\u0000unsynced';

function runsSignature(runs: StylePatch[]): string {
  return runs
    .map(
      (r) =>
        `${(r as TextRun).text}\u0001${r.isBold ? 1 : 0}${r.isItalic ? 1 : 0}${
          r.isUnderline ? 1 : 0
        }\u0001${r.color || ''}`
    )
    .join('\u0002');
}

/**
 * A text element's editing surface.
 *
 * Intentionally an *uncontrolled* contentEditable: React renders no children, so
 * it never fights the browser over the DOM (which is what was resetting the
 * caret and mangling selections on every render). Model -> DOM sync happens only
 * when the model genuinely diverges from what the DOM already shows, tracked by
 * a signature of the runs. That is what makes it possible to select the whole
 * line, then narrow down to a single word inside it and format just that word.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  element,
  isSelected,
  zoom,
  onChange,
  onFocusSelect,
  onEmptyBlur,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const lastSignature = useRef<string>(UNSYNCED);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const hasFocused = useRef(false);
  const formatRef = useRef<SelectionFormatter>(() => false);

  const base = useMemo(() => baseStyleOf(element), [element]);
  const runs = useMemo(() => getRuns(element), [element]);
  const sig = useMemo(() => runsSignature(runs), [runs]);

  const isDevanagari = /[\u0900-\u097F]/.test(element.text || '');

  const fontFamily = useMemo(() => {
    // Any line containing Devanagari is rendered with the Devanagari stack,
    // regardless of what family the PDF reported.
    //
    // The previous version only swapped when the PDF's family looked like a
    // Devanagari face. That missed the common case entirely: legacy Hindi PDFs
    // report "Times New Roman" or "Arial" for their Devanagari runs, so a
    // serif face with no Devanagari coverage was used. The browser then fell
    // back glyph by glyph, and the pre-base matra was drawn detached from its
    // consonant - "लिए" rendered as "हिए".
    //
    // The stack ends in Latin families, so the English words on the same line
    // are still handled.
    if (isDevanagari) return DEVANAGARI_FONT_STACK;
    if (element.fontFamily) return element.fontFamily;
    return 'Arial, Helvetica, sans-serif';
  }, [element.fontFamily, isDevanagari]);

  // ---- model -> DOM -------------------------------------------------------
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (sig === lastSignature.current) return;

    lastSignature.current = sig;
    node.innerHTML = runsToHtml(runs, base);

    const pending = pendingSelection.current;
    if (pending) {
      pendingSelection.current = null;
      setDomSelection(node, pending.start, pending.end);
    }
  }, [sig, runs, base]);

  // ---- caret placement when the element becomes selected -------------------
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (!isSelected) {
      hasFocused.current = false;
      return;
    }
    if (hasFocused.current || document.activeElement === node) {
      hasFocused.current = true;
      return;
    }
    hasFocused.current = true;
    node.focus({ preventScroll: true });
    const len = node.textContent?.length || 0;
    setDomSelection(node, len, len);
  }, [isSelected]);

  // Keep the latest publishSelection reachable from the focus handler without
  // re-creating the callback on every render.
  const publishSelectionRef = useRef<() => void>(() => {});

  useEffect(() => () => clearActiveTextSelection(element.id), [element.id]);

  // ---- selection plumbing -------------------------------------------------
  const readSelectionRange = useCallback((): { start: number; end: number } | null => {
    const node = nodeRef.current;
    if (!node) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!node.contains(range.startContainer) || !node.contains(range.endContainer)) return null;
    return {
      start: domOffset(node, range.startContainer, range.startOffset),
      end: domOffset(node, range.endContainer, range.endOffset),
    };
  }, []);

  const publishSelection = useCallback(() => {
    const node = nodeRef.current;
    if (!node || document.activeElement !== node) return;
    const range = readSelectionRange();
    if (!range) return;
    setActiveTextSelection(
      {
        elementId: element.id,
        start: range.start,
        end: range.end,
        isCollapsed: range.start === range.end,
        style: uniformStyleInRange(getRuns(element), range.start, range.end),
      },
      formatRef.current
    );
  }, [element, readSelectionRange]);

  useEffect(() => {
    publishSelectionRef.current = publishSelection;
  }, [publishSelection]);

  // Clicking back into a box that is still selected but has lost focus (a stray
  // click outside, a tab switch, a toolbar click that slipped through) must
  // restore the caret. Without this the box keeps its selection outline and the
  // Move handle but cannot be typed into, and the only way out is to delete the
  // element and recreate it.
  const handleRefocus = useCallback(() => {
    const node = nodeRef.current;
    if (!node || document.activeElement === node) return;
    node.focus({ preventScroll: true });
    // The browser places the caret from the mousedown offset, so it is left
    // alone. Only force a position when the selection ended up outside this box.
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !node.contains(sel.anchorNode)) {
      const len = node.textContent?.length || 0;
      setDomSelection(node, len, len);
    }
    publishSelectionRef.current();
  }, []);

  // ---- DOM -> model -------------------------------------------------------
  const commitFromDom = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    const elementBase = baseStyleOf(element);
    const next = normalizeRuns(readRunsFromDom(node, elementBase));
    // Record what we just read so the sync effect sees the DOM as already
    // current and leaves the caret where the user put it.
    lastSignature.current = runsSignature(next);
    const compacted = compactIfUniform(next, elementBase);
    onChange(element.id, { text: compacted.text, runs: compacted.runs });
  }, [element, onChange]);

  /**
   * Apply a character style to the live selection.
   * Returns false when there is no non-collapsed selection inside this box, so
   * callers can fall back to element-wide formatting.
   */
  const applyFormat: SelectionFormatter = useCallback(
    (patch) => {
      const range = readSelectionRange();
      if (!range || range.start === range.end) return false;

      const elementBase = baseStyleOf(element);
      const next = normalizeRuns(
        applyStyleToRange(getRuns(element), range.start, range.end, patch)
      );
      const compacted = compactIfUniform(next, elementBase);

      // Hand the range to the sync effect so it rewrites the spans and then
      // re-establishes the same selection.
      pendingSelection.current = { start: range.start, end: range.end };
      onChange(element.id, { text: compacted.text, runs: compacted.runs });
      return true;
    },
    [element, onChange, readSelectionRange]
  );
  // Keep the ref pointing at the latest `applyFormat` so the bridge registered
  // with the Toolbar never calls a stale closure. Done in an effect rather than
  // during render to stay within the React Compiler's rules; DOM events can only
  // fire after commit, so the ref is current by the time it is ever read.
  useEffect(() => {
    formatRef.current = applyFormat;
  }, [applyFormat]);

  // ---- events -------------------------------------------------------------
  const handleInput = useCallback(() => {
    commitFromDom();
    publishSelection();
  }, [commitFromDom, publishSelection]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      // Always paste plain text: pasted rich HTML would inject styles the model
      // does not know about.
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      const node = nodeRef.current;
      const sel = window.getSelection();
      if (!text || !node || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!node.contains(range.startContainer)) return;
      range.deleteContents();
      const inserted = document.createTextNode(text.replace(/\r\n?/g, '\n'));
      range.insertNode(inserted);
      range.setStartAfter(inserted);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      commitFromDom();
      publishSelection();
    },
    [commitFromDom, publishSelection]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      const isBoldKey = e.key === 'b' || e.key === 'B';
      const isItalicKey = e.key === 'i' || e.key === 'I';

      // Intercept the browser's native bold/italic so formatting flows through
      // the run model instead of injecting <b>/<i> tags we would have to parse.
      if (mod && !e.altKey && (isBoldKey || isItalicKey)) {
        e.preventDefault();
        const range = readSelectionRange();
        if (!range || range.start === range.end) return;
        const field = isBoldKey ? 'isBold' : 'isItalic';
        const current = uniformStyleInRange(getRuns(element), range.start, range.end);
        applyFormat({ [field]: !current?.[field] } as StylePatch);
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const node = nodeRef.current;
        const sel = window.getSelection();
        if (!node || !sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!node.contains(range.startContainer)) return;
        range.deleteContents();
        // Insert a literal newline rather than letting the browser create a
        // <div>/<br>, keeping the DOM flat (spans + text nodes only) so that
        // readRunsFromDom stays a simple tree walk.
        const newline = document.createTextNode('\n');
        range.insertNode(newline);
        range.setStartAfter(newline);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        commitFromDom();
        publishSelection();
        return;
      }

      if (e.key === 'Tab') {
        // Keep Tab from escaping the text box mid-edit.
        e.preventDefault();
      }
    },
    [applyFormat, commitFromDom, element, publishSelection, readSelectionRange]
  );

  return (
    <>
      {/* Intrinsic-width probe. Absolutely positioned, so it never paints and
          never intercepts clicks, but it gives the surrounding box a real
          max-content width to size itself against. Without it the box would
          collapse to the element's stored width and long text would wrap
          mid-word. */}
      <span
        aria-hidden
        className="absolute invisible whitespace-pre pointer-events-none"
        style={{
          fontSize: `${(element.fontSize || 14) * zoom}px`,
          fontWeight: base.isBold ? 700 : 400,
          fontStyle: base.isItalic ? 'italic' : 'normal',
          fontFamily,
          lineHeight: 1.2,
        }}
      >
        {element.text || ' '}
      </span>

      <div
        ref={nodeRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onKeyUp={publishSelection}
        onMouseUp={publishSelection}
        onMouseDown={handleRefocus}
        onFocus={() => {
          onFocusSelect(element.id);
          publishSelection();
        }}
        onBlur={(e) => {
          // Losing focus must clear the flag, otherwise a box that is still
          // selected can never be re-focused by the effect above and the only
          // way out is to delete the element and recreate it.
          hasFocused.current = false;
          if (!e.currentTarget.textContent?.trim()) onEmptyBlur(element.id);
          clearActiveTextSelection(element.id);
        }}
        className="outline-none bg-transparent border-none p-0 m-0 cursor-text select-text"
        style={{
          fontSize: `${(element.fontSize || 14) * zoom}px`,
          color: base.color,
          fontWeight: base.isBold ? 700 : 400,
          fontStyle: base.isItalic ? 'italic' : 'normal',
          textDecoration: base.isUnderline ? 'underline' : 'none',
          textAlign: element.align || 'left',
          fontFamily,
          // Capped deliberately. On these documents the baseline-to-baseline
          // spacing is only ~1.33em, so anything above that makes the rendered
          // line taller than the gap to its neighbour and consecutive lines
          // overlap. Devanagari glyphs occupy roughly 0.8em including the top
          // matras (े ै ो ौ) and the bottom ones (ु ू ृ), so 1.3 still contains
          // them comfortably - extra leading was never what the matras needed,
          // letter-spacing was the actual problem.
          lineHeight: isDevanagari ? 1.3 : 1.2,
          // Deliberately 'normal'. A previous version applied letterSpacing to
          // Devanagari, which inserts space between every codepoint pair -
          // including between a base consonant and its zero-width matra. That
          // detaches every matra from its base and is what made the edited
          // Hindi look scattered. The font's own metrics are correct as-is.
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          fontKerning: 'normal',
          fontVariantLigatures: 'common-ligatures',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          width: '100%',
          minWidth: '30px',
          padding: '0 1px',
        }}
      />
    </>
  );
};

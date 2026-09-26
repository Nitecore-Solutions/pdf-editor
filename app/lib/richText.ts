import { TextElement, TextRun } from '../types/editor';

/**
 * Rich-text run model for text elements.
 *
 * A TextElement is either "flat" (no `runs`, the base isBold/isItalic/... apply
 * to every character) or "rich" (a list of runs, each overriding the base).
 * Every helper here accepts both shapes so callers never have to branch.
 */

export interface BaseStyle {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  color: string;
}

/**
 * Colours reach us from three directions (model hex, CSS `rgb()`, pdf-lib), so
 * everything is funnelled through here. Without this a stored `#FF0000` and a
 * computed `#ff0000` would look like different styles and the contenteditable
 * would re-sync (and drop the caret) on every keystroke.
 */
export function normalizeHexColor(value: string | undefined | null, fallback = '#000000'): string {
  if (!value) return fallback;
  let v = String(value).trim().toLowerCase();
  if (v === 'transparent') return fallback;
  if (v.startsWith('#')) {
    if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return /^#[0-9a-f]{6}$/.test(v) ? v : fallback;
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
      const to255 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      v = '#' + to255(parts[0]) + to255(parts[1]) + to255(parts[2]);
      return v;
    }
  }
  return fallback;
}

export function baseStyleOf(el: TextElement): BaseStyle {
  return {
    isBold: !!el.isBold,
    isItalic: !!el.isItalic,
    isUnderline: !!el.isUnderline,
    color: normalizeHexColor(el.color),
  };
}

/** Normalised runs with absolute styles resolved against the element base. */
export function getRuns(el: TextElement): TextRun[] {
  if (el.runs && el.runs.length > 0) {
    return el.runs.map((r) => ({
      text: r.text,
      isBold: !!r.isBold,
      isItalic: !!r.isItalic,
      isUnderline: !!r.isUnderline,
      color: normalizeHexColor(r.color, normalizeHexColor(el.color)),
    }));
  }
  if (!el.text) return [];
  const base = baseStyleOf(el);
  return [{ text: el.text, ...base }];
}

export function runsToText(runs: TextRun[]): string {
  let out = '';
  for (const r of runs) out += r.text;
  return out;
}

function sameStyle(a: TextRun, b: TextRun): boolean {
  return (
    !!a.isBold === !!b.isBold &&
    !!a.isItalic === !!b.isItalic &&
    !!a.isUnderline === !!b.isUnderline &&
    (a.color || '') === (b.color || '')
  );
}

/** Drop empty runs and merge neighbours that ended up identically styled. */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) {
      out[out.length - 1] = { ...last, text: last.text + r.text };
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Split runs so that no run straddles a newline; returns one run list per line. */
export function splitRunsIntoLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const r of runs) {
    const pieces = r.text.split('\n');
    pieces.forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push({ ...r, text: piece });
    });
  }
  return lines.length ? lines : [[]];
}

export function totalLength(runs: TextRun[]): number {
  return runsToText(runs).length;
}

/**
 * Apply a style patch to the character range [start, end).
 * Runs are split at the range boundaries so the patch lands on exactly the
 * selected characters, then neighbours are re-merged.
 */
export function applyStyleToRange(
  runs: TextRun[],
  start: number,
  end: number,
  patch: Partial<Omit<TextRun, 'text'>>
): TextRun[] {
  const s = Math.max(0, Math.min(start, end));
  const e = Math.min(totalLength(runs), Math.max(start, end));
  if (s >= e) return runs;

  const out: TextRun[] = [];
  let pos = 0;
  for (const r of runs) {
    const rs = pos;
    const re = pos + r.text.length;
    pos = re;

    if (re <= s || rs >= e) {
      out.push({ ...r });
      continue;
    }
    if (rs < s) out.push({ ...r, text: r.text.slice(0, s - rs) });
    const a = Math.max(0, s - rs);
    const b = Math.min(r.text.length, e - rs);
    out.push({ ...r, ...patch, text: r.text.slice(a, b) });
    if (re > e) out.push({ ...r, text: r.text.slice(b) });
  }
  return normalizeRuns(out);
}

/** Apply a style patch to every character of the element. */
export function applyStyleToAll(runs: TextRun[], patch: Partial<Omit<TextRun, 'text'>>): TextRun[] {
  return normalizeRuns(runs.map((r) => ({ ...r, ...patch })));
}

/** Style of the character at `index` — used to drive toolbar active states. */
export function styleAt(runs: TextRun[], index: number): TextRun | null {
  let pos = 0;
  for (const r of runs) {
    if (index < pos + r.text.length) return r;
    pos += r.text.length;
  }
  return runs.length ? runs[runs.length - 1] : null;
}

/**
 * Style that is uniform across [start, end), or null when the range is mixed.
 * A mixed range is what makes the toolbar show the bold button as inactive.
 */
export function uniformStyleInRange(
  runs: TextRun[],
  start: number,
  end: number
): TextRun | null {
  const s = Math.max(0, Math.min(start, end));
  const e = Math.max(start, end);
  if (e <= s) return styleAt(runs, s);
  let first: TextRun | null = null;
  let pos = 0;
  for (const r of runs) {
    const rs = pos;
    const re = pos + r.text.length;
    pos = re;
    if (re <= s || rs >= e) continue;
    if (!first) {
      first = r;
    } else if (!sameStyle(first, r)) {
      return null;
    }
  }
  return first;
}

// ---------------------------------------------------------------------------
// DOM <-> runs
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssColorToHex(value: string): string {
  if (!value) return '#000000';
  const v = value.trim();
  if (v.startsWith('#')) {
    if (v.length === 4) {
      return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    }
    return v.toLowerCase();
  }
  const m = v.match(/rgba?\(([^)]+)\)/i);
  if (!m) return '#000000';
  const parts = m[1].split(',').map((p) => parseFloat(p));
  const to255 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return ('#' + to255(parts[0]) + to255(parts[1]) + to255(parts[2])).toLowerCase();
}

/** Only emit fields that differ from the element base, to keep runs minimal. */
function runToSpan(r: TextRun, base: BaseStyle): string {
  const isBold = !!r.isBold;
  const isItalic = !!r.isItalic;
  const isUnderline = !!r.isUnderline;
  const color = r.color || base.color;
  if (isBold === base.isBold && isItalic === base.isItalic && isUnderline === base.isUnderline && color === base.color) {
    return escapeHtml(r.text);
  }
  const style = [
    isBold !== base.isBold ? `font-weight:${isBold ? 700 : 400}` : '',
    isItalic !== base.isItalic ? `font-style:${isItalic ? 'italic' : 'normal'}` : '',
    isUnderline !== base.isUnderline ? `text-decoration:${isUnderline ? 'underline' : 'none'}` : '',
    color !== base.color ? `color:${color}` : '',
  ]
    .filter(Boolean)
    .join(';');
  return `<span style="${style}">${escapeHtml(r.text)}</span>`;
}

/** Serialise runs into contenteditable-safe HTML. */
export function runsToHtml(runs: TextRun[], base: BaseStyle): string {
  return runs.map((r) => runToSpan(r, base)).join('');
}

function styleOfNode(node: Node, base: BaseStyle): TextRun {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (!el) return { text: '', ...base };
  const cs = window.getComputedStyle(el);
  const color = cssColorToHex(cs.color);
  return {
    text: '',
    isBold: parseInt(cs.fontWeight, 10) >= 600,
    isItalic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
    isUnderline: (cs.textDecorationLine || '').includes('underline') || (cs.textDecoration || '').includes('underline'),
    color,
  };
}

function isBlockElement(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = (node as HTMLElement).tagName;
  return tag === 'DIV' || tag === 'P';
}

/**
 * Read the contenteditable subtree back into runs.
 *
 * The DOM is deliberately kept flat (spans + text nodes, newlines inserted as a
 * literal "\n" text node) so this stays a simple tree walk. Browsers can still
 * drop in a <div>/<br> on their own, so both are handled defensively.
 */
export function readRunsFromDom(root: HTMLElement, base: BaseStyle): TextRun[] {
  const out: TextRun[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push({ ...styleOfNode(node, base), text: node.nodeValue || '' });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      out.push({ text: '\n' });
      return;
    }
    if (isBlockElement(el) && el.parentElement === root && out.length > 0) {
      out.push({ text: '\n' });
    }
    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);

  // A block wrapper's own trailing newline is an artefact of the browser, not
  // something the user typed, so trim it back off.
  while (out.length && out[out.length - 1].text === '\n' && !runsToText(out).slice(0, -1).length) {
    out.pop();
  }
  return normalizeRuns(out);
}

/** Character offset of a DOM position, relative to `root`'s text content. */
export function domOffset(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(container, offset);
  return range.toString().length;
}

/** Restore a character range as the current selection inside `root`. */
export function setDomSelection(root: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;

  /** Find the text node + offset for a character index within `root`. */
  const locate = (target: number): { node: Node; offset: number } | null => {
    let pos = 0;
    const scan = (node: Node): { node: Node; offset: number } | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.nodeValue?.length || 0;
        if (target <= pos + len) return { node, offset: Math.max(0, target - pos) };
        pos += len;
        return null;
      }
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
        const parent = node.parentNode;
        if (target <= pos) {
          return { node: parent || node, offset: parent ? Array.prototype.indexOf.call(parent.childNodes, node) : 0 };
        }
        pos += 1;
        return null;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        const hit = scan(node.childNodes[i]);
        if (hit) return hit;
      }
      return null;
    };
    return scan(root);
  };

  const a = locate(start);
  const b = locate(end);
  const startPos = a ?? { node: root as Node, offset: 0 };
  const endPos = b ?? { node: root as Node, offset: root.childNodes.length };

  try {
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {
    /* selection could not be restored; harmless */
  }
}

/**
 * If every run carries the same style, the element can drop `runs` entirely and
 * fall back to being flat. Keeps simple documents simple.
 */
export function compactIfUniform(
  runs: TextRun[],
  base: BaseStyle
): { text: string; runs?: TextRun[] } {
  const normalized = normalizeRuns(runs);
  if (normalized.length === 0) return { text: '' };
  if (normalized.length === 1) {
    const only = normalized[0];
    if (
      !!only.isBold === base.isBold &&
      !!only.isItalic === base.isItalic &&
      !!only.isUnderline === base.isUnderline &&
      (only.color || base.color) === base.color
    ) {
      return { text: only.text };
    }
  }
  return { text: runsToText(normalized), runs: normalized };
}

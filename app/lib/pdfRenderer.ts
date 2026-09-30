// Robust client-side PDF.js loader with isolated offscreen canvas rendering
import { resolveFontStyles, ResolvedFontStyle } from './fontStyles';
import {
  DEVANAGARI_RANGE,
  findDevanagariIssues,
  isLatinBearing,
  isOrphanMatraToken,
  repairDevanagari,
} from './devanagari';
import { applyMisreadings } from './hindiRepair';
import type { TextRun } from '../types/editor';

let pdfjsLibInstance: any = null;

let cachedDocBytes: Uint8Array | null = null;
let cachedDocPromise: Promise<any> | null = null;

export async function getPdfjsLib() {
  if (typeof window === 'undefined') return null;
  
  if (!pdfjsLibInstance) {
    const pdfjs = await import('pdfjs-dist');
    // Set worker source
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
    pdfjsLibInstance = pdfjs;
  }
  return pdfjsLibInstance;
}

async function getPdfDocument(pdfBytes: Uint8Array) {
  const pdfjs = await getPdfjsLib();
  if (!pdfjs) throw new Error('PDF.js unavailable');

  if (cachedDocBytes === pdfBytes && cachedDocPromise) {
    return cachedDocPromise;
  }

  cachedDocBytes = pdfBytes;
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes.slice(0),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  });

  cachedDocPromise = loadingTask.promise;
  return cachedDocPromise;
}

export interface RenderPageOptions {
  pdfBytes: Uint8Array;
  originalPageIndex: number;
  canvas: HTMLCanvasElement;
  scale: number;
  rotation?: number;
}

export async function renderPdfPage({
  pdfBytes,
  originalPageIndex,
  canvas,
  scale = 1.0,
  rotation = 0,
}: RenderPageOptions): Promise<{ width: number; height: number }> {
  const pdfDoc = await getPdfDocument(pdfBytes);
  const page = await pdfDoc.getPage(originalPageIndex + 1); // 1-indexed

  // 1.3333 scale translates 72 pt/in (PDF standard) to standard 96 DPI CSS screen pixels
  const baseScale = 1.3333;
  const totalScale = baseScale * scale;
  const totalRotation = ((page.rotate || 0) + (rotation || 0)) % 360;
  const viewport = page.getViewport({ scale: totalScale, rotation: totalRotation });

  // Ultra-crisp high-DPI rendering: Use supersampling (at least 2.5x - 3x or devicePixelRatio)
  // This completely eliminates any blurriness or pixelation on mobile screens
  const dpr = Math.max(window.devicePixelRatio || 1, 2.5);
  const renderScale = baseScale * Math.max(scale * dpr, 2.0);
  const renderViewport = page.getViewport({ scale: renderScale, rotation: totalRotation });

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = Math.round(renderViewport.width);
  offscreenCanvas.height = Math.round(renderViewport.height);

  const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });
  if (!offscreenCtx) throw new Error('Canvas 2D context not available');

  const renderContext = {
    canvasContext: offscreenCtx,
    viewport: renderViewport,
  };

  await page.render(renderContext).promise;

  // Target DOM canvas: match physical pixel dimensions exactly
  canvas.width = offscreenCanvas.width;
  canvas.height = offscreenCanvas.height;
  // Set CSS size to logical CSS pixels so it displays at correct visual size smoothly
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const targetCtx = canvas.getContext('2d', { alpha: false });
  if (targetCtx) {
    targetCtx.drawImage(offscreenCanvas, 0, 0);
  }

  // Return dimensions in CSS pixels
  return {
    width: viewport.width / scale,
    height: viewport.height / scale,
  };
}

/**
 * Ink extent above and below the baseline, in em.
 *
 * Preferred source is the embedded font program's own hhea/OS-2 metrics. The
 * standard 14 fonts are not embedded and have no program to read, so those fall
 * back to published per-family figures keyed off the same name heuristics used
 * for the family, and finally to the old flat guesses.
 *
 * The result is floored at those guesses and capped: a whiteout that is too
 * short shows the original glyphs through, which is the bug this fixes, whereas
 * a slightly tall one is merely untidy. The cap stops a pathological ascent from
 * producing a box tall enough to cover the line above.
 */
const FALLBACK_ASCENT_LATIN = 0.8;
const FALLBACK_DESCENT_LATIN = 0.28;
const FALLBACK_ASCENT_DEVANAGARI = 0.98;
const FALLBACK_DESCENT_DEVANAGARI = 0.32;

const MAX_ASCENT = 1.2;

const ASCENT_BY_FAMILY: Array<[RegExp, number]> = [
  // Devanagari UI faces carry a very tall ascent - the top matras live up there.
  [/nirmala|mangal|devanagari|utsaah|kokila/, 1.079],
  [/times/, 0.891],
  [/arial|helvetica|liberation/, 0.905],
  [/calibri|carlito/, 0.75],
  [/segoe/, 1.079],
  [/tahoma/, 1.0],
  [/verdana/, 1.008],
  [/trebuchet/, 0.939],
  [/cambria|caladea/, 0.95],
  [/georgia/, 0.917],
  [/garamond/, 0.928],
  [/palatino|book ?antiqua/, 0.925],
  [/courier|consolas|monospace/, 0.833],
];

export function verticalMetricsFor(
  resolved: ResolvedFontStyle | undefined,
  fontNameLower: string,
  isDevanagari: boolean
): { ascentEm: number; descentEm: number } {
  const floorAscent = isDevanagari ? FALLBACK_ASCENT_DEVANAGARI : FALLBACK_ASCENT_LATIN;
  const floorDescent = isDevanagari ? FALLBACK_DESCENT_DEVANAGARI : FALLBACK_DESCENT_LATIN;

  let ascent = resolved?.ascentEm ?? null;
  let descent = resolved?.descentEm ?? null;

  if (ascent == null) {
    const hay = `${fontNameLower} ${resolved?.family || ''} ${resolved?.postScriptName || ''}`;
    for (const [re, value] of ASCENT_BY_FAMILY) {
      if (re.test(hay)) {
        ascent = value;
        if (descent == null) descent = value * 0.25;
        break;
      }
    }
  }

  const ascentEm = Math.min(MAX_ASCENT, Math.max(floorAscent, ascent ?? floorAscent));
  const descentEm = Math.max(floorDescent, descent ?? floorDescent);
  return { ascentEm, descentEm };
}

/**
 * Table detection and per-cell clustering.
 *
 * Rows are clustered by baseline, and every cell in a table row shares a
 * baseline - so a naive "line" is the whole row of the table. "AI", "AI की सहाय"
 * and "Before/After" become one string in one box spanning the full width, the
 * overlay then draws that merged string across the cells, and the text collides
 * with its neighbours. A table is only editable if each cell is kept apart.
 *
 * A divider is found from two facts at once, and both are needed:
 *
 *   1. the gap in front of it is wide. A word space is a fraction of the page; a
 *      column separation is several percent.
 *   2. the item after it starts in the same place on more than one row. This is
 *      what separates a grid from a paragraph, where the gaps are all word-sized,
 *      and from a bulleted list, where the gap between the bullet and its text
 *      *is* in the same place every time - which is why the width test alone is
 *      not enough.
 *
 * The divider is placed at the left edge of the item that follows the wide gap,
 * not in the middle of the gap. A cell's text starts at a fixed inset from the
 * column, so that edge repeats exactly; the middle of the gap moves as the cell
 * above it changes length, which is enough to hide a real table.
 *
 * Anchoring on the left edge is safe here precisely because of the width test: a
 * second word *inside* a cell also sits at a repeating x, but it is never
 * preceded by a wide gap, so it can never be mistaken for a column. That is the
 * combination an earlier attempt was missing.
 *
 * Whitespace-only items are dropped first, because a cell boundary is often
 * written as a real space item, and counting that space as a word gap would hide
 * the very gap being looked for.
 *
 * The geometry is script-agnostic - it runs on positions, before any Devanagari
 * handling - so a bilingual table needs nothing extra.
 */

/** A column separation is at least this much of the page width. */
const MIN_DIVIDER_GAP_PCT = 2.5;
/** Two divider positions within this distance are the same divider. */
const DIVIDER_TOL_PCT = 1.5;
/** A divider must land on at least this many rows. */
const MIN_DIVIDER_ROWS = 2;

/** The text-bearing items of a row, in reading order. */
function rowContent(row: any[]): any[] {
  return row.filter((it) => it.str && it.str.trim()).sort((a, b) => a.xPct - b.xPct);
}

/**
 * Split the rows into per-cell groups, or return null when the page is prose.
 *
 * Cells come back in reading order - each row left to right, rows top to
 * bottom - so ids follow the page.
 */
export function detectTableCells(rows: any[][]): any[][] | null {
  // bucket -> the rows that agree on a divider there, and where they put it.
  const dividerRows = new Map<number, Set<number>>();
  const dividerXs = new Map<number, number[]>();

  rows.forEach((row, rowIndex) => {
    const items = rowContent(row);
    for (let k = 1; k < items.length; k++) {
      const left = items[k - 1];
      const right = items[k];
      const gap = right.xPct - (left.xPct + left.widthPct);
      if (gap < MIN_DIVIDER_GAP_PCT) continue;
      // The right cell's text edge, which repeats from row to row.
      const bucket = Math.round(right.xPct / DIVIDER_TOL_PCT);
      let seen = dividerRows.get(bucket);
      if (!seen) {
        dividerRows.set(bucket, (seen = new Set()));
        dividerXs.set(bucket, []);
      }
      seen.add(rowIndex);
      dividerXs.get(bucket)!.push(right.xPct);
    }
  });

  const dividers = [...dividerRows.entries()]
    .filter(([, seen]) => seen.size >= MIN_DIVIDER_ROWS)
    // The median of the reported edges, not the middle of the bucket: rounding
    // to the bucket would push the divider past the very item it describes, and
    // that item would land back in the cell to its left.
    .map(([bucket]) => {
      const xs = dividerXs.get(bucket)!;
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[sorted.length >> 1];
    })
    .sort((a, b) => a - b);

  if (!dividers.length) return null;

  // A cell is whatever lies between two dividers. Counting the dividers at or
  // just left of each item keeps groups contiguous in x, and text that overflows
  // its own column lands in the next group rather than being merged into a cell
  // it does not belong to. The half-tolerance slack absorbs a cell whose text
  // starts a hair left of the edge the other rows reported.
  const cells: any[][] = [];
  for (const row of rows) {
    const items = rowContent(row);
    if (!items.length) continue;
    let current: any[] = [];
    let currentCell = -1;
    for (const item of items) {
      let cell = 0;
      for (const d of dividers) if (d - DIVIDER_TOL_PCT / 2 <= item.xPct) cell++;
      if (cell !== currentCell) {
        if (current.length) cells.push(current);
        current = [item];
        currentCell = cell;
      } else {
        current.push(item);
      }
    }
    if (current.length) cells.push(current);
  }

  return cells;
}

/**
 * Trim the outer whitespace off a run list so the runs concatenate to exactly
 * `text`.
 *
 * The line's text is trimmed but the runs are built from the untrimmed pieces,
 * and pdf.js emits whitespace-only items at both ends of a line. The two
 * therefore disagree by a character or two - and PageEditor treats a length
 * mismatch as proof that the runs no longer describe the line, so it throws them
 * away and renders the whole line in one uniform weight. That is what silently
 * flattened the bold fragment in a line like
 *
 *   "We are pleased to offer you the position of " + BOLD("Web & App Developer")
 *
 * leaving no bold anywhere in it. Because it depends on whether a line happens
 * to end in a space item, it looked random from one line to the next.
 *
 * Trimming the outermost runs restores the invariant every consumer relies on:
 * runsToText(runs) === text.
 */
export function trimRunsToText(runs: TextRun[], text: string): TextRun[] {
  const out = runs.map((r) => ({ ...r }));

  while (out.length) {
    const trimmed = out[0].text.replace(/^\s+/, '');
    out[0].text = trimmed;
    if (trimmed) break;
    out.shift();
  }
  while (out.length) {
    const last = out[out.length - 1];
    const trimmed = last.text.replace(/\s+$/, '');
    last.text = trimmed;
    if (trimmed) break;
    out.pop();
  }

  // Belt and braces: if anything still disagrees, the caller would discard these
  // runs anyway, so drop them deliberately rather than hand over a line whose
  // styling is about to be thrown away.
  const joined = out.map((r) => r.text).join('');
  return joined === text ? out : [];
}

export interface ExtractedTextItem {
  id: string;
  str: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  fontSize: number;
  fontFamily: string;
  isBold?: boolean;
  isItalic?: boolean;
  /**
   * Per-segment styling, present only when the line mixes bold/regular text.
   * Concatenating the run texts reproduces `str`.
   */
  runs?: TextRun[];
  /** Structural Devanagari problems; drives the model-assisted repair gate. */
  devanagariIssues?: string[];
  baselinePct?: number;
  /** True when this item is a single cell of a detected grid, not a whole line. */
  isCell?: boolean;
}

export async function extractPageTextItems(
  pdfBytes: Uint8Array,
  originalPageIndex: number,
  rotation = 0
): Promise<ExtractedTextItem[]> {
  const pdfDoc = await getPdfDocument(pdfBytes);
  const page = await pdfDoc.getPage(originalPageIndex + 1);
  
  const baseScale = 1.3333;
  const totalRotation = ((page.rotate || 0) + (rotation || 0)) % 360;
  const viewport = page.getViewport({ scale: baseScale, rotation: totalRotation });

  const textContent = await page.getTextContent();
  const rawItems = textContent.items as any[];
  const styles = (textContent.styles || {}) as Record<string, any>;

  // Resolve real bold/italic/family from the embedded font programs. Font
  // resource names are frequently opaque (g_d0_f1) and carry no style
  // information, so matching on `fontName` alone silently loses boldness.
  const usedFontNames = [
    ...new Set(rawItems.filter((it: any) => it.fontName).map((it: any) => it.fontName as string)),
  ];
  const resolvedFonts = await resolveFontStyles(page, usedFontNames);

  const extracted: ExtractedTextItem[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    // Whitespace-only items are kept on purpose. They are dropped in most PDFs
    // by this filter, which throws away the document's own word spacing and
    // leaves the gap heuristic to guess - and in sample2 328 of 728 items are
    // exactly that, so words welded together ("मेंिहने" for "में िहने").
    if (!item.str) continue;

    const fontStyleObj = styles[item.fontName] || {};
    const fontNameLower = (item.fontName || '').toLowerCase();
    const styleFontFamily = (fontStyleObj.fontFamily || '').toLowerCase();
    const resolved = resolvedFonts.get(item.fontName);

    const tx = item.transform; // [a, b, c, d, x, y]
    // Calculate font size in points and CSS pixels
    const fontPt = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
    const fontPx = fontPt * baseScale;
    const fontWidthPx = item.width ? item.width * baseScale : (item.str.length * fontPx * 0.55);

    // Convert PDF baseline coordinate to viewport coordinate
    const [vx, vy] = viewport.convertToViewportPoint(tx[4], tx[5]);

    const isDevanagari = /[\u0900-\u097F]/.test(item.str);

    // How far the ink reaches above and below the baseline.
    //
    // These used to be flat guesses of 0.80em/0.98em, which is a real font's
    // ascent only by coincidence: Nirmala UI reports 1.079em and Times New Roman
    // 0.891em. Under-covering by that much left the top ~1.5px of every line
    // showing through the whiteout, and on these documents that strip is exactly
    // where a pre-base matra sits - so the embedded font's broken mark
    // positioning left "कैसे" readable as "केसै" through the whiteout.
    //
    // The measured values come from the embedded font program. They are floored
    // at the old guesses and capped, so this can only ever cover more than
    // before, never less, and a font with an absurd ascent cannot produce a box
    // that swallows the line above.
    const { ascentEm, descentEm } = verticalMetricsFor(resolved, fontNameLower, isDevanagari);
    const capHeightOffset = fontPx * ascentEm;
    const boxHeight = fontPx * (ascentEm + descentEm);

    const boxX = vx;
    const boxY = vy - capHeightOffset;
    const boxW = Math.max(6, fontWidthPx);
    const boxH = Math.max(6, boxHeight);

    const xPct = Math.max(0, (boxX / viewport.width) * 100);
    const yPct = Math.max(0, (boxY / viewport.height) * 100);
    const widthPct = Math.min(100 - xPct, (boxW / viewport.width) * 100);
    const heightPct = Math.min(100 - yPct, (boxH / viewport.height) * 100);


    // Detect Bold. Prefer the font program's OS/2 weight/fsSelection bits, fall
    // back to the original PostScript name, and only then to the name heuristic.
    const rawFontWeight = (fontStyleObj as any).fontWeight;
    const fontWeightNum = typeof rawFontWeight === 'number' ? rawFontWeight : (typeof rawFontWeight === 'string' ? parseInt(rawFontWeight, 10) : NaN);
    const nameSaysBold =
      fontNameLower.includes('bold') ||
      fontNameLower.includes('black') ||
      fontNameLower.includes('heavy') ||
      fontNameLower.includes('semibold') ||
      (styleFontFamily.includes('bold') && !styleFontFamily.includes('regular')) ||
      rawFontWeight === 'bold' ||
      (!isNaN(fontWeightNum) && fontWeightNum >= 600);

    const isBold = resolved ? resolved.isBold || nameSaysBold : nameSaysBold;

    // Detect Italic
    const nameSaysItalic =
      fontNameLower.includes('italic') ||
      fontNameLower.includes('oblique') ||
      fontNameLower.includes('slant') ||
      styleFontFamily.includes('italic');

    const isItalic = resolved ? resolved.isItalic || nameSaysItalic : nameSaysItalic;

    // The resource name is often opaque (g_d0_f1), so fold the real family and
    // PostScript name recovered from the font program into the haystack the
    // family heuristics below match against.
    const nameHaystack =
      `${fontNameLower} ${resolved?.family || ''} ${resolved?.postScriptName || ''}`.toLowerCase();

    // Determine font family accurately using specific font name matching
    const isMonospace = 
      nameHaystack.includes('courier') || 
      nameHaystack.includes('mono') || 
      nameHaystack.includes('consolas') ||
      styleFontFamily.includes('monospace');

    const isArial = nameHaystack.includes('arial') || styleFontFamily.includes('arial');
    const isHelvetica = nameHaystack.includes('helvetica') || styleFontFamily.includes('helvetica');
    const isCalibri = nameHaystack.includes('calibri') || styleFontFamily.includes('calibri');
    const isTahoma = nameHaystack.includes('tahoma') || styleFontFamily.includes('tahoma');
    const isVerdana = nameHaystack.includes('verdana') || styleFontFamily.includes('verdana');
    const isTrebuchet = nameHaystack.includes('trebuchet') || styleFontFamily.includes('trebuchet');
    const isGaramond = nameHaystack.includes('garamond') || styleFontFamily.includes('garamond');
    const isCambria = nameHaystack.includes('cambria') || styleFontFamily.includes('cambria');
    const isGeorgia = nameHaystack.includes('georgia') || styleFontFamily.includes('georgia');
    const isTimes = nameHaystack.includes('times') || styleFontFamily.includes('times');
    const isPalatinoOrBook = nameHaystack.includes('palatino') || nameHaystack.includes('book antiqua');
    // Windows Devanagari UI font; the original documents rely on it heavily.
    const isNirmalaUI = nameHaystack.includes('nirmala ui') || nameHaystack.includes('nirmalui');
    // Symbol and colour-emoji faces. These must never be mistaken for a text
    // family: an emoji run that wins a line hands the sentence to whatever the
    // symbol font falls back to, which is how a Times New Roman title ended up
    // typeset in sans. Checked before the Latin branches so a name like
    // "ArialEmoji" cannot be read as Arial.
    const isEmojiFont =
      nameHaystack.includes('emoji') ||
      nameHaystack.includes('symbol') ||
      nameHaystack.includes('wingdings') ||
      nameHaystack.includes('webdings');

    const isSerif = 
      !isMonospace && !isArial && !isHelvetica && !isCalibri && !isTahoma && !isVerdana && !isTrebuchet && !isNirmalaUI && !isEmojiFont &&
      (isTimes || isGaramond || isCambria || isGeorgia || isPalatinoOrBook ||
       nameHaystack.includes('roman') ||
       (styleFontFamily.includes('serif') && !styleFontFamily.includes('sans')));

    let fontFamily: string;
    if (isEmojiFont) {
      fontFamily =
        '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ' +
        '"Segoe UI Symbol", "Symbola", sans-serif';
    } else if (isNirmalaUI) {
      fontFamily = '"Nirmala UI", "Noto Sans Devanagari", "Mangal", sans-serif';
    } else if (isMonospace) {
      fontFamily = '"Courier New", Courier, monospace';
    } else if (isArial) {
      fontFamily = 'Arial, "Liberation Sans", Helvetica, sans-serif';
    } else if (isHelvetica) {
      fontFamily = 'Helvetica, Arial, sans-serif';
    } else if (isCalibri) {
      fontFamily = 'Calibri, "Gill Sans", Optima, sans-serif';
    } else if (isTahoma) {
      fontFamily = 'Tahoma, Geneva, sans-serif';
    } else if (isVerdana) {
      fontFamily = 'Verdana, Geneva, sans-serif';
    } else if (isTrebuchet) {
      fontFamily = '"Trebuchet MS", sans-serif';
    } else if (isTimes) {
      fontFamily = '"Times New Roman", Times, serif';
    } else if (isGaramond) {
      fontFamily = 'Garamond, "EB Garamond", serif';
    } else if (isCambria) {
      fontFamily = 'Cambria, Georgia, serif';
    } else if (isGeorgia) {
      fontFamily = 'Georgia, Cambria, serif';
    } else if (isPalatinoOrBook) {
      fontFamily = '"Palatino Linotype", Palatino, serif';
    } else if (isSerif) {
      fontFamily = 'Georgia, "Times New Roman", Times, serif';
    } else {
      // Default: Arial is the most common PDF sans-serif font
      fontFamily = 'Arial, Helvetica, sans-serif';
    }

    const baselinePct = (vy / viewport.height) * 100;

    extracted.push({
      id: `orig_txt_${originalPageIndex}_${i}`,
      str: item.str,
      xPct,
      yPct,
      // The true width, not the floored one. A space item is often only ~0.25%
      // wide, and padding it to 0.8% would push past the next item's origin and
      // swallow the gap that separates the following word.
      widthPct: Math.max(0.05, widthPct),
      heightPct: Math.max(0.8, heightPct),
      fontSize: Math.round(fontPx),
      fontFamily,
      isBold,
      isItalic,
      baselinePct,
    } as any);
  }

  if (extracted.length === 0) return [];

  // 0. Drop duplicate glyph emissions.
  //
  // Some producers draw the same text run twice at near-identical positions
  // (a pre-base matra is often emitted with the base and again on its own).
  // Without this the line assembly concatenates the word with itself, which is
  // what makes Devanagari words appear doubled and glued to their neighbours.
  const deduped: typeof extracted = [];
  for (const item of extracted) {
    const duplicate = deduped.find(
      (kept) =>
        kept.str === item.str &&
        Math.abs((kept.baselinePct ?? 0) - (item.baselinePct ?? 0)) < 0.4 &&
        Math.abs(kept.xPct - item.xPct) < 0.4
    );
    if (!duplicate) deduped.push(item);
  }

  // 1. Cluster items into lines by vertical baseline proximity
  const lines: any[][] = [];
  const sorted = [...deduped].sort((a: any, b: any) => a.baselinePct - b.baselinePct);

  for (const block of sorted) {
    let matched = false;
    const blockBase = block.baselinePct ?? block.yPct;
    for (const line of lines) {
      const avgBase = line.reduce((s: number, b: any) => s + (b.baselinePct ?? b.yPct), 0) / line.length;
      if (Math.abs(blockBase - avgBase) < 0.85) {
        line.push(block);
        matched = true;
        break;
      }
    }
    if (!matched) lines.push([block]);
  }

  lines.sort((a, b) => {
    const aBase = Math.min(...a.map((b: any) => b.baselinePct ?? b.yPct));
    const bBase = Math.min(...b.map((b: any) => b.baselinePct ?? b.yPct));
    return aBase - bBase;
  });

/**
 * Reorder items so an orphaned matra follows the base it belongs to.
 *
 * A matra is drawn relative to its cluster, so pdf.js can report it as its own
 * item whose x sits at (or left of) the base's origin, even though logically it
 * belongs after. Sorting purely by x therefore produces "ा क्य" instead of
 * "क्या".
 *
 * The overlap test is what makes this safe: a matra is only moved when it
 * physically overlaps the following cluster, which is the signature of it being
 * drawn *on* that cluster. A matra that sits in clear space on its own is left
 * exactly where it was.
 */
function orderItemsForLogicalText(line: any[]): any[] {
  const out: any[] = [];
  for (let i = 0; i < line.length; i++) {
    const item = line[i];
    const next = line[i + 1];

    if (
      isOrphanMatraToken(item.str) &&
      next &&
      DEVANAGARI_RANGE.test(next.str) &&
      item.widthPct < 1.2 &&
      next.xPct < item.xPct + item.widthPct
    ) {
      out.push(next);
      out.push(item);
      i++;
      continue;
    }
    out.push(item);
  }
  return out;
}

  // 2. Assemble each group into a single cohesive text item.
  //
  // For ordinary prose a group is a line and the result spans the full width,
  // which is right. In a table a line is a whole *row* of cells that share a
  // baseline, and spanning the full width is exactly the bug: the merged string
  // is then drawn across the cells and collides with them. So when the page
  // really is a grid, the groups are the cells.
  const cells = detectTableCells(lines);
  const isTablePage = cells !== null;
  const groups = cells ?? lines;

  const merged: ExtractedTextItem[] = groups.map((line, idx) => {
    // Sort by x, but only when the difference is meaningful.
    //
    // Some items come back with a width of 0 because pdf.js cannot measure a
    // damaged text item, and its x is then a poor proxy for where the glyphs
    // really sit. In sample2 " ध्य" (x=304.3) and "ान" (x=304.1) differ by
    // two tenths of a point but must stay in content-stream order, or the word
    // "ध्यान" comes out reversed. Treating near-identical x as equal keeps the
    // stream order that the writer intended, and Array#sort is stable.
    line.sort((a, b) => {
      const delta = a.xPct - b.xPct;
      return Math.abs(delta) < 0.06 ? 0 : delta;
    });
    const ordered = orderItemsForLogicalText(line);

    // Track styling per segment rather than collapsing the line to a single
    // flag. A line like "Date: 20 August 2026" followed by a bold name stays
    // partially bold, which is what the source document actually looks like.
    type Piece = { text: string; isBold: boolean; isItalic: boolean };
    const pieces: Piece[] = [];
    const push = (text: string, isBold: boolean, isItalic: boolean) => {
      if (!text) return;
      const last = pieces[pieces.length - 1];
      if (last && last.isBold === isBold && last.isItalic === isItalic) last.text += text;
      else pieces.push({ text, isBold, isItalic });
    };

    let fullText = ordered[0].str;
    push(ordered[0].str, !!ordered[0].isBold, !!ordered[0].isItalic);

    /**
     * True when the current item opens with a matra and the text before it ends
     * in a bare consonant, which means the two are one word that the font split
     * in two: "ध्य" + "ान" is "ध्यान", "बोंद" + "िखना" is "बोंदिखना".
     *
     * A preceding word that already ends in a vowel sign is complete, so the
     * space stays and the two are not welded: "में" + "िहने".
     */
    const joinsPreviousWord = (currStr: string): boolean => {
      if (!/^[\u093E-\u094D\u0962\u0963]/.test(currStr)) return false;
      const trimmed = fullText.replace(/\s+$/, '');
      if (!trimmed) return false;
      const last = [...trimmed].pop() ?? '';
      // A bare consonant or a half-form can still take a matra; a completed
      // vowel sign cannot.
      return /[\u0915-\u0939\u0958-\u095F\u0978-\u097F\u094D]/.test(last);
    };

    /**
     * True when a real space item sits where the font actually split one word
     * in two, and must therefore be dropped.
     *
     * These PDFs emit a genuine space item between "ध्य" and "ान" even though
     * the word is "ध्यान", and between "बोंद" and "िखना" for "बोंदिखना". The
     * space is in the content stream, so the gap heuristic cannot suppress it;
     * it has to be decided here, with a look-ahead at the next real item.
     */
    const spaceItemIsSpurious = (index: number): boolean => {
      const before = fullText.replace(/\s+$/, '');
      if (!before) return false;
      const last = [...before].pop() ?? '';
      // Only a bare consonant or half-form can still take a matra; a word that
      // already ends in a vowel sign is complete ("में" stays separate from
      // whatever follows).
      if (!/[\u0915-\u0939\u0958-\u095F\u0978-\u097F\u094D]/.test(last)) return false;
      for (let j = index + 1; j < ordered.length; j++) {
        const next = ordered[j];
        if (!next.str.trim()) continue;
        return /^[\u093E-\u094D\u0962\u0963]/.test(next.str);
      }
      return false;
    };

    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];

      // A whitespace-only item that splits one word is not emitted at all.
      if (curr.str && !curr.str.trim() && spaceItemIsSpurious(i)) continue;

      const gap = curr.xPct - (prev.xPct + prev.widthPct);
      // Never space out a mark that belongs to the cluster before it.
      const isCombining = isOrphanMatraToken(curr.str) || /^[\u0901-\u0903\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963]/.test(curr.str);
      const needsSpace =
        !isCombining &&
        !joinsPreviousWord(curr.str) &&
        gap > 0.1 &&
        !fullText.endsWith(' ') &&
        !curr.str.startsWith(' ');
      if (needsSpace) {
        fullText += ' ';
        // The separating space belongs to the preceding run visually.
        push(' ', !!prev.isBold, !!prev.isItalic);
      }
      // An item may carry its own leading space even right after a space item,
      // which would double up ("भी " + " ध्य"). Keep the wider gap but emit a
      // single separator.
      const text = fullText.endsWith(' ') ? curr.str.replace(/^ +/, '') : curr.str;
      if (text !== curr.str && !text) continue;
      fullText += text;
      push(text, !!curr.isBold, !!curr.isItalic);
    }

    // Apply the unambiguous repairs *per piece* rather than to the joined line.
    //
    // Repairing the whole line changed its length, which meant the run offsets
    // no longer matched and the line fell back to a single uniform style - so
    // every bold fragment in a repaired Hindi line silently lost its weight.
    // Repairing each styled segment independently keeps the structure intact
    // and the bold survives.
    const repairedPieces = pieces.map((p) => {
      // Known misreadings first, and taken verbatim. The structural pass below
      // would delete the matra in "इस्तेमाि" as a stray, and with it the
      // evidence that the glyph was really a ल.
      const read = applyMisreadings(p.text);
      if (read !== p.text) return { ...p, text: read };
      const r = repairDevanagari(p.text);
      return r.changed ? { ...p, text: r.text } : p;
    });

    const lineText = repairedPieces.map((p) => p.text).join('').trim();
    const devanagariIssues = findDevanagariIssues(lineText);

    // Only worth carrying when the line is genuinely mixed.
    const allBold = repairedPieces.every((p) => p.isBold);
    const allItalic = repairedPieces.every((p) => p.isItalic);
    const mixed = !allBold || !allItalic;
    const lineRuns: TextRun[] | undefined = mixed
      ? trimRunsToText(
          repairedPieces.map((p) => ({
            text: p.text,
            isBold: p.isBold,
            isItalic: p.isItalic,
            isUnderline: false,
          })),
          lineText
        )
      : undefined;

    const minX = Math.min(...line.map(b => b.xPct));
    const maxX = Math.max(...line.map(b => b.xPct + b.widthPct));
    const minY = Math.min(...line.map(b => b.yPct));
    const maxY = Math.max(...line.map(b => b.yPct + b.heightPct));

    // A bilingual line is assembled from two different embedded fonts: a Latin
    // face for the English words and Nirmala UI for the Hindi. The result can
    // only carry one `fontFamily`, and that value becomes the *primary* entry
    // of the render stack (the Devanagari faces are appended after it), so it
    // has to come from an item that actually draws Latin glyphs.
    //
    // Taking ordered[0] blindly was wrong twice over. A line starting with a
    // Hindi word was rendered wholly in Nirmala UI, restyling its English too;
    // and the title line leads with a flag, whose regional indicator symbols
    // matched a naive "not Devanagari" test, so the *emoji* font claimed the
    // line and handed the whole sentence to its sans fallback. isLatinBearing
    // requires a real letter or digit, which excludes symbols as well.
    const latinSource = ordered.find((o) => isLatinBearing(o.str)) ?? ordered[0];

    // The line's true baseline, straight from the PDF. Items were clustered by
    // baseline, so this is the one the overlay has to land on. It is carried
    // through rather than re-derived from the box, because the box top is a
    // cap-height guess and guessing twice compounds the error.
    const lineBaselinePct =
      line.reduce((s: number, b: any) => s + (b.baselinePct ?? b.yPct), 0) / line.length;

    return {
      id: `txt_${originalPageIndex}_${idx}`,
      str: lineText,
      xPct: minX,
      yPct: minY,
      widthPct: Math.min(100 - minX, (maxX - minX) + 0.8),
      heightPct: maxY - minY,
      fontSize: ordered[0].fontSize,
      fontFamily: latinSource.fontFamily,
      isBold: allBold,
      isItalic: allItalic,
      runs: lineRuns,
      devanagariIssues,
      baselinePct: lineBaselinePct,
      // Tells the editor this group is one cell of a grid rather than a whole
      // line, so it can hug the cell's text instead of padding for a full-width
      // line. On a narrow cell the usual padding is a large fraction of the
      // cell, and the selection outline would reach into its neighbour.
      isCell: isTablePage,
    };
  });

  return merged.filter(item => item.str.length > 0);
}

export async function getPdfMetadata(pdfBytes: Uint8Array): Promise<{
  numPages: number;
  pageDimensions: { width: number; height: number; rotation: number }[];
}> {
  const pdfDoc = await getPdfDocument(pdfBytes);
  const numPages = pdfDoc.numPages;
  const pageDimensions: { width: number; height: number; rotation: number }[] = [];

  const baseScale = 1.3333; // 72 pt -> 96 CSS px
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: baseScale });
    pageDimensions.push({
      width: viewport.width,
      height: viewport.height,
      rotation: page.rotate || 0,
    });
  }

  return { numPages, pageDimensions };
}

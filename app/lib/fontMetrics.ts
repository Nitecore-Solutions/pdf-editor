/**
 * Vertical font metrics, measured the way a browser will actually lay text out.
 *
 * Why this exists: to put a line's glyphs back on the baseline the PDF drew them
 * on, the first baseline has to be placed at a known distance from the top of
 * the text box. That distance is not a constant - it is
 *
 *     halfLeading + ascent   where   halfLeading = (lineHeight - (ascent + descent)) / 2
 *
 * so it moves with the font's own ascent and descent *and* with the line height.
 * Guessing a fixed fraction of the font size is what made edited text sit below
 * the original: Times New Roman reports ascent+descent of about 1.107em, so at
 * `line-height: 1.2` the first baseline lands at 0.938em, not at the 0.80em the
 * box assumed. Nirmala UI reports about 1.289em, putting its first baseline at
 * 1.085em against an assumed 0.98em. Both were wrong in the same direction, by
 * roughly a tenth of an em, and the error scaled with the font size.
 *
 * Reading the metrics from the font removes the guess. Times then really does
 * resolve at 0.938em and Nirmala UI at 1.085em, and both land on the PDF's own
 * baseline instead of near it.
 */

/** Ascent and descent in px, for a specific CSS font shorthand. */
export interface FontMetrics {
  ascent: number;
  descent: number;
}

/**
 * Probe string. It mixes scripts on purpose: for a bilingual line the inline
 * box takes the tallest ascent and deepest descent of *every* font used, so a
 * Latin-only probe would under-report the line box for any line containing
 * Devanagari, which is exactly the case being fixed. 'Hxl' pulls in cap, x-height
 * and lowercase; U+0905 is a Devanagari vowel.
 */
const PROBE = 'Hxl\u0905';

let ctx: CanvasRenderingContext2D | null | undefined;

/** Metrics keyed by CSS font shorthand; a given font+size never changes. */
const cache = new Map<string, FontMetrics>();

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx === undefined) {
    ctx =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d');
  }
  return ctx;
}

/**
 * Distance from the top of a text box to the baseline of its first line.
 *
 * `lineHeightPx` may be a ratio of the font size or an absolute px value; both
 * are handled because callers hold a ratio and the editor holds px.
 */
export function firstBaselineOffset(
  metrics: FontMetrics,
  fontSizePx: number,
  lineHeight: number
): number {
  const lineHeightPx = lineHeight <= 3 ? lineHeight * fontSizePx : lineHeight;
  const halfLeading = (lineHeightPx - (metrics.ascent + metrics.descent)) / 2;
  return halfLeading + metrics.ascent;
}

/**
 * Ascent/descent of a font, or null when it cannot be measured (server render,
 * or a browser without TextMetrics font-box properties).
 */
export function measureFontMetrics(cssFont: string): FontMetrics | null {
  const hit = cache.get(cssFont);
  if (hit) return hit;

  const c = getCtx();
  if (!c) return null;

  const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(cssFont);
  const fontSizePx = sizeMatch ? parseFloat(sizeMatch[1]) : 0;
  if (!fontSizePx) return null;

  c.font = cssFont;
  const m = c.measureText(PROBE);

  let ascent = m.fontBoundingBoxAscent;
  let descent = m.fontBoundingBoxDescent;

  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) {
    // Older engines: fall back to the conventional 0.8em/0.2em split, which is
    // what the hardcoded offsets were implicitly assuming anyway.
    ascent = fontSizePx * 0.8;
    descent = fontSizePx * 0.2;
  }

  const out: FontMetrics = { ascent, descent };
  cache.set(cssFont, out);
  return out;
}

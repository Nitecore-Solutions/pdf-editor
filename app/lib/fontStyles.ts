/**
 * Font style resolution for extracted PDF text.
 *
 * The naive approach — matching "bold" against the font name reported by
 * pdf.js — does not work on real-world PDFs. Producers routinely ship subset
 * fonts whose resource names are opaque tokens:
 *
 *     /BaseFont /g_d0_f1     -> what pdf.js reports as item.fontName
 *     styles["g_d0_f1"].fontFamily === "sans-serif"   (no weight info at all)
 *
 * Name matching against those finds nothing, so every line comes out
 * non-bold and the boldness is lost the moment a line is converted to an
 * editable text element.
 *
 * Two reliable signals exist and this module uses both:
 *
 *  1. `FontFace.name` — pdf.js recovers the *original* PostScript name from the
 *     embedded font program and keeps it even when /BaseFont is obfuscated, e.g.
 *     `g_d0_f2` -> `TimesNewRomanPS-BoldMT`. Always available, cheap.
 *
 *  2. The embedded font program itself (`FontFace.data`), whose OS/2 table
 *     carries `usWeightClass` and the `fsSelection` bold/italic bits, and whose
 *     `name` table carries the real family/subfamily. This is exact rather
 *     than heuristic, and is available in the browser (pdf.js only skips
 *     fetching font data in non-browser environments).
 *
 * Signal 2 wins when present; signal 1 is the fallback.
 */

export interface ResolvedFontStyle {
  isBold: boolean;
  isItalic: boolean;
  /** Family name as reported by the font program, e.g. "Nirmala UI". */
  family: string | null;
  /** Style name from the name table, e.g. "Bold", "Italic". */
  subfamily: string | null;
  postScriptName: string | null;
  weight: number | null;
  source: 'program' | 'name' | 'none';
}

// Subset prefixes look like "BCDEEE+"; they carry no style information.
const SUBSET_PREFIX = /^[A-Z]{6}\+/;

// Deliberately conservative: "medium" and "light" are excluded because families
// ship weights like "Nirmala UI Semilight" that are not bold.
//
// Plain substring matching, not word boundaries. PostScript names concatenate
// the style onto the family with no separator ("Arial-BoldMT",
// "TimesNewRomanPS-BoldMT", "Arial-BoldItalic"), and a `\b`-style boundary
// cannot express that. Note that a `/i` regex makes `[^a-z]` exclude *all*
// letters, so a trailing-boundary variant silently fails on every name that has
// a suffix after the style token.
const BOLDISH = /bold|black|heavy|semibold|demibold|ultrabold|extrabold/i;
const ITALICISH = /italic|oblique/i;

function stripSubset(name: string): string {
  return name.replace(SUBSET_PREFIX, '');
}

// ---------------------------------------------------------------------------
// Font program parsing (sfnt / OpenType)
// ---------------------------------------------------------------------------

interface SfntTables {
  [tag: string]: { offset: number; length: number };
}

function readSfntTables(view: DataView): SfntTables | null {
  if (view.byteLength < 12) return null;
  let base = 0;
  if (view.getUint32(0) === 0x74746366) {
    // 'ttcf' collection: use the first font in it.
    if (view.byteLength < 16) return null;
    base = view.getUint32(12);
  }
  const sfnt = view.getUint32(base);
  // 1.0, 'true', 'OTTO', 'typ1'
  if (
    sfnt !== 0x00010000 &&
    sfnt !== 0x74727565 &&
    sfnt !== 0x4f54544f &&
    sfnt !== 0x74797031
  ) {
    return null;
  }
  const numTables = view.getUint16(base + 4);
  const tables: SfntTables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = base + 12 + i * 16;
    if (rec + 16 > view.byteLength) break;
    let tag = '';
    for (let k = 0; k < 4; k++) tag += String.fromCharCode(view.getUint8(rec + k));
    tables[tag] = { offset: view.getUint32(rec + 8), length: view.getUint32(rec + 12) };
  }
  return tables;
}

function readNameTable(view: DataView, table: { offset: number; length: number }) {
  const o = table.offset;
  if (o + 6 > view.byteLength) return {} as Record<string, string>;
  const count = view.getUint16(o + 2);
  const strBase = o + view.getUint16(o + 4);
  const WANT: Record<number, string> = {
    1: 'family',
    2: 'subfamily',
    4: 'fullName',
    6: 'postScript',
    16: 'typoFamily',
    17: 'typoSubfamily',
  };
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const rec = o + 6 + i * 12;
    if (rec + 12 > view.byteLength) break;
    const platformID = view.getUint16(rec);
    const nameID = view.getUint16(rec + 6);
    const key = WANT[nameID];
    if (!key) continue;
    const len = view.getUint16(rec + 8);
    const off = view.getUint16(rec + 10);
    let s = '';
    if (platformID === 3 || platformID === 0) {
      for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(view.getUint16(strBase + off + k));
    } else {
      for (let k = 0; k < len; k++) s += String.fromCharCode(view.getUint8(strBase + off + k));
    }
    const clean = s.replace(/\0/g, '').trim();
    // Prefer the first entry, but let a real subfamily override a generic one.
    if (clean && !out[key]) out[key] = clean;
  }
  return out;
}

function inspectFontProgram(data: ArrayBuffer | Uint8Array): Partial<ResolvedFontStyle> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = readSfntTables(view);
  if (!tables) return {};

  const out: Partial<ResolvedFontStyle> = { source: 'program' };

  const os2 = tables['OS/2'];
  if (os2 && os2.offset + 64 <= view.byteLength) {
    const o = os2.offset;
    const weight = view.getUint16(o + 4);
    out.weight = weight;
    const fsSelection = view.getUint16(o + 62);
    out.isBold = !!(fsSelection & (1 << 5));
    out.isItalic = !!(fsSelection & (1 << 0));
    if (!out.isBold && weight >= 600) out.isBold = true;
  }

  const nameTable = tables['name'];
  if (nameTable) {
    const names = readNameTable(view, nameTable);
    out.family = names.typoFamily || names.family || null;
    out.subfamily = names.typoSubfamily || names.subfamily || null;
    out.postScriptName = names.postScript || names.fullName || null;
  }

  // The name table is authoritative for style even if OS/2 is missing.
  if (out.isBold === undefined && out.subfamily) {
    out.isBold = BOLDISH.test(out.subfamily);
  }
  if (out.isItalic === undefined && out.subfamily) {
    out.isItalic = ITALICISH.test(out.subfamily);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Resolution across all fonts used on a page
// ---------------------------------------------------------------------------

function styleFromNames(...names: (string | null | undefined)[]): { isBold: boolean; isItalic: boolean } {
  const hay = names
    .filter((n): n is string => !!n)
    .map(stripSubset)
    .join(' ');
  if (!hay) return { isBold: false, isItalic: false };
  return { isBold: BOLDISH.test(hay), isItalic: ITALICISH.test(hay) };
}

/**
 * Resolve bold/italic/family for every font resource used on a page.
 * Failures are contained per font: a font we cannot inspect simply falls back
 * to name matching, and then to "not bold" — the previous behaviour.
 */
export async function resolveFontStyles(
  page: any,
  fontNames: string[]
): Promise<Map<string, ResolvedFontStyle>> {
  const result = new Map<string, ResolvedFontStyle>();

  // Fonts resolve lazily; the operator list forces them to load so that
  // commonObjs.get() does not throw "isn't resolved yet".
  try {
    await page.getOperatorList();
  } catch (_) {
    /* renderable check etc. - proceed with whatever is available */
  }

  for (const fontName of fontNames) {
    if (result.has(fontName)) continue;

    let face: any = null;
    try {
      face = page.commonObjs?.get?.(fontName) ?? null;
    } catch (_) {
      face = null;
    }

    const psName: string | null = face?.name ?? null;
    const fallbackName: string | null = face?.fallbackName ?? null;
    const systemFamily: string | null =
      face?.systemFontInfo?.fontFamily ?? face?.cssFontInfo?.fontFamily ?? null;

    let program: Partial<ResolvedFontStyle> = {};
    try {
      if (face?.data) program = inspectFontProgram(face.data);
    } catch (_) {
      program = {};
    }

    if (program.source === 'program') {
      const names = styleFromNames(
        program.postScriptName,
        program.family,
        program.subfamily
      );
      result.set(fontName, {
        // The program is exact; only fall back to names when a bit is missing.
        isBold: program.isBold ?? names.isBold,
        isItalic: program.isItalic ?? names.isItalic,
        family: program.family ?? null,
        subfamily: program.subfamily ?? null,
        postScriptName: program.postScriptName ?? psName,
        weight: program.weight ?? null,
        source: 'program',
      });
      continue;
    }

    const names = styleFromNames(psName, systemFamily, fallbackName);
    result.set(fontName, {
      isBold: names.isBold,
      isItalic: names.isItalic,
      family: null,
      subfamily: null,
      postScriptName: psName,
      weight: null,
      source: psName || systemFamily ? 'name' : 'none',
    });
  }

  return result;
}

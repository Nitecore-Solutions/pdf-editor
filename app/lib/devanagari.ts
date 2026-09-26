/**
 * Devanagari text repair and health checks.
 *
 * Legacy Indic PDFs are a mess: the font's ToUnicode CMap frequently maps the
 * wrong glyph to a character, so extraction yields text that is structurally
 * impossible ("जरूिी" for "जरूरी") or silently wrong ("सूर्ची" for "सूची").
 *
 * This module provides two things, in deliberately different tiers:
 *
 * This module is the *structural* layer only: repairs that are unambiguously
 * correct regardless of language knowledge. A pre-base matra can never follow
 * another matra, a virama can never dangle, and a repeated matra is a
 * duplication artefact. These are safe to apply to every line unconditionally.
 *
 * Orphan matras are deliberately *kept*. A lone matra usually means the x-gap
 * logic slipped a space between a base and its matra, and dropping it would
 * corrupt a line that was otherwise fine.
 *
 * Damage that needs actual knowledge of Hindi - a wrong base consonant, a
 * non-standard but valid spelling - is handled by hindiRepair.ts, which adds
 * orthographic validation, suffix morphology and a lexicon. Nothing in the
 * codebase invents characters or calls a network service.
 */

export const DEVANAGARI_RANGE = /[\u0900-\u097F]/;

/**
 * Font stack for Devanagari overlay text.
 *
 * Ordered so a real, *bold-capable* Devanagari family wins. Picking a family
 * without a bold face makes the browser synthesise (embolden) instead, which
 * changes glyph metrics and is what makes edited Devanagari drift away from the
 * original. The Latin tail matters because these documents are bilingual.
 */
export const DEVANAGARI_FONT_STACK =
  '"Nirmala UI", "Noto Sans Devanagari", "Kohinoor Devanagari", Mangal, ' +
  '"Noto Sans", "Segoe UI", Roboto, Arial, sans-serif';

const isDevanagariChar = (ch: string) => {
  const c = ch.codePointAt(0)!;
  return (
    (c >= 0x0900 && c <= 0x097f) ||
    c === 0x200c || // ZWNJ
    c === 0x200d // ZWJ
  );
};

/** Devanagari combining signs that attach to a preceding base. */
function isMatra(ch: string): boolean {
  if (!ch) return false;
  const c = ch.codePointAt(0)!;
  // 093A-094C matras, 094E-094F, 0955-0957, 0962-0963, nukta 093C, virama 094D
  return (
    (c >= 0x093a && c <= 0x094f) ||
    (c >= 0x0955 && c <= 0x0957) ||
    c === 0x0962 ||
    c === 0x0963
  );
}

/** Pre-base matras: they belong *before* their base in visual terms but are
 *  stored *after* it logically. Seeing one first is a strong corruption signal. */
function isPreBaseMatra(ch: string): boolean {
  const c = ch?.codePointAt(0);
  return c === 0x093f || c === 0x094f;
}

function isMatraOnlyToken(token: string): boolean {
  if (!token) return false;
  return [...token].every((ch) => isMatra(ch) && ch !== '\u094d');
}

function isSpaceLike(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\u00a0';
}

/**
 * Issues that indicate a genuinely broken font mapping. A page showing several
 * of these needs the heavier repair pass.
 *
 * "matra-only-token" is deliberately excluded: a lone matra usually means our
 * own x-gap logic slipped a space between a base consonant and its matra
 * ("क्या" arriving as "ा क्य"). That is a spacing artefact, not a font defect,
 * and treating it as serious would drag clean pages into the model.
 */
const SERIOUS_ISSUES = new Set([
  'leading-prebase-matra',
  'matra-after-matra',
  'dangling-virama',
  'control-char',
  'private-use',
]);

/**
 * Structural problems in a line. An empty array means the line is
 * *structurally* sound, which is not the same as being semantically correct.
 */
export function findDevanagariIssues(text: string): string[] {
  const issues: string[] = [];
  if (!text) return issues;

  // Control characters and private-use codepoints are never legitimate here.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) issues.push('control-char');
  if (/[\uE000-\uF8FF]/.test(text)) issues.push('private-use');

  const tokens = text.split(/[\s\u00a0]+/).filter(Boolean);
  for (const token of tokens) {
    if (!DEVANAGARI_RANGE.test(token)) continue;
    const chars = [...token];

    if (isMatraOnlyToken(token)) {
      issues.push('matra-only-token');
      continue;
    }
    if (isPreBaseMatra(chars[0])) {
      issues.push('leading-prebase-matra');
    }
    for (let i = 1; i < chars.length; i++) {
      if (isMatra(chars[i - 1]) && isMatra(chars[i])) {
        issues.push('matra-after-matra');
        break;
      }
    }
    if (chars[chars.length - 1] === '\u094d') {
      issues.push('dangling-virama');
    }
  }
  return issues;
}

/** Only the subset of issues that justifies escalating to the model. */
export function findSeriousDevanagariIssues(text: string): string[] {
  return findDevanagariIssues(text).filter((i) => SERIOUS_ISSUES.has(i));
}

/**
 * Unambiguous repairs only.
 *
 * - drops a pre-base matra that follows another matra (structurally impossible)
 * - collapses an immediately repeated matra ("ोो" -> "ो")
 * - drops a dangling virama at the end of a token
 * - drops tokens consisting solely of matras
 */
export function repairDevanagari(text: string): { text: string; changed: boolean; repairs: string[] } {
  if (!text || !DEVANAGARI_RANGE.test(text)) {
    return { text, changed: false, repairs: [] };
  }

  const repairs = new Set<string>();
  const out: string[] = [];

  for (const token of text.split(/(\s+)/)) {
    if (!token || isSpaceLike(token)) {
      out.push(token);
      continue;
    }
    if (!DEVANAGARI_RANGE.test(token)) {
      out.push(token);
      continue;
    }

    let chars = [...token];

    // A pre-base matra can only be valid as the *first* mark of a cluster.
    // Anywhere else it is a stray.
    const kept: string[] = [];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const prev = kept[kept.length - 1];
      if (prev && isMatra(prev) && isMatra(ch)) {
        if (isPreBaseMatra(ch) && !isPreBaseMatra(prev)) {
          repairs.add('drop-stray-prebase-matra');
          continue;
        }
        if (ch === prev) {
          repairs.add('collapse-repeated-matra');
          continue;
        }
      }
      kept.push(ch);
    }
    chars = kept;

    // A cluster cannot end on a virama.
    while (chars.length && chars[chars.length - 1] === '\u094d') {
      chars.pop();
      repairs.add('drop-dangling-virama');
    }

    if (chars.length) out.push(chars.join(''));
  }

  // The gap logic can leave doubled spaces behind after a reattached matra.
  // Collapsing runs of spaces is always safe and keeps the repaired line tidy.
  const collapsed = out
    .join('')
    .replace(/[ \t\u00a0]{2,}/g, ' ')
    .replace(/[ \t\u00a0]+$/, '');

  // Curated, unambiguous corrections run last, on the whole line.
  const fixed = applyCommonHindiFixes(collapsed);

  return {
    text: fixed,
    changed: fixed !== text,
    repairs: [...repairs],
  };
}

/**
 * Decide whether a page needs the heavier repair pass.
 *
 * `brokenRatio` is the share of Devanagari lines on the page that are
 * structurally broken. A single bad line in a clean page is usually a genuine
 * local glitch; a large share means the page's font has a broken ToUnicode map
 * and every line is suspect.
 */
export function pageLooksBroken(
  lines: { text: string; issues: string[] }[],
  threshold = 0.25
): boolean {
  const devanagariLines = lines.filter((l) => DEVANAGARI_RANGE.test(l.text));
  if (devanagariLines.length === 0) return false;

  // Only serious issues count towards the gate; minor ones are spacing noise.
  const broken = devanagariLines.filter((l) =>
    l.issues.some((i) => SERIOUS_ISSUES.has(i))
  ).length;
  if (broken === 0) return false;

  // One structurally broken line in a page that has more than a line or two of
  // Hindi is a local glitch, not a broken font. The page-level pass rewrites
  // whole lines, so escalating on a single flag would risk every other line for
  // no benefit - the word-level checker handles isolated damage safely.
  if (broken === 1 && devanagariLines.length > 2) return false;

  return broken / devanagariLines.length >= threshold;
}

/**
 * High-precision corrections for the most common corruptions in these
 * documents.
 *
 * These are applied unconditionally, with no model involved, because they are
 * linguistically unambiguous and because a repair feature that silently does
 * nothing whenever the API is rate-limited is not a repair feature. The
 * provider check in hindiRepair.ts handles everything else.
 *
 * Each entry is anchored to word boundaries; a bare substring rule here would
 * corrupt unrelated words.
 */
const COMMON_FIXES: [RegExp, string][] = [
  // "के लिए" family. The extracted form has a wrong first consonant and no
  // pre-base matra: रलए / ललए / हलए / भलए / कलए are all "लिए".
  // NOTE: the leading group is *capturing* on purpose - the replacement uses
  // $1 to put the matched whitespace back. A non-capturing group would leave
  // $1 undefined and splice the literal text "$1" into the output.
  [/(^|\s)(?:इस|उस|जस)लए(?=\s|$|[,.;:!?।])/g, '$1लिए'],
  [/(^|\s)[रलहभक]लए(?=\s|$|[,.;:!?।])/g, '$1लिए'],
  // Spellings that are accepted but non-standard.
  [/(^|\s)लिये(?=\s|$|[,.;:!?।])/g, '$1लिए'],
  [/(^|\s)किये(?=\s|$|[,.;:!?।])/g, '$1किए'],
  // Causative perfective: standard Hindi writes -ाएं / -ाए, never -ायें / -ाये.
  // This covers the whole family correctly (बनायें->बनाएं, बढ़ायें->बढ़ाएं,
  // जायें->जाएं, दिखाये->दिखाए, लायें->लाएं).
  [/ायें/g, 'ाएं'],
  [/ाये/g, 'ाए'],
];

/** Applies the curated fixes above. Returns the string unchanged if none match. */
export function applyCommonHindiFixes(text: string): string {
  if (!text || !DEVANAGARI_RANGE.test(text)) return text;
  let out = text;
  for (const [pattern, replacement] of COMMON_FIXES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function isDevanagari(text: string): boolean {
  return !!text && DEVANAGARI_RANGE.test(text);
}

/** Split a line into whitespace-delimited tokens, keeping the separators. */
function tokenize(text: string): string[] {
  return (text || '').split(/(\s+)/).filter((t) => t.length > 0);
}

// Devanagari is not in \w, so a token's core has to be identified by code point
// rather than by \b. U+0900-U+097F covers the script; everything else is treated
// as punctuation to be preserved around the core.
//
// U+0964 (danda) and U+0965 (double danda) are sentence punctuation that happen
// to live inside the Devanagari block, so they are excluded. U+093C (nukta) and
// U+0966-U+096F (digits) are genuine word characters and are kept - treating the
// nukta as punctuation would split "बढ़ाएं" in half.
const isWordChar = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  if (c === 0x0964 || c === 0x0965) return false; // । ॥
  if (c >= 0x0900 && c <= 0x097f) return true;
  if (c >= 0x0041 && c <= 0x005a) return true;
  if (c >= 0x0061 && c <= 0x007a) return true;
  if (c >= 0x0030 && c <= 0x0039) return true;
  if (c >= 0x00c0 && c <= 0x024f) return true;
  if (c === 0x200c || c === 0x200d) return true; // ZWNJ / ZWJ
  return false;
};

/** Split off leading/trailing punctuation, returning [core, prefix, suffix]. */
function splitToken(token: string): { prefix: string; core: string; suffix: string } {
  let start = 0;
  let end = token.length;
  while (start < end && !isWordChar(token[start])) start++;
  while (end > start && !isWordChar(token[end - 1])) end--;
  return {
    prefix: token.slice(0, start),
    core: token.slice(start, end),
    suffix: token.slice(end),
  };
}

/** Unique Devanagari words in a line, for the spell checker. */
export function collectDevanagariTokens(text: string): string[] {
  const out: string[] = [];
  for (const part of tokenize(text)) {
    if (/^\s+$/.test(part)) continue;
    const { core } = splitToken(part);
    if (core && DEVANAGARI_RANGE.test(core) && core.length > 1) out.push(core);
  }
  return out;
}

/**
 * Apply a word-level correction map to a line.
 *
 * Only whole tokens are replaced, and a token is only replaced when its bare
 * core is a key in the map. This keeps a correct occurrence of a substring from
 * being mangled by a correction meant for a different word.
 *
 * Returns the original string when nothing changed so callers can cheaply detect
 * the no-op case.
 */
export function applyTokenCorrections(text: string, corrections: Record<string, string>): string {
  if (!text || !corrections) return text;
  const keys = Object.keys(corrections);
  if (keys.length === 0) return text;
  const lookup = new Map(keys.map((k) => [k, corrections[k]]));

  let changed = false;
  const out = tokenize(text).map((part) => {
    if (/^\s+$/.test(part)) return part;
    const { prefix, core, suffix } = splitToken(part);
    const replacement = lookup.get(core);
    if (!replacement || replacement === core) return part;
    changed = true;
    return prefix + replacement + suffix;
  });

  return changed ? out.join('') : text;
}

/**
 * True when a token is nothing but combining marks.
 *
 * Such a token is always an artefact: a matra is meaningless without its base
 * consonant. It shows up when pdf.js emits the base and its matra as separate
 * text items and the matra sorts ahead of its base by x position, which is
 * exactly how "क्या" can arrive as "ा क्य".
 */
export function isOrphanMatraToken(token: string): boolean {
  const chars = [...(token || '')];
  if (chars.length === 0) return false;
  if (!chars.every((ch) => isMatra(ch))) return false;
  // A lone virama is a half-formed conjunct, not a stray matra.
  return !chars.every((ch) => ch === '\u094d');
}

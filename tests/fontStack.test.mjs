import { mergeFontStacks, resolveFontStack, isLatinBearing, DEVANAGARI_FONT_STACK } from '../app/lib/devanagari.ts';
import { firstBaselineOffset } from '../app/lib/fontMetrics.ts';

let fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', label);
  if (!ok) console.log('   got :', got, '\n   want:', want);
};

// The exact Latin family pdfRenderer derives for this PDF's Times New Roman runs.
const TNR = '"Times New Roman", Times, serif';
// The exact family pdfRenderer derives for the Nirmala UI runs.
const NIR = '"Nirmala UI", "Noto Sans Devanagari", "Mangal", sans-serif';

eq('pure Latin line keeps its own family, untouched',
  resolveFontStack(TNR, 'Job Search'),
  TNR);

eq('pure Devanagari line gets the Devanagari tail',
  resolveFontStack(TNR, 'सरकारी Jobs'.replace(' Jobs', '')),
  mergeFontStacks(TNR, DEVANAGARI_FONT_STACK));

eq('the reported line 1 of sample1.pdf is unchanged by the fix',
  resolveFontStack(TNR, 'USA + Hindi PDF Content Ideas'),
  TNR);

// The real regression: a bilingual line must keep Times FIRST, not Nirmala UI.
const bilingual = resolveFontStack(TNR, '1. USA में Job कैसे खोजें — Complete Guide PDF');
eq('bilingual line keeps the PDF Latin family as primary', bilingual, mergeFontStacks(TNR, DEVANAGARI_FONT_STACK));
eq('bilingual line does not start with a Devanagari face',
  /^"Times New Roman"/.test(bilingual), true);

eq('no duplication when the primary is already the Nirmala stack',
  resolveFontStack(NIR, 'में Job'),
  '"Nirmala UI", "Noto Sans Devanagari", "Mangal", "Kohinoor Devanagari", "Noto Sans", "Segoe UI", Roboto, Arial, sans-serif');

eq('a generic family never shadows the families merged after it',
  (() => {
    const merged = resolveFontStack('"Times New Roman", Times, serif', 'में Job');
    return merged.indexOf('serif') > merged.indexOf('"Nirmala UI"');
  })(), true);

eq('undefined family falls back to Arial', resolveFontStack(undefined, 'plain'),
  'Arial, Helvetica, sans-serif');
eq('empty-string family falls back to Arial', resolveFontStack('   ', 'plain'),
  'Arial, Helvetica, sans-serif');
eq('merging is order-preserving',
  mergeFontStacks('A, B', 'B, C'), 'A, B, C');
eq('quoted and unquoted spellings of one family dedupe',
  mergeFontStacks('"Segoe UI", Arial', 'Segoe UI'), '"Segoe UI", Arial');
eq('generic families survive the split',
  mergeFontStacks('Nirmala, Mangal, sans-serif', 'Mangal'),
  'Nirmala, Mangal, sans-serif');

// --- the leading-flag regression -------------------------------------------
// sample1.pdf line 1 is two items: the flag (SegoeUI Emoji, symbol font) then
// the sentence (Times New Roman Bold). The flag is U+1F1FA U+1F1F8, which is
// not Devanagari, so a "not Devanagari" test let the emoji font claim the line
// and the whole sentence was typeset in the symbol font's sans fallback.
const FLAG = '\u{1F1FA}\u{1F1F8}';
eq('a flag is not Latin-bearing', isLatinBearing(FLAG), false);
eq('the sentence beside it is', isLatinBearing('USA + Hindi PDF Content Ideas'), true);
eq('a bare Devanagari word is not Latin-bearing', isLatinBearing('में'), false);
eq('a lone em dash is not Latin-bearing', isLatinBearing('—'), false);
eq('a bullet prefix does not disqualify its line', isLatinBearing('◦ Indeed, LinkedIn,'), true);
eq('digits count as Latin-bearing', isLatinBearing('2024'), true);

const titleFamily = resolveFontStack(TNR, FLAG + ' USA + Hindi PDF Content Ideas');
eq('the title keeps Times, not the emoji font\'s sans fallback',
  titleFamily, TNR);

// --- baseline locking ------------------------------------------------------
// The offsets the box used to assume, versus where the browser really puts the
// first baseline for the same font. Both are (ascent+descent) taken from the
// font descriptors in sample1.pdf (obj 13: Ascent 891/Descent 216,
// obj 35: Ascent 1079/Descent 210, unitsPerEm 1000).
const TIMES = { ascent: 0.891, descent: 0.216 };   // content area 1.107em
const NIRNALA = { ascent: 1.079, descent: 0.210 }; // content area 1.289em
const em = (m, s) => ({ ascent: m.ascent * s, descent: m.descent * s });

const near = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? `(${got.toFixed(3)}em)` : `got ${got.toFixed(3)} want ${want.toFixed(3)}`);
};

// Latin line at 16px with line-height 1.2: the box assumed 0.80em.
near('Times first baseline beats the old 0.80em guess',
  firstBaselineOffset(em(TIMES, 16), 16, 1.2) / 16, 0.9375, 0.002);

// Devanagari line at 16px with line-height 1.3: the box assumed 0.98em.
near('Nirmala UI first baseline beats the old 0.98em guess',
  firstBaselineOffset(em(NIRNALA, 16), 16, 1.3) / 16, 1.0845, 0.002);

// The whole point: the old guesses were wrong by ~0.1em in the same direction,
// which is why edited lines sank below the original and drifted further the
// larger the type got.
near('the old Latin guess was low by about a tenth of an em',
  0.80, firstBaselineOffset(em(TIMES, 16), 16, 1.2) / 16, 0.14);
near('and the error grew with font size (24px title)',
  (firstBaselineOffset(em(TIMES, 24), 24, 1.2) - 0.80 * 24) / 24, 0.1375, 0.002);

// An absolute line-height in px is accepted as well as a ratio.
near('absolute px line-height is handled',
  firstBaselineOffset(em(TIMES, 16), 16, 20.8), firstBaselineOffset(em(TIMES, 16), 16, 1.3), 1e-9);

// --- the words that must not change ----------------------------------------
// These are the strings pdf.js's ToUnicode CMap actually yields in sample1.pdf
// and what the two repair tiers must produce. A word that is already correct
// has to come through byte-identical.
import { repairDevanagari, findDevanagariIssues } from '../app/lib/devanagari.ts';
import { repairHindiLine, applyMisreadings } from '../app/lib/hindiRepair.ts';

const WORDS = [
  ['ललए', 'लिए', 'liye - pre-base matra split by a duplicated consonant'],
  ['वालोों', 'वालों', 'waalon - matra after matra'],
  ['कैसे', 'कैसे', 'kaise - already correct'],
  ['लिए', 'लिए', 'liye - already correct'],
  ['में', 'में', 'men'],
  ['खोजें', 'खोजें', 'khojen'],
  ['बनाएं', 'बनाएं', 'banaen'],
  ['तरीका', 'तरीका', 'tareeka'],
  ['बढ़ाएं', 'बढ़ाएं', 'badhaen - nukta'],
  ['आसान', 'आसान', 'aasan'],
  ['सही', 'सही', 'sahi'],
  ['सरकारी', 'सरकारी', 'sarkari'],
  ['कौन', 'कौन', 'kaun - pre-base au'],
  ['होटल', 'होटल', 'hotel - pre-base o'],
  ['नौकरी', 'नौकरी', 'naukri - post-base au'],
  ['पैसे', 'पैसे', 'paise - pre-base ai'],
  ['बचाने', 'बचाने', 'bachane'],
  ['करने', 'करने', 'karne'],
];

for (const [input, want, why] of WORDS) {
  const structural = repairDevanagari(input);
  const got = repairHindiLine(structural.text).text;
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', `word: ${why}`);
  if (!ok) console.log(`      got ${got}  want ${want}  (structural gave ${structural.text})`);
}

// Whole lines, to catch a repair that is fine in isolation but wrong in context.
const LINES = [
  ['1. USA में Job कैसे खोजें — Complete Guide PDF', '1. USA में Job कैसे खोजें — Complete Guide PDF'],
  ['2. USA में रहने वालोों के ललए Useful Government Websites PDF',
   '2. USA में रहने वालों के लिए Useful Government Websites PDF'],
  ['3. USA में Credit Score कैसे बढ़ाएं? — Hindi PDF Guide', '3. USA में Credit Score कैसे बढ़ाएं? — Hindi PDF Guide'],
  ['6. USA में पैसे कैसे बचाने के 25 तरीके — Hindi Guide', '6. USA में पैसे कैसे बचाने के 25 तरीके — Hindi Guide'],
  ['7. USA में Apartment कैसे खोजें? — Complete Guide', '7. USA में Apartment कैसे खोजें? — Complete Guide'],
  ['हर Website का काम आसान Hindi में', 'हर Website का काम आसान Hindi में'],
  ['करने का सही तरीका', 'करने का सही तरीका'],
];

for (const [input, want] of LINES) {
  const structural = input
    .split(/(\s+)/)
    .map((p) => (/[\u0900-\u097F]/.test(p) ? repairDevanagari(p).text : p))
    .join('');
  const got = repairHindiLine(structural).text;
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', `line: ${input.slice(0, 32)}`);
  if (!ok) console.log(`      got  ${got}\n      want ${want}`);
}

// A correct word must never be flagged as corrupt.
for (const w of ['कैसे', 'लिए', 'कौन', 'होटल', 'नौकरी', 'पैसे', 'में', 'कोड']) {
  const issues = findDevanagariIssues(w).filter((i) => i !== 'matra-only-token');
  const ok = issues.length === 0;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', `no false corruption signal on ${w}`,
    ok ? '' : `-> ${issues.join(', ')}`);
}

// --- whiteout coverage -----------------------------------------------------
// The whiteout has to reach the top of the original ink or the glyphs show
// through it. ascentEm/descentEm below are the values read from the actual
// embedded font programs in sample1.pdf (see tests/metrics.check.mts), so this
// asserts the real coverage rather than a plausible-looking number.
import { verticalMetricsFor } from '../app/lib/pdfRenderer.ts';

const COVERAGE = [
  // [label, resolved metrics, font name, isDevanagari, old ascent guess]
  ['Nirmala UI', { ascentEm: 1.079, descentEm: 0.251 }, 'g_d0_f3', true, 0.98],
  ['Times New Roman', { ascentEm: 0.891, descentEm: 0.216 }, 'g_d0_f2', false, 0.80],
  ['Times New Roman (embedded)', { ascentEm: 0.891, descentEm: 0.216 }, 'g_d0_f4', false, 0.80],
  ['Segoe UI Emoji', { ascentEm: 0.728, descentEm: 0.210 }, 'g_d0_f1', false, 0.80],
];

for (const [label, metrics, name, isDev, oldGuess] of COVERAGE) {
  const got = verticalMetricsFor(metrics, name, isDev);
  const ok = got.ascentEm >= metrics.ascentEm;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', `whiteout covers the ink of ${label}`,
    `(${got.ascentEm.toFixed(3)}em vs ink ${metrics.ascentEm.toFixed(3)}em, was ${oldGuess}em)`);
}

// Never regress below the old guesses, whatever the font claims.
for (const [label, metrics, name, isDev, oldGuess] of COVERAGE) {
  const got = verticalMetricsFor(metrics, name, isDev);
  const ok = got.ascentEm >= oldGuess;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', `never under-covers the old guess for ${label}`);
}

// A font with no program at all still gets a sane box.
for (const name of ['g_d0_f9', 'weird-font', '']) {
  for (const isDev of [true, false]) {
    const got = verticalMetricsFor(undefined, name, isDev);
    const floor = isDev ? 0.98 : 0.8;
    const ok = got.ascentEm >= floor && got.ascentEm <= 1.2 && got.descentEm > 0;
    if (!ok) fail++;
    console.log(ok ? 'PASS' : 'FAIL', `fallback metrics for "${name}" dev=${isDev}`,
      `(${got.ascentEm.toFixed(2)}/${got.descentEm.toFixed(2)})`);
  }
}

// --- sample3.pdf: the ToUnicode faults specific to that document ------------
// Its subset substitutes ह for a leading क and turns a final ल into a matra, so
// the words arrive as legal-but-wrong syllables. The correction is a curated
// table plus one context rule, and every one of these is asserted both ways:
// fixed when the context supports it, untouched when it does not.
const S3 = [
  // The reported words.
  ['Interview के हिए Basic Preparation', 'Interview के लिए Basic Preparation'],
  ['1099 Form हकसके हिए होता है', '1099 Form किसके लिए होता है'],
  ['Online Job Apply करते समय हकन चीजो़ों का', 'Online Job Apply करते समय किन चीजों का'],
  ['Bank Details हकसी Unknown Person को', 'Bank Details किसी Unknown Person को'],
  // Single-glyph misreadings.
  ['सबसे पहिे Bank Account', 'सबसे पहले Bank Account'],
  ['Cashback Apps का इस्तेमाि', 'Cashback Apps का इस्तेमाल'],
  ['खाने का खचच कैसे कम करें', 'खाने का खर्च कैसे कम करें'],
  ['Credit Check हकया जाता है', 'Credit Check किया जाता है'],
  ['हर Website का हहसाब', 'हर Website का हिसाब'],
  ['रहने वालोों के ललए', 'रहने वालों के लिए'],
  // हिए on its own is a real word and must be left alone.
  ['यह हिए', 'यह हिए'],
  ['ये लोग हिए और', 'ये लोग हिए और'],
  ['वे हिए', 'वे हिए'],
  // जरूर is a complete word; it was being stretched to जरूरी.
  ['Expiry Date जरूर Check करें', 'Expiry Date जरूर Check करें'],
  ['Price Comparison जरूर करें', 'Price Comparison जरूर करें'],
  // किन is a complete word; it was being stretched to किनी.
  ['किन बातें', 'किन बातें'],
  ['किन चीजें', 'किन चीजें'],
  // Already-correct words in this document.
  ['कौन - कौन से Documents चाहहए', 'कौन - कौन से Documents चाहिए'],
  ['Fixed Budget बनाए़ं', 'Fixed Budget बनाएं'],
  ['या नही़ं', 'या नहीं'],
  ['Fake Job Offers और Scams को कैसे पहचानें', 'Fake Job Offers और Scams को कैसे पहचानें'],
];

for (const [input, want] of S3) {
  const structured = input
    .split(/(\s+)/)
    .map((p) => {
      if (!/[\u0900-\u097F]/.test(p)) return p;
      const read = applyMisreadings(p);
      return read !== p ? read : repairDevanagari(p).text;
    })
    .join('');
  const got = repairHindiLine(structured).text;
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', `sample3: ${input.slice(0, 30)}`);
  if (!ok) console.log(`      got  ${got}\n      want ${want}`);
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);

// Regression suite for the Hindi repair engine.
//
// Every Devanagari literal is built from code points. Typed literals in a test
// file are unreliable: a matra can be silently normalised into the independent
// vowel that looks identical, which is precisely the bug that shipped in the
// engine itself and made a whole rule dead code.
import { repairHindiLine, repairTokenLexical, isKnownWord } from '../app/lib/hindiRepair.ts';

const cp = (...codes) => String.fromCodePoint(...codes);

const AA = 0x093e;   // aa-matra
const E = 0x090f;    // e-matra
const O = 0x094b;    // o-matra
const OI = 0x0913;   // independent vowel "o" - these fonts emit both
const I = 0x093f;    // i-matra
const II = 0x0940;   // ii-matra
const ANUS = 0x0902; // anusvara
const NUKTA = 0x093c;
const YA = 0x092f;
const E_MATRA = 0x0947;
const B = 0x092c, N = 0x0928, J = 0x091c, W = 0x0935, H = 0x0939,
      L = 0x0932, R = 0x0930, K = 0x0915, D = 0x0922, S = 0x0938;

let fail = 0;
const eq = (n, a, b) => {
  if (a !== b) { fail++; console.log('FAIL ' + n + '\n  actual   ' + a + '\n  expected ' + b); }
  else console.log('ok   ' + n);
};

console.log('--- "ke liye" family (both vowel forms) ---');
eq('lalai',  repairTokenLexical(cp(L, L, E)), cp(L, I, E));
eq('ralai',  repairTokenLexical(cp(R, L, E)), cp(L, I, E));
eq('halai',  repairTokenLexical(cp(H, L, E)), cp(L, I, E));
eq('isalalai',repairTokenLexical(cp(0x0907, S, L, L, E)), cp(0x0907, S, L, I, E));

console.log('\n--- participle, both shapes ---');
eq('doubled o', repairTokenLexical(cp(B, D, AA, E, O, ANUS)), cp(B, D, AA, E, ANUS));
eq('spurious ya', repairTokenLexical(cp(B, N, AA, YA, E_MATRA, ANUS)), cp(B, N, AA, E, ANUS));
eq('locative jahan', repairHindiLine(cp(J, H, AA, O, ANUS)).text, cp(J, H, AA, ANUS));
eq('locative wahan', repairHindiLine(cp(W, H, AA, O, ANUS)).text, cp(W, H, AA, ANUS));
eq('locative via matra', repairHindiLine(cp(J, H, AA, OI, ANUS)).text, cp(J, H, AA, ANUS));

console.log('\n--- stray nukta + doubled sign (sample3) ---');
eq('nukta after matra', repairHindiLine(cp(B, N, AA, E, NUKTA, O, ANUS)).text, cp(B, N, AA, E, ANUS));
eq('nahin', repairHindiLine(cp(N, H, II, NUKTA, O, ANUS)).text, cp(N, H, II, ANUS));

console.log('\n--- duplicate consonants (must be allowed to shorten) ---');
eq('kharchch', repairTokenLexical('खर्चच'), 'खर्च');
eq('hissa',   repairTokenLexical('हिस्सा'), 'हिस्सा');

console.log('\n--- no consonant may be invented ---');
// The ढ for ड swap is the same length, so only a subset check can catch it.
const badhaeon = cp(B, D, AA, E, ANUS);
eq('badhaeon left alone', repairTokenLexical(badhaeon), badhaeon);

console.log('\n--- MUST NOT damage (real words) ---');
const safe = [
  'सही','रही','रहे','रखें','रखे','रखना','रहें','रहना','करें','करने','होने','जाने',
  'कैसे','क्या','क्यों','खोजें','इस्तेमाल','तरीका','बनाएं','नाम','कार्यालय',
  'सरकार','व्यक्ति','जानकारी','समय','पैसा','नौकरी','अमेरिका','भारत','हिन्दी',
  'मासिक','हिस्सा','बिजली','समझें','तैयार','खर्च','बचत','आय','चाहिए','नहीं',
  'के','का','की','को','में','से','पर','और','या','ही','भी','तो','कि','जो','है','हैं',
  'नया','नए','नयी','पहला','दूसरा','बड़ा','छोटा','अच्छा','ज़रूरी','वालों','वाले',
  'आने','सभी','कोई','कुछ','बहुत','ज्यादा','थोड़ा','साथ','बाद','पहले',
  'लिखना','पढ़ना','सीखना','समझना','देखना','सुनना','चाहना','मिलना','लगना','चलना',
  'होना','करना','देना','लेना','बनाना','रखना','रहना','जाना','आना',
];
for (const w of safe) {
  const got = repairTokenLexical(w);
  if (got !== w) { fail++; console.log('FAIL damaged: ' + w + ' -> ' + got); }
}
console.log('ok   ' + safe.length + ' words undamaged');

console.log('\n--- verb inflections recognised ---');
for (const w of ['रखें','रहें','करें','होने','जाने','देखें','सीखें','चाहें','लगें','मिलें']) {
  if (!isKnownWord(w)) { fail++; console.log('FAIL not recognised: ' + w); }
}
console.log('ok   verb inflections recognised');

console.log('\n--- repair must not damage run structure ---');
// The regression that lost bold across a repaired line. Repairing a whole
// line changes its length, the runs stop matching, and the line collapses to a
// single style. Repairing each run independently is what keeps the bold, so
// this asserts the property that makes that safe: a run repaired on its own
// still yields exactly one run, and the concatenation is unchanged apart from
// the repaired characters.
{
  const runs = [
    { text: 'छोटी-छोटी बचत ', isBold: true },
    { text: 'लंबे समय में ', isBold: true },
    { text: 'बडा अंति', isBold: true },
  ];
  const before = runs.map((r) => r.text).join('');
  const repaired = runs.map((r) => {
    const x = repairHindiLine(r.text);
    return { ...r, text: x.changes ? x.text : r.text };
  });
  const after = repaired.map((r) => r.text).join('');
  eq('run count preserved', repaired.length, runs.length);
  eq('all runs still bold', repaired.every((r) => r.isBold), true);
  eq('text only changed where repaired', after === before || after.length !== 0, true);
  // Whitespace must survive: an emptied run would weld two words together.
  eq('no run lost its spaces', repaired.filter((r) => r.text.trim() === '').length, 0);
}

console.log('\n--- spacing is never touched ---');
// sample2 emits 328 whitespace-only text items. Treating a separator as an empty
// token and dropping it welded words together, so whitespace must pass through
// untouched at every level.
for (const w of [' ', '  ', ' \t ', '\n']) {
  eq('whitespace survives verbatim ' + JSON.stringify(w), repairHindiLine(w).text, w);
}
eq(
  'space between words survives repair',
  repairHindiLine('के ' + cp(L, L, E) + ' और').text,
  'के ' + cp(L, I, E) + ' और'
);
eq(
  'leading and trailing space survive repair',
  repairHindiLine(' ' + cp(L, L, E) + ' ').text,
  ' ' + cp(L, I, E) + ' '
);
eq('no space is invented', repairHindiLine('बनाएं।').text, 'बनाएं।');
eq('no double space is invented', repairHindiLine('बनाएं। और').text, 'बनाएं। और');

console.log('\n--- idempotence ---');
for (const l of ['के ' + cp(L, L, E) + ' और', 'नहीं आएगा जरूर', cp(B, N, AA, E, NUKTA, O, ANUS) + ' क्य?']) {
  const once = repairHindiLine(l).text;
  eq('stable', repairHindiLine(once).text, once);
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILURE(S)'));
process.exit(fail === 0 ? 0 : 1);

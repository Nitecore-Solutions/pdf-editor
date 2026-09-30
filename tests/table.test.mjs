// Table clustering tests. The items are shaped exactly like the ones pdf.js
// yields (str, xPct, widthPct, yPct, heightPct, baselinePct), so this exercises
// the real geometry without needing a PDF.
import { detectTableCells } from '../app/lib/pdfRenderer.ts';

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', label);
  if (!ok) console.log('   got ', JSON.stringify(got), '\n   want', JSON.stringify(want));
};

let n = 0;
const it = (str, x, width, baseline) => ({
  id: `i${n++}`, str, xPct: x, widthPct: width,
  yPct: baseline - 1, heightPct: 2, baselinePct: baseline,
});
// A cell's worth of text: words ~0.5% apart (4 - 3.5), cells ~8% apart.
const cell = (words, x, baseline) =>
  words.map((w, k) => it(w, x + k * 4, 3.5, baseline));
// A row is a flat list of items across all its cells.
const rowOf = (cells) => cells.flat();

// ---------------------------------------------------------------------------
// A three-column grid, the shape in the bug report. Every cell is a single
// word, so *every* gap on the page is a column gap - which is what defeated the
// earlier median-gap approach.
// ---------------------------------------------------------------------------
const rows3 = [
  rowOf([cell(['AI'], 8, 80), cell(['AI की सहायता'], 20, 80), cell(['Before/After'], 55, 80)]),
  rowOf([cell(['Photo'], 8, 75), cell(['Editing के लिए'], 20, 75), cell(['prompt, AI'], 55, 75)]),
  rowOf([cell(['Editing'], 8, 70), cell(['सानन्य कोटे'], 20, 70), cell(['tool का पूरा'], 55, 70)]),
  rowOf([cell(['Video'], 8, 65), cell(['वीडियो बनाना'], 20, 65), cell(['टूल की जानकारी'], 55, 65)]),
];
const c3 = detectTableCells(rows3);
eq('a three-column grid is detected', c3 && c3.length, 12);
eq('each cell stays whole', c3 && c3.map((c) => c.map((i) => i.str)),
  [
    ['AI'], ['AI की सहायता'], ['Before/After'],
    ['Photo'], ['Editing के लिए'], ['prompt, AI'],
    ['Editing'], ['सानन्य कोटे'], ['tool का पूरा'],
    ['Video'], ['वीडियो बनाना'], ['टूल की जानकारी'],
  ]);
eq('cells are in reading order, row by row', c3 && c3[3][0].str, 'Photo');

// Multi-word cells must NOT be split at their internal word gap. Note the left
// cell is a different width on every row, so the middle of the gap moves - which
// is why the divider is anchored to the right cell's edge, not the gap's centre.
const multi = [
  [it('Employee', 8, 3.5, 80), it('Name', 12, 3.5, 80), it('Chand', 30, 5, 80), it('Ansari', 35.5, 5.5, 80)],
  [it('Designation', 8, 9, 75), it('Web', 17.5, 3, 75), it('App', 21, 3, 75), it('Developer', 30, 8, 75)],
  [it('Company', 8, 6, 70), it('Nitecore', 14.5, 7, 70), it('Solutions', 30, 7, 70)],
];
const cMulti = detectTableCells(multi);
eq('a two-word cell is one cell', cMulti && cMulti.length, 6);
eq('the words stay in their own cell', cMulti && cMulti[0].map((i) => i.str), ['Employee', 'Name']);
eq('the label and the value are not merged', cMulti && cMulti[1].map((i) => i.str), ['Chand', 'Ansari']);

// A single row cannot be identified as a grid: a lone wide gap is just as likely
// to be a tab in a sentence. Requiring a second row is what keeps prose intact,
// so this is a deliberate limit rather than an oversight.
eq('a single row is left as one line', detectTableCells([multi[0]]), null);

// ---------------------------------------------------------------------------
// The offer-letter shape: a two-column label/value table, where the divider
// falls in the middle of a real space item.
// ---------------------------------------------------------------------------
const rows2 = [];
for (let r = 0; r < 4; r++) {
  const b = 80 - r * 5;
  rows2.push([
    it('Employee Name', 8, 14, b),
    it(' ', 23, 1, b),          // the divider is written as a space item
    it('Chand Ansari', 25, 13, b),
  ]);
}
const c2 = detectTableCells(rows2);
eq('a two-column table is detected', c2 && c2.length, 8);
eq('the boundary is found despite the space item', c2 && c2[0].map((i) => i.str),
  ['Employee Name']);

// ---------------------------------------------------------------------------
// Prose must be left completely alone.
// ---------------------------------------------------------------------------
const para = [
  'है। प्र कय करें। हैं। ि वलए व्यस्थ ाप्त आिश्यक महत्वपूर्य वकसी हय',
  'आज महत्वपूर्य वकसी हय उपययग जीिन ान आप क्य आिश्यकता है कंप्यूटर केिल',
  'दुवनया पयायप्त भयजन य रखें। वशक्षा अनेक अन्य कयई चावहए ज्ञ ध्य प पढाई',
  'प्रश्न म वकया वनयवमत स्व ह उपययगकताय कार दस्तािेज पररिार प्रश्',
];
const rowsProse = para.map((line, r) => {
  const b = 80 - r * 4;
  return line.split(' ').map((w, k) => it(w, 8 + k * 4, 3.5, b));
});
eq('prose is not mistaken for a table', detectTableCells(rowsProse), null);

// A bulleted list: the bullet is close to its text, so no gap qualifies.
const rowsBullets = [];
for (let r = 0; r < 6; r++) {
  const b = 80 - r * 4;
  rowsBullets.push([it('◦', 6, 1, b), it('सही', 7.5, 4, b), it('तरीका', 12, 5, b), it('का', 17.5, 2, b)]);
}
eq('a bulleted list is not a table', detectTableCells(rowsBullets), null);

// A single wide gap on one line only - a tab, not a grid.
const oneOff = [
  [it('a', 8, 3, 80), it('b', 11.5, 3, 80), it('far away', 40, 8, 80)],
  [it('c', 8, 3, 75), it('d', 11.5, 3, 75)],
  [it('e', 8, 3, 70), it('f', 11.5, 3, 70)],
];
eq('one stray wide gap is not a grid', detectTableCells(oneOff), null);

// Text too short to judge.
eq('a page with too few gaps is left alone', detectTableCells([[it('only', 8, 3, 80)]]), null);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);

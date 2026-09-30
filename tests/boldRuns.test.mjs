// A line that mixes bold and regular text keeps its styling only while the runs
// still concatenate to exactly the line's text. PageEditor checks that with
//
//   runs.reduce((n, r) => n + r.text.length, 0) === str.length
//
// and throws the runs away when it fails, rendering the line in a single weight.
// The line text is trimmed but the runs used to come from the untrimmed pieces,
// and pdf.js puts whitespace-only items at the ends of lines, so a single
// trailing space was enough to flatten every bold fragment on that line.
import { trimRunsToText } from '../app/lib/pdfRenderer.ts';
import { runsToText } from '../app/lib/richText.ts';

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', label);
  if (!ok) console.log('   got ', JSON.stringify(got), '\n   want', JSON.stringify(want));
};
const aligns = (runs, text) =>
  runs.length > 0 && runs.reduce((n, r) => n + r.text.length, 0) === text.length;

const R = (text, isBold) => ({ text, isBold, isItalic: false, isUnderline: false });

// The offer-letter line, exactly as the extractor produces it: a trailing space
// item, and a bold phrase in the middle.
const pieces = [
  R('We are pleased to offer you the position of ', false),
  R('Web & App Developer', true),
  R(' at Nitecore Solutions Pvt. Ltd.', true),
  R(' ', false),
];
const lineText = pieces.map((p) => p.text).join('').trim();

eq('the untrimmed runs really do disagree with the text',
  aligns(pieces, lineText), false);

const fixed = trimRunsToText(pieces, lineText);
eq('the trimmed runs align with the text', aligns(fixed, lineText), true);
eq('the text is unchanged', runsToText(fixed), lineText);
eq('the bold fragment survives', fixed.filter((r) => r.isBold).map((r) => r.text),
  ['Web & App Developer', ' at Nitecore Solutions Pvt. Ltd.']);
eq('the regular fragment survives', fixed.filter((r) => !r.isBold).map((r) => r.text),
  ['We are pleased to offer you the position of ']);
eq('only the outer whitespace was removed', fixed.length, 3);

// A leading space item, which pdf.js also emits.
const lead = trimRunsToText(
  [R(' ', false), R('1. Position Details', true), R('Designation', false)],
  '1. Position DetailsDesignation'
);
eq('a leading space is trimmed too', runsToText(lead), '1. Position DetailsDesignation');
eq('and it still aligns', aligns(lead, '1. Position DetailsDesignation'), true);

// Runs that are already clean are left alone.
const clean = [R('Hello ', false), R('World', true)];
eq('already-aligned runs are untouched', trimRunsToText(clean, 'Hello World'), clean);

// Runs made only of whitespace collapse to nothing, rather than being handed on
// as an empty styled line.
eq('an all-whitespace run list collapses',
  trimRunsToText([R('  ', false), R(' ', true)], ''), []);

// A mixed Hindi line from the sample documents, to prove the fix is not
// specific to Latin text.
const hi = [
  R('रहने ', false),
  R('वालों', true),
  R(' के ', false),
  R('लिए', true),
  R(' ', false),
];
const hiText = hi.map((r) => r.text).join('').trim();
const hiFixed = trimRunsToText(hi, hiText);
eq('a Hindi line aligns after trimming', aligns(hiFixed, hiText), true);
eq('and keeps its text', runsToText(hiFixed), hiText);
eq('and keeps both bold fragments', hiFixed.filter((r) => r.isBold).map((r) => r.text),
  ['वालों', 'लिए']);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);

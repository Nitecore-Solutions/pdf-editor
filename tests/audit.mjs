// Reusable audit: runs the real repair pipeline over a PDF and reports every
// word that would change, with frequency. Judging these is how the lexicon and
// the protected list get decided - a bigger lexicon is only safe if the words it
// attracts are the words that are actually damaged.
import fs from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
import { repairDevanagari, findDevanagariIssues } from '../app/lib/devanagari.ts';
import { repairHindiLine, applyMisreadings, isKnownWord } from '../app/lib/hindiRepair.ts';

const piece = (w) => {
  const read = applyMisreadings(w);
  return read !== w ? read : repairDevanagari(w).text;
};

const counts = new Map();
for (const file of process.argv.slice(2)) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str || !/[\u0900-\u097F]/.test(it.str)) continue;
      for (const w of it.str.match(/[\u0900-\u097F]+/g) || []) {
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }
}

const words = [...counts.keys()].sort();
const known = words.filter((w) => isKnownWord(w));
console.log(`${words.length} distinct words, ${known.length} in lexicon (${Math.round((known.length / words.length) * 100)}%)\n`);

const rows = [];
for (const w of words) {
  const st = piece(w);
  const out = repairHindiLine(st).text;
  rows.push({ w, n: counts.get(w), st, out, changed: out !== w, issues: findDevanagariIssues(st) });
}

const changed = rows.filter((r) => r.changed);
console.log(`--- ${changed.length} words would change ---`);
for (const r of changed.sort((a, b) => b.n - a.n)) {
  console.log(`${String(r.n).padStart(3)}x  ${r.w}  ->  ${r.out}${r.st !== r.w ? `  [struct ${r.st}]` : ''}`);
}

console.log(`\n--- unknown words the lexicon does not know (${words.length - known.length}) ---`);
console.log(
  rows
    .filter((r) => !isKnownWord(r.w))
    .sort((a, b) => b.n - a.n)
    .map((r) => r.w)
    .join(' ')
);

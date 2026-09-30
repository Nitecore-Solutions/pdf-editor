// Does table detection misfire on real documents? Reconstructs the rows the way
// pdfRenderer does (positions in percent of page size) and asks
// detectTableCells whether each page is a grid. Prose must always come back
// null, or ordinary lines would start being cut into pieces.
import fs from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
import { detectTableCells } from '../app/lib/pdfRenderer.ts';

const BASE = 1.3333;

for (const file of process.argv.slice(2)) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
  let flagged = 0;
  const details = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: BASE });
    const tc = await page.getTextContent();

    const items = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const tx = it.transform;
      const fontPt = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
      const fontPx = fontPt * BASE;
      const widthPx = it.width ? it.width * BASE : it.str.length * fontPx * 0.55;
      const [, vy] = vp.convertToViewportPoint(tx[4], tx[5]);
      const [, vx] = vp.convertToViewportPoint(tx[4], tx[5]);
      items.push({
        str: it.str,
        xPct: Math.max(0, (vx / vp.width) * 100),
        widthPct: (widthPx / vp.width) * 100,
        yPct: Math.max(0, ((vy - fontPx * 0.8) / vp.height) * 100),
        heightPct: (fontPx * 1.08 / vp.height) * 100,
        baselinePct: (vy / vp.height) * 100,
      });
    }

    // Cluster by baseline, exactly as pdfRenderer does.
    const rows = [];
    for (const block of [...items].sort((a, b) => a.baselinePct - b.baselinePct)) {
      const row = rows.find((r) => {
        const avg = r.reduce((s, b) => s + b.baselinePct, 0) / r.length;
        return Math.abs(block.baselinePct - avg) < 0.85;
      });
      if (row) row.push(block);
      else rows.push([block]);
    }

    const cells = detectTableCells(rows);
    if (cells) {
      flagged++;
      details.push(`  p${p}: DETECTED AS TABLE (${rows.length} rows -> ${cells.length} cells)`);
    }
  }

  console.log(`${file}: ${flagged}/${doc.numPages} pages flagged as tables`);
  for (const d of details) console.log(d);
}

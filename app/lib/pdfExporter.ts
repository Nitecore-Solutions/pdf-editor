import { PDFDocument, rgb, degrees, StandardFonts, PDFFont } from 'pdf-lib';
import { EditorElement, PageInfo, DrawingElement, TextRun } from '../types/editor';
import { getRuns, runsToText, splitRunsIntoLines, normalizeHexColor } from './richText';

// Helper to convert hex color string (#RRGGBB) to pdf-lib rgb(r, g, b)
function hexToRgb(hex: string) {
  if (!hex || hex === 'transparent') return rgb(0, 0, 0);
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

// Convert base64 DataURL to Uint8Array
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// High-resolution fallback for rendering Unicode (Hindi / Devanagari / Special symbols) to PNG.
// Draws run by run so that range-scoped bold/italic/colour survive the raster fallback.
function renderTextToCanvasPng(
  runs: TextRun[],
  fontSizePt: number,
  fontFamily: string,
  boxWidthPt: number,
  align: string = 'left'
): Uint8Array | null {
  try {
    const scale = 3; // 3x crisp supersampling
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontFor = (r: TextRun) =>
      `${r.isItalic ? 'italic ' : ''}${r.isBold ? 'bold ' : ''}${Math.round(
        fontSizePt * scale
      )}px ${fontFamily || 'Arial, sans-serif'}`;

    const lines = splitRunsIntoLines(runs);
    const measure = (lineRuns: TextRun[]) => {
      let w = 0;
      for (const r of lineRuns) {
        if (!r.text) continue;
        ctx.font = fontFor(r);
        w += ctx.measureText(r.text).width;
      }
      return w;
    };

    let maxLineWidth = 0;
    for (const lineRuns of lines) {
      const m = measure(lineRuns);
      if (m > maxLineWidth) maxLineWidth = m;
    }

    const w = Math.max(Math.round(boxWidthPt * scale), Math.round(maxLineWidth) + 20);
    const lineHeightPx = fontSizePt * 1.25 * scale;
    const topPadding = fontSizePt * 0.35 * scale; // headroom for Devanagari top matras
    const h = Math.round(Math.max(fontSizePt * scale, lines.length * lineHeightPx) + topPadding);

    canvas.width = w;
    canvas.height = h;

    ctx.textBaseline = 'top';

    lines.forEach((lineRuns, idx) => {
      const lineW = measure(lineRuns);
      let x = 0;
      if (align === 'center') x = (w - lineW) / 2;
      else if (align === 'right') x = w - lineW;

      for (const r of lineRuns) {
        if (!r.text) continue;
        ctx.font = fontFor(r);
        ctx.fillStyle = r.color || '#000000';
        ctx.fillText(r.text, x, topPadding + idx * lineHeightPx);
        if (r.isUnderline) {
          const prev = ctx.fillStyle;
          ctx.fillRect(x, topPadding + idx * lineHeightPx + fontSizePt * scale * 1.05,
            ctx.measureText(r.text).width, Math.max(1, Math.round(fontSizePt * scale * 0.06)));
          ctx.fillStyle = prev;
        }
        x += ctx.measureText(r.text).width;
      }
    });

    const dataUrl = canvas.toDataURL('image/png');
    return dataUrlToBytes(dataUrl);
  } catch (e) {
    console.warn('Unicode text rasterization fallback failed:', e);
    return null;
  }
}

// Render freehand drawings and highlighters in a single unified 2D canvas pass to prevent alpha accumulation
function renderDrawingPathsToCanvasPng(
  drawings: { paths?: { points: { x: number; y: number }[]; color: string; width: number; opacity: number; isHighlighter?: boolean }[] }[],
  pageWidthPt: number,
  pageHeightPt: number
): Uint8Array | null {
  try {
    const scale = 2.5; // 2.5x crisp supersampling
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(pageWidthPt * scale);
    canvas.height = Math.round(pageHeightPt * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    for (const drawing of drawings) {
      for (const path of drawing.paths || []) {
        if (!path.points || path.points.length < 2) continue;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const isHighlighter = path.isHighlighter;
        const strokeWidth = (isHighlighter ? 10 : (path.width || 2.5)) * (scale / 1.3333);
        ctx.lineWidth = Math.max(1, strokeWidth);
        ctx.strokeStyle = path.color || (isHighlighter ? '#fde047' : '#ef4444');
        ctx.globalAlpha = isHighlighter ? 0.35 : (path.opacity ?? 1);

        const pts = path.points;
        ctx.beginPath();
        const p0x = (pts[0].x / 100) * canvas.width;
        const p0y = (pts[0].y / 100) * canvas.height;
        ctx.moveTo(p0x, p0y);

        for (let i = 1; i < pts.length - 1; i++) {
          const curX = (pts[i].x / 100) * canvas.width;
          const curY = (pts[i].y / 100) * canvas.height;
          const nextX = (pts[i + 1].x / 100) * canvas.width;
          const nextY = (pts[i + 1].y / 100) * canvas.height;

          const midX = (curX + nextX) / 2;
          const midY = (curY + nextY) / 2;

          ctx.quadraticCurveTo(curX, curY, midX, midY);
        }

        const lastX = (pts[pts.length - 1].x / 100) * canvas.width;
        const lastY = (pts[pts.length - 1].y / 100) * canvas.height;
        ctx.lineTo(lastX, lastY);

        ctx.stroke();
        ctx.restore();
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    return dataUrlToBytes(dataUrl);
  } catch (e) {
    console.warn('Failed to render drawing to canvas PNG:', e);
    return null;
  }
}

export interface ExportPdfOptions {
  originalPdfBytes: Uint8Array | null;
  pages: PageInfo[];
  elements: EditorElement[];
  fileName?: string;
}

export async function exportModifiedPdf({
  originalPdfBytes,
  pages,
  elements,
  fileName = 'edited_document.pdf',
}: ExportPdfOptions): Promise<Uint8Array> {
  const outputDoc = await PDFDocument.create();

  // Standard font embeddings
  const helveticaFont = await outputDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await outputDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await outputDoc.embedFont(StandardFonts.HelveticaOblique);
  const helveticaBoldOblique = await outputDoc.embedFont(StandardFonts.HelveticaBoldOblique);
  const timesFont = await outputDoc.embedFont(StandardFonts.TimesRoman);
  const courierFont = await outputDoc.embedFont(StandardFonts.Courier);

  // Load source document if provided
  let sourceDoc: PDFDocument | null = null;
  if (originalPdfBytes && originalPdfBytes.length > 0) {
    sourceDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
  }

  // Create/copy pages in order
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageInfo = pages[pageIdx];
    let pdfPage: any;

    if (pageInfo.isNewBlank || !sourceDoc || pageInfo.originalPageIndex === undefined) {
      // Create new blank A4 page (595.28 x 841.89 pt)
      const w = 595.28;
      const h = 841.89;
      pdfPage = outputDoc.addPage([w, h]);
    } else {
      // Copy existing page
      const [copiedPage] = await outputDoc.copyPages(sourceDoc, [pageInfo.originalPageIndex]);
      pdfPage = outputDoc.addPage(copiedPage);
    }

    // Apply rotation
    if (pageInfo.rotation) {
      const currentRotation = pdfPage.getRotation().angle || 0;
      pdfPage.setRotation(degrees((currentRotation + pageInfo.rotation) % 360));
    }

    const { width: pageWidth, height: pageHeight } = pdfPage.getSize();

    // Get all elements on this specific page
    const pageElements = elements.filter((el) => el.pageIndex === pageIdx);

    for (const el of pageElements) {
      // Convert percentage coordinates to PDF points (origin at top-left in UI, bottom-left in PDF)
      const elWidth = (el.width / 100) * pageWidth;
      const elHeight = (el.height / 100) * pageHeight;
      const elX = (el.x / 100) * pageWidth;
      const elY = pageHeight - ((el.y + el.height) / 100) * pageHeight;

      if (el.type === 'whiteout') {
        pdfPage.drawRectangle({
          x: elX,
          y: elY,
          width: Math.max(1, elWidth),
          height: Math.max(1, elHeight),
          color: hexToRgb(el.color || '#ffffff'),
          borderWidth: 0,
        });
      } else if (el.type === 'text') {
        // Range-scoped styling: each run carries its own weight/slant/colour.
        const fontSizePt = Math.max(4, (el.fontSize || 14) / 1.3333);
        const lineHeight = fontSizePt * 1.2;
        const runs = getRuns(el);
        const lineRunsList = splitRunsIntoLines(runs);
        const baseColor = normalizeHexColor(el.color);

        const pickFont = (isBold: boolean, isItalic: boolean): PDFFont => {
          // Times/Courier only have the regular face embedded (matching the
          // previous behaviour); the Helvetica family covers all four styles.
          if (el.fontFamily?.includes('Times')) return timesFont;
          if (el.fontFamily?.includes('Courier')) return courierFont;
          if (isBold && isItalic) return helveticaBoldOblique;
          if (isBold) return helveticaBold;
          if (isItalic) return helveticaOblique;
          return helveticaFont;
        };

        const canEncodeDirectly = (() => {
          try {
            for (const r of runs) {
              if (r.text) pickFont(!!r.isBold, !!r.isItalic).encodeText(r.text);
            }
            return true;
          } catch (_) {
            return false;
          }
        })();

        if (canEncodeDirectly) {
          lineRunsList.forEach((lineRuns, lineIndex) => {
            const lineText = runsToText(lineRuns);
            if (!lineText.trim() && lineRunsList.length === 1) return;
            const lineY = pageHeight - (el.y / 100) * pageHeight - (lineIndex + 0.85) * lineHeight;

            const lineWidth = lineRuns.reduce((sum, r) => {
              if (!r.text) return sum;
              return sum + pickFont(!!r.isBold, !!r.isItalic).widthOfTextAtSize(r.text, fontSizePt);
            }, 0);

            let x = elX;
            if (el.align === 'center') {
              x = elX + (elWidth - lineWidth) / 2;
            } else if (el.align === 'right') {
              x = elX + elWidth - lineWidth;
            }

            for (const r of lineRuns) {
              if (!r.text) continue;
              const font = pickFont(!!r.isBold, !!r.isItalic);
              const runWidth = font.widthOfTextAtSize(r.text, fontSizePt);
              const drawX = Math.max(0, x);
              const drawY = Math.max(0, lineY);

              pdfPage.drawText(r.text, {
                x: drawX,
                y: drawY,
                size: fontSizePt,
                font,
                color: hexToRgb(r.color || baseColor),
              });

              // Underline is a run-level property, so it has to be drawn here;
              // previously it was rendered on screen but silently dropped on export.
              if (r.isUnderline) {
                const thickness = Math.max(0.5, fontSizePt * 0.06);
                pdfPage.drawLine({
                  start: { x: drawX, y: drawY - fontSizePt * 0.12 },
                  end: { x: drawX + runWidth, y: drawY - fontSizePt * 0.12 },
                  thickness,
                  color: hexToRgb(r.color || baseColor),
                });
              }

              x += runWidth;
            }
          });
        } else {
          // Unicode / Hindi / Complex script fallback via high-res PNG embedding
          try {
            const pngBytes = renderTextToCanvasPng(
              runs,
              fontSizePt,
              el.fontFamily || 'Arial, sans-serif',
              elWidth,
              el.align || 'left'
            );
            if (pngBytes) {
              const embedded = await outputDoc.embedPng(pngBytes);
              const { width: imgW, height: imgH } = embedded.scale(1 / 3);
              pdfPage.drawImage(embedded, {
                x: elX,
                y: pageHeight - (el.y / 100) * pageHeight - imgH + (imgH * 0.35 / 1.35),
                width: imgW,
                height: imgH,
              });
            }
          } catch (unicodeErr) {
            console.warn('Unicode text embed error:', unicodeErr);
          }
        }
      } else if (el.type === 'image' || el.type === 'signature') {
        try {
          if (el.dataUrl && el.dataUrl.startsWith('data:image/')) {
            const imgBytes = dataUrlToBytes(el.dataUrl);
            const isPng = el.dataUrl.includes('image/png');
            const embeddedImage = isPng
              ? await outputDoc.embedPng(imgBytes)
              : await outputDoc.embedJpg(imgBytes);

            pdfPage.drawImage(embeddedImage, {
              x: elX,
              y: elY,
              width: Math.max(1, elWidth),
              height: Math.max(1, elHeight),
            });
          }
        } catch (imgErr) {
          console.warn('Failed to embed image in PDF:', imgErr);
        }
      } else if (el.type === 'shape') {
        const strokeColor = hexToRgb(el.strokeColor || '#000000');
        const strokeWidth = el.strokeWidth || 2;
        const fillColor =
          el.isFilled && el.fillColor && el.fillColor !== 'transparent'
            ? hexToRgb(el.fillColor)
            : undefined;

        if (el.shapeType === 'rectangle') {
          pdfPage.drawRectangle({
            x: elX,
            y: elY,
            width: Math.max(1, elWidth),
            height: Math.max(1, elHeight),
            borderColor: strokeColor,
            borderWidth: strokeWidth,
            color: fillColor,
          });
        } else if (el.shapeType === 'circle') {
          const rx = elWidth / 2;
          const ry = elHeight / 2;
          pdfPage.drawEllipse({
            x: elX + rx,
            y: elY + ry,
            xScale: Math.max(1, rx),
            yScale: Math.max(1, ry),
            borderColor: strokeColor,
            borderWidth: strokeWidth,
            color: fillColor,
          });
        } else if (el.shapeType === 'line' || el.shapeType === 'arrow') {
          pdfPage.drawLine({
            start: { x: elX, y: elY + elHeight },
            end: { x: elX + elWidth, y: elY },
            thickness: strokeWidth,
            color: strokeColor,
          });
          // Arrow head
          if (el.shapeType === 'arrow') {
            const endX = elX + elWidth;
            const endY = elY;
            const angle = Math.atan2(-elHeight, elWidth);
            const headLen = Math.max(8, strokeWidth * 3);
            pdfPage.drawLine({
              start: { x: endX, y: endY },
              end: {
                x: endX - headLen * Math.cos(angle - Math.PI / 6),
                y: endY - headLen * Math.sin(angle - Math.PI / 6),
              },
              thickness: strokeWidth,
              color: strokeColor,
            });
            pdfPage.drawLine({
              start: { x: endX, y: endY },
              end: {
                x: endX - headLen * Math.cos(angle + Math.PI / 6),
                y: endY - headLen * Math.sin(angle + Math.PI / 6),
              },
              thickness: strokeWidth,
              color: strokeColor,
            });
          }
        }
      } else if (el.type === 'drawing') {
        // Rendered collectively after element loop to maintain proper layer blending
      } else if (el.type === 'form') {
        if (el.formType === 'checkbox') {
          pdfPage.drawRectangle({
            x: elX,
            y: elY,
            width: elWidth,
            height: elHeight,
            borderColor: rgb(0.2, 0.2, 0.2),
            borderWidth: 1.5,
            color: rgb(1, 1, 1),
          });
          // Draw crisp vector checkmark lines (never throws WinAnsi error)
          if (el.value === true) {
            pdfPage.drawLine({
              start: { x: elX + elWidth * 0.2, y: elY + elHeight * 0.45 },
              end: { x: elX + elWidth * 0.42, y: elY + elHeight * 0.2 },
              thickness: 2,
              color: rgb(0.1, 0.6, 0.2),
            });
            pdfPage.drawLine({
              start: { x: elX + elWidth * 0.42, y: elY + elHeight * 0.2 },
              end: { x: elX + elWidth * 0.8, y: elY + elHeight * 0.78 },
              thickness: 2,
              color: rgb(0.1, 0.6, 0.2),
            });
          }
        } else {
          // Text form field: Do not draw artificial background rectangle or border box!
          if (typeof el.value === 'string' && el.value.trim()) {
            const fontSizePt = Math.max(6, (el.fontSize || 12) / 1.3333);
            const textColor = hexToRgb(el.color || '#000000');
            let fontToUse = helveticaFont;
            if (el.isBold && el.isItalic) fontToUse = helveticaBoldOblique;
            else if (el.isBold) fontToUse = helveticaBold;
            else if (el.isItalic) fontToUse = helveticaOblique;

            try {
              fontToUse.encodeText(el.value);
              pdfPage.drawText(el.value, {
                x: elX + 2,
                y: elY + (elHeight - fontSizePt) / 2,
                size: fontSizePt,
                font: fontToUse,
                color: textColor,
              });
            } catch (_) {
              const pngBytes = renderTextToCanvasPng(
                [
                  {
                    text: String(el.value ?? ''),
                    isBold: !!el.isBold,
                    isItalic: !!el.isItalic,
                    color: el.color || '#000000',
                  },
                ],
                fontSizePt,
                el.fontFamily || 'Arial, sans-serif',
                elWidth
              );
              if (pngBytes) {
                const embedded = await outputDoc.embedPng(pngBytes);
                const { width: imgW, height: imgH } = embedded.scale(1 / 3);
                pdfPage.drawImage(embedded, {
                  x: elX + 2,
                  y: elY + (elHeight - imgH) / 2,
                  width: imgW,
                  height: imgH,
                });
              }
            }
          }
        }
      }
    }

    // Embed all drawings & highlighters on this page as a single crisp transparent PNG layer
    const pageDrawings = pageElements.filter((el): el is DrawingElement => el.type === 'drawing');
    if (pageDrawings.length > 0) {
      try {
        const pngBytes = renderDrawingPathsToCanvasPng(pageDrawings, pageWidth, pageHeight);
        if (pngBytes) {
          const embedded = await outputDoc.embedPng(pngBytes);
          pdfPage.drawImage(embedded, {
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight,
          });
        }
      } catch (drawErr) {
        console.warn('Failed to embed drawings layer:', drawErr);
      }
    }
  }

  const pdfOutputBytes = await outputDoc.save();
  return pdfOutputBytes;
}

export function downloadPdfBlob(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

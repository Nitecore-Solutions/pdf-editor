
function renderDrawingsToCanvasPng(
  drawingElements: any[],
  pageWidthPt: number,
  pageHeightPt: number
): Uint8Array | null {
  try {
    if (typeof document === 'undefined') return null;
    const scale = 2.5;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(pageWidthPt * scale);
    canvas.height = Math.round(pageHeightPt * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scale, scale);

    for (const el of drawingElements) {
      for (const path of el.paths || []) {
        if (!path.points || path.points.length < 2) continue;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = path.color || '#ff0000';
        ctx.lineWidth = path.isHighlighter ? (path.width || 8) * 1.6 : (path.width || 2.5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = path.isHighlighter ? 0.38 : (path.opacity || 1);

        const first = path.points[0];
        ctx.moveTo((first.x / 100) * pageWidthPt, (first.y / 100) * pageHeightPt);
        for (let i = 1; i < path.points.length; i++) {
          const pt = path.points[i];
          ctx.lineTo((pt.x / 100) * pageWidthPt, (pt.y / 100) * pageHeightPt);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    return dataUrlToBytes(canvas.toDataURL('image/png'));
  } catch (e) {
    console.warn('Drawing rasterization failed:', e);
    return null;
  }
}

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { EditorElement, PageInfo } from '../types/editor';

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

// High-resolution fallback for rendering Unicode (Hindi / Devanagari / Special symbols) to PNG
function renderTextToCanvasPng(
  text: string,
  fontSizePt: number,
  color: string,
  isBold: boolean,
  isItalic: boolean,
  fontFamily: string,
  boxWidthPt: number,
  align: string = 'left'
): Uint8Array | null {
  try {
    const scale = 3; // 3x crisp supersampling
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontStyle = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${Math.round(fontSizePt * scale)}px ${
      fontFamily || 'Arial, sans-serif'
    }`;
    ctx.font = fontStyle;

    const lines = text.split('\n');
    let maxLineWidth = 0;
    for (const l of lines) {
      const m = ctx.measureText(l);
      if (m.width > maxLineWidth) maxLineWidth = m.width;
    }

    const w = Math.max(Math.round(boxWidthPt * scale), Math.round(maxLineWidth) + 20);
    const lineHeightPx = fontSizePt * 1.25 * scale;
    const h = Math.round(Math.max(fontSizePt * scale, lines.length * lineHeightPx));

    canvas.width = w;
    canvas.height = h;

    ctx.font = fontStyle;
    ctx.fillStyle = color || '#000000';
    ctx.textBaseline = 'top';

    lines.forEach((line, idx) => {
      let x = 0;
      if (align === 'center') {
        const textW = ctx.measureText(line).width;
        x = (w - textW) / 2;
      } else if (align === 'right') {
        const textW = ctx.measureText(line).width;
        x = w - textW;
      }
      ctx.fillText(line, x, idx * lineHeightPx);
    });

    const dataUrl = canvas.toDataURL('image/png');
    return dataUrlToBytes(dataUrl);
  } catch (e) {
    console.warn('Unicode text rasterization fallback failed:', e);
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
        let fontToUse = helveticaFont;
        if (el.fontFamily?.includes('Times')) fontToUse = timesFont;
        else if (el.fontFamily?.includes('Courier')) fontToUse = courierFont;
        else if (el.isBold && el.isItalic) fontToUse = helveticaBoldOblique;
        else if (el.isBold) fontToUse = helveticaBold;
        else if (el.isItalic) fontToUse = helveticaOblique;

        // Convert UI font size (96 DPI CSS px) to PDF standard 72 pt font size
        const fontSizePt = Math.max(4, (el.fontSize || 14) / 1.3333);
        const textColor = hexToRgb(el.color || '#000000');
        const lines = (el.text || '').split('\n');
        const lineHeight = fontSizePt * 1.2;

        // Verify if all lines can be encoded directly with WinAnsi
        let canEncodeDirectly = true;
        try {
          for (const line of lines) {
            fontToUse.encodeText(line);
          }
        } catch (_) {
          canEncodeDirectly = false;
        }

        if (canEncodeDirectly) {
          lines.forEach((line, lineIndex) => {
            if (!line.trim() && lines.length === 1) return;
            const lineY = pageHeight - (el.y / 100) * pageHeight - (lineIndex + 0.85) * lineHeight;

            let lineX = elX;
            if (el.align === 'center') {
              const textWidth = fontToUse.widthOfTextAtSize(line, fontSizePt);
              lineX = elX + (elWidth - textWidth) / 2;
            } else if (el.align === 'right') {
              const textWidth = fontToUse.widthOfTextAtSize(line, fontSizePt);
              lineX = elX + elWidth - textWidth;
            }

            pdfPage.drawText(line, {
              x: Math.max(0, lineX),
              y: Math.max(0, lineY),
              size: fontSizePt,
              font: fontToUse,
              color: textColor,
            });
          });
        } else {
          // Unicode / Hindi / Complex script fallback via high-res PNG embedding
          try {
            const pngBytes = renderTextToCanvasPng(
              el.text,
              fontSizePt,
              el.color || '#000000',
              !!el.isBold,
              !!el.isItalic,
              el.fontFamily || 'Arial, sans-serif',
              elWidth,
              el.align || 'left'
            );
            if (pngBytes) {
              const embedded = await outputDoc.embedPng(pngBytes);
              const { width: imgW, height: imgH } = embedded.scale(1 / 3);
              pdfPage.drawImage(embedded, {
                x: elX,
                y: pageHeight - (el.y / 100) * pageHeight - imgH,
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
        const drawingPng = renderDrawingsToCanvasPng([el], pageWidth, pageHeight);
        if (drawingPng) {
          const embeddedDrawing = await outputDoc.embedPng(drawingPng);
          pdfPage.drawImage(embeddedDrawing, {
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight,
          });
        }
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
          pdfPage.drawRectangle({
            x: elX,
            y: elY,
            width: elWidth,
            height: elHeight,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 1,
            color: rgb(0.97, 0.98, 1),
          });
          if (typeof el.value === 'string' && el.value.trim()) {
            try {
              helveticaFont.encodeText(el.value);
              pdfPage.drawText(el.value, {
                x: elX + 4,
                y: elY + elHeight / 2 - 5,
                size: 11,
                font: helveticaFont,
                color: rgb(0, 0, 0),
              });
            } catch (_) {
              const pngBytes = renderTextToCanvasPng(
                el.value,
                11,
                '#000000',
                false,
                false,
                'Arial, sans-serif',
                elWidth - 8
              );
              if (pngBytes) {
                const embedded = await outputDoc.embedPng(pngBytes);
                const { width: imgW, height: imgH } = embedded.scale(1 / 3);
                pdfPage.drawImage(embedded, {
                  x: elX + 4,
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

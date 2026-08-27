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
        const fontSizePt = Math.max(6, (el.fontSize || 14) / 1.3333);
        const textColor = hexToRgb(el.color || '#000000');
        const lines = (el.text || '').split('\n');
        const lineHeight = fontSizePt * 1.2;

        // Draw each line
        lines.forEach((line, lineIndex) => {
          if (!line.trim() && lines.length === 1) return;
          const lineY = (pageHeight - (el.y / 100) * pageHeight) - (lineIndex + 0.85) * lineHeight;
          
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
        const fillColor = el.isFilled && el.fillColor && el.fillColor !== 'transparent'
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
        for (const path of el.paths || []) {
          if (!path.points || path.points.length < 2) continue;
          const pathColor = hexToRgb(path.color || '#ff0000');
          const pathWidth = path.width || 3;
          const opacity = path.isHighlighter ? 0.35 : (path.opacity || 1);

          for (let i = 0; i < path.points.length - 1; i++) {
            const p1 = path.points[i];
            const p2 = path.points[i + 1];

            const x1 = (p1.x / 100) * pageWidth;
            const y1 = pageHeight - (p1.y / 100) * pageHeight;
            const x2 = (p2.x / 100) * pageWidth;
            const y2 = pageHeight - (p2.y / 100) * pageHeight;

            pdfPage.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              thickness: path.isHighlighter ? pathWidth * 3 : pathWidth,
              color: pathColor,
              opacity: opacity,
            });
          }
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
          if (el.value === true) {
            pdfPage.drawText('✓', {
              x: elX + elWidth * 0.2,
              y: elY + elHeight * 0.15,
              size: elHeight * 0.75,
              font: helveticaBold,
              color: rgb(0.1, 0.5, 0.2),
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
            pdfPage.drawText(el.value, {
              x: elX + 4,
              y: elY + elHeight / 2 - 5,
              size: 12,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
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

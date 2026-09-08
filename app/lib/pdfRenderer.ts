// Robust client-side PDF.js loader with isolated offscreen canvas rendering
let pdfjsLibInstance: any = null;

let cachedDocBytes: Uint8Array | null = null;
let cachedDocPromise: Promise<any> | null = null;

export async function getPdfjsLib() {
  if (typeof window === 'undefined') return null;
  
  if (!pdfjsLibInstance) {
    const pdfjs = await import('pdfjs-dist');
    // Set worker source
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
    pdfjsLibInstance = pdfjs;
  }
  return pdfjsLibInstance;
}

async function getPdfDocument(pdfBytes: Uint8Array) {
  const pdfjs = await getPdfjsLib();
  if (!pdfjs) throw new Error('PDF.js unavailable');

  if (cachedDocBytes === pdfBytes && cachedDocPromise) {
    return cachedDocPromise;
  }

  cachedDocBytes = pdfBytes;
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes.slice(0),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  });

  cachedDocPromise = loadingTask.promise;
  return cachedDocPromise;
}

export interface RenderPageOptions {
  pdfBytes: Uint8Array;
  originalPageIndex: number;
  canvas: HTMLCanvasElement;
  scale: number;
  rotation?: number;
}

export async function renderPdfPage({
  pdfBytes,
  originalPageIndex,
  canvas,
  scale = 1.0,
  rotation = 0,
}: RenderPageOptions): Promise<{ width: number; height: number }> {
  const pdfDoc = await getPdfDocument(pdfBytes);
  const page = await pdfDoc.getPage(originalPageIndex + 1); // 1-indexed

  // 1.3333 scale translates 72 pt/in (PDF standard) to standard 96 DPI CSS screen pixels
  const baseScale = 1.3333;
  const totalScale = baseScale * scale;
  const totalRotation = ((page.rotate || 0) + (rotation || 0)) % 360;
  const viewport = page.getViewport({ scale: totalScale, rotation: totalRotation });

  // Ultra-crisp high-DPI rendering: Use supersampling (at least 2.5x - 3x or devicePixelRatio)
  // This completely eliminates any blurriness or pixelation on mobile screens
  const dpr = Math.max(window.devicePixelRatio || 1, 2.5);
  const renderScale = baseScale * Math.max(scale * dpr, 2.0);
  const renderViewport = page.getViewport({ scale: renderScale, rotation: totalRotation });

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = Math.round(renderViewport.width);
  offscreenCanvas.height = Math.round(renderViewport.height);

  const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });
  if (!offscreenCtx) throw new Error('Canvas 2D context not available');

  const renderContext = {
    canvasContext: offscreenCtx,
    viewport: renderViewport,
  };

  await page.render(renderContext).promise;

  // Target DOM canvas: match physical pixel dimensions exactly
  canvas.width = offscreenCanvas.width;
  canvas.height = offscreenCanvas.height;
  // Set CSS size to logical CSS pixels so it displays at correct visual size smoothly
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const targetCtx = canvas.getContext('2d', { alpha: false });
  if (targetCtx) {
    targetCtx.drawImage(offscreenCanvas, 0, 0);
  }

  // Return dimensions in CSS pixels
  return {
    width: viewport.width / scale,
    height: viewport.height / scale,
  };
}

export interface ExtractedTextItem {
  id: string;
  str: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  fontSize: number;
  fontFamily: string;
  isBold?: boolean;
  isItalic?: boolean;
  baselinePct?: number;
}

export async function extractPageTextItems(
  pdfBytes: Uint8Array,
  originalPageIndex: number,
  rotation = 0
): Promise<ExtractedTextItem[]> {
  const pdfDoc = await getPdfDocument(pdfBytes);
  const page = await pdfDoc.getPage(originalPageIndex + 1);
  
  const baseScale = 1.3333;
  const totalRotation = ((page.rotate || 0) + (rotation || 0)) % 360;
  const viewport = page.getViewport({ scale: baseScale, rotation: totalRotation });

  const textContent = await page.getTextContent();
  const rawItems = textContent.items as any[];
  const styles = (textContent.styles || {}) as Record<string, any>;
  
  const extracted: ExtractedTextItem[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item.str || !item.str.trim()) continue;

    const tx = item.transform; // [a, b, c, d, x, y]
    // Calculate font size in points and CSS pixels
    const fontPt = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
    const fontPx = fontPt * baseScale;
    const fontWidthPx = item.width ? item.width * baseScale : (item.str.length * fontPx * 0.55);

    // Convert PDF baseline coordinate to viewport coordinate
    const [vx, vy] = viewport.convertToViewportPoint(tx[4], tx[5]);

    // Precise Cap-Height offset aligns HTML text baseline 1:1 with canvas and covers Devanagari top matras
    const isDevanagari = /[\u0900-\u097F]/.test(item.str);
    const capHeightOffset = isDevanagari ? fontPx * 0.98 : fontPx * 0.80;
    const boxHeight = isDevanagari ? fontPx * 1.30 : fontPx * 1.08;

    const boxX = vx;
    const boxY = vy - capHeightOffset;
    const boxW = Math.max(6, fontWidthPx);
    const boxH = Math.max(6, boxHeight);

    const xPct = Math.max(0, (boxX / viewport.width) * 100);
    const yPct = Math.max(0, (boxY / viewport.height) * 100);
    const widthPct = Math.min(100 - xPct, (boxW / viewport.width) * 100);
    const heightPct = Math.min(100 - yPct, (boxH / viewport.height) * 100);

    const fontStyleObj = styles[item.fontName] || {};
    const fontNameLower = (item.fontName || '').toLowerCase();
    const styleFontFamily = (fontStyleObj.fontFamily || '').toLowerCase();

    // Detect Bold
    const isBold = 
      fontNameLower.includes('bold') || 
      fontNameLower.includes('black') || 
      fontNameLower.includes('heavy') || 
      fontNameLower.includes('semibold') || 
      fontNameLower.includes('medium') ||
      (styleFontFamily.includes('bold') && !styleFontFamily.includes('regular'));

    // Detect Italic
    const isItalic = 
      fontNameLower.includes('italic') || 
      fontNameLower.includes('oblique') || 
      fontNameLower.includes('slant') ||
      styleFontFamily.includes('italic');

    // Determine font family accurately using specific font name matching
    const isMonospace = 
      fontNameLower.includes('courier') || 
      fontNameLower.includes('mono') || 
      fontNameLower.includes('consolas') || 
      styleFontFamily.includes('monospace');

    const isArial = fontNameLower.includes('arial') || styleFontFamily.includes('arial');
    const isHelvetica = fontNameLower.includes('helvetica') || styleFontFamily.includes('helvetica');
    const isCalibri = fontNameLower.includes('calibri') || styleFontFamily.includes('calibri');
    const isTahoma = fontNameLower.includes('tahoma') || styleFontFamily.includes('tahoma');
    const isVerdana = fontNameLower.includes('verdana') || styleFontFamily.includes('verdana');
    const isTrebuchet = fontNameLower.includes('trebuchet') || styleFontFamily.includes('trebuchet');
    const isGaramond = fontNameLower.includes('garamond') || styleFontFamily.includes('garamond');
    const isCambria = fontNameLower.includes('cambria') || styleFontFamily.includes('cambria');
    const isGeorgia = fontNameLower.includes('georgia') || styleFontFamily.includes('georgia');
    const isTimes = fontNameLower.includes('times') || styleFontFamily.includes('times');
    const isPalatinoOrBook = fontNameLower.includes('palatino') || fontNameLower.includes('book antiqua');

    const isSerif = 
      !isMonospace && !isArial && !isHelvetica && !isCalibri && !isTahoma && !isVerdana && !isTrebuchet &&
      (isTimes || isGaramond || isCambria || isGeorgia || isPalatinoOrBook ||
       fontNameLower.includes('roman') ||
       (styleFontFamily.includes('serif') && !styleFontFamily.includes('sans')));

    let fontFamily: string;
    if (isMonospace) {
      fontFamily = '"Courier New", Courier, monospace';
    } else if (isArial) {
      fontFamily = 'Arial, "Liberation Sans", Helvetica, sans-serif';
    } else if (isHelvetica) {
      fontFamily = 'Helvetica, Arial, sans-serif';
    } else if (isCalibri) {
      fontFamily = 'Calibri, "Gill Sans", Optima, sans-serif';
    } else if (isTahoma) {
      fontFamily = 'Tahoma, Geneva, sans-serif';
    } else if (isVerdana) {
      fontFamily = 'Verdana, Geneva, sans-serif';
    } else if (isTrebuchet) {
      fontFamily = '"Trebuchet MS", sans-serif';
    } else if (isTimes) {
      fontFamily = '"Times New Roman", Times, serif';
    } else if (isGaramond) {
      fontFamily = 'Garamond, "EB Garamond", serif';
    } else if (isCambria) {
      fontFamily = 'Cambria, Georgia, serif';
    } else if (isGeorgia) {
      fontFamily = 'Georgia, Cambria, serif';
    } else if (isPalatinoOrBook) {
      fontFamily = '"Palatino Linotype", Palatino, serif';
    } else if (isSerif) {
      fontFamily = 'Georgia, "Times New Roman", Times, serif';
    } else {
      // Default: Arial is the most common PDF sans-serif font
      fontFamily = 'Arial, Helvetica, sans-serif';
    }

    const baselinePct = (vy / viewport.height) * 100;

    extracted.push({
      id: `orig_txt_${originalPageIndex}_${i}`,
      str: item.str,
      xPct,
      yPct,
      widthPct: Math.max(0.8, widthPct),
      heightPct: Math.max(0.8, heightPct),
      fontSize: Math.round(fontPx),
      fontFamily,
      isBold,
      isItalic,
      baselinePct,
    } as any);
  }

  if (extracted.length === 0) return [];

  // 1. Cluster items into lines by vertical baseline proximity
  const lines: any[][] = [];
  const sorted = [...extracted].sort((a: any, b: any) => a.baselinePct - b.baselinePct);

  for (const block of sorted) {
    let matched = false;
    const blockBase = block.baselinePct ?? block.yPct;
    for (const line of lines) {
      const avgBase = line.reduce((s: number, b: any) => s + (b.baselinePct ?? b.yPct), 0) / line.length;
      if (Math.abs(blockBase - avgBase) < 0.85) {
        line.push(block);
        matched = true;
        break;
      }
    }
    if (!matched) lines.push([block]);
  }

  lines.sort((a, b) => {
    const aBase = Math.min(...a.map((b: any) => b.baselinePct ?? b.yPct));
    const bBase = Math.min(...b.map((b: any) => b.baselinePct ?? b.yPct));
    return aBase - bBase;
  });

  // 2. Assemble each clustered line into a single cohesive line item spanning full width
  const merged: ExtractedTextItem[] = lines.map((line, idx) => {
    line.sort((a, b) => a.xPct - b.xPct);

    let fullText = line[0].str;
    for (let i = 1; i < line.length; i++) {
      const prev = line[i - 1];
      const curr = line[i];
      const gap = curr.xPct - (prev.xPct + prev.widthPct);
      const isCombining = /^[\u0901-\u0903\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963]/.test(curr.str);
      const needsSpace = !isCombining && gap > 0.1 && !fullText.endsWith(' ') && !curr.str.startsWith(' ');
      fullText += (needsSpace ? ' ' : '') + curr.str;
    }

    const minX = Math.min(...line.map(b => b.xPct));
    const maxX = Math.max(...line.map(b => b.xPct + b.widthPct));
    const minY = Math.min(...line.map(b => b.yPct));
    const maxY = Math.max(...line.map(b => b.yPct + b.heightPct));

    return {
      id: `txt_${originalPageIndex}_${idx}`,
      str: fullText.trim(),
      xPct: minX,
      yPct: minY,
      widthPct: Math.min(100 - minX, (maxX - minX) + 0.8),
      heightPct: maxY - minY,
      fontSize: line[0].fontSize,
      fontFamily: line[0].fontFamily,
      isBold: line[0].isBold,
      isItalic: line[0].isItalic,
    };
  });

  return merged.filter(item => item.str.length > 0);
}

export async function getPdfMetadata(pdfBytes: Uint8Array): Promise<{
  numPages: number;
  pageDimensions: { width: number; height: number; rotation: number }[];
}> {
  const pdfDoc = await getPdfDocument(pdfBytes);
  const numPages = pdfDoc.numPages;
  const pageDimensions: { width: number; height: number; rotation: number }[] = [];

  const baseScale = 1.3333; // 72 pt -> 96 CSS px
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: baseScale });
    pageDimensions.push({
      width: viewport.width,
      height: viewport.height,
      rotation: page.rotate || 0,
    });
  }

  return { numPages, pageDimensions };
}

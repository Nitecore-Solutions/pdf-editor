'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Trash2, 
  RotateCw, 
  PlusCircle, 
  ExternalLink,
  GripHorizontal,
  Check
} from 'lucide-react';
import { 
  PageInfo, 
  EditorElement, 
  ToolType, 
  AnnotateSubtool, 
  ShapeSubtool, 
  FormSubtool,
  TextElement,
  WhiteoutElement,
  ImageElement,
  SignatureElement,
  ShapeElement,
  DrawingElement,
  FormElement,
  LinkElement
} from '../types/editor';
import { renderPdfPage, extractPageTextItems, ExtractedTextItem } from '../lib/pdfRenderer';

// Helper to generate smooth Catmull-Rom/quadratic bezier SVG path data from normalized percentage points
function generateSmoothPathData(points: { x: number; y: number }[], width: number, height: number): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    const px = (points[0].x / 100) * width;
    const py = (points[0].y / 100) * height;
    return `M ${px} ${py} L ${px + 0.1} ${py + 0.1}`;
  }
  if (points.length === 2) {
    const p0x = (points[0].x / 100) * width;
    const p0y = (points[0].y / 100) * height;
    const p1x = (points[1].x / 100) * width;
    const p1y = (points[1].y / 100) * height;
    return `M ${p0x} ${p0y} L ${p1x} ${p1y}`;
  }

  const p0x = (points[0].x / 100) * width;
  const p0y = (points[0].y / 100) * height;
  let d = `M ${p0x} ${p0y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const curX = (points[i].x / 100) * width;
    const curY = (points[i].y / 100) * height;
    const nextX = (points[i + 1].x / 100) * width;
    const nextY = (points[i + 1].y / 100) * height;

    const midX = (curX + nextX) / 2;
    const midY = (curY + nextY) / 2;

    d += ` Q ${curX} ${curY}, ${midX} ${midY}`;
  }

  const lastX = (points[points.length - 1].x / 100) * width;
  const lastY = (points[points.length - 1].y / 100) * height;
  d += ` L ${lastX} ${lastY}`;

  return d;
}

interface PageEditorProps {
  pageInfo: PageInfo;
  pdfBytes: Uint8Array | null;
  zoom: number;
  activeTool: ToolType;
  activeAnnotateSubtool: AnnotateSubtool;
  activeShapeSubtool: ShapeSubtool;
  activeFormSubtool: FormSubtool;
  elements: EditorElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onAddElement: (element: EditorElement | EditorElement[]) => void;
  onUpdateElement: (id: string, updates: Partial<EditorElement>) => void;
  onDeleteElement: (id: string) => void;
  onDeletePage: (pageIndex: number) => void;
  onRotatePage: (pageIndex: number) => void;
  onInsertPageHere: (pageIndex: number) => void;
}

export const PageEditor: React.FC<PageEditorProps> = ({
  pageInfo,
  pdfBytes,
  zoom,
  activeTool,
  activeAnnotateSubtool,
  activeShapeSubtool,
  activeFormSubtool,
  elements,
  selectedElementId,
  onSelectElement,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
  onDeletePage,
  onRotatePage,
  onInsertPageHere,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({
    width: pageInfo.width || 794,
    height: pageInfo.height || 1123,
  });
  const [isRendering, setIsRendering] = useState(false);

  // Extracted existing text from PDF
  const [extractedTexts, setExtractedTexts] = useState<ExtractedTextItem[]>([]);
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);
  const [editedOriginalIds, setEditedOriginalIds] = useState<Set<string>>(new Set());

  // Freehand drawing in-progress state
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Dragging / Resizing elements state
  const [dragState, setDragState] = useState<{
    elementId: string;
    action: 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  // Render PDF page to canvas & extract existing text
  useEffect(() => {
    let isCancelled = false;

    async function loadPage() {
      if (pageInfo.isNewBlank || !pdfBytes || pageInfo.originalPageIndex === undefined) {
        setPageSize({ width: pageInfo.width || 794, height: pageInfo.height || 1123 });
        return;
      }

      if (!canvasRef.current) return;
      setIsRendering(true);

      try {
        const dimensions = await renderPdfPage({
          pdfBytes,
          originalPageIndex: pageInfo.originalPageIndex,
          canvas: canvasRef.current,
          scale: zoom,
          rotation: pageInfo.rotation,
        });

        if (!isCancelled && dimensions) {
          setPageSize(dimensions);
        }

        // Universal text extraction across all PDF types
        const textItems = await extractPageTextItems(pdfBytes, pageInfo.originalPageIndex, pageInfo.rotation);

        if (!isCancelled) {
          setExtractedTexts(textItems);
        }

        // Automatic AI OCR enhancement ONLY for pages containing Devanagari / Hindi script
        const hasDevanagari = textItems.some((item) => /[\u0900-\u097F]/.test(item.str));
        if (hasDevanagari && textItems.length > 0) {
          try {
            const ocrRes = await fetch('/api/ocr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lines: textItems }),
            });
            if (ocrRes.ok) {
              const ocrData = await ocrRes.json();
              if (!isCancelled && ocrData?.success && Array.isArray(ocrData.lines) && ocrData.lines.length > 0) {
                setExtractedTexts(ocrData.lines);
              }
            }
          } catch {
            // Graceful fallback to client-extracted lines
          }
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Failed to render PDF page:', err);
        }
      } finally {
        if (!isCancelled) setIsRendering(false);
      }
    }

    loadPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfBytes, pageInfo.originalPageIndex, pageInfo.rotation, zoom, pageInfo.isNewBlank]);

  const displayedWidth = pageSize.width * zoom;
  const displayedHeight = pageSize.height * zoom;

  // Filter elements on this page
  const pageElements = elements.filter((el) => el.pageIndex === pageInfo.pageIndex);

  // Convert existing static PDF text to editable text (Bharat Job style)
  const handleConvertExistingText = (item: ExtractedTextItem) => {
    const isDevanagari = /[\u0900-\u097F]/.test(item.str) || item.fontFamily?.includes('Devanagari');
    const hindiFont = '"Noto Sans Devanagari", "Mangal", "Nirmala UI", "Segoe UI", Arial, sans-serif';

    // 1. Whiteout element covering original static text completely
    const whiteoutId = 'el_wo_' + Math.random().toString(36).substr(2, 9);
    const yOffset = isDevanagari ? 0.15 : 0.05;
    const hExtra = isDevanagari ? 0.1 : 0.05;

    const whiteout: WhiteoutElement = {
      id: whiteoutId,
      pageIndex: pageInfo.pageIndex,
      type: 'whiteout',
      x: Math.max(0, item.xPct - 0.15),
      y: Math.max(0, item.yPct - yOffset),
      width: Math.min(100 - item.xPct + 0.15, item.widthPct + (isDevanagari ? 2.0 : 0.8)),
      height: Math.min(100 - item.yPct + yOffset, item.heightPct + yOffset + hExtra),
      color: '#ffffff',
    };

    // 2. Editable TextElement in place
    const textId = 'el_txt_' + Math.random().toString(36).substr(2, 9);
    const newText: TextElement = {
      id: textId,
      pageIndex: pageInfo.pageIndex,
      type: 'text',
      text: item.str,
      x: item.xPct,
      y: Math.max(0, item.yPct - yOffset),
      width: Math.min(100 - item.xPct, item.widthPct + (isDevanagari ? 2.5 : 1.2)),
      height: item.heightPct + yOffset + hExtra,
      fontSize: item.fontSize || 14,
      fontFamily: isDevanagari ? hindiFont : (item.fontFamily || 'Arial, Helvetica, sans-serif'),
      color: '#000000',
      isBold: !!item.isBold,
      isItalic: !!item.isItalic,
      isUnderline: false,
      align: 'left',
    };

    onAddElement([whiteout, newText]);
    onSelectElement(textId);
    setEditedOriginalIds((prev) => new Set(prev).add(item.id));
  };

  // Handle overlay click to insert elements
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select') {
      onSelectElement(null);
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const xPct = Math.max(0, Math.min(95, (clickX / displayedWidth) * 100));
    const yPct = Math.max(0, Math.min(95, (clickY / displayedHeight) * 100));

    const id = 'el_' + Math.random().toString(36).substr(2, 9);

    if (activeTool === 'text') {
      const newText: TextElement = {
        id,
        pageIndex: pageInfo.pageIndex,
        type: 'text',
        text: '',
        x: xPct,
        y: yPct,
        width: 15,
        height: 2.5,
        fontSize: 14,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: '#000000',
        isBold: false,
        isItalic: false,
        isUnderline: false,
        align: 'left',
      };
      onAddElement(newText);
      onSelectElement(id);
    } else if (activeTool === 'whiteout') {
      const newWhiteout: WhiteoutElement = {
        id,
        pageIndex: pageInfo.pageIndex,
        type: 'whiteout',
        x: xPct,
        y: yPct,
        width: 20,
        height: 3.5,
        color: '#ffffff',
      };
      onAddElement(newWhiteout);
      onSelectElement(id);
    } else if (activeTool === 'shapes') {
      const newShape: ShapeElement = {
        id,
        pageIndex: pageInfo.pageIndex,
        type: 'shape',
        shapeType: activeShapeSubtool,
        x: xPct,
        y: yPct,
        width: 20,
        height: activeShapeSubtool === 'line' || activeShapeSubtool === 'arrow' ? 4 : 12,
        strokeColor: '#000000',
        strokeWidth: 2,
        fillColor: 'transparent',
        isFilled: false,
      };
      onAddElement(newShape);
      onSelectElement(id);
    } else if (activeTool === 'forms') {
      const isCheckbox = activeFormSubtool === 'checkbox';
      const newForm: FormElement = {
        id,
        pageIndex: pageInfo.pageIndex,
        type: 'form',
        formType: activeFormSubtool,
        x: xPct,
        y: yPct,
        width: isCheckbox ? 5 : 28,
        height: isCheckbox ? 4 : 4.5,
        value: isCheckbox ? false : '',
      };
      onAddElement(newForm);
      onSelectElement(id);
    } else if (activeTool === 'links') {
      const url = prompt('Enter destination URL:', 'https://');
      if (url) {
        const newLink: LinkElement = {
          id,
          pageIndex: pageInfo.pageIndex,
          type: 'link',
          x: xPct,
          y: yPct,
          width: 20,
          height: 3.5,
          url,
        };
        onAddElement(newLink);
        onSelectElement(id);
      }
    }
  };

  // Freehand Drawing pointer handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'annotate') return;
    if (!containerRef.current) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = containerRef.current.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / displayedWidth) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / displayedHeight) * 100));

    setIsDrawing(true);
    setCurrentPath([{ x: xPct, y: yPct }]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Handle Element Dragging/Resizing
    if (dragState) {
      const deltaX = ((e.clientX - dragState.startX) / displayedWidth) * 100;
      const deltaY = ((e.clientY - dragState.startY) / displayedHeight) * 100;

      const targetEl = pageElements.find((el) => el.id === dragState.elementId);
      const isImage = targetEl?.type === 'image';
      const isSignature = targetEl?.type === 'signature';
      const imgAspect = isImage
        ? (targetEl as ImageElement).aspectRatio || 1
        : isSignature
        ? 2.4
        : 1;
      const pageRatio = pageSize.width / pageSize.height;

      if (dragState.action === 'move') {
        const newX = Math.max(0, Math.min(100 - dragState.initialW, dragState.initialX + deltaX));
        const newY = Math.max(0, Math.min(100 - dragState.initialH, dragState.initialY + deltaY));
        onUpdateElement(dragState.elementId, { x: newX, y: newY });
      } else if (dragState.action === 'resize-se') {
        let newW = Math.max(2, dragState.initialW + deltaX);
        let newH = Math.max(2, dragState.initialH + deltaY);
        if (isImage || isSignature) {
          newH = (newW * pageRatio) / imgAspect;
        }
        onUpdateElement(dragState.elementId, { width: newW, height: newH });
      } else if (dragState.action === 'resize-sw') {
        let newW = Math.max(2, dragState.initialW - deltaX);
        let newH = Math.max(2, dragState.initialH + deltaY);
        let newX = dragState.initialX + (dragState.initialW - newW);
        if (isImage || isSignature) {
          newH = (newW * pageRatio) / imgAspect;
        }
        onUpdateElement(dragState.elementId, { x: newX, width: newW, height: newH });
      } else if (dragState.action === 'resize-ne') {
        let newW = Math.max(2, dragState.initialW + deltaX);
        let newH = Math.max(2, dragState.initialH - deltaY);
        let newY = dragState.initialY + (dragState.initialH - newH);
        if (isImage || isSignature) {
          newH = (newW * pageRatio) / imgAspect;
          newY = dragState.initialY + (dragState.initialH - newH);
        }
        onUpdateElement(dragState.elementId, { y: newY, width: newW, height: newH });
      } else if (dragState.action === 'resize-nw') {
        let newW = Math.max(2, dragState.initialW - deltaX);
        let newH = Math.max(2, dragState.initialH - deltaY);
        let newX = dragState.initialX + (dragState.initialW - newW);
        let newY = dragState.initialY + (dragState.initialH - newH);
        if (isImage || isSignature) {
          newH = (newW * pageRatio) / imgAspect;
          newY = dragState.initialY + (dragState.initialH - newH);
        }
        onUpdateElement(dragState.elementId, { x: newX, y: newY, width: newW, height: newH });
      }
      return;
    }

    // Handle Freehand Drawing
    if (!isDrawing || activeTool !== 'annotate' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / displayedWidth) * 100));
    let yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / displayedHeight) * 100));

    // For highlighter: If Shift key is held or movement is mostly horizontal, snap Y to start Y for razor-straight line
    if (activeAnnotateSubtool === 'highlighter' && currentPath && currentPath.length > 0) {
      const startPt = currentPath[0];
      if (e.shiftKey || (Math.abs(yPct - startPt.y) < 1.2 && Math.abs(xPct - startPt.x) > 1.2)) {
        yPct = startPt.y;
      }
    }

    setCurrentPath((prev) => (prev ? [...prev, { x: xPct, y: yPct }] : [{ x: xPct, y: yPct }]));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (dragState) {
      setDragState(null);
    }

    if (isDrawing && currentPath && currentPath.length > 1) {
      const isHighlighter = activeAnnotateSubtool === 'highlighter';
      const id = 'el_draw_' + Math.random().toString(36).substr(2, 9);
      
      const newDrawing: DrawingElement = {
        id,
        pageIndex: pageInfo.pageIndex,
        type: 'drawing',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        paths: [
          {
            points: currentPath,
            color: isHighlighter ? '#fde047' : '#ef4444',
            width: isHighlighter ? 11 : 2.5,
            opacity: isHighlighter ? 0.32 : 1,
            isHighlighter,
          },
        ],
      };
      onAddElement(newDrawing);
    }

    setIsDrawing(false);
    setCurrentPath(null);
  };

  return (
    <div className="flex flex-col items-center my-6 select-none" id={`pdf-page-${pageInfo.pageIndex}`}>
      {/* Bharat Job Style Page Header Controls */}
      <div 
        className="flex items-center justify-between mb-2 text-xs text-gray-600 bg-white/90 backdrop-blur-xs px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-gray-200 shadow-2xs max-w-full"
        style={{ width: `${displayedWidth}px` }}
      >
        {/* Left: Page Number */}
        <div className="flex items-center space-x-2">
          <span className="font-bold text-gray-800 text-xs sm:text-sm">{pageInfo.pageIndex + 1}</span>
        </div>

        {/* Center: Page Action Icons */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onDeletePage(pageInfo.pageIndex)}
            className="p-1 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
            title="Delete page"
            aria-label="Delete page"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRotatePage(pageInfo.pageIndex)}
            className="p-1 sm:p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition cursor-pointer"
            title="Rotate 90°"
            aria-label="Rotate page"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Insert page buttons — above and below */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onInsertPageHere(pageInfo.pageIndex)}
            className="flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded transition border border-emerald-200 text-2xs font-semibold cursor-pointer"
            title="Insert a blank page before this page"
          >
            <PlusCircle className="w-3 h-3" />
            <span className="hidden sm:inline">Insert above</span>
          </button>
          <button
            onClick={() => onInsertPageHere(pageInfo.pageIndex + 1)}
            className="flex items-center space-x-1 text-sky-600 hover:text-sky-700 hover:bg-sky-50 px-1.5 sm:px-2 py-0.5 rounded transition border border-sky-200 text-2xs font-semibold cursor-pointer"
            title="Insert a blank page after this page"
          >
            <PlusCircle className="w-3 h-3" />
            <span className="hidden sm:inline">Insert below</span>
          </button>
        </div>
      </div>

      {/* Main Page Paper Canvas Container */}
      <div
        ref={containerRef}
        onClick={handleOverlayClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative bg-white shadow-xl rounded-sm border border-gray-300 overflow-hidden ${
          activeTool === 'annotate' || dragState ? 'touch-none' : ''
        }`}
        style={{
          width: `${displayedWidth}px`,
          height: `${displayedHeight}px`,
          cursor:
            activeTool === 'text'
              ? 'text'
              : activeTool === 'whiteout' || activeTool === 'shapes'
              ? 'crosshair'
              : activeTool === 'annotate'
              ? 'crosshair'
              : 'default',
        }}
      >
        {/* Layer 1: PDF.js Canvas Rendering */}
        {!pageInfo.isNewBlank && (
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
          />
        )}

        {/* Blank page placeholder background */}
        {pageInfo.isNewBlank && (
          <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none text-gray-300 font-medium text-sm">
            Blank Page
          </div>
        )}

        {/* Layer 1.5: Interactive Existing PDF Text Detection Layer (Active when Text tool is chosen) */}
        {activeTool === 'text' && (
          <div className="absolute inset-0 z-25 pointer-events-none">
            {extractedTexts
              .filter((item) => !editedOriginalIds.has(item.id))
              .map((item) => (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredTextId(item.id)}
                  onMouseLeave={() => setHoveredTextId((prev) => (prev === item.id ? null : prev))}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConvertExistingText(item);
                  }}
                  className="absolute transition-colors cursor-text pointer-events-auto"
                  style={{
                    left: `${item.xPct}%`,
                    top: `${item.yPct}%`,
                    width: `${item.widthPct}%`,
                    height: `${item.heightPct}%`,
                    border:
                      hoveredTextId === item.id
                        ? '1.5px dashed #2563eb'
                        : '1px dashed transparent',
                    backgroundColor:
                      hoveredTextId === item.id ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                    borderRadius: '2px',
                  }}
                  title="Click to edit text directly"
                />
              ))}
          </div>
        )}

        {/* Layer 2: Interactive Placed Elements (Text, Whiteout, Images, Signatures, Shapes, Forms, Links) */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          {pageElements.map((el) => {
            const isSelected = selectedElementId === el.id;
            const canInteract =
              activeTool === 'select' ||
              (activeTool === 'text' && el.type === 'text') ||
              isSelected;

            if (el.type === 'drawing') return null; // handled in SVG layer

            return (
              <div
                key={el.id}
                onClick={(e) => {
                  if (canInteract) {
                    e.stopPropagation();
                    onSelectElement(el.id);
                  }
                }}
                className={`absolute group transition-shadow ${
                  el.id.startsWith('el_wo_') || !canInteract
                    ? 'pointer-events-none'
                    : 'pointer-events-auto'
                } ${
                  isSelected
                    ? 'outline outline-2 outline-emerald-500 shadow-md z-30'
                    : canInteract
                    ? 'hover:outline hover:outline-1 hover:outline-emerald-300'
                    : ''
                }`}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: el.type === 'text' ? 'max-content' : `${el.width}%`,
                  maxWidth: el.type === 'text' ? `${Math.max(10, 100 - el.x)}%` : undefined,
                  minWidth: el.type === 'text' ? `${el.width}%` : undefined,
                  height: `${el.height}%`,
                  overflow: el.type === 'text' ? 'visible' : undefined,
                }}
              >
                {/* 1. WHITEOUT */}
                {el.type === 'whiteout' && (
                  <div
                    onPointerDown={(e) => {
                      if (!el.id.startsWith('el_wo_')) {
                        e.stopPropagation();
                        onSelectElement(el.id);
                        setDragState({
                          elementId: el.id,
                          action: 'move',
                          startX: e.clientX,
                          startY: e.clientY,
                          initialX: el.x,
                          initialY: el.y,
                          initialW: el.width,
                          initialH: el.height,
                        });
                      }
                    }}
                    className={`w-full h-full ${
                      el.id.startsWith('el_wo_')
                        ? 'pointer-events-none'
                        : 'cursor-grab active:cursor-grabbing'
                    }`}
                    style={{ backgroundColor: el.color || '#ffffff' }}
                  />
                )}

                {/* 2. TEXT */}
                {el.type === 'text' && (
                  <div className="relative w-full h-full flex items-start">
                    {/* Move grip handle on top when selected */}
                    {isSelected && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDragState({
                            elementId: el.id,
                            action: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            initialX: el.x,
                            initialY: el.y,
                            initialW: el.width,
                            initialH: el.height,
                          });
                        }}
                        className="absolute -top-5 left-0 bg-emerald-600 text-white px-1.5 py-0.5 rounded text-3xs flex items-center space-x-0.5 cursor-grab active:cursor-grabbing shadow-xs z-50 select-none"
                      >
                        <GripHorizontal className="w-3 h-3" />
                        <span>Move</span>
                      </div>
                    )}

                    {el.text.includes('\n') ? (
                      <>
                        {/* Hidden mirror span to measure true text width for this font/weight */}
                        <span
                          aria-hidden
                          className="absolute invisible whitespace-pre pointer-events-none"
                          style={{
                            fontSize: `${(el.fontSize || 14) * zoom}px`,
                            fontWeight: el.isBold ? 700 : 400,
                            fontStyle: el.isItalic ? 'italic' : 'normal',
                            fontFamily:
                              el.fontFamily ||
                              (el.text && /[\u0900-\u097F]/.test(el.text)
                                ? '"Noto Sans Devanagari", "Mangal", "Nirmala UI", "Segoe UI", Arial, sans-serif'
                                : 'Arial, Helvetica, sans-serif'),
                            lineHeight: 1.2,
                          }}
                        >
                          {el.text || ' '}
                        </span>
                        <textarea
                          ref={(node) => {
                            if (node && isSelected && document.activeElement !== node) {
                              node.focus({ preventScroll: true });
                              const len = node.value.length;
                              node.setSelectionRange(len, len);
                            }
                          }}
                          value={el.text}
                          onChange={(e) =>
                            onUpdateElement(el.id, { text: e.target.value })
                          }
                          onBlur={(e) => {
                            if (!e.target.value.trim()) onDeleteElement(el.id);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          rows={Math.max(1, el.text.split('\n').length)}
                          className="outline-none bg-transparent border-none p-0 m-0 resize-none cursor-text select-text overflow-hidden"
                          style={{
                            fontSize: `${(el.fontSize || 14) * zoom}px`,
                            color: el.color || '#000000',
                            fontWeight: el.isBold ? 700 : 400,
                            fontStyle: el.isItalic ? 'italic' : 'normal',
                            textDecoration: el.isUnderline ? 'underline' : 'none',
                            textAlign: el.align || 'left',
                            fontFamily:
                              el.fontFamily ||
                              (el.text && /[\u0900-\u097F]/.test(el.text)
                                ? '"Noto Sans Devanagari", "Mangal", "Nirmala UI", "Segoe UI", Arial, sans-serif'
                                : 'Arial, Helvetica, sans-serif'),
                            lineHeight: 1.25,
                            padding: '0 2px',
                            letterSpacing: el.text && /[\u0900-\u097F]/.test(el.text) ? '0.01em' : 'normal',
                            wordSpacing: el.text && /[\u0900-\u097F]/.test(el.text) ? '0.04em' : 'normal',
                            width: '100%',
                            minWidth: '40px',
                          }}
                        />
                      </>
                    ) : (
                      <input
                        ref={(node) => {
                          if (node && isSelected && document.activeElement !== node) {
                            node.focus({ preventScroll: true });
                            const len = node.value.length;
                            node.setSelectionRange(len, len);
                          }
                        }}
                        type="text"
                        value={el.text}
                        onChange={(e) =>
                          onUpdateElement(el.id, { text: e.target.value })
                        }
                        onBlur={(e) => {
                          if (!e.target.value.trim()) onDeleteElement(el.id);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onSelectElement(el.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectElement(el.id);
                        }}
                        className="outline-none bg-transparent border-none p-0 m-0 cursor-text select-text block"
                        style={{
                          fontSize: `${(el.fontSize || 14) * zoom}px`,
                          color: el.color || '#000000',
                          fontWeight: el.isBold ? 700 : 400,
                          fontStyle: el.isItalic ? 'italic' : 'normal',
                          textDecoration: el.isUnderline ? 'underline' : 'none',
                          textAlign: el.align || 'left',
                          fontFamily:
                            el.fontFamily ||
                            (el.text && /[\u0900-\u097F]/.test(el.text)
                              ? '"Noto Sans Devanagari", "Mangal", "Nirmala UI", "Segoe UI", Arial, sans-serif'
                              : 'Arial, Helvetica, sans-serif'),
                          lineHeight: 1.28,
                          padding: '0 1px',
                          margin: 0,
                          letterSpacing: el.text && /[\u0900-\u097F]/.test(el.text) ? '0.012em' : 'normal',
                          wordSpacing: el.text && /[\u0900-\u097F]/.test(el.text) ? '0.06em' : 'normal',
                          boxSizing: 'border-box',
                          width: '100%',
                          minWidth: '30px',
                        }}
                      />
                    )}
                  </div>
                )}

                {/* 3. IMAGE */}
                {el.type === 'image' && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectElement(el.id);
                      setDragState({
                        elementId: el.id,
                        action: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialX: el.x,
                        initialY: el.y,
                        initialW: el.width,
                        initialH: el.height,
                      });
                    }}
                    className="w-full h-full cursor-grab active:cursor-grabbing select-none"
                  >
                    <img
                      src={el.dataUrl}
                      alt="Embedded"
                      className="w-full h-full object-fill pointer-events-none select-none block"
                      draggable={false}
                    />
                  </div>
                )}

                {/* 4. SIGNATURE */}
                {el.type === 'signature' && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectElement(el.id);
                      setDragState({
                        elementId: el.id,
                        action: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialX: el.x,
                        initialY: el.y,
                        initialW: el.width,
                        initialH: el.height,
                      });
                    }}
                    className="w-full h-full cursor-grab active:cursor-grabbing"
                  >
                    <img
                      src={el.dataUrl}
                      alt="Signature"
                      className="w-full h-full object-contain pointer-events-none filter drop-shadow-2xs"
                    />
                  </div>
                )}

                {/* 5. SHAPES */}
                {el.type === 'shape' && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectElement(el.id);
                      setDragState({
                        elementId: el.id,
                        action: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialX: el.x,
                        initialY: el.y,
                        initialW: el.width,
                        initialH: el.height,
                      });
                    }}
                    className="w-full h-full cursor-grab active:cursor-grabbing"
                  >
                    {el.shapeType === 'rectangle' && (
                      <div
                        className="w-full h-full"
                        style={{
                          border: `${el.strokeWidth || 2}px solid ${el.strokeColor || '#000000'}`,
                          backgroundColor: el.isFilled ? el.fillColor : 'transparent',
                        }}
                      />
                    )}
                    {el.shapeType === 'circle' && (
                      <div
                        className="w-full h-full rounded-full"
                        style={{
                          border: `${el.strokeWidth || 2}px solid ${el.strokeColor || '#000000'}`,
                          backgroundColor: el.isFilled ? el.fillColor : 'transparent',
                        }}
                      />
                    )}
                    {el.shapeType === 'line' && (
                      <div
                        className="w-full h-0.5 top-1/2 relative -translate-y-1/2"
                        style={{
                          height: `${el.strokeWidth || 2}px`,
                          backgroundColor: el.strokeColor || '#000000',
                        }}
                      />
                    )}
                    {el.shapeType === 'arrow' && (
                      <div className="w-full h-full flex items-center justify-end relative">
                        <div
                          className="w-full h-0.5 absolute"
                          style={{
                            height: `${el.strokeWidth || 2}px`,
                            backgroundColor: el.strokeColor || '#000000',
                          }}
                        />
                        <div
                          className="w-3 h-3 border-t-2 border-r-2 transform rotate-45 mr-1"
                          style={{
                            borderColor: el.strokeColor || '#000000',
                            borderWidth: `${el.strokeWidth || 2}px`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 6. FORMS */}
                {el.type === 'form' && (
                  <div className="relative w-full h-full pointer-events-auto flex items-center justify-center">
                    {/* Move grip handle on top when selected */}
                    {isSelected && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDragState({
                            elementId: el.id,
                            action: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            initialX: el.x,
                            initialY: el.y,
                            initialW: el.width,
                            initialH: el.height,
                          });
                        }}
                        className="absolute -top-5 left-0 bg-emerald-600 text-white px-1.5 py-0.5 rounded text-3xs flex items-center space-x-0.5 cursor-grab active:cursor-grabbing shadow-xs z-50 select-none pointer-events-auto"
                      >
                        <GripHorizontal className="w-3 h-3" />
                        <span>Move</span>
                      </div>
                    )}

                    {el.formType === 'checkbox' ? (
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onSelectElement(el.id);
                          if (activeTool === 'select' || isSelected) {
                            setDragState({
                              elementId: el.id,
                              action: 'move',
                              startX: e.clientX,
                              startY: e.clientY,
                              initialX: el.x,
                              initialY: el.y,
                              initialW: el.width,
                              initialH: el.height,
                            });
                          }
                        }}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectElement(el.id);
                          onUpdateElement(el.id, { value: !el.value });
                        }}
                        className={`w-full h-full border-2 rounded flex items-center justify-center transition cursor-pointer active:scale-95 touch-manipulation ${
                          el.value
                            ? 'bg-emerald-600 border-emerald-700 text-white'
                            : 'bg-white border-gray-400 hover:border-gray-600'
                        }`}
                        aria-label="Form Checkbox"
                      >
                        {el.value && <Check className="w-3.5 h-3.5 stroke-3" />}
                      </button>
                    ) : (
                      <input
                        type="text"
                        value={typeof el.value === 'string' ? el.value : ''}
                        onChange={(e) =>
                          onUpdateElement(el.id, { value: e.target.value })
                        }
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onSelectElement(el.id);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          onSelectElement(el.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectElement(el.id);
                        }}
                        placeholder={el.placeholder || 'Fill field...'}
                        className={`w-full h-full px-1.5 py-0.5 rounded focus:outline-none text-gray-900 touch-manipulation text-xs transition-colors ${
                          isSelected
                            ? 'bg-blue-50/50 border border-blue-400 shadow-2xs'
                            : 'bg-transparent border border-transparent hover:border-blue-200'
                        }`}
                        style={{
                          fontSize: `${Math.max(10, (el.fontSize || 12) * zoom)}px`,
                          color: el.color || '#1e293b',
                          fontWeight: el.isBold ? 700 : 400,
                          fontStyle: el.isItalic ? 'italic' : 'normal',
                          fontFamily: el.fontFamily || 'inherit',
                        }}
                      />
                    )}
                  </div>
                )}

                {/* 7. LINKS */}
                {el.type === 'link' && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectElement(el.id);
                      setDragState({
                        elementId: el.id,
                        action: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialX: el.x,
                        initialY: el.y,
                        initialW: el.width,
                        initialH: el.height,
                      });
                    }}
                    className="w-full h-full border-2 border-dashed border-sky-400 bg-sky-50/40 rounded flex items-center justify-between px-1 text-2xs text-sky-800 cursor-grab active:cursor-grabbing"
                  >
                    <span className="truncate flex-1 min-w-0">{el.url}</span>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const href = el.url.startsWith('http') ? el.url : `https://${el.url}`;
                        window.open(href, '_blank', 'noopener,noreferrer');
                      }}
                      className="shrink-0 ml-1 p-0.5 rounded hover:bg-sky-200 transition cursor-pointer"
                      title={`Open: ${el.url}`}
                    >
                      <ExternalLink className="w-3 h-3 opacity-80" />
                    </button>
                  </div>
                )}

                {/* 4 Corner Resize handles when selected */}
                {isSelected && (
                  <>
                    {/* Top Left */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: el.id,
                          action: 'resize-nw',
                          startX: e.clientX,
                          startY: e.clientY,
                          initialX: el.x,
                          initialY: el.y,
                          initialW: el.width,
                          initialH: el.height,
                        });
                      }}
                      className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-emerald-500 border border-white rounded-full cursor-nwse-resize shadow-xs z-40"
                    />
                    {/* Top Right */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: el.id,
                          action: 'resize-ne',
                          startX: e.clientX,
                          startY: e.clientY,
                          initialX: el.x,
                          initialY: el.y,
                          initialW: el.width,
                          initialH: el.height,
                        });
                      }}
                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 border border-white rounded-full cursor-nesw-resize shadow-xs z-40"
                    />
                    {/* Bottom Left */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: el.id,
                          action: 'resize-sw',
                          startX: e.clientX,
                          startY: e.clientY,
                          initialX: el.x,
                          initialY: el.y,
                          initialW: el.width,
                          initialH: el.height,
                        });
                      }}
                      className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-emerald-500 border border-white rounded-full cursor-nesw-resize shadow-xs z-40"
                    />
                    {/* Bottom Right */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: el.id,
                          action: 'resize-se',
                          startX: e.clientX,
                          startY: e.clientY,
                          initialX: el.x,
                          initialY: el.y,
                          initialW: el.width,
                          initialH: el.height,
                        });
                      }}
                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 border border-white rounded-full cursor-nwse-resize shadow-xs z-40"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Layer 3: Annotations, Freehand Drawings & Highlighters on top of all elements */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-30"
          viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
        >
          {/* Rendered Drawing Elements */}
          {pageElements
            .filter((el): el is DrawingElement => el.type === 'drawing')
            .map((el) =>
              (el.paths || []).map((path, pIdx) => {
                if (!path.points || path.points.length < 2) return null;
                const d = generateSmoothPathData(path.points, pageSize.width, pageSize.height);
                return (
                  <path
                    key={`${el.id}_${pIdx}`}
                    d={d}
                    fill="none"
                    stroke={path.color}
                    strokeWidth={path.isHighlighter ? (path.width || 11) : (path.width || 2.5)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={path.opacity ?? (path.isHighlighter ? 0.32 : 1)}
                    style={
                      path.isHighlighter
                        ? { mixBlendMode: 'multiply' }
                        : undefined
                    }
                  />
                );
              })
            )}

          {/* In-progress drawing path */}
          {currentPath && currentPath.length > 1 && (
            <path
              d={generateSmoothPathData(currentPath, pageSize.width, pageSize.height)}
              fill="none"
              stroke={activeAnnotateSubtool === 'highlighter' ? '#fde047' : '#ef4444'}
              strokeWidth={activeAnnotateSubtool === 'highlighter' ? 11 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={activeAnnotateSubtool === 'highlighter' ? 0.32 : 1}
              style={
                activeAnnotateSubtool === 'highlighter'
                  ? { mixBlendMode: 'multiply' }
                  : undefined
              }
            />
          )}
        </svg>
      </div>
    </div>
  );
};

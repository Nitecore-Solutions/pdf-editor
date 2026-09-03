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
    action: 'move' | 'resize-br' | 'resize-bl' | 'resize-tr' | 'resize-tl';
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

        // Extract existing text items for direct click-to-edit
        const textItems = await extractPageTextItems(
          pdfBytes,
          pageInfo.originalPageIndex,
          pageInfo.rotation
        );

        if (!isCancelled) {
          setExtractedTexts(textItems);
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
    // 1. Whiteout element covering original static text
    const whiteoutId = 'el_wo_' + Math.random().toString(36).substr(2, 9);
    const whiteout: WhiteoutElement = {
      id: whiteoutId,
      pageIndex: pageInfo.pageIndex,
      type: 'whiteout',
      x: Math.max(0, item.xPct - 0.1),
      y: Math.max(0, item.yPct),
      width: Math.min(100 - item.xPct, item.widthPct + 0.2),
      height: Math.min(100 - item.yPct, item.heightPct),
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
      y: item.yPct,
      width: Math.min(100 - item.xPct, item.widthPct + 1.0),
      height: item.heightPct,
      fontSize: item.fontSize || 14,
      fontFamily: item.fontFamily,
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

      if (dragState.action === 'move') {
        const newX = Math.max(0, Math.min(100 - dragState.initialW, dragState.initialX + deltaX));
        const newY = Math.max(0, Math.min(100 - dragState.initialH, dragState.initialY + deltaY));
        onUpdateElement(dragState.elementId, { x: newX, y: newY });
      } else if (dragState.action === 'resize-br') {
        const targetElement = pageElements.find((el) => el.id === dragState.elementId);
        if (targetElement?.type === 'image' && (targetElement as any).aspectRatio) {
          const imgEl = targetElement as any;
          const pageAspect = pageSize.width / pageSize.height;
          const newW = Math.max(3, dragState.initialW + deltaX);
          const newH = newW / (imgEl.aspectRatio * pageAspect);
          onUpdateElement(dragState.elementId, { width: newW, height: newH });
        } else {
          const newW = Math.max(2, dragState.initialW + deltaX);
          const newH = Math.max(2, dragState.initialH + deltaY);
          onUpdateElement(dragState.elementId, { width: newW, height: newH });
        }
      } else if (dragState.action === 'resize-tl') {
        const newW = Math.max(2, dragState.initialW - deltaX);
        const newH = Math.max(2, dragState.initialH - deltaY);
        const newX = dragState.initialX + deltaX;
        const newY = dragState.initialY + deltaY;
        onUpdateElement(dragState.elementId, { x: newX, y: newY, width: newW, height: newH });
      }
      return;
    }

    // Handle Freehand Drawing
    if (!isDrawing || activeTool !== 'annotate' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / displayedWidth) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / displayedHeight) * 100));

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
            color: isHighlighter ? '#facc15' : '#ef4444',
            width: isHighlighter ? 8 : 2.5,
            opacity: isHighlighter ? 0.4 : 1,
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
              .filter((item) => {
                if (editedOriginalIds.has(item.id)) return false;
                // Exclude Hindi / Devanagari / complex scripts so native Hindi text is never disrupted
                const isComplexScript = /[\u0900-\u097F\u0A00-\u0D7F]/.test(item.str);
                return !isComplexScript;
              })
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

        {/* Layer 2: Interactive SVG Layer for Drawings & Paths */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-25"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Rendered Drawing Elements */}
          {pageElements
            .filter((el): el is DrawingElement => el.type === 'drawing')
            .map((el) =>
              (el.paths || []).map((path, pIdx) => {
                if (!path.points || path.points.length < 2) return null;
                const d = path.points.reduce(
                  (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`,
                  ''
                );
                return (
                  <path
                    key={`${el.id}_${pIdx}`}
                    d={d}
                    fill="none"
                    stroke={path.color}
                    strokeWidth={path.width * 0.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={path.opacity || 1}
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
              d={currentPath.reduce(
                (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`,
                ''
              )}
              fill="none"
              stroke={activeAnnotateSubtool === 'highlighter' ? '#facc15' : '#ef4444'}
              strokeWidth={activeAnnotateSubtool === 'highlighter' ? 2 : 0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={activeAnnotateSubtool === 'highlighter' ? 0.4 : 1}
            />
          )}
        </svg>

        {/* Layer 3: Interactive Placed Elements (Text, Whiteout, Images, Signatures, Shapes, Forms, Links) */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          {pageElements.map((el) => {
            const isSelected = selectedElementId === el.id;

            if (el.type === 'drawing') return null; // handled in SVG layer

            return (
              <div
                key={el.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElement(el.id);
                }}
                className={`absolute group transition-shadow ${activeTool === 'annotate' ? 'pointer-events-none' : 'pointer-events-auto'} ${
                  isSelected
                    ? 'ring-2 ring-emerald-500 shadow-sm z-30'
                    : 'hover:ring-1 hover:ring-emerald-300'
                }`}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: el.type === 'text' ? 'auto' : `${el.width}%`,
                  minWidth: el.type === 'text' ? `${el.width}%` : undefined,
                  height: `${el.height}%`,
                }}
              >
                {/* 1. WHITEOUT */}
                {el.type === 'whiteout' && (
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
                    style={{ backgroundColor: el.color || '#ffffff' }}
                  />
                )}

                {/* 2. TEXT */}
                {el.type === 'text' && (
                  <div className="relative w-full h-full flex items-start">
                    {/* Compact grip handle when selected */}
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
                        className="absolute -top-4 -left-1 bg-emerald-600 hover:bg-emerald-700 text-white p-0.5 rounded-xs flex items-center cursor-grab active:cursor-grabbing shadow-xs z-50 select-none"
                        title="Drag to move"
                      >
                        <GripHorizontal className="w-3 h-3" />
                      </div>
                    )}

                    {/* Auto-fitting text container that prevents text from shifting or scrolling */}
                    <div className="relative inline-block w-full min-w-full overflow-visible">
                      {/* Hidden mirror span to ensure width matches exact text dimensions */}
                      <span
                        aria-hidden
                        className="invisible whitespace-pre block pointer-events-none select-none"
                        style={{
                          fontSize: `${(el.fontSize || 14) * zoom}px`,
                          fontWeight: el.isBold ? 700 : 400,
                          fontStyle: el.isItalic ? 'italic' : 'normal',
                          fontFamily: el.fontFamily || 'Arial, Helvetica, sans-serif',
                          lineHeight: 1.15,
                          padding: 0,
                          margin: 0,
                        }}
                      >
                        {el.text || ' '}
                      </span>

                      {el.text.includes('\\n') ? (
                        <textarea
                          ref={(node) => {
                            if (node && isSelected) node.focus({ preventScroll: true });
                          }}
                          value={el.text}
                          onChange={(e) =>
                            onUpdateElement(el.id, { text: e.target.value })
                          }
                          onBlur={(e) => {
                            if (!e.target.value.trim()) onDeleteElement(el.id);
                          }}
                          onFocus={() => onSelectElement(el.id)}
                          onPointerDown={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
                          onClick={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
                          rows={Math.max(1, el.text.split('\\n').length)}
                          className="absolute inset-0 w-full h-full outline-none bg-transparent border-none p-0 m-0 resize-none cursor-text select-text overflow-hidden"
                          style={{
                            fontSize: `${(el.fontSize || 14) * zoom}px`,
                            color: el.color || '#000000',
                            fontWeight: el.isBold ? 700 : 400,
                            fontStyle: el.isItalic ? 'italic' : 'normal',
                            textDecoration: el.isUnderline ? 'underline' : 'none',
                            textAlign: el.align || 'left',
                            fontFamily: el.fontFamily || 'Arial, Helvetica, sans-serif',
                            lineHeight: 1.15,
                          }}
                        />
                      ) : (
                        <input
                          ref={(node) => {
                            if (node && isSelected) {
                              node.focus({ preventScroll: true });
                              node.scrollLeft = 0;
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
                          onFocus={() => onSelectElement(el.id)}
                          onPointerDown={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
                          onClick={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
                          className="absolute inset-0 w-full h-full outline-none bg-transparent border-none p-0 m-0 cursor-text select-text"
                          style={{
                            fontSize: `${(el.fontSize || 14) * zoom}px`,
                            color: el.color || '#000000',
                            fontWeight: el.isBold ? 700 : 400,
                            fontStyle: el.isItalic ? 'italic' : 'normal',
                            textDecoration: el.isUnderline ? 'underline' : 'none',
                            textAlign: el.align || 'left',
                            fontFamily: el.fontFamily || 'Arial, Helvetica, sans-serif',
                            lineHeight: 1.15,
                          }}
                        />
                      )}
                    </div>
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
                    className="w-full h-full cursor-grab active:cursor-grabbing"
                  >
                    <img
                      src={el.dataUrl}
                      alt="Embedded"
                      className="w-full h-full object-fill pointer-events-none"
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
                    {/* Move grip handle when selected */}
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
                        className="absolute -top-4 -left-1 bg-emerald-600 hover:bg-emerald-700 text-white p-0.5 rounded-xs flex items-center cursor-grab active:cursor-grabbing shadow-xs z-50 select-none"
                        title="Drag to move"
                      >
                        <GripHorizontal className="w-3 h-3" />
                      </div>
                    )}

                    {el.formType === 'checkbox' ? (
                      <div
                        onPointerDown={(e) => {
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectElement(el.id);
                            onUpdateElement(el.id, { value: !el.value });
                          }}
                          className={`w-full h-full border-2 rounded flex items-center justify-center transition cursor-pointer active:scale-95 touch-manipulation ${el.value ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-white border-gray-400 hover:border-gray-600'}`}
                          aria-label="Form Checkbox"
                        >
                          {el.value && <Check className="w-3.5 h-3.5 stroke-3" />}
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-full relative">
                        <input
                          type="text"
                          value={typeof el.value === 'string' ? el.value : ''}
                          onChange={(e) => onUpdateElement(el.id, { value: e.target.value })}
                          onFocus={() => onSelectElement(el.id)}
                          onPointerDown={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
                          onClick={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
                          placeholder="Fillable field..."
                          className="w-full h-full border border-blue-400/80 bg-blue-50/20 px-1 py-0.5 rounded text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          style={{
                            fontSize: `${(el.fontSize || 13) * zoom}px`,
                            color: el.color || '#000000', fontWeight: el.isBold ? 700 : 400, fontStyle: el.isItalic ? 'italic' : 'normal' }}
                        />
                      </div>
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

                {/* Resize handle (bottom right) when selected */}
                {isSelected && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        elementId: el.id,
                        action: 'resize-br',
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
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

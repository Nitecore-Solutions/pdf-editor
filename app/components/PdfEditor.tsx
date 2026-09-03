'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './Navbar';
import { Toolbar } from './Toolbar';
import { PageEditor } from './PageEditor';
import { SignatureModal } from './SignatureModal';
import { ThumbnailsDrawer } from './ThumbnailsDrawer';
import { 
  ToolType, 
  AnnotateSubtool, 
  ShapeSubtool, 
  FormSubtool,
  EditorElement,
  PageInfo,
  EditorState,
  SignatureElement,
  ImageElement
} from '../types/editor';
import { getPdfMetadata } from '../lib/pdfRenderer';
import { exportModifiedPdf, downloadPdfBlob } from '../lib/pdfExporter';
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

interface PdfEditorProps {
  initialFile: File | null;
  initialPdfBytes: Uint8Array | null;
  onReset: () => void;
}

export const PdfEditor: React.FC<PdfEditorProps> = ({
  initialFile,
  initialPdfBytes,
  onReset,
}) => {
  const [fileName, setFileName] = useState(initialFile?.name || 'document.pdf');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(initialPdfBytes);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Tools state
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeAnnotateSubtool, setActiveAnnotateSubtool] = useState<AnnotateSubtool>('pen');
  const [activeShapeSubtool, setActiveShapeSubtool] = useState<ShapeSubtool>('rectangle');
  const [activeFormSubtool, setActiveFormSubtool] = useState<FormSubtool>('text');

  // Zoom & UI state
  const [zoom, setZoom] = useState(1.0);
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Auto-fit zoom on mobile screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      const fit = Math.max(0.4, Math.min(0.9, (window.innerWidth - 32) / 595));
      setZoom(Math.round(fit * 100) / 100);
    }
  }, []);

  // Track the page currently visible in the scroll area
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const mainScrollRef = React.useRef<HTMLDivElement>(null);
  const prevZoomRef = React.useRef(zoom);

  // Preserve center focal point when zooming in or out
  useEffect(() => {
    const container = mainScrollRef.current;
    if (container && prevZoomRef.current !== zoom) {
      const ratio = zoom / prevZoomRef.current;
      const currentCenterX = container.scrollLeft + container.clientWidth / 2;
      const newCenterX = currentCenterX * ratio;
      container.scrollLeft = Math.max(0, newCenterX - container.clientWidth / 2);
    }
    prevZoomRef.current = zoom;
  }, [zoom]);

  // Undo / Redo history
  const [history, setHistory] = useState<EditorElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize PDF or Blank Page
  useEffect(() => {
    async function initDocument() {
      if (pdfBytes && pdfBytes.length > 0) {
        try {
          const metadata = await getPdfMetadata(pdfBytes);
          const initialPages: PageInfo[] = [];
          for (let i = 0; i < metadata.numPages; i++) {
            const dim = metadata.pageDimensions[i] || { width: 595, height: 842, rotation: 0 };
            initialPages.push({
              pageIndex: i,
              originalPageIndex: i,
              width: dim.width,
              height: dim.height,
              rotation: 0,
            });
          }
          setPages(initialPages);
        } catch (e) {
          console.error('Failed to load PDF metadata:', e);
          // Fallback to 1 blank page
          setPages([{ pageIndex: 0, width: 595, height: 842, rotation: 0, isNewBlank: true }]);
        }
      } else {
        // Blank document
        setPages([{ pageIndex: 0, width: 595, height: 842, rotation: 0, isNewBlank: true }]);
      }
    }

    initDocument();
  }, [pdfBytes]);

  // Warn on reload/close if the user has a document open with changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pdfBytes || elements.length > 0) {
        e.preventDefault();
        // Modern browsers ignore the custom message but require returnValue to be set
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pdfBytes, elements.length]);

  // Push new state to history
  const recordHistory = useCallback(
    (newElements: EditorElement[]) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(newElements);
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    },
    [history, historyIndex]
  );

  // Add element(s)
  const handleAddElement = (elementOrElements: EditorElement | EditorElement[]) => {
    const newItems = Array.isArray(elementOrElements) ? elementOrElements : [elementOrElements];
    setElements((prev) => {
      const updated = [...prev, ...newItems];
      recordHistory(updated);
      return updated;
    });
  };

  // Update an element
  const handleUpdateElement = (id: string, updates: Partial<EditorElement>) => {
    const updated = elements.map((el) =>
      el.id === id ? ({ ...el, ...updates } as EditorElement) : el
    );
    setElements(updated);
    recordHistory(updated);
  };

  // Delete an element
  const handleDeleteElement = (id: string) => {
    const updated = elements.filter((el) => el.id !== id);
    setElements(updated);
    setSelectedElementId(null);
    recordHistory(updated);
  };

  // Duplicate currently selected element
  const handleDuplicateSelected = () => {
    if (!selectedElementId) return;
    const target = elements.find((el) => el.id === selectedElementId);
    if (!target) return;

    const newId = 'el_' + Math.random().toString(36).substr(2, 9);
    const duplicated: EditorElement = {
      ...target,
      id: newId,
      x: Math.min(90, target.x + 2),
      y: Math.min(90, target.y + 2),
    };

    const updated = [...elements, duplicated];
    setElements(updated);
    setSelectedElementId(newId);
    recordHistory(updated);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setElements(history[newIdx]);
      setSelectedElementId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setElements(history[newIdx]);
      setSelectedElementId(null);
    }
  };

  // Page Actions
  const handleRotatePage = (pageIdx: number) => {
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === pageIdx ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
  };

  const handleDeletePage = (pageIdx: number) => {
    if (pages.length <= 1) {
      alert('Cannot delete the only page in the document.');
      return;
    }
    const updatedPages = pages
      .filter((_, idx) => idx !== pageIdx)
      .map((p, newIdx) => ({ ...p, pageIndex: newIdx }));
    // Also remove elements on that page or shift index
    const updatedElements = elements
      .filter((el) => el.pageIndex !== pageIdx)
      .map((el) =>
        el.pageIndex > pageIdx ? { ...el, pageIndex: el.pageIndex - 1 } : el
      );

    setPages(updatedPages);
    setElements(updatedElements);
    recordHistory(updatedElements);
  };

  const handleInsertPage = (insertIndex: number) => {
    // Inherit dimensions from the nearest existing page so the blank matches the PDF
    const refPage =
      pages[insertIndex] ||       // the page that will be pushed down (insert above)
      pages[insertIndex - 1] ||   // the page just above (insert below)
      pages[0];                   // fallback: first page

    const newPage: PageInfo = {
      pageIndex: insertIndex,
      width: refPage ? refPage.width : 595,
      height: refPage ? refPage.height : 842,
      rotation: 0,
      isNewBlank: true,
    };

    const newPagesList = [...pages];
    newPagesList.splice(insertIndex, 0, newPage);
    const reindexedPages = newPagesList.map((p, idx) => ({ ...p, pageIndex: idx }));

    // Shift element page indices
    const updatedElements = elements.map((el) =>
      el.pageIndex >= insertIndex ? { ...el, pageIndex: el.pageIndex + 1 } : el
    );

    setPages(reindexedPages);
    setElements(updatedElements);
    recordHistory(updatedElements);
  };

  // Image Upload handler — places on the currently visible page
  const handleUploadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const id = 'el_img_' + Math.random().toString(36).substr(2, 9);
        const img = new Image();
        img.src = e.target.result as string;
        img.onload = () => {
          const aspectRatio = img.width / img.height;
          const newImgElement: ImageElement = {
            id,
            pageIndex: currentPageIndex,
            type: 'image',
            dataUrl: img.src,
            originalWidth: img.width,
            originalHeight: img.height,
            aspectRatio,
            x: 20,
            y: 20,
            width: 25,
            height: (25 * (img.height / img.width) * ((pages[currentPageIndex]?.width || 794) / (pages[currentPageIndex]?.height || 1123))),
          };
          handleAddElement(newImgElement);
          setSelectedElementId(id);
          // Scroll to the page where the image was placed
          setTimeout(() => {
            document.getElementById(`pdf-page-${currentPageIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        };
      }
    };
    reader.readAsDataURL(file);
  };

  // Signature placement handler — places on the currently visible page
  const handleSaveSignature = (dataUrl: string, sigType: 'draw' | 'type' | 'upload', color: string) => {
    const id = 'el_sig_' + Math.random().toString(36).substr(2, 9);
    const newSig: SignatureElement = {
      id,
      pageIndex: currentPageIndex,
      type: 'signature',
      dataUrl,
      sigType,
      color,
      x: 30,
      y: 40,
      width: 24,
      height: 10,
    };
    handleAddElement(newSig);
    setSelectedElementId(id);
    // Scroll to the page where the signature was placed
    setTimeout(() => {
      document.getElementById(`pdf-page-${currentPageIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Compile & Export with pdf-lib
  const handleApplyChanges = async () => {
    setIsExporting(true);
    try {
      const outputBytes = await exportModifiedPdf({
        originalPdfBytes: pdfBytes,
        pages,
        elements,
        fileName,
      });

      downloadPdfBlob(outputBytes, fileName);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Error generating PDF. Please check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  const selectedElement = elements.find((el) => el.id === selectedElementId) || null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100/90 text-gray-900">
      {/* Top Navbar */}
      <Navbar
        isEditing
        fileName={fileName}
        zoom={zoom}
        onZoomChange={setZoom}
        onToggleThumbnails={() => setIsThumbnailsOpen(!isThumbnailsOpen)}
        onReset={onReset}
      />

      {/* Floating Toolbar */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        activeAnnotateSubtool={activeAnnotateSubtool}
        onSelectAnnotateSubtool={setActiveAnnotateSubtool}
        activeShapeSubtool={activeShapeSubtool}
        onSelectShapeSubtool={setActiveShapeSubtool}
        activeFormSubtool={activeFormSubtool}
        onSelectFormSubtool={setActiveFormSubtool}
        onOpenSignatureModal={() => setIsSignatureModalOpen(true)}
        onUploadImage={handleUploadImage}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        selectedElement={selectedElement}
        onUpdateSelectedElement={(updates) =>
          selectedElementId && handleUpdateElement(selectedElementId, updates)
        }
        onDeleteSelectedElement={() =>
          selectedElementId && handleDeleteElement(selectedElementId)
        }
        onDuplicateSelectedElement={handleDuplicateSelected}
      />

      {/* Multi-Page Canvas Scroll Area */}
      <main 
        ref={mainScrollRef} 
        className="flex-1 overflow-y-auto overflow-x-auto py-4 sm:py-8 flex flex-col pb-28 sm:pb-36 w-full"
        onScroll={() => {
          // Detect which page is most visible in the scroll container
          const container = mainScrollRef.current;
          if (!container) return;
          const containerRect = container.getBoundingClientRect();
          const midY = containerRect.top + containerRect.height / 2;
          let closestPage = 0;
          let closestDist = Infinity;
          pages.forEach((_, idx) => {
            const el = document.getElementById(`pdf-page-${idx}`);
            if (!el) return;
            const elRect = el.getBoundingClientRect();
            const elMidY = elRect.top + elRect.height / 2;
            const dist = Math.abs(elMidY - midY);
            if (dist < closestDist) {
              closestDist = dist;
              closestPage = idx;
            }
          });
          setCurrentPageIndex(closestPage);
        }}
      >
        <div className="min-w-max mx-auto flex flex-col items-center px-4 sm:px-8">
          {pages.map((page) => (
            <PageEditor
              key={`page-${page.pageIndex}-${page.rotation}`}
              pageInfo={page}
              pdfBytes={pdfBytes}
              zoom={zoom}
              activeTool={activeTool}
              activeAnnotateSubtool={activeAnnotateSubtool}
              activeShapeSubtool={activeShapeSubtool}
              activeFormSubtool={activeFormSubtool}
              elements={elements}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onAddElement={handleAddElement}
              onUpdateElement={handleUpdateElement}
              onDeleteElement={handleDeleteElement}
              onDeletePage={handleDeletePage}
              onRotatePage={handleRotatePage}
              onInsertPageHere={handleInsertPage}
            />
          ))}
        </div>
      </main>

      {/* Sticky Bottom Bar (Apply changes >) */}
      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-gray-200 py-2.5 sm:py-3.5 px-3 sm:px-6 z-40 shadow-2xl flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3 text-2xs sm:text-xs text-gray-500">
          <span className="font-medium text-gray-700">
            {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}
          </span>
          <span>•</span>
          <span className="truncate max-w-[120px] sm:max-w-none">
            {elements.length} {elements.length === 1 ? 'change' : 'changes'}
          </span>
        </div>

        {/* Big Green "Apply changes >" Action Button */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {exportSuccess && (
            <div className="flex items-center space-x-1 sm:space-x-1.5 text-2xs sm:text-xs text-emerald-600 font-semibold animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Downloaded!</span>
            </div>
          )}

          <button
            onClick={handleApplyChanges}
            disabled={isExporting}
            className="flex items-center space-x-1.5 sm:space-x-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-xs sm:text-base px-4 sm:px-7 py-2 sm:py-3 rounded-lg sm:rounded-xl shadow-md sm:shadow-lg shadow-emerald-500/25 transition duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Apply changes</span>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </>
            )}
          </button>
        </div>
      </footer>

      {/* Signature Modal */}
      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSaveSignature={handleSaveSignature}
      />

      {/* Thumbnails Sidebar Drawer */}
      <ThumbnailsDrawer
        isOpen={isThumbnailsOpen}
        onClose={() => setIsThumbnailsOpen(false)}
        pages={pages}
        currentPageIndex={0}
        onSelectPage={(pageIdx) => {
          const el = document.getElementById(`pdf-page-${pageIdx}`);
          el?.scrollIntoView({ behavior: 'smooth' });
          setIsThumbnailsOpen(false);
        }}
        onRotatePage={handleRotatePage}
        onDeletePage={handleDeletePage}
        onInsertBlankPage={handleInsertPage}
      />
    </div>
  );
};

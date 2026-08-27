'use client';

import React, { useState, useRef } from 'react';
import { 
  Type, 
  Link as LinkIcon, 
  CheckSquare, 
  Image as ImageIcon, 
  PenTool, 
  Eraser, 
  Highlighter, 
  Square, 
  Circle, 
  Minus, 
  ArrowUpRight, 
  Undo2, 
  Redo2, 
  ChevronDown, 
  Bold, 
  Italic, 
  Trash2,
  Copy,
  ExternalLink
} from 'lucide-react';
import { 
  ToolType, 
  AnnotateSubtool, 
  ShapeSubtool, 
  FormSubtool,
  EditorElement,
  TextElement,
  ShapeElement,
  FormElement,
  LinkElement
} from '../types/editor';

interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  activeAnnotateSubtool: AnnotateSubtool;
  onSelectAnnotateSubtool: (subtool: AnnotateSubtool) => void;
  activeShapeSubtool: ShapeSubtool;
  onSelectShapeSubtool: (shape: ShapeSubtool) => void;
  activeFormSubtool: FormSubtool;
  onSelectFormSubtool: (form: FormSubtool) => void;
  onOpenSignatureModal: () => void;
  onUploadImage: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedElement: EditorElement | null;
  onUpdateSelectedElement: (updates: Partial<EditorElement>) => void;
  onDeleteSelectedElement: () => void;
  onDuplicateSelectedElement: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  activeAnnotateSubtool,
  onSelectAnnotateSubtool,
  activeShapeSubtool,
  onSelectShapeSubtool,
  activeFormSubtool,
  onSelectFormSubtool,
  onOpenSignatureModal,
  onUploadImage,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  selectedElement,
  onUpdateSelectedElement,
  onDeleteSelectedElement,
  onDuplicateSelectedElement,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <div className="shrink-0 w-full bg-white border-b border-gray-200 select-none z-30 relative shadow-2xs">
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageFileChange}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />

      {/* Main Primary Tool Bar */}
      <div className="flex items-center justify-start sm:justify-center w-full px-2 sm:px-4 py-1.5 overflow-x-auto no-scrollbar">
        <div className="inline-flex items-center bg-gray-50 rounded-xl border border-gray-200 p-1 text-xs sm:text-sm font-medium text-gray-700 space-x-0.5 sm:space-x-1 shrink-0">
          
          {/* TEXT TOOL */}
          <button
            onClick={() => onSelectTool('text')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 ${
              activeTool === 'text'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-200/70 text-gray-700'
            }`}
          >
            <Type className="w-4 h-4" />
            <span>Text</span>
          </button>

          {/* LINKS TOOL */}
          <button
            onClick={() => onSelectTool('links')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 ${
              activeTool === 'links'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-200/70 text-gray-700'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>Links</span>
          </button>

          {/* FORMS TOOL */}
          <button
            onClick={() => onSelectTool('forms')}
            className={`flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 ${
              activeTool === 'forms'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-200/70 text-gray-700'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Forms</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>

          {/* IMAGES TOOL */}
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer hover:bg-gray-200/70 text-gray-700 shrink-0"
          >
            <ImageIcon className="w-4 h-4 text-purple-600" />
            <span>Images</span>
          </button>

          {/* SIGN TOOL */}
          <button
            onClick={onOpenSignatureModal}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer hover:bg-gray-200/70 text-gray-700 shrink-0"
          >
            <PenTool className="w-4 h-4 text-blue-600" />
            <span>Sign</span>
          </button>

          {/* WHITEOUT TOOL */}
          <button
            onClick={() => onSelectTool('whiteout')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 ${
              activeTool === 'whiteout'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-200/70 text-gray-700'
            }`}
          >
            <Eraser className="w-4 h-4 text-gray-600" />
            <span>Whiteout</span>
          </button>

          {/* ANNOTATE TOOL */}
          <button
            onClick={() => onSelectTool('annotate')}
            className={`flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 ${
              activeTool === 'annotate'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-200/70 text-gray-700'
            }`}
          >
            <Highlighter className="w-4 h-4 text-amber-500" />
            <span>Annotate</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>

          {/* SHAPES TOOL */}
          <button
            onClick={() => onSelectTool('shapes')}
            className={`flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 ${
              activeTool === 'shapes'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-200/70 text-gray-700'
            }`}
          >
            <Square className="w-4 h-4" />
            <span>Shapes</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>

          {/* UNDO / REDO */}
          <div className="flex items-center pl-1 border-l border-gray-300 space-x-0.5 shrink-0">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-1.5 rounded-lg transition ${
                canUndo ? 'hover:bg-gray-200/80 text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
              }`}
              title="Undo"
              aria-label="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-1.5 rounded-lg transition ${
                canRedo ? 'hover:bg-gray-200/80 text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
              }`}
              title="Redo"
              aria-label="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Subtool Options Bar (Always visible & fully clickable when Forms, Annotate, or Shapes is selected) */}
      {activeTool === 'forms' && (
        <div className="bg-emerald-50/60 border-t border-emerald-100 px-3 py-1.5 flex items-center justify-center space-x-2 text-xs overflow-x-auto no-scrollbar animate-in fade-in">
          <span className="text-emerald-800 font-bold text-2xs uppercase tracking-wider shrink-0">Form Type:</span>
          <button
            onClick={() => onSelectFormSubtool('text')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeFormSubtool === 'text'
                ? 'bg-emerald-600 text-white font-bold border-emerald-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <span className="font-mono bg-black/10 px-1 py-0.5 rounded text-2xs">abc</span>
            <span>Text Field</span>
          </button>
          <button
            onClick={() => onSelectFormSubtool('checkbox')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeFormSubtool === 'checkbox'
                ? 'bg-emerald-600 text-white font-bold border-emerald-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Checkbox</span>
          </button>
        </div>
      )}

      {activeTool === 'annotate' && (
        <div className="bg-amber-50/60 border-t border-amber-100 px-3 py-1.5 flex items-center justify-center space-x-2 text-xs overflow-x-auto no-scrollbar animate-in fade-in">
          <span className="text-amber-800 font-bold text-2xs uppercase tracking-wider shrink-0">Annotate Tool:</span>
          <button
            onClick={() => onSelectAnnotateSubtool('pen')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeAnnotateSubtool === 'pen'
                ? 'bg-amber-600 text-white font-bold border-amber-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Freehand Pen</span>
          </button>
          <button
            onClick={() => onSelectAnnotateSubtool('highlighter')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeAnnotateSubtool === 'highlighter'
                ? 'bg-amber-600 text-white font-bold border-amber-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>Highlighter</span>
          </button>
        </div>
      )}

      {activeTool === 'shapes' && (
        <div className="bg-blue-50/60 border-t border-blue-100 px-3 py-1.5 flex items-center justify-center space-x-2 text-xs overflow-x-auto no-scrollbar animate-in fade-in">
          <span className="text-blue-800 font-bold text-2xs uppercase tracking-wider shrink-0">Shape:</span>
          <button
            onClick={() => onSelectShapeSubtool('rectangle')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeShapeSubtool === 'rectangle'
                ? 'bg-blue-600 text-white font-bold border-blue-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Square className="w-3.5 h-3.5" />
            <span>Rectangle</span>
          </button>
          <button
            onClick={() => onSelectShapeSubtool('circle')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeShapeSubtool === 'circle'
                ? 'bg-blue-600 text-white font-bold border-blue-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Circle className="w-3.5 h-3.5" />
            <span>Circle</span>
          </button>
          <button
            onClick={() => onSelectShapeSubtool('line')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeShapeSubtool === 'line'
                ? 'bg-blue-600 text-white font-bold border-blue-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Minus className="w-3.5 h-3.5" />
            <span>Line</span>
          </button>
          <button
            onClick={() => onSelectShapeSubtool('arrow')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              activeShapeSubtool === 'arrow'
                ? 'bg-blue-600 text-white font-bold border-blue-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Arrow</span>
          </button>
        </div>
      )}

      {/* Dynamic Element Styling Bar when an element is selected */}
      {selectedElement && (
        <div className="bg-white border-t border-emerald-300/80 px-3 py-1.5 flex items-center justify-center space-x-3 text-xs overflow-x-auto no-scrollbar shadow-inner animate-in fade-in">
          {/* Element Type Indicator */}
          <span className="font-semibold text-emerald-700 uppercase tracking-wider text-2xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
            {selectedElement.type}
          </span>

          {/* Text Controls */}
          {selectedElement.type === 'text' && (
            <>
              {/* Font Size */}
              <div className="flex items-center space-x-1 shrink-0">
                <span className="text-gray-500">Size:</span>
                <select
                  value={(selectedElement as TextElement).fontSize || 14}
                  onChange={(e) =>
                    onUpdateSelectedElement({ fontSize: parseInt(e.target.value) })
                  }
                  className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                >
                  {Array.from(new Set([8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48, 64, (selectedElement as TextElement).fontSize || 14]))
                    .sort((a, b) => a - b)
                    .map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                </select>
              </div>

              {/* Bold / Italic */}
              <div className="flex items-center space-x-0.5 bg-gray-100 p-0.5 rounded border border-gray-200 shrink-0">
                <button
                  onClick={() =>
                    onUpdateSelectedElement({
                      isBold: !(selectedElement as TextElement).isBold,
                    })
                  }
                  className={`p-1 rounded transition cursor-pointer ${
                    (selectedElement as TextElement).isBold
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  aria-label="Bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    onUpdateSelectedElement({
                      isItalic: !(selectedElement as TextElement).isItalic,
                    })
                  }
                  className={`p-1 rounded transition cursor-pointer ${
                    (selectedElement as TextElement).isItalic
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  aria-label="Italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Full Color Picker */}
              <div className="flex items-center space-x-1.5 pl-1 shrink-0">
                <span className="text-gray-500 text-xs">Color:</span>
                <label
                  className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer overflow-hidden block shadow-xs hover:border-emerald-400 transition"
                  style={{ backgroundColor: (selectedElement as TextElement).color || '#000000' }}
                  title="Pick text color"
                >
                  <input
                    type="color"
                    value={(selectedElement as TextElement).color || '#000000'}
                    onChange={(e) => onUpdateSelectedElement({ color: e.target.value })}
                    className="opacity-0 w-0 h-0 absolute"
                  />
                </label>
              </div>
            </>
          )}

          {/* Form Field Controls */}
          {selectedElement.type === 'form' && (selectedElement as FormElement).formType !== 'checkbox' && (
            <>
              {/* Font Size */}
              <div className="flex items-center space-x-1 shrink-0">
                <span className="text-gray-500">Size:</span>
                <select
                  value={(selectedElement as FormElement).fontSize || 12}
                  onChange={(e) =>
                    onUpdateSelectedElement({ fontSize: parseInt(e.target.value) })
                  }
                  className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                >
                  {[8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24].map((size) => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
              </div>

              {/* Bold / Italic */}
              <div className="flex items-center space-x-0.5 bg-gray-100 p-0.5 rounded border border-gray-200 shrink-0">
                <button
                  onClick={() =>
                    onUpdateSelectedElement({ isBold: !(selectedElement as FormElement).isBold })
                  }
                  className={`p-1 rounded transition cursor-pointer ${
                    (selectedElement as FormElement).isBold
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  aria-label="Bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    onUpdateSelectedElement({ isItalic: !(selectedElement as FormElement).isItalic })
                  }
                  className={`p-1 rounded transition cursor-pointer ${
                    (selectedElement as FormElement).isItalic
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  aria-label="Italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Text Color */}
              <div className="flex items-center space-x-1.5 pl-1 shrink-0">
                <span className="text-gray-500 text-xs">Color:</span>
                <label
                  className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer overflow-hidden block shadow-xs hover:border-emerald-400 transition"
                  style={{ backgroundColor: (selectedElement as FormElement).color || '#1e293b' }}
                  title="Pick text color"
                >
                  <input
                    type="color"
                    value={(selectedElement as FormElement).color || '#1e293b'}
                    onChange={(e) => onUpdateSelectedElement({ color: e.target.value })}
                    className="opacity-0 w-0 h-0 absolute"
                  />
                </label>
              </div>

              {/* Placeholder */}
              <div className="flex items-center space-x-1 shrink-0">
                <span className="text-gray-500 text-xs">Placeholder:</span>
                <input
                  type="text"
                  value={(selectedElement as FormElement).placeholder || ''}
                  onChange={(e) => onUpdateSelectedElement({ placeholder: e.target.value })}
                  placeholder="Fill field..."
                  className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none w-24"
                />
              </div>
            </>
          )}

          {/* Link Controls */}
          {selectedElement.type === 'link' && (
            <div className="flex items-center space-x-2 shrink-0">
              <ExternalLink className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <input
                type="url"
                value={(selectedElement as LinkElement).url || ''}
                onChange={(e) => onUpdateSelectedElement({ url: e.target.value })}
                placeholder="https://example.com"
                className="bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-sky-400 w-44 sm:w-52"
              />
              <button
                onClick={() => {
                  const url = (selectedElement as LinkElement).url || '';
                  const href = url.startsWith('http') ? url : `https://${url}`;
                  window.open(href, '_blank', 'noopener,noreferrer');
                }}
                className="flex items-center space-x-0.5 text-2xs text-sky-600 hover:text-sky-800 font-medium bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded border border-sky-200 transition cursor-pointer"
                title="Open URL"
              >
                <span>Open</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Shape Controls */}
          {selectedElement.type === 'shape' && (
            <>
              <div className="flex items-center space-x-1 shrink-0">
                <span className="text-gray-500">Stroke:</span>
                <select
                  value={(selectedElement as ShapeElement).strokeWidth || 2}
                  onChange={(e) =>
                    onUpdateSelectedElement({ strokeWidth: parseInt(e.target.value) })
                  }
                  className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                >
                  {[1, 2, 3, 4, 6, 8].map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                </select>
              </div>

              {/* Stroke Color Picker */}
              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="text-gray-500 text-xs">Color:</span>
                <label
                  className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer overflow-hidden block shadow-xs hover:border-emerald-400 transition"
                  style={{ backgroundColor: (selectedElement as ShapeElement).strokeColor || '#000000' }}
                  title="Pick stroke color"
                >
                  <input
                    type="color"
                    value={(selectedElement as ShapeElement).strokeColor || '#000000'}
                    onChange={(e) => onUpdateSelectedElement({ strokeColor: e.target.value })}
                    className="opacity-0 w-0 h-0 absolute"
                  />
                </label>
              </div>
            </>
          )}

          {/* Action buttons: Duplicate & Delete */}
          <div className="flex items-center space-x-1 pl-2 border-l border-gray-200 shrink-0">
            <button
              onClick={onDuplicateSelectedElement}
              className="p-1 text-gray-500 hover:text-emerald-600 hover:bg-gray-100 rounded transition cursor-pointer"
              title="Duplicate Element"
              aria-label="Duplicate"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDeleteSelectedElement}
              className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
              title="Delete Element"
              aria-label="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

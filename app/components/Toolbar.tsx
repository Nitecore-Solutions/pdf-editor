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
  Underline, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const toggleDropdown = (name: string) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(e.target.files[0]);
      e.target.value = '';
    }
  };

  const colors = ['#000000', '#1e293b', '#dc2626', '#16a34a', '#2563eb', '#ca8a04', '#9333ea', '#ffffff'];

  return (
    <div className="sticky top-14 z-30 flex items-center justify-start sm:justify-center w-full px-2 sm:px-4 bg-gray-50/95 backdrop-blur-md border-b border-gray-200 select-none relative h-13 overflow-x-auto no-scrollbar">
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageFileChange}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />

      {/* Main Tool Bar (Bharat Job Style) */}
      <div className="inline-flex items-center bg-white rounded-xl shadow-md border border-gray-200 p-1 divide-x divide-gray-100 text-xs sm:text-sm font-medium text-gray-700 shrink-0 mx-auto sm:mx-0">
        
        {/* TEXT TOOL */}
        <div className="relative">
          <button
            onClick={() => {
              onSelectTool('text');
              setOpenDropdown(null);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTool === 'text'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Type className="w-4 h-4" />
            <span>Text</span>
          </button>
        </div>

        {/* LINKS TOOL */}
        <div className="relative pl-1">
          <button
            onClick={() => {
              onSelectTool('links');
              setOpenDropdown(null);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTool === 'links'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>Links</span>
          </button>
        </div>

        {/* FORMS TOOL */}
        <div className="relative pl-1">
          <button
            onClick={() => toggleDropdown('forms')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTool === 'forms'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Forms</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {openDropdown === 'forms' && (
            <div className="absolute left-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-50 flex flex-col space-y-1">
              <button
                onClick={() => {
                  onSelectTool('forms');
                  onSelectFormSubtool('text');
                  setOpenDropdown(null);
                }}
                className="flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg hover:bg-gray-100 text-gray-700 cursor-pointer"
              >
                <span className="font-mono bg-gray-100 px-1 py-0.5 rounded border border-gray-300">abc</span>
                <span>Text Field</span>
              </button>
              <button
                onClick={() => {
                  onSelectTool('forms');
                  onSelectFormSubtool('checkbox');
                  setOpenDropdown(null);
                }}
                className="flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg hover:bg-gray-100 text-gray-700 cursor-pointer"
              >
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <span>Checkbox</span>
              </button>
            </div>
          )}
        </div>

        {/* IMAGES TOOL */}
        <div className="relative pl-1">
          <button
            onClick={() => imageInputRef.current?.click()}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer hover:bg-gray-100 text-gray-700`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Images</span>
          </button>
        </div>

        {/* SIGN TOOL */}
        <div className="relative pl-1">
          <button
            onClick={onOpenSignatureModal}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer hover:bg-gray-100 text-gray-700`}
          >
            <PenTool className="w-4 h-4 text-blue-600" />
            <span>Sign</span>
          </button>
        </div>

        {/* WHITEOUT TOOL */}
        <div className="relative pl-1">
          <button
            onClick={() => {
              onSelectTool('whiteout');
              setOpenDropdown(null);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTool === 'whiteout'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Eraser className="w-4 h-4" />
            <span>Whiteout</span>
          </button>
        </div>

        {/* ANNOTATE TOOL (Pen / Highlighter) */}
        <div className="relative pl-1">
          <button
            onClick={() => toggleDropdown('annotate')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTool === 'annotate'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Highlighter className="w-4 h-4 text-amber-500" />
            <span>Annotate</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {openDropdown === 'annotate' && (
            <div className="absolute left-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-50 flex flex-col space-y-1">
              <button
                onClick={() => {
                  onSelectTool('annotate');
                  onSelectAnnotateSubtool('pen');
                  setOpenDropdown(null);
                }}
                className={`flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg transition cursor-pointer ${
                  activeAnnotateSubtool === 'pen' && activeTool === 'annotate'
                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <PenTool className="w-4 h-4" />
                <span>Freehand Pen</span>
              </button>
              <button
                onClick={() => {
                  onSelectTool('annotate');
                  onSelectAnnotateSubtool('highlighter');
                  setOpenDropdown(null);
                }}
                className={`flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg transition cursor-pointer ${
                  activeAnnotateSubtool === 'highlighter' && activeTool === 'annotate'
                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Highlighter className="w-4 h-4 text-amber-500" />
                <span>Highlighter</span>
              </button>
            </div>
          )}
        </div>

        {/* SHAPES TOOL */}
        <div className="relative pl-1">
          <button
            onClick={() => toggleDropdown('shapes')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTool === 'shapes'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Square className="w-4 h-4" />
            <span>Shapes</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {openDropdown === 'shapes' && (
            <div className="absolute left-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-50 flex flex-col space-y-1">
              <button
                onClick={() => {
                  onSelectTool('shapes');
                  onSelectShapeSubtool('rectangle');
                  setOpenDropdown(null);
                }}
                className="flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg hover:bg-gray-100 text-gray-700 cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>Rectangle</span>
              </button>
              <button
                onClick={() => {
                  onSelectTool('shapes');
                  onSelectShapeSubtool('circle');
                  setOpenDropdown(null);
                }}
                className="flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg hover:bg-gray-100 text-gray-700 cursor-pointer"
              >
                <Circle className="w-4 h-4" />
                <span>Circle / Ellipse</span>
              </button>
              <button
                onClick={() => {
                  onSelectTool('shapes');
                  onSelectShapeSubtool('line');
                  setOpenDropdown(null);
                }}
                className="flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg hover:bg-gray-100 text-gray-700 cursor-pointer"
              >
                <Minus className="w-4 h-4" />
                <span>Line</span>
              </button>
              <button
                onClick={() => {
                  onSelectTool('shapes');
                  onSelectShapeSubtool('arrow');
                  setOpenDropdown(null);
                }}
                className="flex items-center space-x-2 w-full px-3 py-2 text-xs rounded-lg hover:bg-gray-100 text-gray-700 cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Arrow</span>
              </button>
            </div>
          )}
        </div>

        {/* UNDO / REDO */}
        <div className="flex items-center pl-1 space-x-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded-lg transition ${
              canUndo ? 'hover:bg-gray-100 text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
            }`}
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded-lg transition ${
              canRedo ? 'hover:bg-gray-100 text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
            }`}
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dynamic Element Styling Sub-Bar when an element is selected */}
      {selectedElement && (
        <div className="fixed sm:absolute top-[7.25rem] sm:top-full mt-1.5 left-1/2 -translate-x-1/2 inline-flex items-center bg-white/95 backdrop-blur-xs rounded-xl shadow-xl border border-emerald-300/80 px-2.5 sm:px-3 py-1.5 space-x-2 sm:space-x-3 text-xs z-50 animate-in fade-in slide-in-from-top-1 duration-150 whitespace-nowrap max-w-[96vw] overflow-x-auto no-scrollbar">
          
          {/* Element Type Indicator */}
          <span className="font-semibold text-emerald-700 uppercase tracking-wider text-2xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {selectedElement.type}
          </span>

          {/* Text Controls */}
          {selectedElement.type === 'text' && (
            <>
              {/* Font Size */}
              <div className="flex items-center space-x-1">
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

              {/* Bold / Italic / Align */}
              <div className="flex items-center space-x-0.5 bg-gray-100 p-0.5 rounded border border-gray-200">
                <button
                  onClick={() =>
                    onUpdateSelectedElement({
                      isBold: !(selectedElement as TextElement).isBold,
                    })
                  }
                  className={`p-1 rounded transition ${
                    (selectedElement as TextElement).isBold
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    onUpdateSelectedElement({
                      isItalic: !(selectedElement as TextElement).isItalic,
                    })
                  }
                  className={`p-1 rounded transition ${
                    (selectedElement as TextElement).isItalic
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Full Color Picker */}
              <div className="flex items-center space-x-1.5 pl-1">
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
              <div className="flex items-center space-x-1">
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
              <div className="flex items-center space-x-0.5 bg-gray-100 p-0.5 rounded border border-gray-200">
                <button
                  onClick={() =>
                    onUpdateSelectedElement({ isBold: !(selectedElement as FormElement).isBold })
                  }
                  className={`p-1 rounded transition ${
                    (selectedElement as FormElement).isBold
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    onUpdateSelectedElement({ isItalic: !(selectedElement as FormElement).isItalic })
                  }
                  className={`p-1 rounded transition ${
                    (selectedElement as FormElement).isItalic
                      ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Text Color */}
              <div className="flex items-center space-x-1.5 pl-1">
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
              <div className="flex items-center space-x-1">
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
            <div className="flex items-center space-x-2">
              <ExternalLink className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <input
                type="url"
                value={(selectedElement as LinkElement).url || ''}
                onChange={(e) => onUpdateSelectedElement({ url: e.target.value })}
                placeholder="https://example.com"
                className="bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-sky-400 w-52"
              />
              <button
                onClick={() => {
                  const url = (selectedElement as LinkElement).url || '';
                  const href = url.startsWith('http') ? url : `https://${url}`;
                  window.open(href, '_blank', 'noopener,noreferrer');
                }}
                className="flex items-center space-x-0.5 text-2xs text-sky-600 hover:text-sky-800 font-medium bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded border border-sky-200 transition"
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
              <div className="flex items-center space-x-1">
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
              <div className="flex items-center space-x-1.5">
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
          <div className="flex items-center space-x-1 pl-2 border-l border-gray-200">
            <button
              onClick={onDuplicateSelectedElement}
              className="p-1 text-gray-500 hover:text-emerald-600 hover:bg-gray-100 rounded transition"
              title="Duplicate Element"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDeleteSelectedElement}
              className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition"
              title="Delete Element"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

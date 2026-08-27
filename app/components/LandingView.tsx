'use client';

import React, { useRef, useState } from 'react';
import { 
  Upload, 
  FilePlus, 
  Sparkles, 
  Lock, 
  ChevronDown
} from 'lucide-react';

interface LandingViewProps {
  onFileSelect: (file: File) => void;
  onStartBlank: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onFileSelect,
  onStartBlank,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        onFileSelect(file);
      } else {
        alert('Please drop a valid PDF file.');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelect(file);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start bg-gradient-to-b from-gray-50/70 via-white to-gray-50 min-h-[calc(100vh-3.5rem)] px-3 sm:px-6 select-none pt-4 sm:pt-10 pb-12 w-full">
      {/* Hero Header */}
      <div className="text-center mt-2 sm:mt-4 mb-6 sm:mb-8 max-w-2xl px-2">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-2xs sm:text-xs font-bold uppercase tracking-wider mb-3 sm:mb-4 border border-blue-200 shadow-2xs">
          <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <span>Bharat Job Online Tools</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Online PDF Editor
        </h1>
        <p className="mt-2.5 sm:mt-3 text-sm sm:text-base md:text-lg text-gray-600 font-normal px-2">
          Edit PDF files for free. Fill & sign PDF. Add text, shapes, whiteout, signatures & more.
        </p>
      </div>

      {/* Drop Zone & Big Upload Button */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-xl p-5 sm:p-8 rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center bg-white shadow-xl ${
          isDragging ? 'border-blue-500 bg-blue-50/40 scale-[1.01]' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept="application/pdf,.pdf"
          className="hidden"
        />

        {/* Upload Button */}
        <div className="flex items-center shadow-md rounded-xl overflow-hidden group max-w-full">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-2 sm:space-x-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm sm:text-base px-4 sm:px-6 py-2.5 sm:py-3 transition duration-150 cursor-pointer"
          >
            <div className="bg-blue-700/60 p-1 rounded-md">
              <Upload className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
            </div>
            <span>Upload PDF file</span>
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white px-2.5 sm:px-3 py-3 sm:py-3.5 border-l border-blue-500/40 transition flex items-center justify-center cursor-pointer"
            aria-label="Upload options"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Start with blank document */}
        <div className="mt-4">
          <button
            onClick={onStartBlank}
            className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-1.5 cursor-pointer py-1"
          >
            <FilePlus className="w-4 h-4" />
            <span>or start with a blank document</span>
          </button>
        </div>

        {/* Drag message */}
        <p className="mt-4 sm:mt-6 text-2xs sm:text-xs text-gray-400 font-medium text-center">
          Drag & drop your PDF here or click to browse
        </p>
      </div>

      {/* Privacy Guarantee & Notice */}
      <div className="mt-6 sm:mt-8 text-center max-w-lg text-xs text-gray-500 space-y-1.5 px-3">
        <div className="flex items-center justify-center space-x-1.5 text-gray-600 font-medium">
          <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>Files stay private. Edited 100% locally in your browser.</span>
        </div>
        <p className="text-2xs sm:text-xs">
          Free service for documents up to 200 pages or 50 MB and unlimited edits.
        </p>
      </div>

      {/* Features Overview Badges */}
      <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-8 sm:mt-12 mb-6">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex sm:flex-col items-center sm:text-center space-x-3 sm:space-x-0">
          <div className="w-10 h-10 rounded-full bg-blue-100/70 text-blue-600 flex items-center justify-center shrink-0 mb-0 sm:mb-2 font-bold">
            Aa
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Add & Edit Text</h3>
            <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">Insert custom text with colors, fonts, and styles.</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex sm:flex-col items-center sm:text-center space-x-3 sm:space-x-0">
          <div className="w-10 h-10 rounded-full bg-indigo-100/70 text-indigo-600 flex items-center justify-center shrink-0 mb-0 sm:mb-2 font-bold text-xs">
            ✍️
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Fill & Sign</h3>
            <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">Draw, type cursive, or upload your signature.</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex sm:flex-col items-center sm:text-center space-x-3 sm:space-x-0">
          <div className="w-10 h-10 rounded-full bg-purple-100/70 text-purple-600 flex items-center justify-center shrink-0 mb-0 sm:mb-2 font-bold text-xs">
            ⬛
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Whiteout & Erase</h3>
            <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">Cover sensitive info or erase unwanted text.</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex sm:flex-col items-center sm:text-center space-x-3 sm:space-x-0">
          <div className="w-10 h-10 rounded-full bg-amber-100/70 text-amber-600 flex items-center justify-center shrink-0 mb-0 sm:mb-2 font-bold text-xs">
            📐
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Shapes & Annotate</h3>
            <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">Freehand pen, highlighter, rectangles, and arrows.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

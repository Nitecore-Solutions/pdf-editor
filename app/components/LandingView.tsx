'use client';

import React, { useRef, useState } from 'react';
import { 
  Upload, 
  FilePlus, 
  ShieldCheck, 
  Zap, 
  Sparkles, 
  Lock, 
  CheckCircle2, 
  FileText,
  ChevronDown,
  ArrowRight
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
    <div className="flex-1 flex flex-col items-center justify-start bg-gradient-to-b from-gray-50/70 via-white to-gray-50 min-h-[calc(100vh-3.5rem)] px-4 select-none">
      {/* Banner / Language notification */}
      <div className="w-full max-w-2xl mt-4 flex items-center justify-between bg-sky-50 border border-sky-200 text-sky-800 text-xs sm:text-sm px-4 py-2 rounded-lg shadow-2xs">
        <div className="flex items-center space-x-2">
          <span>文A</span>
          <span>Sejda हिन्दी व अन्य भाषाओं में भी उपलब्ध है।</span>
        </div>
        <button className="text-sky-700 hover:text-sky-900 font-semibold cursor-pointer underline">
          भाषा बदलें
        </button>
      </div>

      {/* Hero Header */}
      <div className="text-center mt-12 mb-8 max-w-2xl">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-4 border border-emerald-200">
          <Sparkles className="w-3.5 h-3.5" />
          <span>BETA Online PDF Suite</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Online PDF editor
        </h1>
        <p className="mt-3 text-lg sm:text-xl text-gray-600 font-normal">
          Edit PDF files for free. Fill & sign PDF. Add text, shapes, whiteout, signatures & more.
        </p>
      </div>

      {/* Drop Zone & Big Upload Button */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-xl p-8 rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center bg-white shadow-xl ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50/50 scale-[1.02]'
            : 'border-gray-300 hover:border-emerald-400'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept="application/pdf,.pdf"
          className="hidden"
        />

        {/* Big Green Upload Button */}
        <div className="flex items-center shadow-lg rounded-xl overflow-hidden group">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-lg px-8 py-4 transition duration-150 cursor-pointer"
          >
            <div className="bg-emerald-600/60 p-1.5 rounded-lg">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <span>Upload PDF file</span>
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-5 border-l border-emerald-400/40 transition flex items-center justify-center cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Start with blank document */}
        <div className="mt-4">
          <button
            onClick={onStartBlank}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline flex items-center space-x-1.5 cursor-pointer"
          >
            <FilePlus className="w-4 h-4" />
            <span>or start with a blank document</span>
          </button>
        </div>

        {/* Drag message */}
        <p className="mt-6 text-xs text-gray-400 font-medium">
          Drag & drop your PDF here to start editing instantly
        </p>
      </div>

      {/* Privacy Guarantee & Notice */}
      <div className="mt-8 text-center max-w-lg text-xs text-gray-500 space-y-1.5">
        <div className="flex items-center justify-center space-x-1.5 text-gray-600 font-medium">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>Files stay private. Edited 100% locally in your browser.</span>
        </div>
        <p>
          Free service for documents up to 200 pages or 50 MB and unlimited edits.
        </p>
        <div className="text-gray-400 text-2xs space-x-2 pt-1">
          <span className="hover:underline cursor-pointer">Terms of Use</span>
          <span>•</span>
          <span className="hover:underline cursor-pointer">Privacy Policy</span>
        </div>
      </div>

      {/* Features Overview Badges */}
      <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 mb-12">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-100/70 text-emerald-600 flex items-center justify-center mb-2 font-bold">
            Aa
          </div>
          <h3 className="font-semibold text-gray-800 text-sm">Add & Edit Text</h3>
          <p className="text-xs text-gray-500 mt-1">Insert custom text with colors, fonts, and styles.</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-blue-100/70 text-blue-600 flex items-center justify-center mb-2 font-bold">
            ✍️
          </div>
          <h3 className="font-semibold text-gray-800 text-sm">Fill & Sign</h3>
          <p className="text-xs text-gray-500 mt-1">Draw, type cursive, or upload your signature.</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-purple-100/70 text-purple-600 flex items-center justify-center mb-2 font-bold">
            ⬜
          </div>
          <h3 className="font-semibold text-gray-800 text-sm">Whiteout & Erase</h3>
          <p className="text-xs text-gray-500 mt-1">Cover sensitive information or erase unwanted text.</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-amber-100/70 text-amber-600 flex items-center justify-center mb-2 font-bold">
            🎨
          </div>
          <h3 className="font-semibold text-gray-800 text-sm">Shapes & Annotate</h3>
          <p className="text-xs text-gray-500 mt-1">Freehand pen, highlighter, rectangles, and arrows.</p>
        </div>
      </div>
    </div>
  );
};

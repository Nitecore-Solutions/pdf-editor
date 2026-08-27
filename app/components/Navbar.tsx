'use client';

import React from 'react';
import { 
  FileText, 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  ArrowLeft
} from 'lucide-react';

interface NavbarProps {
  fileName?: string;
  isEditing?: boolean;
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
  onToggleThumbnails?: () => void;
  onReset?: () => void;
  onNewBlank?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  fileName,
  isEditing = false,
  zoom = 1,
  onZoomChange,
  onToggleThumbnails,
  onReset,
  onNewBlank,
}) => {
  return (
    <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-6">
          <div 
            onClick={onReset}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:bg-blue-700 transition">
              BJ
            </div>
            <span className="font-extrabold text-lg sm:text-xl text-gray-900 tracking-tight flex items-center gap-1.5">
              <span>Bharat Job</span>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">PDF Editor</span>
            </span>
          </div>

          {/* Nav links: ONLY Edit */}
          <nav className="hidden sm:flex items-center space-x-5 text-sm font-medium text-gray-600">
            <span className="text-blue-600 font-bold cursor-pointer border-b-2 border-blue-600 pb-0.5 flex items-center gap-1">
              Edit PDF
            </span>
          </nav>
        </div>

        {/* Center: File Title if editing */}
        {isEditing && fileName && (
          <div className="hidden md:flex items-center space-x-2 bg-gray-100/80 px-3 py-1 rounded-full text-xs text-gray-700 max-w-xs truncate border border-gray-200">
            <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate font-medium">{fileName}</span>
          </div>
        )}

        {/* Right Tools & Actions */}
        <div className="flex items-center space-x-3">
          {isEditing ? (
            <>
              {/* Zoom controls */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200 text-xs text-gray-700">
                <button
                  onClick={() => onZoomChange && onZoomChange(Math.max(0.5, zoom - 0.1))}
                  className="p-1.5 hover:bg-white rounded transition hover:text-blue-600 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-semibold min-w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => onZoomChange && onZoomChange(Math.min(2.0, zoom + 0.1))}
                  className="p-1.5 hover:bg-white rounded transition hover:text-blue-600 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Thumbnails Sidebar Toggle */}
              {onToggleThumbnails && (
                <button
                  onClick={onToggleThumbnails}
                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition border border-transparent hover:border-gray-200 cursor-pointer"
                  title="Pages Overview & Thumbnails"
                >
                  <Layers className="w-4 h-4" />
                </button>
              )}

              {/* Exit / Back */}
              <button
                onClick={onReset}
                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg transition hover:bg-red-50 cursor-pointer font-medium"
                title="Exit Editor"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back</span>
              </button>
            </>
          ) : (
            <a
              href="https://bharatjobresult.com"
              target="_top"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 transition"
            >
              ← Back to Bharat Job
            </a>
          )}
        </div>
      </div>
    </header>
  );
};

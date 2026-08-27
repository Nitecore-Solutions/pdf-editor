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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between h-14">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-3 sm:space-x-6 shrink-0">
          <div 
            onClick={onReset}
            className="flex items-center space-x-2 sm:space-x-2.5 cursor-pointer group"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-xs sm:text-sm shadow-sm group-hover:bg-blue-700 transition shrink-0">
              B
            </div>
            <span className="font-extrabold text-base sm:text-lg md:text-xl text-gray-900 tracking-tight flex items-center gap-1 sm:gap-1.5">
              <span>Bharat Job</span>
              <span className="hidden xs:inline text-2xs sm:text-xs font-semibold text-blue-600 bg-blue-50 px-1.5 sm:px-2 py-0.5 rounded-full border border-blue-200">PDF Editor</span>
            </span>
          </div>

          {/* Nav links: ONLY Edit */}
          {!isEditing && (
            <nav className="hidden md:flex items-center space-x-5 text-sm font-medium text-gray-600">
              <span className="text-blue-600 font-bold cursor-pointer border-b-2 border-blue-600 pb-0.5 flex items-center gap-1">
                Edit PDF
              </span>
            </nav>
          )}
        </div>

        {/* Center: File Title if editing */}
        {isEditing && fileName && (
          <div className="hidden lg:flex items-center space-x-2 bg-gray-100/80 px-3 py-1 rounded-full text-xs text-gray-700 max-w-xs truncate border border-gray-200">
            <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate font-medium">{fileName}</span>
          </div>
        )}

        {/* Right Tools & Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-3">
          {isEditing ? (
            <>
              {/* Zoom controls */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200 text-xs text-gray-700">
                <button
                  onClick={() => onZoomChange && onZoomChange(Math.max(0.3, zoom - 0.1))}
                  className="p-1 sm:p-1.5 hover:bg-white rounded transition hover:text-blue-600 cursor-pointer active:bg-gray-200"
                  title="Zoom Out"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1 sm:px-2 font-semibold min-w-8 sm:min-w-10 text-center text-2xs sm:text-xs">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => onZoomChange && onZoomChange(Math.min(2.5, zoom + 0.1))}
                  className="p-1 sm:p-1.5 hover:bg-white rounded transition hover:text-blue-600 cursor-pointer active:bg-gray-200"
                  title="Zoom In"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Thumbnails Sidebar Toggle */}
              {onToggleThumbnails && (
                <button
                  onClick={onToggleThumbnails}
                  className="p-1.5 sm:p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition border border-transparent hover:border-gray-200 cursor-pointer active:bg-gray-200"
                  title="Pages Overview & Thumbnails"
                  aria-label="Pages Overview"
                >
                  <Layers className="w-4 h-4" />
                </button>
              )}

              {/* Exit / Back */}
              <button
                onClick={onReset}
                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-red-600 px-2 sm:px-2.5 py-1.5 rounded-lg transition hover:bg-red-50 cursor-pointer font-medium active:bg-red-100"
                title="Exit Editor"
                aria-label="Exit Editor"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </>
          ) : (
            <a
              href="https://bharatjobresult.com"
              target="_top"
              className="text-2xs sm:text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 sm:px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 transition whitespace-nowrap"
            >
              ← <span className="hidden xs:inline">Back to </span>Bharat Job
            </a>
          )}
        </div>
      </div>
    </header>
  );
};

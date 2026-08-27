'use client';

import React from 'react';
import { 
  FileText, 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ChevronDown, 
  Globe, 
  Menu,
  FilePlus,
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
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-lg shadow-sm group-hover:bg-emerald-600 transition">
              S
            </div>
            <span className="font-bold text-xl text-gray-800 tracking-tight">
              Sejda <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded ml-1 border border-emerald-200">Editor</span>
            </span>
          </div>

          {/* Nav links if not in full edit mode or general menu */}
          <nav className="hidden lg:flex items-center space-x-5 text-sm font-medium text-gray-600">
            <button className="flex items-center hover:text-emerald-600 transition py-1">
              All Tools <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
            </button>
            <span className="hover:text-emerald-600 cursor-pointer transition">Compress</span>
            <span className="text-emerald-600 font-semibold cursor-pointer border-b-2 border-emerald-500 pb-0.5">Edit</span>
            <span className="hover:text-emerald-600 cursor-pointer transition">Fill & Sign</span>
            <span className="hover:text-emerald-600 cursor-pointer transition">Merge</span>
            <span className="hover:text-emerald-600 cursor-pointer transition">Delete Pages</span>
            <span className="hover:text-emerald-600 cursor-pointer transition">Crop</span>
          </nav>
        </div>

        {/* Center: File Title if editing */}
        {isEditing && fileName && (
          <div className="hidden md:flex items-center space-x-2 bg-gray-100/80 px-3 py-1 rounded-full text-xs text-gray-700 max-w-xs truncate border border-gray-200">
            <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
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
                  className="p-1.5 hover:bg-white rounded transition hover:text-emerald-600"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-semibold min-w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => onZoomChange && onZoomChange(Math.min(2.0, zoom + 0.1))}
                  className="p-1.5 hover:bg-white rounded transition hover:text-emerald-600"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Thumbnails Sidebar Toggle */}
              {onToggleThumbnails && (
                <button
                  onClick={onToggleThumbnails}
                  className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-gray-100 rounded-lg transition border border-transparent hover:border-gray-200"
                  title="Pages Overview & Thumbnails"
                >
                  <Layers className="w-4 h-4" />
                </button>
              )}

              {/* Exit / Back */}
              <button
                onClick={onReset}
                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1.5 rounded transition hover:bg-red-50"
                title="Exit Editor"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Close</span>
              </button>
            </>
          ) : (
            <div className="flex items-center space-x-4 text-sm font-medium text-gray-600">
              <span className="hidden md:inline hover:text-emerald-600 cursor-pointer">Pricing</span>
              <span className="hidden md:inline hover:text-emerald-600 cursor-pointer">Desktop</span>
              <span className="hover:text-emerald-600 cursor-pointer">Log in</span>
              <button className="flex items-center space-x-1 text-gray-500 hover:text-gray-800 transition">
                <Globe className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

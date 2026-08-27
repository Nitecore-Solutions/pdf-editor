'use client';

import React from 'react';
import { X, RotateCw, Trash2, Plus, FileText } from 'lucide-react';
import { PageInfo } from '../types/editor';

interface ThumbnailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageInfo[];
  currentPageIndex: number;
  onSelectPage: (pageIndex: number) => void;
  onRotatePage: (pageIndex: number) => void;
  onDeletePage: (pageIndex: number) => void;
  onInsertBlankPage: (pageIndex: number) => void;
}

export const ThumbnailsDrawer: React.FC<ThumbnailsDrawerProps> = ({
  isOpen,
  onClose,
  pages,
  currentPageIndex,
  onSelectPage,
  onRotatePage,
  onDeletePage,
  onInsertBlankPage,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-72 bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-200 select-none">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-sm text-gray-800">
            Pages ({pages.length})
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-200/60 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Pages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {pages.map((page, index) => (
          <div
            key={index}
            className={`group relative rounded-xl p-2.5 border transition cursor-pointer ${
              currentPageIndex === index
                ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
            onClick={() => onSelectPage(index)}
          >
            {/* Page preview mock / number */}
            <div className="aspect-3/4 bg-gray-100 rounded-lg flex flex-col items-center justify-center border border-gray-200/80 shadow-2xs relative overflow-hidden">
              <span className="text-2xl font-bold text-gray-300 group-hover:text-emerald-500 transition">
                {index + 1}
              </span>
              {page.rotation > 0 && (
                <span className="absolute top-1 right-1 text-3xs font-semibold bg-gray-200 text-gray-700 px-1 py-0.5 rounded">
                  {page.rotation}°
                </span>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-100 text-xs text-gray-600">
              <span className="font-semibold text-gray-700">Page {index + 1}</span>
              <div className="flex items-center space-x-1">
                {/* Rotate */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotatePage(index);
                  }}
                  className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                  title="Rotate 90° Clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                {/* Delete (only if > 1 page) */}
                {pages.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePage(index);
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                    title="Delete Page"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Add Blank Page at end */}
        <button
          onClick={() => onInsertBlankPage(pages.length)}
          className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-emerald-500 hover:bg-emerald-50/50 rounded-xl text-xs font-semibold text-gray-600 hover:text-emerald-600 transition flex items-center justify-center space-x-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Blank Page</span>
        </button>
      </div>
    </div>
  );
};

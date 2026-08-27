'use client';

import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { LandingView } from './components/LandingView';
import { PdfEditor } from './components/PdfEditor';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const bytes = new Uint8Array(e.target.result as ArrayBuffer);
        setPdfBytes(bytes);
        setIsEditing(true);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleStartBlank = () => {
    setFile(null);
    setPdfBytes(null);
    setIsEditing(true);
  };

  const handleReset = () => {
    setFile(null);
    setPdfBytes(null);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <PdfEditor
        initialFile={file}
        initialPdfBytes={pdfBytes}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      {/* Landing Top Header */}
      <Navbar onReset={handleReset} onNewBlank={handleStartBlank} />

      {/* Main Landing & Upload Hero */}
      <LandingView
        onFileSelect={handleFileSelect}
        onStartBlank={handleStartBlank}
      />
    </div>
  );
}

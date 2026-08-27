'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, PenTool, Type, Upload, Eraser, Check, Sparkles } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSignature: (dataUrl: string, sigType: 'draw' | 'type' | 'upload', color: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSaveSignature,
}) => {
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [selectedColor, setSelectedColor] = useState('#1e293b'); // default black/slate
  const [typedName, setTypedName] = useState('Chand Ansari');
  const [selectedFont, setSelectedFont] = useState('font-cursive-1');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Drawing canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Colors available for signature
  const colors = [
    { name: 'Black', value: '#1e293b' },
    { name: 'Blue', value: '#1d4ed8' },
    { name: 'Navy', value: '#0f172a' },
    { name: 'Emerald', value: '#047857' },
    { name: 'Red', value: '#b91c1c' },
  ];

  // Initialize canvas
  useEffect(() => {
    if (isOpen && activeTab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2.5;
      }
    }
  }, [isOpen, activeTab, selectedColor]);

  // Touch & Mouse Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setUploadedImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Convert typed name to signature image data URL
  const generateTypedSignatureDataUrl = (name: string, fontStyle: string, color: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    let fontFace = 'Dancing Script, cursive';
    if (fontStyle === 'font-cursive-2') fontFace = 'Great Vibes, cursive, Pacifico';
    else if (fontStyle === 'font-cursive-3') fontFace = 'Caveat, cursive, cursive';
    else if (fontStyle === 'font-cursive-4') fontFace = 'Sacramento, cursive, Brush Script MT';

    ctx.font = `italic 54px ${fontFace}, serif`;
    ctx.fillText(name || 'Signature', canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL('image/png');
  };

  if (!isOpen) return null;

  const handleSave = () => {
    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        alert('Please draw your signature first.');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      onSaveSignature(dataUrl, 'draw', selectedColor);
      onClose();
    } else if (activeTab === 'type') {
      if (!typedName.trim()) {
        alert('Please enter your name.');
        return;
      }
      const dataUrl = generateTypedSignatureDataUrl(typedName, selectedFont, selectedColor);
      onSaveSignature(dataUrl, 'type', selectedColor);
      onClose();
    } else if (activeTab === 'upload') {
      if (!uploadedImage) {
        alert('Please upload an image first.');
        return;
      }
      onSaveSignature(uploadedImage, 'upload', selectedColor);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
              ✍️
            </div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Add Signature</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-3 sm:px-6 pt-2 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('draw')}
            className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 font-medium text-xs sm:text-sm border-b-2 transition cursor-pointer shrink-0 ${
              activeTab === 'draw'
                ? 'border-emerald-500 text-emerald-600 bg-white rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <PenTool className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Draw</span>
          </button>
          <button
            onClick={() => setActiveTab('type')}
            className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 font-medium text-xs sm:text-sm border-b-2 transition cursor-pointer shrink-0 ${
              activeTab === 'type'
                ? 'border-emerald-500 text-emerald-600 bg-white rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Type className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Type</span>
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 font-medium text-xs sm:text-sm border-b-2 transition cursor-pointer shrink-0 ${
              activeTab === 'upload'
                ? 'border-emerald-500 text-emerald-600 bg-white rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Upload Image</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {/* Color Selector */}
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-2xs sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Signature Color
            </span>
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              {colors.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setSelectedColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                    selectedColor === c.value
                      ? 'ring-2 ring-emerald-500 ring-offset-2 scale-110'
                      : 'hover:scale-105'
                  }`}
                  title={c.name}
                  aria-label={c.name}
                >
                  {selectedColor === c.value && <Check className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* TAB 1: DRAW */}
          {activeTab === 'draw' && (
            <div>
              <div className="relative border-2 border-dashed border-gray-300 rounded-xl bg-gray-50/50 overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={460}
                  height={180}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="cursor-crosshair w-full h-[150px] sm:h-[180px] touch-none"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 text-xs sm:text-sm text-center px-4">
                    Draw your signature here with finger or mouse
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-2">
                <button
                  onClick={clearCanvas}
                  className="flex items-center space-x-1 text-xs text-gray-500 hover:text-red-600 transition cursor-pointer p-1"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Clear canvas</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TYPE */}
          {activeTab === 'type' && (
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Your Full Name
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Type name here..."
                  className="w-full px-3 sm:px-3.5 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 pt-1 sm:pt-2">
                {[
                  { id: 'font-cursive-1', label: 'Script 1', sampleFont: 'italic 24px "Dancing Script", cursive' },
                  { id: 'font-cursive-2', label: 'Script 2', sampleFont: 'italic 24px "Great Vibes", cursive' },
                  { id: 'font-cursive-3', label: 'Script 3', sampleFont: 'italic 24px "Caveat", cursive' },
                  { id: 'font-cursive-4', label: 'Script 4', sampleFont: 'italic 24px "Sacramento", cursive' },
                ].map((fontOption) => (
                  <button
                    key={fontOption.id}
                    onClick={() => setSelectedFont(fontOption.id)}
                    style={{ color: selectedColor }}
                    className={`p-2.5 sm:p-3 rounded-xl border text-center transition cursor-pointer ${
                      selectedFont === fontOption.id
                        ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div 
                      className="text-lg sm:text-xl truncate tracking-wide"
                      style={{ fontFamily: fontOption.id === 'font-cursive-2' ? 'cursive' : 'serif', fontStyle: 'italic' }}
                    >
                      {typedName || 'Signature'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-3">
              <label className="border-2 border-dashed border-gray-300 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 bg-gray-50/50 transition text-center">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-gray-400 mb-2" />
                <span className="text-xs sm:text-sm font-medium text-gray-700">
                  {uploadedImage ? 'Change signature image' : 'Upload PNG or JPG signature'}
                </span>
                <span className="text-2xs sm:text-xs text-gray-400 mt-1">Transparent background recommended</span>
              </label>

              {uploadedImage && (
                <div className="p-3 bg-gray-100 rounded-xl flex items-center justify-center max-h-28 sm:max-h-32 overflow-hidden border border-gray-200">
                  <img src={uploadedImage} alt="Uploaded signature" className="max-h-20 sm:max-h-24 object-contain" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end space-x-2 sm:space-x-3 shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 rounded-lg transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition flex items-center space-x-1.5 cursor-pointer active:bg-emerald-700"
          >
            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Save & Place</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Upload, Download, Settings, Layers, Image as ImageIcon, Loader2, Crop as CropIcon, Check, RefreshCw, Printer, Coffee } from 'lucide-react';
import { quantizeImage, resizeImageToCanvas, drawQuantizedPreview, getCroppedImg } from './utils/imageHelper';
import { generate3MF, generateSTLs } from './utils/stlHelper';
import { BookmarkSettings, ProcessingState, RGB } from './types';
import { DEFAULT_PALETTE, ASPECT_RATIO, CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

export default function App() {
  // State
  const [rawImgSrc, setRawImgSrc] = useState<string | null>(null); // Before crop
  const [imgSrc, setImgSrc] = useState<string | null>(null); // Final cropped
  const [quantizedData, setQuantizedData] = useState<{ palette: RGB[], indices: Uint8Array } | null>(null);
  
  // Cropper State
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const [settings, setSettings] = useState<BookmarkSettings>({
    baseHeight: 0.8,
    layerHeights: [0.6, 0.8, 1.0, 1.2],
    isTactile: true,
    widthMm: 50,
    heightMm: 160
  });

  const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle' });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setRawImgSrc(event.target.result as string);
          setImgSrc(null); // Final cropped
          setQuantizedData(null);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input value to allow re-uploading same file
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropConfirm = async () => {
    if (rawImgSrc && croppedAreaPixels) {
      setProcessing({ status: 'processing', message: 'Cropping...' });
      try {
        const croppedImage = await getCroppedImg(rawImgSrc, croppedAreaPixels);
        setImgSrc(croppedImage);
        setRawImgSrc(null); // Hide cropper
        setProcessing({ status: 'idle' });
      } catch (e) {
        console.error(e);
        setProcessing({ status: 'error', message: 'Crop failed' });
      }
    }
  };

  const handleReset = () => {
    setRawImgSrc(null);
    setImgSrc(null);
    setQuantizedData(null);
    setProcessing({ status: 'idle' });
  };

  const toggleMode = (tactile: boolean) => {
      setSettings(prev => {
          const newSettings = { ...prev, isTactile: tactile };
          if (!tactile) {
              // Switch to Flat: Set all to 0.6mm (3 layers) for solid opacity and uniform flatness
              newSettings.layerHeights = [0.6, 0.6, 0.6, 0.6];
          } else {
              // Switch to Tactile: Restore default stepped heights
              newSettings.layerHeights = [0.6, 0.8, 1.0, 1.2];
          }
          return newSettings;
      });
  };

  // Process image when final source changes
  useEffect(() => {
    if (!imgSrc) return;
    
    const img = new Image();
    img.onload = () => {
        // Resize handled by getCroppedImg or just double check
        const canvas = resizeImageToCanvas(img);
        const ctx = canvas.getContext('2d');
        if(!ctx) return;

        // Quantize
        const result = quantizeImage(ctx, 4);
        setQuantizedData(result);
    };
    img.src = imgSrc;
  }, [imgSrc]);

  // Redraw preview when quantization data changes
  useEffect(() => {
    if (quantizedData && canvasRef.current) {
        drawQuantizedPreview(canvasRef.current, quantizedData.indices, quantizedData.palette);
    }
  }, [quantizedData]);


  const handleDownload3MF = async () => {
    if (!quantizedData || !imgSrc) return;
    setProcessing({ status: 'generating_stl', message: 'Generating 3MF...' });
    
    // Use a timeout to allow UI to update
    setTimeout(async () => {
        try {
            const effectiveSettings = { ...settings };
            // Ensure absolute uniformity in Flat mode based on current slider setting
            if (!settings.isTactile) {
                const h = settings.layerHeights[0];
                effectiveSettings.layerHeights = [h, h, h, h];
            }

            // Generate 3MF Blob
            // Pass the preview canvas as thumbnail source
            const thumbnailData = canvasRef.current?.toDataURL('image/png') || imgSrc;
            const blob = await generate3MF(quantizedData.indices, effectiveSettings, quantizedData.palette, thumbnailData);
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bambu_bookmark_project.3mf';
            a.click();
            URL.revokeObjectURL(url);
            
            setProcessing({ status: 'done', message: 'Download ready!' });
            setTimeout(() => setProcessing({ status: 'idle' }), 3000);
            
        } catch (e) {
            console.error(e);
            setProcessing({ status: 'error', message: 'Generation failed.' });
        }
    }, 100);
  };

  const handleDownloadSTL = async () => {
    if (!quantizedData) return;
    setProcessing({ status: 'generating_stl', message: 'Generating STLs...' });

    setTimeout(async () => {
        try {
            const effectiveSettings = { ...settings };
            if (!settings.isTactile) {
                 const h = settings.layerHeights[0];
                 effectiveSettings.layerHeights = [h, h, h, h];
            }

            const stlBuffers = await generateSTLs(quantizedData.indices, effectiveSettings);
            
            setProcessing({ status: 'zipping', message: 'Zipping STLs...' });

            const zip = new window.JSZip();
            Object.keys(stlBuffers).forEach(filename => {
                zip.file(filename, stlBuffers[filename]);
            });

            const blob = await zip.generateAsync({ type: 'blob' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bookmark_stls.zip';
            a.click();
            URL.revokeObjectURL(url);

            setProcessing({ status: 'done', message: 'Download ready!' });
            setTimeout(() => setProcessing({ status: 'idle' }), 3000);
        } catch (e) {
            console.error(e);
            setProcessing({ status: 'error', message: 'Generation failed.' });
        }
    }, 100);
  };

  const updateLayerHeight = (idx: number, val: number) => {
    const newHeights = [...settings.layerHeights] as [number, number, number, number];
    newHeights[idx] = val;
    setSettings(prev => ({ ...prev, layerHeights: newHeights }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4 font-sans text-slate-800">
      
      {/* Header */}
      <header className="max-w-4xl w-full flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white">
                <Layers size={28} />
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Multi-Color 3D Bookmark Creator</h1>
                <p className="text-slate-500 text-sm">Convert images to 4-color printable files</p>
            </div>
        </div>
        
        {/* Only show upload input via handler, no button here if empty. If image loaded, show Restart */}
        {imgSrc && (
            <button 
                onClick={handleReset}
                className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-md hover:bg-slate-50 transition-colors text-sm font-medium text-slate-600"
            >
                <RefreshCw size={16} /> New Project
            </button>
        )}
        {/* Hidden Input */}
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
      </header>

      {/* Cropper Modal Overlay */}
      {rawImgSrc && (
          <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
              <div className="relative w-full max-w-2xl h-[60vh] bg-slate-900 rounded-xl overflow-hidden shadow-2xl">
                  <Cropper
                    image={rawImgSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={5 / 16}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
              </div>
              <div className="mt-6 flex gap-4 bg-white p-4 rounded-xl shadow-lg">
                  <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Zoom</label>
                      <input
                        type="range"
                        value={zoom}
                        min={1}
                        max={3}
                        step={0.1}
                        aria-labelledby="Zoom"
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-48 accent-emerald-600"
                      />
                  </div>
                  <button 
                    onClick={handleCropConfirm}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
                  >
                      <Check size={20} /> Crop & Continue
                  </button>
              </div>
          </div>
      )}

      <main className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Editor & Preview */}
        <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Upload / Start Section */}
            {!imgSrc && !rawImgSrc && (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white p-8 rounded-xl shadow-sm border-2 border-dashed border-slate-300 text-center flex flex-col items-center justify-center gap-4 min-h-[400px] hover:border-emerald-500 hover:bg-slate-50 transition-all cursor-pointer group"
                >
                    <div className="bg-slate-100 group-hover:bg-emerald-100 p-6 rounded-full mb-2 transition-colors">
                        <Upload className="text-slate-400 group-hover:text-emerald-600" size={48} />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-slate-700 group-hover:text-emerald-700">Upload an Image</h2>
                        <p className="text-slate-500 max-w-sm mt-2">
                            Select a JPG or PNG. High contrast images with distinct colors work best.
                        </p>
                    </div>
                    <button className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold shadow-sm mt-4 group-hover:bg-emerald-700 transition-colors">
                        Choose File
                    </button>
                </div>
            )}

            {/* Canvas Preview */}
            {imgSrc && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center">
                    <div className="flex justify-between w-full mb-4 items-center">
                         <h3 className="font-semibold flex items-center gap-2"><ImageIcon size={18} /> Preview</h3>
                         <div className="flex gap-2">
                            <button onClick={() => { setRawImgSrc(imgSrc); setImgSrc(null); }} className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                                <CropIcon size={12} /> Re-crop
                            </button>
                            <span className="text-xs font-mono text-slate-400">50mm x 160mm</span>
                         </div>
                    </div>
                   
                    <div className="relative shadow-inner bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                         {/* Actual Canvas */}
                         <canvas 
                            ref={canvasRef} 
                            width={CANVAS_WIDTH} 
                            height={CANVAS_HEIGHT} 
                            className="w-[150px] h-[480px] object-contain"
                         />
                    </div>
                    
                    {quantizedData && (
                        <div className="flex gap-4 mt-6">
                            {quantizedData.palette.map((c, i) => (
                                <div key={i} className="flex flex-col items-center gap-1">
                                    <div 
                                        className="w-10 h-10 rounded-full border border-slate-200 shadow-sm relative"
                                        style={{ backgroundColor: `rgb(${c.r},${c.g},${c.b})` }}
                                    >
                                        {i === 0 && (
                                            <div className="absolute -top-2 -right-2 bg-slate-800 text-white text-[10px] px-1 rounded">Base</div>
                                        )}
                                    </div>
                                    <span className="text-xs text-slate-500 font-medium">Col {i+1}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Printing Instructions */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-slate-800">
                    <Printer className="text-emerald-600" size={20} />
                    How to print with Bambu AMS
                </h3>
                <ul className="space-y-4">
                    <li className="flex gap-3 text-sm text-slate-600">
                        <span className="bg-slate-100 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0 text-xs mt-0.5">1</span>
                        <span>
                            <strong className="text-slate-800 block mb-1">Download your design</strong>
                            Export either the 3MF file (recommended) or the Stacked STLs (for manual control) directly from the app.
                        </span>
                    </li>
                    <li className="flex gap-3 text-sm text-slate-600">
                        <span className="bg-slate-100 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0 text-xs mt-0.5">2</span>
                        <span>
                             <strong className="text-slate-800 block mb-1">Import into Bambu Studio</strong>
                             Drag your file(s) onto the build plate. If the slicer asks to "Load as a single object with multiple parts," always select <strong className="text-emerald-700">YES</strong> to ensure the layers stay perfectly aligned.
                        </span>
                    </li>
                    <li className="flex gap-3 text-sm text-slate-600">
                        <span className="bg-slate-100 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0 text-xs mt-0.5">3</span>
                        <span>
                             <strong className="text-slate-800 block mb-1">Locate the Parts</strong>
                             Switch to the <em>Objects</em> tab in the left-hand sidebar to see each color layer and the base plate listed as distinct components. <strong className="text-emerald-700">Note: Your object will likely appear monochrome until you assign AMS colors to the four individual objects!</strong>
                        </span>
                    </li>
                     <li className="flex gap-3 text-sm text-slate-600">
                        <span className="bg-slate-100 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0 text-xs mt-0.5">4</span>
                        <span>
                             <strong className="text-slate-800 block mb-1">Assign AMS Colors</strong>
                             Select a layer from the list and press the number on your keyboard (1, 2, 3, or 4) that matches the filament slot in your AMS.
                        </span>
                    </li>
                </ul>
            </div>
        </div>

        {/* Right Column: Controls */}
        <div className="lg:col-span-5 flex flex-col gap-6">
             
             {/* 3D Configuration */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                    <Settings className="text-emerald-600" size={20} />
                    <h2 className="font-semibold text-lg">3D Configuration</h2>
                </div>

                <div className="space-y-6">
                    
                    {/* Mode Toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Mode</span>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button 
                                onClick={() => toggleMode(false)}
                                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${!settings.isTactile ? 'bg-white shadow text-emerald-700' : 'text-slate-500'}`}
                            >
                                Flat Multi-color
                            </button>
                            <button 
                                onClick={() => toggleMode(true)}
                                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${settings.isTactile ? 'bg-white shadow text-emerald-700' : 'text-slate-500'}`}
                            >
                                Tactile 2.5D
                            </button>
                        </div>
                    </div>

                    {/* Base Height */}
                    <div>
                         <div className="flex justify-between mb-2">
                             <label className="text-sm font-medium text-slate-700">Base Thickness</label>
                             <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{settings.baseHeight}mm</span>
                         </div>
                         <input 
                            type="range" min="0.2" max="2.0" step="0.2"
                            value={settings.baseHeight}
                            onChange={(e) => setSettings(s => ({...s, baseHeight: parseFloat(e.target.value)}))}
                            className="w-full accent-emerald-600"
                         />
                    </div>

                    {/* Layer Heights */}
                    {settings.isTactile ? (
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Layer Heights (Above Base)</p>
                            {settings.layerHeights.map((h, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-16 text-xs font-medium text-slate-500">
                                        {i === 0 ? "Col 1 (Base)" : `Color ${i+1}`}
                                    </div>
                                    <input 
                                        type="range" min="0.2" max="3.0" step="0.2"
                                        value={h}
                                        onChange={(e) => updateLayerHeight(i, parseFloat(e.target.value))}
                                        className="flex-1 accent-emerald-600"
                                    />
                                    <span className="w-10 text-xs text-right text-slate-600">{h}mm</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                         <div className="pt-4 border-t border-slate-100">
                             <div className="flex justify-between mb-2">
                                 <label className="text-sm font-medium text-slate-700">Color Thickness</label>
                                 <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{settings.layerHeights[0]}mm</span>
                             </div>
                             <input 
                                type="range" min="0.2" max="2.0" step="0.2"
                                value={settings.layerHeights[0]}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setSettings(s => ({...s, layerHeights: [val, val, val, val]}));
                                }}
                                className="w-full accent-emerald-600"
                             />
                             <p className="text-[10px] text-slate-400 mt-2">
                                Uniform thickness for a smooth, flat top surface.
                             </p>
                        </div>
                    )}
                </div>
             </div>

             {/* Action Buttons */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col gap-3">
                    {/* 3MF Button */}
                    <button
                        onClick={handleDownload3MF}
                        disabled={!quantizedData || processing.status !== 'idle'}
                        className={`w-full py-3 rounded-lg font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all
                            ${!quantizedData ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg active:scale-95'}
                        `}
                    >
                        {processing.status === 'idle' || processing.status === 'done' || processing.status === 'error' ? (
                            <>
                                <Download size={20} /> Download 3MF Project
                            </>
                        ) : (
                            <>
                                <Loader2 className="animate-spin" size={20} /> {processing.message}
                            </>
                        )}
                    </button>
                    
                    {/* STL Button */}
                    <button
                        onClick={handleDownloadSTL}
                        disabled={!quantizedData || processing.status !== 'idle'}
                        className={`w-full py-3 rounded-lg font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center gap-2 transition-all
                             ${!quantizedData ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        <Download size={18} /> Download STLs (ZIP)
                    </button>
                </div>
                
                {processing.status === 'error' && (
                    <p className="text-red-500 text-xs text-center mt-2">{processing.message}</p>
                )}
                <p className="text-xs text-slate-400 text-center mt-3">
                    3MF is recommended for Bambu Studio to maintain alignment.
                </p>

                {/* Version Log */}
                <div className="mt-6 pt-5 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Updates</span>
                        <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">v1.3.0</span>
                    </div>
                    <ul className="space-y-2 text-xs text-slate-500">
                        <li className="flex gap-2">
                            <span className="text-emerald-500 shrink-0">•</span>
                            <span><strong>High Res Engine:</strong> Resolution increased by 60% (8px/mm).</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-emerald-500 shrink-0">•</span>
                            <span><strong>Vibrancy Boost:</strong> Enhanced color separation and noise reduction.</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-emerald-500 shrink-0">•</span>
                            <span><strong>Smart 3MF:</strong> Added thumbnails & auto-color assignment.</span>
                        </li>
                    </ul>
                </div>
             </div>

        </div>
      </main>

      {/* Tip Jar Footer */}
      <footer className="mt-16 pb-6 flex flex-col items-center gap-3">
        <p className="text-slate-400 text-sm">Found this useful?</p>
        <a 
          href="https://ko-fi.com/danackerman" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#FF5E5B] text-white px-6 py-2.5 rounded-full font-medium shadow-md hover:bg-[#ff4845] hover:shadow-lg transition-all active:scale-95"
        >
          <Coffee size={18} fill="currentColor" className="text-white" />
          <span>Buy me a coffee</span>
        </a>
      </footer>
    </div>
  );
}
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2, 
  AlertTriangle, 
  MapPin, 
  Layers, 
  X, 
  Check, 
  ShoppingBag,
  Tag,
  Warehouse,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Camera,
  Image as ImageIcon,
  Upload,
  FileSpreadsheet,
  Printer,
  Barcode,
  Download,
  Share2,
  Copy,
  Calendar,
  Clock,
  Eye
} from 'lucide-react';
import BarcodeComponent from 'react-barcode';
import html2canvas from 'html2canvas';
import { Product, User, Role } from '../types';
import { getExpiryStatus, formatDateIndo, generateNextBatchNumber } from '../lib/expiryUtils';

interface ImageCaptureUploaderProps {
  value: string;
  onChange: (value: string) => void;
}

// Compress any base64 image data URL to a lightweight, web-optimized JPEG format safe for Google Sheets
const compressImage = (base64Str: string, maxWidth = 400, maxHeight = 400, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str.startsWith('data:')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio while sizing down
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

        // Google Sheets cell limit is 50,000 characters. If still large, scale down further to guarantee safe storage
        if (compressedDataUrl.length > 38000) {
          const smallCanvas = document.createElement('canvas');
          const targetW = Math.min(width, 260);
          const targetH = Math.round((height * targetW) / width);
          smallCanvas.width = targetW;
          smallCanvas.height = targetH;
          const smallCtx = smallCanvas.getContext('2d');
          if (smallCtx) {
            smallCtx.drawImage(canvas, 0, 0, targetW, targetH);
            compressedDataUrl = smallCanvas.toDataURL('image/jpeg', 0.5);
          }
        }
        resolve(compressedDataUrl);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

function ImageCaptureUploader({ value, onChange }: ImageCaptureUploaderProps) {
  const [activeMode, setActiveMode] = useState<'file' | 'native' | 'live' | 'url'>('file');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Stop camera when unmounting or switching modes
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Safely assign camera stream to the video element once the ref is mounted/rendered
  useEffect(() => {
    if (stream && videoRef.current) {
      try {
        const video = videoRef.current;
        video.srcObject = stream;
        
        // Use a safer play approach for modern browsers to avoid AbortError on fast unmounts
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            // Ignore AbortError as it's common when elements are removed from DOM quickly
            if (e.name !== 'AbortError') {
              console.warn('Error playing live stream:', e);
            }
          });
        }
      } catch (err) {
        console.warn('Error setting live stream source object:', err);
      }
    }
  }, [stream]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const compressed = await compressImage(reader.result);
          onChange(compressed);
        }
        setIsCompressing(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const startLiveCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
    } catch (err: any) {
      console.error(err);
      setCameraError('Akses kamera live gagal. Gunakan tombol "Kamera Hp" atau "Pilih File" di atas.');
    }
  };

  const stopLiveCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const captureSnapshot = async () => {
    if (videoRef.current) {
      setIsCompressing(true);
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const compressed = await compressImage(dataUrl);
        onChange(compressed);
        stopLiveCamera();
        setActiveMode('file');
      }
      setIsCompressing(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Hidden native inputs triggered by buttons */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <input ref={nativeInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />

      {/* Compact Action Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isCompressing}
          onClick={() => { stopLiveCamera(); setActiveMode('file'); fileInputRef.current?.click(); }}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-[11px] font-extrabold transition-all border shadow-sm ${
            activeMode === 'file' 
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200/40 dark:shadow-none' 
              : 'bg-white dark:bg-zinc-855 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800'
          } disabled:opacity-50`}
        >
          <Upload className="w-3.5 h-3.5" />
          Galeri / File
        </button>
        <button
          type="button"
          disabled={isCompressing}
          onClick={() => { stopLiveCamera(); setActiveMode('native'); nativeInputRef.current?.click(); }}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-[11px] font-extrabold transition-all border shadow-sm ${
            activeMode === 'native' 
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-200/40 dark:shadow-none' 
              : 'bg-white dark:bg-zinc-855 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800'
          } disabled:opacity-50`}
        >
          <Camera className="w-3.5 h-3.5" />
          Kamera Hp
        </button>
      </div>

      {isCompressing && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1.5 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          Mengompresi dan mengoptimasi resolusi gambar baru...
        </div>
      )}

      {/* The "Box" area is now only visible if needed for UI (Live/URL) or to show Preview */}
      {(value || activeMode === 'live' || activeMode === 'url') && (
        <div className="rounded-2xl border border-gray-150/80 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-950/20 p-2.5 sm:p-3.5">
          
          {/* Unified Preview Area */}
          {value && activeMode !== 'live' && (
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-750 shadow-sm shrink-0 bg-white dark:bg-zinc-900">
                <img src={value} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="absolute top-0 right-0 p-1 bg-rose-600 text-white rounded-bl-lg shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-extrabold text-indigo-650 dark:text-indigo-400 mb-1 items-center flex gap-1">
                  <Check className="w-2.5 h-2.5" /> Terpilih
                </p>
                <p className="text-[10px] text-gray-500 dark:text-zinc-500 font-mono italic truncate max-w-[140px]">
                  {value.startsWith('data:') ? 'Unggahan Berkas Lokal' : value}
                </p>
              </div>
            </div>
          )}

          {activeMode === 'live' && (
            <div className="w-full space-y-3">
              {stream ? (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 bg-black shadow-inner">
                  <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-center">
                    <button
                      type="button"
                      onClick={captureSnapshot}
                      className="px-6 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-full text-xs font-extrabold shadow-xl active:scale-95 transition-transform"
                    >
                      Jepret & Simpan
                    </button>
                  </div>
                </div>
              ) : cameraError ? (
                <div className="p-4 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl">
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 leading-relaxed">{cameraError}</p>
                </div>
              ) : (
                <div className="py-8 text-center bg-gray-100/50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-gray-200 dark:border-zinc-800">
                    <Camera className="w-8 h-8 text-gray-300 dark:text-zinc-700 mx-auto mb-2" />
                    <button 
                      type="button"
                      onClick={startLiveCamera}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Nyalakan Kamera Live
                    </button>
                </div>
              )}
            </div>
          )}

          {activeMode === 'url' && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500">Tempel Link Gambar</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://gudang-online.com/data/img-01.jpg"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
                {value && (
                  <button type="button" onClick={() => onChange('')} className="p-2 text-rose-500 flex items-center justify-center bg-rose-50 dark:bg-rose-950/30 rounded-xl">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SkuScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedSku: string) => void;
}

function SkuScannerModal({ isOpen, onClose, onScan }: SkuScannerModalProps) {
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let html5QrcodeScanner: any = null;
    let isMounted = true;

    async function startCamera() {
      setScanError(null);
      const elementId = "sku-scanner-modal-viewport";
      const element = document.getElementById(elementId);
      if (!element) {
        setTimeout(() => { if (isMounted) startCamera(); }, 150);
        return;
      }

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (!isMounted) return;

        html5QrcodeScanner = new Html5Qrcode(elementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODABAR
          ],
          verbose: false
        });

        await html5QrcodeScanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: (width: number, height: number) => {
              const qrWidth = Math.min(width, 360) * 0.85;
              const qrHeight = Math.min(height, 220) * 0.6;
              return { width: Math.max(200, qrWidth), height: Math.max(100, qrHeight) };
            }
          },
          (decodedText: string) => {
            const cleanCode = decodedText.trim();
            if (cleanCode) {
              try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                  const ctx = new AudioCtx();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(880, ctx.currentTime);
                  gain.gain.setValueAtTime(0.12, ctx.currentTime);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.15);
                }
              } catch (e) {}

              onScan(cleanCode);
              onClose();
            }
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Camera SKU scanner error:", err);
        if (isMounted) {
          setScanError("Kamera tidak dapat diakses. Pastikan izin kamera telah diberikan di browser.");
        }
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
          html5QrcodeScanner.clear();
        }).catch((e: any) => console.log("Stop SKU scanner error:", e));
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-center">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <Camera className="w-5 h-5" />
            <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">Pindai Barcode SKU</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {scanError ? (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs rounded-xl border border-rose-100 dark:border-rose-900/40">
            {scanError}
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border border-gray-200 dark:border-zinc-800 shadow-inner">
            <div id="sku-scanner-modal-viewport" className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" />
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="w-48 h-28 border-2 border-indigo-500/80 rounded-lg relative shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">
          Arahkan kamera ke kode barcode / QR barang. Hasil pindaian akan langsung terisi ke kolom SKU.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

interface InventoryManagerProps {
  products: Product[];
  currentUser: User;
  onAddProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'lastUpdatedBy'>) => Promise<void>;
  onEditProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onBulkDeleteProducts?: (ids: string[]) => Promise<void>;
  onAddLog: (action: string, userName: string, details: string) => void;
  categoriesList?: string[];
  locationsList?: string[];
}

export default function InventoryManager({
  products,
  currentUser,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onBulkDeleteProducts,
  onAddLog,
  categoriesList,
  locationsList
}: InventoryManagerProps) {
  
  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'critical' | 'normal'>('all');
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expired' | 'near_expiry' | 'near_90' | 'fefo'>('all');
  
  // Multi-select state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('cfg_inventory_items_per_page');
      return saved ? parseInt(saved, 10) || 25 : 25;
    } catch {
      return 25;
    }
  });

  const handleSetItemsPerPage = (num: number) => {
    setItemsPerPage(num);
    setCurrentPage(1);
    try {
      localStorage.setItem('cfg_inventory_items_per_page', String(num));
    } catch {}
  };

  // Modals state
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [selectedBatchProduct, setSelectedBatchProduct] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSkuScannerOpen, setIsSkuScannerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddLocationDropdownOpen, setIsAddLocationDropdownOpen] = useState(false);
  const [isEditLocationDropdownOpen, setIsEditLocationDropdownOpen] = useState(false);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null);
  const [barcodePreviewProduct, setBarcodePreviewProduct] = useState<Product | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedProducts, setParsedProducts] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    sku: '',
    description: '',
    category: 'Elektronik',
    qty: '0',
    minQty: '5',
    location: '',
    price: '0',
    unit: 'Unit',
    purchaseUnit: 'Unit',
    recipeUnit: 'Unit',
    conversionFactor: '1',
    imageUrl: '',
    expiryDate: '',
    batchNumber: ''
  });

  const isUserRestricted = useMemo(() => {
    if (currentUser.role === 'admin') return false;
    if (!currentUser.location) return false;
    const locs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return !locs.includes('semua gudang');
  }, [currentUser]);

  const accessibleProducts = useMemo(() => {
    if (!isUserRestricted || !currentUser.location) return products;
    const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return products.filter(p => {
      if (!p.location) return false;
      const prodLocs = p.location.split(',').map(l => l.trim().toLowerCase());
      return prodLocs.some(l => userLocs.includes(l));
    });
  }, [products, isUserRestricted, currentUser.location]);

  const categories = useMemo(() => {
    const list = new Set([
      ...(categoriesList || []),
      ...accessibleProducts.map(p => p.category)
    ]);
    return ['all', ...Array.from(list)];
  }, [accessibleProducts, categoriesList]);

  const locationsForFilter = useMemo(() => {
    const list = new Set<string>();
    if (locationsList) {
      locationsList.forEach(loc => {
        if (loc && loc !== 'Semua Gudang') list.add(loc);
      });
    }
    accessibleProducts.forEach(p => {
      if (p.location) {
        p.location.split(',').forEach(loc => {
          const trimmed = loc.trim();
          if (trimmed && trimmed !== 'Semua Gudang') list.add(trimmed);
        });
      }
    });
    return ['all', ...Array.from(list)];
  }, [accessibleProducts, locationsList]);

  const allowedLocations = useMemo(() => {
    if (isUserRestricted && currentUser.location) {
      return currentUser.location.split(',').map(l => l.trim()).filter(Boolean);
    }
    const defaultList = locationsList && locationsList.length > 0
      ? locationsList.filter(loc => loc !== 'Semua Gudang')
      : ['Sektor A-1', 'Sektor B-4', 'Sektor C-1', 'Gudang Utama', 'Gudang Samping'];
    return defaultList;
  }, [isUserRestricted, currentUser.location, locationsList]);

  const toggleLocationSelection = (locName: string) => {
    const currentLocs = formData.location ? formData.location.split(',').map((l: string) => l.trim()).filter(Boolean) : [];
    let updatedLocs: string[];
    if (currentLocs.includes(locName)) {
      updatedLocs = currentLocs.filter((l: string) => l !== locName);
    } else {
      updatedLocs = [...currentLocs, locName];
    }
    setFormData(prev => ({ ...prev, location: updatedLocs.join(', ') }));
  };

  // Convert numbers to IDR currency safely
  const formatIDR = (num: any) => {
    try {
      const parsed = typeof num === 'number' ? num : parseFloat(num);
      if (isNaN(parsed)) return 'Rp 0';
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
      }).format(parsed);
    } catch {
      return 'Rp ' + (num || 0);
    }
  };

  // Filter and search
  const filteredProducts = useMemo(() => {
    let list = accessibleProducts.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.batchNumber && p.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const matchLocation = selectedLocation === 'all' || 
                            (p.location && p.location.split(',').map(l => l.trim().toLowerCase()).includes(selectedLocation.toLowerCase()));
      
      const isCritical = p.qty <= p.minQty;
      const matchStock = stockFilter === 'all' || 
                         (stockFilter === 'critical' && isCritical) || 
                         (stockFilter === 'normal' && !isCritical);
      
      const expStatus = getExpiryStatus(p.expiryDate);
      const matchExpiry = expiryFilter === 'all' || expiryFilter === 'fefo' ||
                          (expiryFilter === 'expired' && expStatus.status === 'expired') ||
                          (expiryFilter === 'near_expiry' && (expStatus.status === 'expired' || expStatus.status === 'near_expiry')) ||
                          (expiryFilter === 'near_90' && expStatus.status !== 'none' && expStatus.diffDays <= 90);
      
      return matchSearch && matchCategory && matchLocation && matchStock && matchExpiry;
    });

    if (expiryFilter === 'fefo' || expiryFilter === 'near_90') {
      // FEFO (First Expired First Out) Sorting
      list = [...list].sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });
    }

    return list;
  }, [accessibleProducts, searchTerm, selectedCategory, selectedLocation, stockFilter, expiryFilter]);

  // Paginated elements
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;

  // Multi-Select Helpers
  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const isAllFilteredSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    return filteredProducts.every(p => selectedProductIds.includes(p.id));
  }, [filteredProducts, selectedProductIds]);

  const isSomeFilteredSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    return filteredProducts.some(p => selectedProductIds.includes(p.id)) && !isAllFilteredSelected;
  }, [filteredProducts, selectedProductIds, isAllFilteredSelected]);

  const handleToggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      const filteredIds = new Set(filteredProducts.map(p => p.id));
      setSelectedProductIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      const allFilteredIds = filteredProducts.map(p => p.id);
      setSelectedProductIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleDeselectAll = () => {
    setSelectedProductIds([]);
  };

  const handleScanSkuSuccess = (scannedSku: string) => {
    setFormData(prev => ({ ...prev, sku: scannedSku }));
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    if (!currentUser.permissions.canDeleteProduct) {
      alert('Maaf, hanya administrator yang berwenang menghapus permanen catatan barang.');
      return;
    }

    setIsBulkDeleting(true);
    try {
      if (onBulkDeleteProducts) {
        await onBulkDeleteProducts(selectedProductIds);
      } else {
        for (const id of selectedProductIds) {
          await onDeleteProduct(id);
        }
      }
      onAddLog('Hapus Massal Barang', currentUser.name, `Menghapus ${selectedProductIds.length} data barang sekaligus.`);
      setSelectedProductIds([]);
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Error bulk deleting products:", error);
      alert("Gagal menghapus beberapa data barang. Silakan coba lagi.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Form handlers
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleOpenAddModal = () => {
    if (!currentUser.permissions.canAddProduct) {
      alert('Maaf, akun Anda tidak memiliki izin untuk mendaftarkan barang baru.');
      return;
    }
    const defaultLocation = (currentUser.role !== 'admin' && currentUser.location && !currentUser.location.split(',').map(l => l.trim().toLowerCase()).includes('semua gudang'))
      ? currentUser.location.split(',')[0].trim()
      : (locationsList && locationsList.length > 0 ? locationsList[0] : 'Gudang Utama');
    setFormData({
      name: '',
      sku: '',
      description: '',
      category: categoriesList && categoriesList.length > 0 ? categoriesList[0] : 'Elektronik',
      qty: '0',
      minQty: '5',
      location: defaultLocation,
      price: '0',
      unit: 'Unit',
      purchaseUnit: 'Unit',
      recipeUnit: 'Unit',
      conversionFactor: '1',
      imageUrl: '',
      expiryDate: '',
      batchNumber: generateNextBatchNumber(accessibleProducts)
    });
    setShowAddModal(true);
  };

  const handleOpenEditModal = (product: Product) => {
    if (!currentUser.permissions.canEditProduct) {
      alert('Maaf, akun Anda tidak memiliki izin mengedit data barang.');
      return;
    }
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
      qty: String(product.qty),
      minQty: String(product.minQty),
      location: product.location,
      price: String(product.price),
      unit: product.unit || 'Unit',
      purchaseUnit: product.purchaseUnit || 'Unit',
      recipeUnit: product.recipeUnit || 'Unit',
      conversionFactor: String(product.conversionFactor || 1),
      imageUrl: product.imageUrl || '',
      expiryDate: product.expiryDate || (product.batches && product.batches.length > 0 ? product.batches[0].expiryDate : '') || '',
      batchNumber: product.batchNumber || (product.batches && product.batches.length > 0 ? product.batches[0].batchNumber : '') || ''
    });
    setShowEditModal(true);
  };

  const handlePrintLabel = (product: Product) => {
    setPrintingProduct(product);
    // Increased timeout for mobile devices to ensure React renders SVGs synchronously
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print failed:', err);
      } finally {
        // Fallback cleanup for mobile browsers where the 'afterprint' event might not fire reliably
        setTimeout(() => {
          setPrintingProduct(null);
        }, 1500);
      }
    }, 600);
  };

  const handleOpenBarcodeModal = (product: Product) => {
    if (!currentUser.permissions.canPrintProduct) {
      alert('Anda tidak memiliki hak akses untuk mencetak barcode / label (Print Barcode).');
      return;
    }
    setBarcodePreviewProduct(product);
    setGeneratedImageUrl(null);
    setIsGeneratingImage(true);
    setShareSuccess(false);

    // Wait slightly for React to mount the offscreen tag and fully build the DOM SVG
    setTimeout(async () => {
      const target = document.getElementById('barcode-capture-target');
      if (target) {
        try {
          const canvas = await html2canvas(target, {
            scale: 4, // 4x resolution for sharp barcode line rendering scanner
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: true
          });
          const imgUrl = canvas.toDataURL('image/png');
          setGeneratedImageUrl(imgUrl);
        } catch (err) {
          console.error('Failed to generate label image:', err);
        } finally {
          setIsGeneratingImage(false);
        }
      } else {
        setIsGeneratingImage(false);
      }
    }, 450);
  };

  const handleShareBarcode = async () => {
    if (!generatedImageUrl || !barcodePreviewProduct) return;
    try {
      const response = await fetch(generatedImageUrl);
      const blob = await response.blob();
      const file = new File([blob], `Barcode_${barcodePreviewProduct.sku || '0000'}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Barcode ${barcodePreviewProduct.name}`,
          text: `Barcode SKU: ${barcodePreviewProduct.sku || ''} - Gudang Online`
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } else {
        handleDownloadBarcode();
      }
    } catch (err) {
      console.error('Error sharing barcode:', err);
      handleDownloadBarcode();
    }
  };

  const handleDownloadBarcode = () => {
    if (!generatedImageUrl || !barcodePreviewProduct) return;
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = `Barcode_${barcodePreviewProduct.sku || 'sku'}_33x15mm.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 2000);
  };

  useEffect(() => {
    const onAfterPrint = () => setPrintingProduct(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sku || !formData.location) {
      alert('Silakan lengkapi kolom yang wajib diisi!');
      return;
    }

    // Check SKU duplicate locally at the same location
    const formLocations = formData.location.split(',').map((l: string) => l.trim().toLowerCase());
    const isSkuDuplicate = products.some(p => {
      if (p.sku.trim().toLowerCase() !== formData.sku.trim().toLowerCase()) return false;
      const existingLocs = p.location.split(',').map(l => l.trim().toLowerCase());
      return existingLocs.some(l => formLocations.includes(l));
    });
    if (isSkuDuplicate) {
      alert(`SKU / Nomor Barcode "${formData.sku}" sudah terdaftar untuk barang lain di salah satu lokasi yang sama: "${formData.location}"!`);
      return;
    }

    const parsedQty = parseFloat(String(formData.qty).replace(/,/g, '.')) || 0;
    const parsedMinQty = parseFloat(String(formData.minQty).replace(/,/g, '.')) || 0;
    const parsedPrice = parseFloat(String(formData.price).replace(/,/g, '.')) || 0;
    const parsedConversionFactor = parseFloat(String(formData.conversionFactor).replace(/,/g, '.')) || 1;

    try {
      await onAddProduct({
        name: formData.name,
        sku: formData.sku.trim(),
        description: formData.description,
        category: formData.category,
        qty: parsedQty,
        minQty: parsedMinQty,
        location: formData.location,
        price: parsedPrice,
        unit: formData.purchaseUnit || formData.unit,
        purchaseUnit: formData.purchaseUnit,
        recipeUnit: formData.recipeUnit,
        conversionFactor: parsedConversionFactor,
        unitPrice: Math.round(parsedPrice / parsedConversionFactor),
        imageUrl: formData.imageUrl,
        expiryDate: formData.expiryDate || undefined,
        batchNumber: formData.batchNumber || undefined
      });
      setShowAddModal(false);
      onAddLog('Registrasi Barang Baru', currentUser.name, `Berhasil mendaftarkan barang: ${formData.name} (SKU: ${formData.sku})`);
    } catch (e: any) {
      console.error(e);
      alert(`Gagal menyimpan barang baru:\n${e?.message || 'Terjadi kesalahan sistem.'}`);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    if (!formData.name || !formData.sku || !formData.location) {
      alert('Silakan lengkapi kolom yang wajib diisi!');
      return;
    }

    // Check SKU duplicate, excluding current edited product database id, for the same location
    const formLocations = formData.location.split(',').map((l: string) => l.trim().toLowerCase());
    const isSkuDuplicate = products.some(p => {
      if (p.id === editingProduct.id) return false;
      if (p.sku.trim().toLowerCase() !== formData.sku.trim().toLowerCase()) return false;
      const existingLocs = p.location.split(',').map(l => l.trim().toLowerCase());
      return existingLocs.some(l => formLocations.includes(l));
    });
    if (isSkuDuplicate) {
      alert(`SKU / Nomor Barcode "${formData.sku}" sudah terdaftar untuk barang lain di salah satu lokasi yang sama: "${formData.location}"!`);
      return;
    }

    const parsedQty = parseFloat(String(formData.qty).replace(/,/g, '.')) || 0;
    const parsedMinQty = parseFloat(String(formData.minQty).replace(/,/g, '.')) || 0;
    const parsedPrice = parseFloat(String(formData.price).replace(/,/g, '.')) || 0;
    const parsedConversionFactor = parseFloat(String(formData.conversionFactor).replace(/,/g, '.')) || 1;

    const expDate = formData.expiryDate ? formData.expiryDate.trim() : undefined;
    const batchNum = formData.batchNumber ? formData.batchNumber.trim() : undefined;

    try {
      let updatedBatches = editingProduct.batches ? [...editingProduct.batches] : [];
      if (updatedBatches.length > 0) {
        updatedBatches[0] = {
          ...updatedBatches[0],
          expiryDate: expDate || updatedBatches[0].expiryDate || '',
          batchNumber: batchNum || updatedBatches[0].batchNumber || '',
          qty: parsedQty
        };
      } else if (expDate || batchNum) {
        updatedBatches = [{
          id: `batch-${Date.now()}`,
          batchNumber: batchNum || `LOT-${new Date().getFullYear()}-001`,
          expiryDate: expDate || '',
          qty: parsedQty,
          createdAt: new Date().toISOString()
        }];
      }

      const updatedProduct: Product = {
        ...editingProduct,
        name: formData.name,
        sku: formData.sku.trim(),
        description: formData.description,
        category: formData.category,
        qty: parsedQty,
        minQty: parsedMinQty,
        location: formData.location,
        price: parsedPrice,
        unit: formData.purchaseUnit || formData.unit,
        purchaseUnit: formData.purchaseUnit,
        recipeUnit: formData.recipeUnit,
        conversionFactor: parsedConversionFactor,
        unitPrice: Math.round(parsedPrice / parsedConversionFactor),
        imageUrl: formData.imageUrl,
        expiryDate: expDate,
        batchNumber: batchNum,
        batches: updatedBatches.length > 0 ? updatedBatches : undefined,
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: currentUser.name
      };

      await onEditProduct(updatedProduct);
      setShowEditModal(false);
      setEditingProduct(null);
      onAddLog('Sunting Barang', currentUser.name, `Mengupdate data barang: ${formData.name} (SKU: ${formData.sku})`);
    } catch (e: any) {
      console.error(e);
      alert(`Gagal menyimpan rincian barang:\n${e?.message || 'Terjadi kesalahan sistem.'}`);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!currentUser.permissions.canDeleteProduct) {
      alert('Maaf, hanya administrator yang berwenang menghapus permanen catatan barang.');
      return;
    }

    try {
      await onDeleteProduct(product.id);
      onAddLog('Hapus Barang Permanen', currentUser.name, `Menghapus produk SKU: ${product.sku} (Nama: ${product.name})`);
      
      // Reset translation index after deletion in case paginating
      if (paginatedProducts.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser.permissions.canImportCSV) {
      alert('Anda tidak memiliki hak akses untuk mengimpor data barang (Import CSV).');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) {
        alert('File kosong atau tidak dapat diperoleh.');
        return;
      }

      // Parse CSV correctly
      const lines = text.split(/\r?\n/);
      const tempParsed: any[] = [];
      const errors: string[] = [];
      
      if (lines.length < 2) {
        alert('Data CSV tidak memiliki baris data yang cukup.');
        return;
      }

      // Helper to split line with quote awareness
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if ((char === ',' || char === ';') && !inQuotes) {
            result.push(current.trim().replace(/^["']|["']$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        return result;
      };

      const headerLine = lines[0];
      const headers = parseCSVLine(headerLine).map(h => h.toLowerCase());

      const nameIdx = headers.findIndex(h => h.includes('nama') || h.includes('name'));
      const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('barcode') || h.includes('kode'));
      const descIdx = headers.findIndex(h => h.includes('deskripsi') || h.includes('description') || h.includes('ket') || h.includes('detail'));
      const categoryIdx = headers.findIndex(h => h.includes('kategori') || h.includes('category'));
      const qtyIdx = headers.findIndex(h => h.includes('stok') || h.includes('qty') || h.includes('jumlah') || h.includes('volume'));
      const minQtyIdx = headers.findIndex(h => h.includes('min') || h.includes('batas'));
      const locationIdx = headers.findIndex(h => h.includes('lokasi') || h.includes('location') || h.includes('rak') || h.includes('gudang'));
      const priceIdx = headers.findIndex(h => h.includes('harga') || h.includes('price') || h.includes('nilai'));
      const unitIdx = headers.findIndex(h => h.includes('satuan') || h.includes('unit'));
      const imageIdx = headers.findIndex(h => h.includes('foto') || h.includes('image') || h.includes('gambar') || h.includes('pic'));
      const batchIdx = headers.findIndex(h => h.includes('batch') || h.includes('lot'));
      const expiryIdx = headers.findIndex(h => h.includes('kadaluarsa') || h.includes('expir') || h.includes('ed') || h.includes('expired'));

      // Validate mapping quality
      if (nameIdx === -1 || skuIdx === -1) {
        errors.push("Header 'Nama' dan 'SKU' wajib ada pada baris pertama spreadsheet.");
        setImportErrors(errors);
        setParsedProducts([]);
        setShowImportModal(true);
        return;
      }

      const existingSkus = new Set(products.map(p => `${p.sku.toLowerCase().trim()}::${p.location.toLowerCase().trim()}`));
      const csvSkus = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // skip blank line

        const cells = parseCSVLine(line);
        if (cells.length < 2) continue; // skip invalid or mostly empty row

        const name = cells[nameIdx] || '';
        const sku = (cells[skuIdx] || '').trim();
        const description = descIdx !== -1 ? (cells[descIdx] || '') : '';
        const category = categoryIdx !== -1 ? (cells[categoryIdx] || 'Elektronik') : 'Elektronik';
        const qtyRaw = qtyIdx !== -1 ? cells[qtyIdx] : '0';
        const minQtyRaw = minQtyIdx !== -1 ? cells[minQtyIdx] : '5';
        const locationDefault = locationsList && locationsList.length > 0 ? locationsList[0] : 'Gudang Utama';
        const location = locationIdx !== -1 ? (cells[locationIdx] || locationDefault) : locationDefault;
        const priceRaw = priceIdx !== -1 ? cells[priceIdx] : '0';
        const unit = unitIdx !== -1 ? (cells[unitIdx] || 'Unit') : 'Unit';
        const imageUrl = imageIdx !== -1 ? (cells[imageIdx] || '') : '';
        const batchNumber = batchIdx !== -1 ? (cells[batchIdx] || '') : '';
        const expiryDate = expiryIdx !== -1 ? (cells[expiryIdx] || '') : '';

        // validations
        if (!name) {
          errors.push(`Baris ${i + 1}: Nama barang kosong.`);
          continue;
        }
        if (!sku) {
          errors.push(`Baris ${i + 1}: SKU / Barcode kosong.`);
          continue;
        }
        const skuLocKey = `${sku.toLowerCase()}::${location.toLowerCase()}`;
        if (existingSkus.has(skuLocKey)) {
          errors.push(`Baris ${i + 1}: SKU "${sku}" di lokasi "${location}" sudah terdaftar di database.`);
          continue;
        }
        if (csvSkus.has(skuLocKey)) {
          errors.push(`Baris ${i + 1}: Duplikasi SKU "${sku}" di lokasi "${location}" di dalam file.`);
          continue;
        }

        csvSkus.add(skuLocKey);

        // Parse numbers safely allowing decimals with dot or comma as decimal separators
        const parseCSVDecimal = (raw: string, fallback: number): number => {
          if (!raw) return fallback;
          let cleaned = raw.trim();
          if (cleaned.includes(',') && cleaned.includes('.')) {
            const lastDot = cleaned.lastIndexOf('.');
            const lastComma = cleaned.lastIndexOf(',');
            if (lastComma > lastDot) {
              cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
            } else {
              cleaned = cleaned.replace(/,/g, '');
            }
          } else if (cleaned.includes(',')) {
            cleaned = cleaned.replace(/,/g, '.');
          }
          const val = parseFloat(cleaned);
          return isNaN(val) ? fallback : val;
        };

        const qty = parseCSVDecimal(qtyRaw, 0);
        const minQty = parseCSVDecimal(minQtyRaw, 5);
        const price = parseCSVDecimal(priceRaw, 0);

        tempParsed.push({
          name,
          sku,
          description,
          category,
          qty,
          minQty,
          location,
          price,
          unit,
          purchaseUnit: unit,
          recipeUnit: unit,
          conversionFactor: 1,
          unitPrice: price,
          imageUrl,
          expiryDate: expiryDate || undefined,
          batchNumber: batchNumber || undefined
        });
      }

      setParsedProducts(tempParsed);
      setImportErrors(errors);
      setShowImportModal(true);
    };

    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (parsedProducts.length === 0) return;
    
    let importedCount = 0;
    try {
      for (const prod of parsedProducts) {
        await onAddProduct({
          name: prod.name,
          sku: prod.sku,
          description: prod.description,
          category: prod.category,
          qty: prod.qty,
          minQty: prod.minQty,
          location: prod.location,
          price: prod.price,
          unit: prod.unit,
          purchaseUnit: prod.purchaseUnit,
          recipeUnit: prod.recipeUnit,
          conversionFactor: prod.conversionFactor,
          unitPrice: prod.unitPrice,
          imageUrl: prod.imageUrl,
          expiryDate: prod.expiryDate,
          batchNumber: prod.batchNumber
        });
        importedCount++;
      }

      setShowImportModal(false);
      onAddLog('Import Massal CSV', currentUser.name, `Berhasil mengimpor massal ${importedCount} barang baru via berkas CSV.`);
      alert(`Berhasil mengimpor ${importedCount} barang baru ke inventaris.`);
      setParsedProducts([]);
      setImportErrors([]);
    } catch (e: any) {
      console.error(e);
      alert(`Terjadi kesalahan saat mengimpor (${importedCount} barang berhasil diimpor):\n${e?.message || 'Kesalahan sistem.'}`);
    }
  };

  const downloadTemplateCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8,Nama,SKU,Deskripsi,Kategori,Stok,Stok Minimum,Lokasi,Harga,Satuan\n" +
      "Produk Contoh A,SKU-A101-XYZ,Barang elektronika berkualitas,Elektronik,50,5,Sektor B-4,150000,Unit\n" +
      "Botol Kaca B,SKU-B202-VUT,Bahan wadah kaca tebal,Bahan Baku,100,10,Sektor B-2,4500,Pcs\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_import_barang.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToCSV = () => {
    if (!currentUser.permissions.canExportCSV) {
      alert('Anda tidak memiliki hak akses untuk mengekspor data barang (Ekspor CSV).');
      return;
    }
    if (filteredProducts.length === 0) {
      alert("Tidak ada data barang yang dicari / cocok untuk diekspor.");
      return;
    }

    const headers = [
      "Nama Barang",
      "SKU / Barcode",
      "Deskripsi",
      "Kategori",
      "Stok Sekarang",
      "Stok Minimum",
      "Lokasi Rak",
      "Harga Jual (Rp)",
      "Satuan",
      "Nomor Batch",
      "Tanggal Kadaluarsa",
      "Status Kadaluarsa",
      "Kondisi Stok",
      "Foto Produk"
    ];

    const rows = filteredProducts.map(p => {
      const isCritical = p.qty <= p.minQty;
      const status = isCritical ? "Stok Kritis" : "Stok Aman";
      const expStatus = getExpiryStatus(p.expiryDate);
      
      const escape = (val: any) => {
        const str = String(val === undefined || val === null ? '' : val);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escape(p.name),
        escape(p.sku),
        escape(p.description || ''),
        escape(p.category),
        p.qty,
        p.minQty,
        escape(p.location),
        p.price,
        escape(p.purchaseUnit || p.unit || 'pcs'),
        escape(p.batchNumber || ''),
        escape(p.expiryDate || ''),
        escape(expStatus.label),
        status,
        escape(p.imageUrl || '')
      ].join(',');
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `Data_Inventaris_Gudang_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onAddLog('Ekspor CSV', currentUser.name, `Mengekspor ${filteredProducts.length} data barang ke berkas CSV.`);
  };

  return (
    <div className="space-y-6" id="inventory-tab-workspace">
      
      {/* Title with Registered Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-800 dark:text-zinc-200">Manajemen Gudang & Inventaris</h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {currentUser.permissions.canImportCSV && (
            <>
              <input 
                type="file" 
                ref={csvInputRef} 
                onChange={handleCsvUpload} 
                accept=".csv" 
                className="hidden" 
              />
              <button
                id="import-csv-btn"
                onClick={() => csvInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md shadow-emerald-100 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0 transition-all select-none"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Import CSV
              </button>
            </>
          )}

          {currentUser.permissions.canExportCSV && (
            <button
              id="export-csv-btn"
              onClick={exportToCSV}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md shadow-teal-100 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0 transition-all select-none"
              title="Ekspor daftar barang yang sedang difilter ke spreadsheet Excel / CSV"
            >
              <Download className="w-4 h-4" />
              Ekspor CSV
            </button>
          )}

          {currentUser.permissions.canAddProduct && (
            <button
              id="register-barang-btn"
              onClick={handleOpenAddModal}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md shadow-indigo-100 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0 transition-all select-none"
            >
              <Plus className="w-4 h-4" />
              Tambah Barang
            </button>
          )}
        </div>
      </div>

      {isUserRestricted && (
        <div className="flex">
          <button
            type="button"
            className="inline-flex items-center gap-2.5 px-3 py-1.5 bg-indigo-50/70 hover:bg-indigo-100/75 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 border border-indigo-100/50 dark:border-zinc-800 rounded-full text-xs font-semibold text-indigo-700 dark:text-indigo-400 shadow-xs transition-all cursor-pointer select-none"
            title={`Akses dibatasi. Inventaris saat ini dibatasi secara otomatis hanya untuk barang yang berada di lokasi "${currentUser.location}"`}
          >
            <MapPin className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] leading-none tracking-tight">
              Akses Tersegmentasi: <strong className="text-indigo-800 dark:text-indigo-300 font-bold">{currentUser.location}</strong>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0"></span>
          </button>
        </div>
      )}

      {/* Control filters bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 p-4 rounded-xl border border-gray-150 dark:border-zinc-805 bg-white dark:bg-zinc-900 shadow-sm">
        
        {/* Search */}
        <div className="relative sm:col-span-2 lg:col-span-2">
          <input
            type="text"
            placeholder="Cari barang, SKU, No Batch, atau Lokasi..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
          />
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Category Picker */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
            className="w-full pl-8 pr-4 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'Semua Kategori' : cat}
              </option>
            ))}
          </select>
          <Layers className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
          <Filter className="absolute right-3 top-3 w-3 h-3 text-gray-400 pointer-events-none opacity-40" />
        </div>

        {/* Location Picker (For Admin/Full view) */}
        <div className="relative">
          <select
            value={selectedLocation}
            onChange={(e) => { setSelectedLocation(e.target.value); setCurrentPage(1); }}
            className="w-full pl-8 pr-4 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none cursor-pointer"
            disabled={isUserRestricted}
          >
            {locationsForFilter.map((loc) => (
              <option key={loc} value={loc}>
                {loc === 'all' ? 'Semua Lokasi' : loc}
              </option>
            ))}
          </select>
          <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
          <Filter className="absolute right-3 top-3 w-3 h-3 text-gray-400 pointer-events-none opacity-40" />
        </div>

        {/* Stock Level Slider picker */}
        <div className="relative">
          <select
            value={stockFilter}
            onChange={(e) => { setStockFilter(e.target.value as any); setCurrentPage(1); }}
            className="w-full pl-8 pr-4 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none cursor-pointer"
          >
            <option value="all">Semua Kondisi Stok</option>
            <option value="critical">⚠️ Stok Kritis (≤ Min)</option>
            <option value="normal">✓ Stok Aman (&gt; Min)</option>
          </select>
          <Filter className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Expiry Filter Picker */}
        <div className="relative">
          <select
            value={expiryFilter}
            onChange={(e) => { setExpiryFilter(e.target.value as any); setCurrentPage(1); }}
            className="w-full pl-8 pr-4 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none cursor-pointer"
          >
            <option value="all">Semua Kadaluarsa</option>
            <option value="near_expiry">⚠️ Hampir Kadaluarsa (≤30hr)</option>
            <option value="near_90">⚠️ Hampir Kadaluarsa (≤90hr)</option>
            <option value="expired">🛑 Sudah Kadaluarsa</option>
            <option value="fefo">⏳ FEFO (Kadaluarsa Terdekat)</option>
          </select>
          <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

      </div>

      {/* Floating Bulk Action Bar when items are selected */}
      {selectedProductIds.length > 0 && (
        <div className="bg-indigo-900 text-white dark:bg-zinc-800 p-3.5 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl border border-indigo-700/50 dark:border-zinc-700 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-700 dark:bg-zinc-700 flex items-center justify-center font-extrabold text-xs text-white shrink-0 shadow-inner">
              {selectedProductIds.length}
            </div>
            <div>
              <p className="font-extrabold text-xs sm:text-sm">
                {selectedProductIds.length} Barang Terpilih
              </p>
              <p className="text-[10px] text-indigo-200 dark:text-zinc-400">
                Pilih aksi atau batalkan pilihan seluruh barang
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDeselectAll}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              Batalkan Pilihan
            </button>

            <button
              type="button"
              onClick={() => {
                if (!currentUser.permissions.canDeleteProduct) {
                  alert('Maaf, hanya administrator yang berwenang menghapus permanen catatan barang.');
                  return;
                }
                setShowBulkDeleteModal(true);
              }}
              className="px-3.5 py-1.5 text-xs font-extrabold rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Terpilih ({selectedProductIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Table Grid representing items */}
      <div className="border border-gray-150/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm">
        {/* Table Top Bar with Quick 25, 50, 75, 100 filter buttons */}
        <div className="py-2.5 px-4 border-b border-gray-150 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-850/30 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-800 dark:text-zinc-200">Daftar Inventaris</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 font-mono text-[10px] font-bold border border-indigo-100/80 dark:border-indigo-900/40">
              {filteredProducts.length} barang
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-zinc-400 text-[11px] font-medium hidden sm:inline">Tampilkan:</span>
            <div className="inline-flex items-center bg-white dark:bg-zinc-950 p-0.5 rounded-lg border border-gray-200 dark:border-zinc-800 shadow-xs">
              {[25, 50, 75, 100].map((size) => {
                const isActive = itemsPerPage === size;
                return (
                  <button
                    key={size}
                    type="button"
                    id={`table-top-items-per-page-${size}-btn`}
                    onClick={() => handleSetItemsPerPage(size)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800'
                    }`}
                    title={`Tampilkan ${size} barang per halaman`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-gray-400 dark:text-zinc-500 hidden sm:inline">/ hal</span>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-150 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-850/20 text-xs font-semibold text-gray-400 dark:text-zinc-500 font-sans">
                <th className="py-3 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={isAllFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeFilteredSelected;
                    }}
                    onChange={handleToggleSelectAllFiltered}
                    className="rounded border-gray-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    title={isAllFilteredSelected ? "Batal Pilih Semua" : "Pilih Semua Barang"}
                  />
                </th>
                <th className="py-3 px-4">Nama Barang & SKU</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Lokasi Rak</th>
                <th className="py-3 px-4 text-center">Tingkat Volume Stok</th>
                <th className="py-3 px-4">Satuan Harga</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150 dark:divide-gray-800 text-xs">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-450 dark:text-zinc-500 font-medium">
                    <ShoppingBag className="w-10 h-10 mx-auto text-gray-300 dark:text-zinc-700 mb-2" />
                    Tidak ada catatan barang yang cocok dengan kriteria pencarian Anda.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => {
                  const isCritical = p.qty <= p.minQty;
                  const expStatus = getExpiryStatus(p.expiryDate);
                  // Percentage calculation for visual progress bar indicator
                  const percentage = Math.min((p.qty / (p.minQty * 3 || 1)) * 100, 100);
                  const isSelected = selectedProductIds.includes(p.id);

                  return (
                    <tr key={p.id} className={`transition-colors ${isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/30' : 'hover:bg-gray-50/50 dark:hover:bg-zinc-850/10'}`}>
                      
                      {/* Selection Checkbox */}
                      <td className="py-4 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectProduct(p.id)}
                          className="rounded border-gray-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Name & SKU */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-extrabold flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40 shrink-0 overflow-hidden cursor-zoom-in group relative"
                            onClick={() => p.imageUrl && setSelectedImageUrl(p.imageUrl)}
                          >
                            {p.imageUrl ? (
                              <>
                                <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                  <ImageIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </>
                            ) : (
                              p.name.substring(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <span 
                              onClick={() => setViewingProduct(p)} 
                              className="font-extrabold text-sm text-gray-950 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer block truncate max-w-xs" 
                              title={`Lihat rincian: ${p.name}`}
                            >
                              {p.name}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] text-gray-400 dark:text-zinc-500">
                              <span>SKU: {p.sku}</span>
                            </div>
                            {p.expiryDate && (
                              <div 
                                onClick={() => setSelectedBatchProduct(p)}
                                className="flex items-center gap-1 mt-0.5 font-mono text-[10px] text-gray-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"
                                title="Klik untuk rincian Lot / Batch FEFO"
                              >
                                <Calendar className="w-3 h-3 text-gray-400 dark:text-zinc-500 shrink-0" />
                                <span>Exp: {formatDateIndo(p.expiryDate)}</span>
                              </div>
                            )}
                            {p.description && (
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-450 mt-1 max-w-xs truncate font-medium italic" title={p.description}>
                                Catatan: {p.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-350 border border-gray-150 dark:border-zinc-750">
                          {p.category}
                        </span>
                      </td>

                      {/* Area Penempatan */}
                      <td className="py-4 px-4 font-mono">
                        <span className="flex items-center gap-1 text-gray-750 dark:text-zinc-300 font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          {p.location}
                        </span>
                      </td>

                      {/* Stock levels slider */}
                      <td className="py-4 px-4">
                        <div className="max-w-[160px] mx-auto text-left">
                          <div className="flex items-center text-[10px] mb-1 font-mono">
                            <span className={isCritical ? 'text-rose-650 dark:text-rose-400 font-bold' : 'text-gray-550 dark:text-zinc-400 font-semibold'}>
                              {p.qty} {p.purchaseUnit || p.unit || 'unit'}
                            </span>
                          </div>
                          
                          {/* Progress Line bar */}
                          <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${isCritical ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>

                          {isCritical && (
                            <span className="inline-block text-[8px] font-bold text-rose-600 dark:text-rose-450 uppercase tracking-widest mt-1 animate-pulse">
                              ⚠️ STOK MENIPIS
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Valuation */}
                      <td className="py-4 px-4">
                        <div className="font-mono font-bold text-gray-805 dark:text-zinc-200">
                          {formatIDR(p.price)}
                        </div>
                      </td>

                      {/* Controls Area */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* View Product Details */}
                          <button
                            onClick={() => setViewingProduct(p)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Lihat rincian lengkap barang"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit Details */}
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-lg transition-colors cursor-pointer"
                            title="Edit rincian data barang"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Print Label */}
                          <button
                            onClick={() => handleOpenBarcodeModal(p)}
                            className="p-1.5 text-gray-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-lg transition-colors cursor-pointer"
                            title="Tampilkan & Cetak Label Barcode (33x15mm)"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Delete Core */}
                          {confirmDeleteProductId === p.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 p-1 rounded-lg border border-rose-100 dark:border-rose-900/30 animate-in fade-in duration-100">
                              <span className="text-[10px] text-rose-600 dark:text-rose-455 font-bold px-0.5 select-none">Hapus?</span>
                              <button
                                onClick={() => {
                                  handleDeleteProduct(p);
                                  setConfirmDeleteProductId(null);
                                }}
                                className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold text-[9px] cursor-pointer"
                                title="Ya, Hapus"
                              >
                                Ya
                              </button>
                              <button
                                onClick={() => setConfirmDeleteProductId(null)}
                                className="px-1.5 py-0.5 bg-gray-251 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded font-semibold text-[9px] cursor-pointer"
                                title="Batal"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (!currentUser.permissions.canDeleteProduct) {
                                  alert('Maaf, hanya administrator yang berwenang menghapus permanen catatan barang.');
                                  return;
                                }
                                setConfirmDeleteProductId(p.id);
                              }}
                              className="p-1.5 text-gray-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-lg transition-colors cursor-pointer"
                              title="Hapus permanen barang"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (Handphone Optimized) */}
        <div className="md:hidden divide-y divide-gray-150 dark:divide-zinc-805">
          {paginatedProducts.length === 0 ? (
            <div className="py-12 text-center text-gray-450 dark:text-zinc-500 font-medium">
              <ShoppingBag className="w-10 h-10 mx-auto text-gray-300 dark:text-zinc-700 mb-2" />
              Tidak ada catatan barang.
            </div>
          ) : (
            paginatedProducts.map((p) => {
              const isCritical = p.qty <= p.minQty;
              const expStatus = getExpiryStatus(p.expiryDate);
              const percentage = Math.min((p.qty / (p.minQty * 3 || 1)) * 100, 100);
              const isSelected = selectedProductIds.includes(p.id);

              return (
                <div key={p.id} className={`p-4 space-y-4 transition-colors ${isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/30' : 'hover:bg-gray-50/30 dark:hover:bg-zinc-850/5'}`}>
                  <div className="flex items-start gap-3">
                    <div className="pt-1 shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectProduct(p.id)}
                        className="rounded border-gray-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                    <div 
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-extrabold flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40 shrink-0 overflow-hidden shadow-sm cursor-zoom-in active:scale-95 transition-transform"
                      onClick={() => p.imageUrl && setSelectedImageUrl(p.imageUrl)}
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-lg">{(p.name || '').substring(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span 
                          onClick={() => setViewingProduct(p)} 
                          className="font-extrabold text-sm text-gray-950 dark:text-gray-100 block leading-tight truncate cursor-pointer hover:text-blue-600" 
                          title={p.name}
                        >
                          {p.name}
                        </span>
                        <div className="flex items-center shrink-0">
                          <button
                            onClick={() => setViewingProduct(p)}
                            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                            title="Lihat rincian barang"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenBarcodeModal(p)}
                            className="p-2 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                            title="Tampilkan & Cetak Label"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (!currentUser.permissions.canDeleteProduct) {
                                alert('Maaf, hanya administrator yang berwenang menghapus permanen catatan barang.');
                                return;
                              }
                              setConfirmDeleteProductId(p.id);
                            }}
                            className="p-2 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-mono font-bold text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-850 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                          SKU: {p.sku}
                        </span>
                        {p.expiryDate && (
                          <span className="text-[10px] font-mono font-medium text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-850 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            Exp: {formatDateIndo(p.expiryDate)}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 italic truncate">
                          {p.category}
                        </span>
                      </div>
                      {p.description && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 font-medium bg-zinc-50 dark:bg-zinc-850/30 px-2 py-1.5 rounded-lg border border-zinc-150 dark:border-zinc-800 italic break-words" title={p.description}>
                          Catatan: {p.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-xl bg-gray-50 dark:bg-zinc-850/40 border border-gray-150/50 dark:border-zinc-800">
                      <p className="text-[9px] font-bold text-gray-400 dark:text-zinc-550 mb-1">Lokasi Rak</p>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-gray-800 dark:text-zinc-200">
                        <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                        <span className="truncate">{p.location}</span>
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-gray-50 dark:bg-zinc-850/40 border border-gray-150/50 dark:border-zinc-800">
                      <p className="text-[9px] font-bold text-gray-400 dark:text-zinc-550 mb-1">Satuan Harga</p>
                      <div className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 truncate">
                        {formatIDR(p.price)}
                      </div>
                    </div>
                  </div>

                  {/* Stock Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className={isCritical ? 'text-rose-600 animate-pulse' : 'text-gray-500 dark:text-zinc-400 uppercase tracking-tighter'}>
                        {isCritical ? '⚠ STOK KRITIS' : 'Batas Aman'}
                      </span>
                      <span className="text-gray-900 dark:text-white">
                        {p.qty} / <span className="text-gray-400 font-medium font-mono">{p.minQty} {p.purchaseUnit || p.unit}</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden border border-gray-200/40 dark:border-zinc-750">
                      <div 
                        className={`h-full transition-all duration-500 rounded-full ${isCritical ? 'bg-rose-500' : 'bg-indigo-500'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Confirm Delete Overlay for Mobile */}
                  {confirmDeleteProductId === p.id && (
                    <div className="mt-2 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50 flex items-center justify-between animate-in zoom-in-95 duration-200">
                      <span className="text-xs font-bold text-rose-700 dark:text-rose-300">Hapus barang ini?</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setConfirmDeleteProductId(null)}
                          className="px-3 py-1.5 text-[10px] font-bold text-gray-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          onClick={() => {
                            handleDeleteProduct(p);
                            setConfirmDeleteProductId(null);
                          }}
                          className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold shadow-sm cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination footer controller */}
        {filteredProducts.length > 0 && (
          <div className="py-3 px-4 border-t border-gray-150 dark:border-zinc-800 bg-gray-50/20 dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <div className="flex items-center flex-wrap gap-3">
              <span>
                Menampilkan data <strong className="font-bold text-gray-800 dark:text-zinc-200">{(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredProducts.length)}</strong> dari <strong className="font-bold text-gray-800 dark:text-zinc-200">{filteredProducts.length}</strong> barang
              </span>
              <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-gray-200 dark:border-zinc-800">
                <span className="text-[11px] text-gray-400 dark:text-zinc-500">Tampilkan:</span>
                <div className="inline-flex items-center bg-gray-100 dark:bg-zinc-950 p-0.5 rounded-lg border border-gray-200/80 dark:border-zinc-800">
                  {[25, 50, 75, 100].map((size) => (
                    <button
                      key={size}
                      type="button"
                      id={`footer-items-per-page-${size}-btn`}
                      onClick={() => handleSetItemsPerPage(size)}
                      className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                        itemsPerPage === size
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 transition-colors disabled:opacity-40 cursor-pointer"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono px-3 font-semibold text-gray-800 dark:text-zinc-300">
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 transition-colors disabled:opacity-40 cursor-pointer"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Fullscreen Image Overlay Modal */}
      {selectedImageUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setSelectedImageUrl(null)}
        >
          <button 
            className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all z-10"
            onClick={(e) => { e.stopPropagation(); setSelectedImageUrl(null); }}
          >
            <X className="w-6 h-6 shadow-sm" />
          </button>
          <div 
            className="relative lg:max-w-5xl md:max-w-3xl sm:max-w-xl max-w-full max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={selectedImageUrl} 
              alt="Full Size View" 
              className="w-full h-auto max-h-[90vh] object-contain bg-white dark:bg-zinc-950" 
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

      {/* Barcode Print Template (Hidden from UI, visible only in @media print) */}
      <style>
        {`
          @media print {
            @page {
              size: 33mm 15mm;
              margin: 0;
            }
            html, body {
              width: 33mm !important;
              height: 15mm !important;
              padding: 0 !important;
              margin: 0 !important;
              overflow: hidden !important;
              background: white !important;
            }
            #root {
              display: none !important;
            }
            #print-root {
              display: flex !important;
              visibility: visible !important;
              width: 33mm !important;
              height: 15mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              flex-direction: column !important;
              justify-content: center !important;
              align-items: center !important;
            }
            #print-root svg {
              display: block !important;
              margin: 0 auto !important;
              max-width: 100% !important;
              height: auto !important;
              max-height: 25px !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}
      </style>

      {printingProduct && createPortal(
        <div id="print-root" className="fixed top-0 left-0 invisible pointer-events-none">
          <div className="flex flex-col items-center justify-between bg-white text-black animate-none text-center" style={{ width: '33mm', height: '15mm', overflow: 'hidden', padding: '1mm 0.8mm 0.5mm 0.8mm', boxSizing: 'border-box' }}>
            <div className="w-full flex justify-center items-center max-h-[4.8mm] overflow-hidden">
              <p 
                className="font-bold text-black font-sans uppercase text-center w-full"
                style={{
                  fontSize: printingProduct.name.length > 25 ? '5.5px' : printingProduct.name.length > 15 ? '6.5px' : '7.5px',
                  lineHeight: '1.2',
                  wordBreak: 'break-word',
                  margin: 0,
                  padding: 0
                }}
              >
                {printingProduct.name}
              </p>
            </div>
            <div className="barcode-container flex justify-center items-center w-full max-h-[8.5mm] overflow-hidden my-auto">
              <BarcodeComponent 
                value={printingProduct.sku || '0000'} 
                width={0.95}
                height={18}
                fontSize={7}
                margin={0}
                displayValue={true}
                renderer="svg"
                background="transparent"
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Hidden Offscreen Label Target (for html2canvas high-res generation) */}
      {barcodePreviewProduct && (
        <div className="fixed -top-[9999px] -left-[9999px] pointer-events-none select-none">
          <div 
            id="barcode-capture-target" 
            className="flex flex-col items-center justify-between bg-white text-black text-center" 
            style={{ 
              width: '330px', 
              height: '150px', 
              padding: '12px 10px 6px 10px', 
              boxSizing: 'border-box' 
            }}
          >
            <div className="w-full flex justify-center items-center min-h-[32px] max-h-[40px] overflow-hidden px-1">
              <p 
                className="font-bold text-black uppercase tracking-wide font-sans text-center w-full"
                style={{
                  fontSize: barcodePreviewProduct.name.length > 28 ? '9px' : barcodePreviewProduct.name.length > 18 ? '10.5px' : '12px',
                  lineHeight: '1.25',
                  wordBreak: 'break-word',
                  margin: 0,
                  padding: 0
                }}
              >
                {barcodePreviewProduct.name}
              </p>
            </div>
            <div className="flex justify-center items-center w-full overflow-hidden select-none my-auto pt-0.5">
              <BarcodeComponent 
                value={barcodePreviewProduct.sku || '0000'} 
                width={1.38}
                height={42}
                fontSize={11}
                margin={0}
                displayValue={true}
                renderer="svg"
                background="transparent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Barcode Interactive Mobile-First Preview and Download Modal */}
      {barcodePreviewProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div 
            className="bg-white dark:bg-zinc-900 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-100 dark:border-zinc-800 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-850/50">
              <div className="flex items-center gap-2">
                <Barcode className="w-5 h-5 text-indigo-500" />
                <h3 className="font-extrabold text-sm text-gray-900 dark:text-gray-100">
                  Label Barcode Utama
                </h3>
              </div>
              <button 
                onClick={() => setBarcodePreviewProduct(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Preview Box */}
            <div className="p-6 flex flex-col items-center justify-center bg-gray-150/40 dark:bg-zinc-950 border-b border-gray-100 dark:border-zinc-850">
              <span className="text-[10px] font-semibold text-gray-450 dark:text-zinc-500 uppercase tracking-widest mb-4">
                Pratinjau Label (33mm x 15mm)
              </span>

              {/* Real SVG or Canvas live interactive display */}
              <div className="relative p-2 bg-white rounded-2xl shadow-md border border-gray-200/50 flex flex-col items-center justify-center aspect-[33/15] overflow-hidden" style={{ width: '264px', height: '120px' }}>
                {isGeneratingImage ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-xs text-indigo-600 font-bold gap-2 font-mono">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                    </span>
                    Memproses Foto...
                  </div>
                ) : generatedImageUrl ? (
                  <img 
                    src={generatedImageUrl} 
                    alt="Generated Barcode Preview" 
                    className="w-full h-full object-contain pointer-events-auto select-all cursor-zoom-in active:scale-[0.98] transition-transform"
                    title="Tekan lama atau klik kanan untuk simpan foto langsung"
                  />
                ) : (
                  <div className="text-gray-400 dark:text-zinc-600 text-xs">Gagal memuat label</div>
                )}
              </div>

              {/* Info text for mobile touch and hold */}
              <p className="text-[10px] text-gray-450 dark:text-zinc-500 text-center mt-4">
                💡 <span className="font-semibold text-gray-500 dark:text-zinc-400">Tips Mobile:</span> Tekan lama gambar barcode di atas untuk langsung menyimpannya ke galeri handphone Anda.
              </p>
            </div>

            {/* Actions Grid */}
            <div className="p-4 space-y-2 bg-white dark:bg-zinc-900">
              {shareSuccess && (
                <div className="flex items-center justify-center gap-1.5 py-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-xl border border-emerald-100 dark:border-emerald-900/30 animate-in fade-in zoom-in-95 leading-none">
                  <Check className="w-3.5 h-3.5" />
                  Berhasil Disimpan / Dibagikan!
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {/* Save image png */}
                <button
                  type="button"
                  onClick={handleDownloadBarcode}
                  disabled={isGeneratingImage || !generatedImageUrl}
                  className="flex items-center justify-center gap-2 px-3 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 disabled:opacity-40 text-gray-800 dark:text-zinc-200 text-xs font-extrabold rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Unduh Gambar
                </button>

                {/* Share image */}
                <button
                  type="button"
                  onClick={handleShareBarcode}
                  disabled={isGeneratingImage || !generatedImageUrl}
                  className="flex items-center justify-center gap-2 px-3 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/20 disabled:opacity-40 text-xs font-extrabold rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  Bagikan Label
                </button>
              </div>

              {/* Standard Print trigger */}
              <button
                type="button"
                onClick={() => {
                  setBarcodePreviewProduct(null);
                  handlePrintLabel(barcodePreviewProduct);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/10 active:scale-[0.98] cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Cetak Langsung (Printers)
              </button>
            </div>
            
            {/* Meta status details */}
            <div className="bg-gray-50/50 dark:bg-zinc-950/20 px-4 py-3 text-[10px] text-gray-400 dark:text-zinc-500 flex justify-between font-mono">
              <span>SKU: {barcodePreviewProduct.sku}</span>
              <span>UKURAN: 33mm x 15mm</span>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal Form drawer */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 p-4 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-150 my-auto">
            
            <div className="flex items-center justify-between pb-2 sm:pb-3 border-b border-gray-150 dark:border-zinc-850 mb-3 sm:mb-4">
              <h3 className="font-sans font-bold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <Warehouse className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                Daftarkan Varian Barang Baru
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-zinc-805 dark:hover:text-white rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 sm:space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Nama Barang <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Contoh: Lampu LED Phillips 15W"
                    value={formData.name}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Nomor SKU / Kode Barcode <span className="text-rose-500">*</span></label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      name="sku"
                      required
                      placeholder="Contoh: 89912345678"
                      value={formData.sku}
                      onChange={handleFormChange}
                      className="w-full pl-3 pr-20 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setIsSkuScannerOpen(true)}
                      className="absolute right-1.5 px-2.5 py-1.5 sm:py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-2xs active:scale-95"
                      title="Pindai Barcode / SKU dengan Kamera"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold">Scan</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-indigo-500" />
                  Foto Barang <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-normal">(Pilih file atau ambil langsung dari kamera ponsel)</span>
                </label>
                <ImageCaptureUploader
                  value={formData.imageUrl || ''}
                  onChange={(val) => setFormData(prev => ({ ...prev, imageUrl: val }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Kategori Barang</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 sm:py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer appearance-none"
                  >
                    {categoriesList && categoriesList.length > 0 ? (
                      categoriesList.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))
                    ) : (
                      <>
                        <option value="Elektronik">Elektronik</option>
                        <option value="Peralatan">Peralatan</option>
                        <option value="Alat Kantor">Alat Kantor</option>
                        <option value="Bahan Kimia">Bahan Kimia</option>
                        <option value="Logistik & Kemasan">Logistik & Kemasan</option>
                        <option value="Lainnya">Lainnya</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Penempatan Sektor / Rak <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isUserRestricted}
                      onClick={() => setIsAddLocationDropdownOpen(!isAddLocationDropdownOpen)}
                      className="w-full min-h-[38px] px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-zinc-900 cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-wrap gap-1 items-center max-w-[90%] text-left">
                        {formData.location ? (
                          formData.location.split(',').map((l: string) => l.trim()).filter(Boolean).map((loc: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold border border-indigo-100 dark:indigo-900/40"
                            >
                              {loc}
                              {!isUserRestricted && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLocationSelection(loc);
                                  }}
                                  className="hover:bg-indigo-200 dark:hover:bg-indigo-900 rounded-full px-1 font-bold cursor-pointer"
                                >
                                  &times;
                                </span>
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 dark:text-zinc-550">Pilih Sektor / Rak...</span>
                        )}
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    </button>
                    <input
                      type="hidden"
                      name="location"
                      required
                      value={formData.location}
                    />
                    {isAddLocationDropdownOpen && !isUserRestricted && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsAddLocationDropdownOpen(false)} 
                        />
                        <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl border border-gray-150 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl max-h-56 overflow-y-auto p-2 space-y-1">
                          {allowedLocations.map((loc) => {
                            const isSelected = formData.location ? formData.location.split(',').map((l: string) => l.trim().toLowerCase()).includes(loc.toLowerCase()) : false;
                            return (
                              <label
                                key={loc}
                                className="flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-805 cursor-pointer transition-colors text-gray-750 dark:text-zinc-200"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleLocationSelection(loc)}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="font-medium">{loc}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {isUserRestricted && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-1">
                      ⚠️ Terkunci ke wilayah akses Anda ({currentUser.location}).
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Satuan Beli</label>
                <input
                  type="text"
                  name="purchaseUnit"
                  placeholder="Contoh: Box of 24"
                  value={formData.purchaseUnit}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Satuan Resep / Jual</label>
                  <input
                    type="text"
                    name="recipeUnit"
                    placeholder="Contoh: Gram, Ml"
                    value={formData.recipeUnit}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Konversi <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="conversionFactor"
                    required
                    value={formData.conversionFactor}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Harga Beli (IDR) <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="price"
                    required
                    value={formData.price}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 sm:p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">Estimasi Harga Per Unit</p>
                <p className="text-sm font-extrabold text-indigo-900 dark:text-white">
                  {formatIDR(Math.round((parseFloat(String(formData.price).replace(/,/g, '.')) || 0) / (parseFloat(String(formData.conversionFactor).replace(/,/g, '.')) || 1)))} 
                  <span className="text-[10px] font-normal text-indigo-400 ml-1">/ {formData.recipeUnit}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Stok Awal Fisik</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="qty"
                    required
                    value={formData.qty}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Threshold Stok Minimum</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="minQty"
                    required
                    value={formData.minQty}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* Expiry Date & Batch Number Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/50 dark:border-amber-900/30">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 dark:text-amber-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Tanggal Kadaluarsa (ED)
                  </label>
                  <input
                    type="date"
                    name="expiryDate"
                    value={formData.expiryDate || ''}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-amber-200 dark:border-amber-800/50 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono"
                  />
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 block">
                    Kosongkan jika bukan barang ber-ED
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Nomor Batch / Lot
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextBatch = generateNextBatchNumber(accessibleProducts);
                        setFormData(prev => ({ ...prev, batchNumber: nextBatch }));
                      }}
                      className="text-[10px] font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 bg-amber-200/60 dark:bg-amber-900/50 hover:bg-amber-200 px-2 py-0.5 rounded-md transition-all flex items-center gap-1"
                      title="Generate Nomor Batch Berurut Otomatis"
                    >
                      ⚡ Auto Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      name="batchNumber"
                      placeholder="Contoh: LOT-2026-001"
                      value={formData.batchNumber || ''}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-amber-200 dark:border-amber-800/50 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 block">
                    Otomatis berurut (misal: LOT-2026-001, LOT-2026-002) atau bisa diisi manual
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Catatan / Keterangan Barang</label>
                <textarea
                  name="description"
                  placeholder="Contoh: Garansi resmi 1 tahun, simpan di wadah kedap udara, dll."
                  value={formData.description || ''}
                  onChange={handleFormChange}
                  rows={2}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="pt-4 border-t border-gray-150 dark:border-zinc-850 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-xl text-xs font-semibold cursor-pointer dark:text-zinc-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md shadow-blue-100 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0 transition-all select-none"
                >
                  Simpan Barang ✓
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Edit Modal Form drawer */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 p-4 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-150 my-auto">
            
            <div className="flex items-center justify-between pb-2 sm:pb-3 border-b border-gray-150 dark:border-zinc-850 mb-3 sm:mb-4">
              <h3 className="font-sans font-bold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                Sunting Catatan & Atasi Lokasi Barang
              </h3>
              <button 
                onClick={() => { setShowEditModal(false); setEditingProduct(null); }} 
                className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-zinc-805 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3 sm:space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Nama Barang <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Nomor SKU / Kode Barcode <span className="text-rose-500">*</span></label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      name="sku"
                      required
                      value={formData.sku}
                      onChange={handleFormChange}
                      className="w-full pl-3 pr-20 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setIsSkuScannerOpen(true)}
                      className="absolute right-1.5 px-2.5 py-1.5 sm:py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-2xs active:scale-95"
                      title="Pindai Barcode / SKU dengan Kamera"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold">Scan</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-indigo-500" />
                  Foto Barang <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-normal">(Pilih file atau ambil langsung dari kamera ponsel)</span>
                </label>
                <ImageCaptureUploader
                  value={formData.imageUrl || ''}
                  onChange={(val) => setFormData(prev => ({ ...prev, imageUrl: val }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Kategori Barang</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-955 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer appearance-none"
                  >
                    {categoriesList && categoriesList.length > 0 ? (
                      categoriesList.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))
                    ) : (
                      <>
                        <option value="Elektronik">Elektronik</option>
                        <option value="Peralatan">Peralatan</option>
                        <option value="Alat Kantor">Alat Kantor</option>
                        <option value="Bahan Kimia">Bahan Kimia</option>
                        <option value="Logistik & Kemasan">Logistik & Kemasan</option>
                        <option value="Lainnya">Lainnya</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Penempatan Sektor / Rak <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isUserRestricted}
                      onClick={() => setIsEditLocationDropdownOpen(!isEditLocationDropdownOpen)}
                      className="w-full min-h-[38px] px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-zinc-900 cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-wrap gap-1 items-center max-w-[90%] text-left">
                        {formData.location ? (
                          formData.location.split(',').map((l: string) => l.trim()).filter(Boolean).map((loc: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold border border-indigo-100 dark:indigo-900/40"
                            >
                              {loc}
                              {!isUserRestricted && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLocationSelection(loc);
                                  }}
                                  className="hover:bg-indigo-200 dark:hover:bg-indigo-900 rounded-full px-1 font-bold cursor-pointer"
                                >
                                  &times;
                                </span>
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 dark:text-zinc-550">Pilih Sektor / Rak...</span>
                        )}
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    </button>
                    <input
                      type="hidden"
                      name="location"
                      required
                      value={formData.location}
                    />
                    {isEditLocationDropdownOpen && !isUserRestricted && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsEditLocationDropdownOpen(false)} 
                        />
                        <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl border border-gray-150 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl max-h-56 overflow-y-auto p-2 space-y-1">
                          {allowedLocations.map((loc) => {
                            const isSelected = formData.location ? formData.location.split(',').map((l: string) => l.trim().toLowerCase()).includes(loc.toLowerCase()) : false;
                            return (
                              <label
                                key={loc}
                                className="flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-805 cursor-pointer transition-colors text-gray-750 dark:text-zinc-200"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleLocationSelection(loc)}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="font-medium">{loc}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {isUserRestricted && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-1">
                      ⚠️ Terkunci ke wilayah akses Anda ({currentUser.location}).
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Satuan Beli</label>
                <input
                  type="text"
                  name="purchaseUnit"
                  placeholder="Contoh: Box of 24"
                  value={formData.purchaseUnit}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Satuan Resep / Jual</label>
                  <input
                    type="text"
                    name="recipeUnit"
                    placeholder="Contoh: Gram, Ml"
                    value={formData.recipeUnit}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Konversi <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="conversionFactor"
                    required
                    value={formData.conversionFactor}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Harga Beli (IDR) <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="price"
                    required
                    value={formData.price}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 sm:p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">Estimasi Harga Per Unit</p>
                <p className="text-sm font-extrabold text-indigo-900 dark:text-white">
                  {formatIDR(Math.round((parseFloat(String(formData.price).replace(/,/g, '.')) || 0) / (parseFloat(String(formData.conversionFactor).replace(/,/g, '.')) || 1)))} 
                  <span className="text-[10px] font-normal text-indigo-400 ml-1">/ {formData.recipeUnit}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Jumlah Stok Fisik</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="qty"
                    required
                    value={formData.qty}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-955 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Threshold Stok Minimum</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="minQty"
                    required
                    value={formData.minQty}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2.5 sm:py-3 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-955 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* Edit Expiry Date & Batch Number Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/50 dark:border-amber-900/30">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 dark:text-amber-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Tanggal Kadaluarsa (ED)
                  </label>
                  <input
                    type="date"
                    name="expiryDate"
                    value={formData.expiryDate || ''}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-amber-200 dark:border-amber-800/50 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono"
                  />
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 block">
                    Kosongkan jika bukan barang ber-ED
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Nomor Batch / Lot
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextBatch = generateNextBatchNumber(accessibleProducts);
                        setFormData(prev => ({ ...prev, batchNumber: nextBatch }));
                      }}
                      className="text-[10px] font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 bg-amber-200/60 dark:bg-amber-900/50 hover:bg-amber-200 px-2 py-0.5 rounded-md transition-all flex items-center gap-1"
                      title="Generate Nomor Batch Berurut Otomatis"
                    >
                      ⚡ Auto Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    name="batchNumber"
                    placeholder="Contoh: LOT-2026-001"
                    value={formData.batchNumber || ''}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-amber-200 dark:border-amber-800/50 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono"
                  />
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 block">
                    Otomatis berurut atau diisi manual
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-450 mb-1">Catatan / Keterangan Barang</label>
                <textarea
                  name="description"
                  placeholder="Contoh: Garansi resmi 1 tahun, simpan di wadah kedap udara, dll."
                  value={formData.description || ''}
                  onChange={handleFormChange}
                  rows={2}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="pt-4 border-t border-gray-150 dark:border-zinc-850 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingProduct(null); }}
                  className="px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-xl text-xs font-semibold cursor-pointer dark:text-zinc-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md shadow-blue-100 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0 transition-all select-none"
                >
                  Simpan Perubahan ✓
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Import CSV Modal Preview drawer */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 p-4 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-150 my-auto">
            
            <div className="flex items-center justify-between pb-2 sm:pb-3 border-b border-gray-150 dark:border-zinc-855 mb-3 sm:mb-4">
              <h3 className="font-sans font-bold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                Daftar Sinkronisasi & Import Barang CSV
              </h3>
              <button 
                onClick={() => { setShowImportModal(false); setParsedProducts([]); setImportErrors([]); }} 
                className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-zinc-805 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* File Info & Download template option */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gray-50/50 dark:bg-zinc-950/20 border border-gray-150 dark:border-zinc-800 rounded-xl text-xs text-gray-700 dark:text-zinc-300">
                <div>
                  <span className="font-semibold text-gray-500 block text-[10px]">Berkas yang diproses:</span>
                  <span className="font-bold text-gray-900 dark:text-white font-mono break-all">{importFileName}</span>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplateCSV}
                  className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 rounded-xl text-[11px] font-bold cursor-pointer transition-all self-start sm:self-center"
                >
                  Download Format CSV Template
                </button>
              </div>

              {/* Errors Section */}
              {importErrors.length > 0 && (
                <div className="max-h-36 overflow-y-auto p-3.5 bg-rose-50/70 dark:bg-rose-950/15 border border-rose-100/50 dark:border-rose-900/30 rounded-xl text-[11px] text-rose-800 dark:text-rose-300">
                  <span className="font-extrabold block mb-1">Peringatan / Data Tidak Valid ({importErrors.length}):</span>
                  <ul className="list-disc pl-4 space-y-1 font-mono">
                    {importErrors.map((err, idx) => (
                      <li key={idx} className="leading-relaxed">{err}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] text-rose-600 dark:text-rose-450 italic font-sans font-medium">
                    Catatan: Baris-baris bermasalah di atas tidak akan diimpor. Silakan koreksi di file spreadsheet Anda dan upload ulang jika diperlukan.
                  </p>
                </div>
              )}

              {/* Preview List Table */}
              <div className="space-y-2">
                <span className="font-bold text-xs text-gray-600 dark:text-zinc-400 block">
                  Barang yang Siap Diimpor ({parsedProducts.length} item):
                </span>
                
                {parsedProducts.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl text-gray-400 text-xs">
                    Tidak ada barang yang memenuhi syarat untuk diimpor.
                  </div>
                ) : (
                  <div className="border border-gray-150 dark:border-zinc-805 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-[11px] border-collapse font-sans">
                      <thead className="sticky top-0 bg-gray-100 dark:bg-zinc-850 text-gray-500 dark:text-zinc-450 font-bold border-b border-gray-150 dark:border-zinc-800">
                        <tr>
                          <th className="py-2 px-3">Nama Barang</th>
                          <th className="py-2 px-3">SKU</th>
                          <th className="py-2 px-3">Kategori</th>
                          <th className="py-2 px-3 text-right">Stok</th>
                          <th className="py-2 px-3 text-right">Harga (IDR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 dark:divide-zinc-805 text-xs">
                        {parsedProducts.map((p, idx) => (
                          <tr key={idx} className="bg-white dark:bg-zinc-900 hover:bg-gray-50/50 dark:hover:bg-zinc-850/10 transition-colors">
                            <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white truncate max-w-[150px]" title={p.name}>{p.name}</td>
                            <td className="py-2 px-3 font-mono text-gray-400">{p.sku}</td>
                            <td className="py-2 px-3 text-gray-550 dark:text-zinc-400">{p.category}</td>
                            <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">{p.qty} {p.purchaseUnit || p.unit}</td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-gray-900 dark:text-white">{formatIDR(p.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Action area */}
              <div className="pt-4 border-t border-gray-150 dark:border-zinc-850 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowImportModal(false); setParsedProducts([]); setImportErrors([]); }}
                  className="px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-xl text-xs font-semibold cursor-pointer dark:text-zinc-300"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={parsedProducts.length === 0}
                  onClick={handleConfirmImport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold cursor-pointer shadow-md shadow-emerald-100 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0 transition-all select-none"
                >
                  Proses & Impor Sekarang ✓
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-100 dark:border-rose-900/40">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                  Konfirmasi Hapus Massal
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {selectedProductIds.length} Barang Terpilih
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 dark:text-zinc-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus <b className="text-rose-600 dark:text-rose-400">{selectedProductIds.length} data barang</b> yang telah dipilih secara permanen? Catatan ini akan dilepas tuntas dari sistem audit dan tidak dapat dikembalikan.
            </p>

            {/* Selected items list preview */}
            <div className="bg-gray-50 dark:bg-zinc-950/50 p-3 rounded-xl border border-gray-150 dark:border-zinc-800 max-h-40 overflow-y-auto space-y-1.5 text-[11px]">
              {products
                .filter(p => selectedProductIds.includes(p.id))
                .map(p => (
                  <div key={p.id} className="flex justify-between items-center text-gray-700 dark:text-zinc-300">
                    <span className="font-semibold truncate max-w-[200px]">• {p.name}</span>
                    <span className="font-mono text-gray-400 text-[10px] shrink-0">SKU: {p.sku}</span>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800">
              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 text-xs font-extrabold rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isBulkDeleting ? 'Menghapus...' : `Ya, Hapus (${selectedProductIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sku Camera Scanner Modal */}
      <SkuScannerModal
        isOpen={isSkuScannerOpen}
        onClose={() => setIsSkuScannerOpen(false)}
        onScan={handleScanSkuSuccess}
      />

      {/* Product Details Modal (Lihat Rincian Barang) */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 max-w-xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 my-auto">
            
            {/* Header */}
            <div className="flex justify-between items-start pb-3 border-b border-gray-150 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 rounded-2xl text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-950 dark:text-white leading-tight">
                    Rincian Barang
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 font-mono mt-0.5">
                    SKU: {viewingProduct.sku}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingProduct(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto py-4 space-y-4 flex-1 pr-1">
              
              {/* Product Info & Photo Card */}
              <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-2xl bg-gray-50/70 dark:bg-zinc-850/40 border border-gray-150 dark:border-zinc-800">
                {/* Photo / Thumbnail */}
                <div 
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-black text-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40 shrink-0 overflow-hidden relative group cursor-pointer mx-auto sm:mx-0 shadow-sm"
                  onClick={() => viewingProduct.imageUrl && setSelectedImageUrl(viewingProduct.imageUrl)}
                  title={viewingProduct.imageUrl ? "Klik untuk perbesar foto" : undefined}
                >
                  {viewingProduct.imageUrl ? (
                    <>
                      <img src={viewingProduct.imageUrl} alt={viewingProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </>
                  ) : (
                    viewingProduct.name.substring(0, 2).toUpperCase()
                  )}
                </div>

                {/* Main Meta */}
                <div className="flex-1 min-w-0 flex flex-col justify-between text-center sm:text-left">
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-gray-900 dark:text-white leading-snug">
                      {viewingProduct.name}
                    </h4>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-200/70 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
                        {viewingProduct.category}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-zinc-300">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        {viewingProduct.location}
                      </span>
                    </div>
                  </div>

                  {viewingProduct.description && (
                    <div className="text-xs text-gray-500 dark:text-zinc-400 mt-2 italic bg-white dark:bg-zinc-900 p-2 rounded-xl border border-gray-150 dark:border-zinc-800">
                      "{viewingProduct.description}"
                    </div>
                  )}
                </div>
              </div>

              {/* Barcode Display */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-150 dark:border-zinc-800 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                  Pratinjau Barcode SKU
                </span>
                <div className="overflow-hidden select-none bg-white p-2 rounded-xl border border-gray-100">
                  <BarcodeComponent 
                    value={viewingProduct.sku || '0000'} 
                    width={1.4} 
                    height={40} 
                    fontSize={11} 
                    margin={0} 
                    displayValue={true} 
                    renderer="svg" 
                    background="transparent" 
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Stock Level */}
                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-zinc-850/40 border border-gray-150 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-1">
                    Stok Saat Ini
                  </span>
                  <div className="text-base font-black text-gray-900 dark:text-white font-mono">
                    {viewingProduct.qty} <span className="text-xs font-semibold text-gray-500">{viewingProduct.purchaseUnit || viewingProduct.unit}</span>
                  </div>
                  <div className="mt-1">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      viewingProduct.qty <= viewingProduct.minQty 
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' 
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}>
                      {viewingProduct.qty <= viewingProduct.minQty ? 'Kritis / Menipis' : 'Stok Aman'}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-zinc-850/40 border border-gray-150 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-1">
                    Harga Beli
                  </span>
                  <div className="text-base font-black text-indigo-600 dark:text-indigo-400 font-mono">
                    {formatIDR(viewingProduct.price)}
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-zinc-500 block mt-0.5">
                    per {viewingProduct.purchaseUnit || viewingProduct.unit}
                  </span>
                </div>

                {/* Expiry */}
                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-zinc-850/40 border border-gray-150 dark:border-zinc-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-1">
                    Kadaluarsa
                  </span>
                  <div className="text-xs font-bold text-gray-900 dark:text-white font-mono flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>{viewingProduct.expiryDate ? formatDateIndo(viewingProduct.expiryDate) : 'Tanpa Tgl'}</span>
                  </div>
                  {viewingProduct.batchNumber && (
                    <span className="text-[10px] text-gray-500 dark:text-zinc-400 block mt-1 font-mono">
                      Batch: {viewingProduct.batchNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Conversion and Recipe Details if available */}
              {(viewingProduct.conversionFactor && viewingProduct.conversionFactor > 1) && (
                <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400 font-medium">
                    Konversi Resep: 1 {viewingProduct.purchaseUnit || viewingProduct.unit} = {viewingProduct.conversionFactor} {viewingProduct.recipeUnit}
                  </span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                    {formatIDR(Math.round((parseFloat(String(viewingProduct.price).replace(/,/g, '.')) || 0) / (parseFloat(String(viewingProduct.conversionFactor).replace(/,/g, '.')) || 1)))} / {viewingProduct.recipeUnit}
                  </span>
                </div>
              )}

            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-gray-150 dark:border-zinc-800 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewingProduct(null)}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold rounded-xl bg-gray-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 transition-colors cursor-pointer shadow-sm text-center"
              >
                Tutup
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Multi-Batch FEFO Breakdown Modal */}
      {selectedBatchProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-start pb-3 border-b border-gray-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 dark:bg-amber-950/80 rounded-xl text-amber-700 dark:text-amber-300">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    {selectedBatchProduct.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 font-mono">
                    SKU: {selectedBatchProduct.sku} • Lokasi: {selectedBatchProduct.location}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatchProduct(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Stock Summary Banner */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-400 block">
                  Total Stok Tergabung (Katalog Utama)
                </span>
                <span className="text-lg font-black text-amber-950 dark:text-amber-200 font-mono">
                  {selectedBatchProduct.qty} <span className="text-xs font-semibold">{selectedBatchProduct.unit}</span>
                </span>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                  🎯 FEFO Auto-Pick Active
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed shrink-0">
              Barang dikelompokkan dalam <b>1 entri katalog utama</b>. Transaksi keluar akan otomatis memotong dari Batch/Lot dengan Tanggal Kadaluarsa paling dekat terlebih dahulu.
            </p>

            {/* Batches List */}
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1 min-h-[150px]">
              {(!selectedBatchProduct.batches || selectedBatchProduct.batches.length === 0) ? (
                // Single default batch representation
                <div className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/40 space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-900 dark:text-white font-mono">
                      Batch Utama: {selectedBatchProduct.batchNumber || 'DEFAULT-001'}
                    </span>
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                      {selectedBatchProduct.qty} {selectedBatchProduct.unit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-gray-500">
                    <span>Kadaluarsa: {selectedBatchProduct.expiryDate ? formatDateIndo(selectedBatchProduct.expiryDate) : 'Tanpa Tgl'}</span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      🎯 Single Lot Active
                    </span>
                  </div>
                </div>
              ) : (
                selectedBatchProduct.batches
                  .filter(b => b.qty > 0)
                  .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                  .map((b, idx) => {
                    const st = getExpiryStatus(b.expiryDate);
                    return (
                      <div 
                        key={b.id || idx} 
                        className={`p-3.5 rounded-xl border transition-all ${
                          idx === 0 
                            ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-2 ring-amber-500/20' 
                            : 'bg-gray-50/60 dark:bg-zinc-950/40 border-gray-200 dark:border-zinc-800'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 dark:text-white font-mono">
                              📦 Batch: {b.batchNumber}
                            </span>
                            {idx === 0 && (
                              <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-200 bg-amber-200 dark:bg-amber-900 px-2 py-0.5 rounded-full border border-amber-400 dark:border-amber-700">
                                ⚡ Prioritas FEFO #1
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-black text-gray-900 dark:text-white font-mono bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-800">
                            {b.qty} {selectedBatchProduct.unit}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[11px] pt-1 border-t border-gray-200/50 dark:border-zinc-800">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500 dark:text-zinc-400">Tanggal ED:</span>
                            <span className="font-mono font-bold text-gray-800 dark:text-zinc-200">
                              {formatDateIndo(b.expiryDate)}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.badgeBg} ${st.badgeText} ${st.borderClass}`}>
                            {st.shortLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedBatchProduct(null)}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-gray-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 shadow-md transition-all cursor-pointer"
              >
                Tutup Rincian
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

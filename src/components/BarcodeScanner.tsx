/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Scan, 
  Camera, 
  CornerDownLeft, 
  CheckCircle2, 
  AlertCircle, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Plus, 
  Minus,
  Maximize2,
  Minimize2,
  RefreshCw,
  Video,
  Barcode,
  Trash2,
  X,
  Check,
  ShoppingBag,
  ArrowLeft,
  ClipboardList,
  Printer,
  Calendar,
  Clock,
  Sparkles,
  Search,
  Save
} from 'lucide-react';
import { Product, User, BOM } from '../types';
import { generateNextBatchNumber } from '../lib/expiryUtils';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import BarcodeComponent from 'react-barcode';
import TransactionLoadingModal from './TransactionLoadingModal';

const WAREHOUSES = [
  'Gudang Utama',
  'Gudang Sektor A',
  'Gudang Sektor B',
  'Gudang Bahan Baku',
  'Gudang Transit',
  'Dapur Utama',
  'Outlet Cabang'
];

const formatIDR = (num: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num || 0);
};

interface BarcodeScannerProps {
  products: Product[];
  currentUser: User;
  onRecordStockChange: (
    productId: string, 
    type: 'in' | 'out', 
    qty: number, 
    note: string,
    isAudit?: boolean,
    systemQty?: number,
    physicalQty?: number,
    difference?: number,
    customDate?: string,
    newPrice?: number,
    batchNumber?: string,
    expiryDate?: string,
    location?: string
  ) => Promise<void>;
  onInitiateTransfer: (
    productId: string,
    originWarehouse: string,
    targetWarehouse: string,
    qty: number,
    note: string,
    customDate?: string
  ) => Promise<void>;
  onRecordMultipleChanges?: (
    items: {
      productId: string;
      productName?: string;
      sku?: string;
      type: 'in' | 'out';
      qty: number;
      note: string;
      isAudit?: boolean;
      systemQty?: number;
      physicalQty?: number;
      difference?: number;
      customDate?: string;
      newPrice?: number;
      batchNumber?: string;
      expiryDate?: string;
      isTransfer?: boolean;
      originWarehouse?: string;
      targetWarehouse?: string;
      location?: string;
    }[]
  ) => Promise<void>;
  onAddLog: (action: string, userName: string, details: string) => void;
  initialIntent?: 'in' | 'out' | 'transfer' | 'audit' | 'adjust';
  onClose?: () => void;
  locationsList?: string[];
  boms?: BOM[];
}

export default function BarcodeScanner({
  products,
  currentUser,
  onRecordStockChange,
  onInitiateTransfer,
  onRecordMultipleChanges,
  onAddLog,
  initialIntent = 'in',
  onClose,
  locationsList,
  boms = []
}: BarcodeScannerProps) {
  const isUserRestricted = React.useMemo(() => {
    if (currentUser.role === 'admin') return false;
    if (!currentUser.location) return false;
    const locs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return !locs.includes('semua gudang');
  }, [currentUser]);

  const userAllowedLocations = React.useMemo(() => {
    if (!currentUser.location) return [];
    return currentUser.location.split(',').map(l => l.trim());
  }, [currentUser.location]);

  const accessibleProducts = React.useMemo(() => {
    if (!isUserRestricted || !currentUser.location) return products;
    const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return products.filter(p => p.location && userLocs.includes(p.location.trim().toLowerCase()));
  }, [products, isUserRestricted, currentUser.location]);

  const WAREHOUSES_OPTIONS = React.useMemo(() => {
    if (locationsList && locationsList.length > 0) {
      const filtered = locationsList.filter(loc => loc !== 'Semua Gudang');
      if (filtered.length > 0) return filtered;
    }
    return WAREHOUSES;
  }, [locationsList]);

  const availableRacks = React.useMemo(() => {
    const set = new Set<string>();
    if (locationsList) {
      locationsList.forEach(l => {
        if (l && l.trim() && l.trim().toLowerCase() !== 'semua gudang') set.add(l.trim());
      });
    }
    products.forEach(p => {
      if (p.location && p.location.trim() && p.location.trim().toLowerCase() !== 'semua gudang') {
        set.add(p.location.trim());
      }
    });
    if (set.size === 0) {
      ['Rak A-01', 'Rak A-02', 'Rak B-01', 'Rak B-02', 'Sektor 1', 'Sektor 2'].forEach(r => set.add(r));
    }
    return Array.from(set).sort();
  }, [locationsList, products]);

  const getDefaultOrigin = () => {
    if (locationsList && locationsList.length > 0) {
      const filtered = locationsList.filter(loc => loc !== 'Semua Gudang');
      if (filtered.length > 0) return filtered[0];
    }
    return 'Gudang Utama';
  };

  const getDefaultTarget = () => {
    if (locationsList && locationsList.length > 0) {
      const filtered = locationsList.filter(loc => loc !== 'Semua Gudang');
      if (filtered.length > 1) return filtered[1];
      if (filtered.length > 0) return filtered[0];
    }
    return 'Gudang Sektor A';
  };

  const [skuInput, setSkuInput] = useState('');
  const [adminLocationFilter, setAdminLocationFilter] = useState<string>('all');
  const [productTypeFilter, setProductTypeFilter] = useState<'all' | 'bahan' | 'bom'>('all');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPrintingOpname, setIsPrintingOpname] = useState(false);
  const [printingOpnameLocation, setPrintingOpnameLocation] = useState('');
  const [showOpnamePreview, setShowOpnamePreview] = useState(false);
  const [opnameStartDate, setOpnameStartDate] = useState<string>(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  });
  const [opnameEndDate, setOpnameEndDate] = useState<string>(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-10`;
  });

  // States for Barang Masuk (Faktur Pembelian) Form
  const [selectedFormProduct, setSelectedFormProduct] = useState<Product | null>(null);
  const [formQty, setFormQty] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [formNo, setFormNo] = useState<string>(() => {
    const now = new Date();
    const yr = String(now.getFullYear()).slice(-2);
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    let seq = 1;
    try {
      const lastSeq = localStorage.getItem('gudang_last_form_no_seq_in') || localStorage.getItem('gudang_last_form_no_seq');
      if (lastSeq) {
        seq = parseInt(lastSeq, 10) + 1;
      }
    } catch (e) {
      console.warn(e);
    }
    const padded = String(seq).padStart(5, '0');
    return `${padded}-PI-${mo}-${yr}`;
  });
  const [suratJalanNo, setSuratJalanNo] = useState<string>('');
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [productModalSearch, setProductModalSearch] = useState<string>('');
  const [productModalRack, setProductModalRack] = useState<string>('all');
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const filteredModalProducts = useMemo(() => {
    let list = accessibleProducts;
    if (productModalRack !== 'all') {
      list = list.filter(p => p.location && p.location.trim().toLowerCase() === productModalRack.trim().toLowerCase());
    }
    if (!productModalSearch.trim()) return list;
    const q = productModalSearch.toLowerCase().trim();
    return list.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.location && p.location.toLowerCase().includes(q))
    );
  }, [accessibleProducts, productModalRack, productModalSearch]);

  const handleSelectProductFromModal = (prod: Product) => {
    setSelectedFormProduct(prod);
    setFormPrice(prod.price !== undefined && prod.price !== null && prod.price !== 0 ? String(prod.price) : '');
    setFormQty('');
    setShowProductModal(false);
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 120);
  };

  // Post-Transaction Barcode Label Print State (For Barang Masuk)
  const [showPostTxPrintModal, setShowPostTxPrintModal] = useState(false);
  const [postTxPrintItems, setPostTxPrintItems] = useState<{
    product: Product;
    qtyIn: number;
    printQty: number;
    selected: boolean;
  }[]>([]);
  const [isPrintingPostTxBarcodes, setIsPrintingPostTxBarcodes] = useState(false);

  const postTxBarcodePrintList = useMemo(() => {
    const list: { product: Product }[] = [];
    postTxPrintItems.forEach(item => {
      if (item.selected && item.printQty > 0) {
        for (let i = 0; i < item.printQty; i++) {
          list.push({ product: item.product });
        }
      }
    });
    return list;
  }, [postTxPrintItems]);

  const totalSelectedPostTxItems = useMemo(() => {
    return postTxPrintItems.filter(i => i.selected).length;
  }, [postTxPrintItems]);

  const handlePrintPostTxBarcodes = () => {
    if (postTxBarcodePrintList.length === 0) return;
    setIsPrintingPostTxBarcodes(true);
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print barcodes error:', err);
      } finally {
        setTimeout(() => {
          setIsPrintingPostTxBarcodes(false);
        }, 1500);
      }
    }, 600);
  };

  const filteredProductsForAudit = useMemo(() => {
    let list = accessibleProducts;
    
    if (adminLocationFilter !== 'all') {
      list = list.filter(p => p.location && p.location.trim().toLowerCase() === adminLocationFilter.trim().toLowerCase());
    }

    if (productTypeFilter === 'bahan') {
      list = list.filter(p => {
        const isBOM = p.category === 'Hasil BOM' || (boms && boms.some(b => 
          b.name.trim().toLowerCase() === p.name.trim().toLowerCase() && 
          b.location.trim().toLowerCase() === p.location.trim().toLowerCase()
        ));
        return !isBOM;
      });
    } else if (productTypeFilter === 'bom') {
      list = list.filter(p => {
        const isBOM = p.category === 'Hasil BOM' || (boms && boms.some(b => 
          b.name.trim().toLowerCase() === p.name.trim().toLowerCase() && 
          b.location.trim().toLowerCase() === p.location.trim().toLowerCase()
        ));
        return isBOM;
      });
    }

    return list;
  }, [accessibleProducts, productTypeFilter, boms, adminLocationFilter]);

  // Set default filter for restricted users
  useEffect(() => {
    if (isUserRestricted && adminLocationFilter === 'all' && userAllowedLocations.length > 0) {
      setAdminLocationFilter(userAllowedLocations[0]);
    }
  }, [isUserRestricted, userAllowedLocations, adminLocationFilter]);

  const formatAuditDateRange = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return '';
    try {
      const d1 = new Date(startStr);
      const d2 = new Date(endStr);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        const option: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if (startStr === endStr) {
          return d1.toLocaleDateString('id-ID', option);
        }
        return `${d1.toLocaleDateString('id-ID', option)} s/d ${d2.toLocaleDateString('id-ID', option)}`;
      }
    } catch (err) {
      console.warn(err);
    }
    return `${startStr} s/d ${endStr}`;
  };

  const getOpnameColumns = () => {
    if (!opnameStartDate || !opnameEndDate) return [];
    try {
      const start = new Date(opnameStartDate);
      const end = new Date(opnameEndDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
      if (start > end) return [];

      const cols: string[] = [];
      const current = new Date(start);
      // Safety limit to avoid huge columns breaking grid (e.g. 31 days)
      let limit = 0;
      while (current <= end && limit < 31) {
        const pad = (n: number) => String(n).padStart(2, '0');
        cols.push(pad(current.getDate()));
        current.setDate(current.getDate() + 1);
        limit++;
      }
      return cols;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const opnameCols = getOpnameColumns();
  const opnameColWidth = opnameCols.length > 0 ? `${(56 / opnameCols.length).toFixed(2)}%` : '5.6%';
  
  // Scanned status popup modal state
  const [scanPopup, setScanPopup] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
    sku: string;
    productName?: string;
    imageUrl?: string;
  } | null>(null);
  
  // Multi-item transaction cart
  interface CartItem {
    product: Product;
    qty: number | string;
    price?: number | string;
    note: string;
    batchNumber?: string;
    expiryDate?: string;
    location?: string;
  }
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('gudang_active_cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const handleAddRowToCart = () => {
    if (!selectedFormProduct) {
      setShowProductModal(true);
      return;
    }
    const parsedQty = parseFloat(String(formQty).replace(/,/g, '.')) || 0;
    if (parsedQty <= 0) {
      alert('Kuantitas (Qty) harus lebih besar dari 0!');
      qtyInputRef.current?.focus();
      return;
    }
    if (actionType === 'out') {
      const existingInCart = cartItems.find(item => item.product.id === selectedFormProduct.id);
      const currentCartQty = existingInCart ? (parseFloat(String(existingInCart.qty).replace(/,/g, '.')) || 0) : 0;
      if (selectedFormProduct.qty < (currentCartQty + parsedQty)) {
        alert(`⚠️ PERINGATAN STOK KURANG: Stok tidak mencukupi untuk "${selectedFormProduct.name}"!\n\nStok tersedia: ${selectedFormProduct.qty} unit.\nKuantitas diinput: ${currentCartQty + parsedQty} unit.\n\nInput tetap diperbolehkan.`);
      }
    }
    const parsedPrice = formPrice !== '' ? (parseFloat(String(formPrice).replace(/,/g, '.')) || 0) : (selectedFormProduct.price || 0);
    const targetLoc = adminLocationFilter !== 'all' ? adminLocationFilter : (selectedFormProduct.location || 'Rak A-01');

    setCartItems(prev => {
      const existingIndex = prev.findIndex(item => item.product.id === selectedFormProduct.id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        const currentQty = parseFloat(String(updated[existingIndex].qty).replace(/,/g, '.')) || 0;
        updated[existingIndex] = {
          ...updated[existingIndex],
          qty: currentQty + parsedQty,
          price: parsedPrice,
          note: formNote.trim() || updated[existingIndex].note,
          location: targetLoc
        };
        return updated;
      } else {
        const nextBatch = generateNextBatchNumber(selectedFormProduct.batches || [], selectedFormProduct.sku || 'LOT');
        return [
          ...prev,
          {
            product: selectedFormProduct,
            qty: parsedQty,
            price: parsedPrice,
            note: formNote.trim(),
            location: targetLoc,
            batchNumber: nextBatch
          }
        ];
      }
    });

    // Reset row inputs
    setSelectedFormProduct(null);
    setFormQty('');
    setFormPrice('');
    setFormNote('');
  };

  const totalInvoiceAmount = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      const q = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
      const p = parseFloat(String(item.price !== undefined ? item.price : (item.product.price || 0)).replace(/,/g, '.')) || 0;
      return acc + (q * p);
    }, 0);
  }, [cartItems]);

  const [autoConsumeItemIds, setAutoConsumeItemIds] = useState<{[productId: string]: boolean}>({});

  // Transaction forms
  const [actionType, setActionType] = useState<'in' | 'out' | 'transfer' | 'audit' | 'adjust'>('in');
  const prevActionTypeRef = useRef<string>(actionType);
  const [originWarehouse, setOriginWarehouse] = useState(getDefaultOrigin);
  const [targetWarehouse, setTargetWarehouse] = useState(getDefaultTarget);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Persist active cart to sessionStorage so it survives tab switching or re-renders
  useEffect(() => {
    try {
      if (cartItems.length > 0) {
        sessionStorage.setItem('gudang_active_cart', JSON.stringify(cartItems));
      } else {
        sessionStorage.removeItem('gudang_active_cart');
      }
    } catch {}
  }, [cartItems]);

  // Effect to synchronize sequential form number with transactions database
  useEffect(() => {
    async function syncFormNo() {
      try {
        const { dbService } = await import('../lib/databaseService');
        const transactions = await dbService.getTransactions();
        let maxSequence = 0;
        
        const isOut = actionType === 'out';
        const targetType = isOut ? 'out' : 'in';
        const prefix = isOut ? 'PO' : 'PI';
        const storageKey = isOut ? 'gudang_last_form_no_seq_out' : 'gudang_last_form_no_seq_in';
        
        transactions.forEach(t => {
          if (t.type === targetType && t.note) {
            const match = isOut
              ? (t.note.match(/Faktur Penjualan \/ SJ (\d+)/i) || t.note.match(/(\d{5})-PO/))
              : (t.note.match(/Faktur Pembelian (\d+)/i) || t.note.match(/(\d{5})-PI/));
            if (match && match[1]) {
              const seq = parseInt(match[1], 10);
              if (!isNaN(seq) && seq > maxSequence) {
                maxSequence = seq;
              }
            }
          }
        });

        const currentSaved = parseInt(localStorage.getItem(storageKey) || '0', 10);
        const resolvedSeq = Math.max(maxSequence, currentSaved);
        
        const nextSequence = resolvedSeq + 1;
        
        const now = new Date();
        const yr = String(now.getFullYear()).slice(-2);
        const mo = String(now.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(nextSequence).padStart(5, '0');
        
        setFormNo(`${paddedSeq}-${prefix}-${mo}-${yr}`);
      } catch (e) {
        console.warn('Failed to sync sequential form number with db, relying on local state', e);
      }
    }
    
    if (actionType === 'in' || actionType === 'out') {
      syncFormNo();
    }
  }, [actionType, cartItems]);

  const [loadingProgress, setLoadingProgress] = useState<{
    isOpen: boolean;
    percentage: number;
    title?: string;
    detail?: string;
    currentItem?: number;
    totalItems?: number;
  } | null>(null);

  // Uncounted products popup modal state for Stok Opname
  const [showUncountedModal, setShowUncountedModal] = useState(false);
  const [uncountedSearchQuery, setUncountedSearchQuery] = useState('');

  const [transactionDate, setTransactionDate] = useState<string>(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
    return localISOTime;
  });

  // Sync actionType if initialIntent changes
  useEffect(() => {
    if (initialIntent === 'out') {
      setActionType('out');
    } else if (initialIntent === 'transfer') {
      setActionType('transfer');
      setOriginWarehouse(getDefaultOrigin());
      setTargetWarehouse(getDefaultTarget());
    } else if (initialIntent === 'audit') {
      setActionType('audit');
    } else if (initialIntent === 'adjust') {
      setActionType('adjust');
    } else {
      setActionType('in');
    }
  }, [initialIntent]);

  // Keep product information in cartItems up to date when inventory changes in background, without wiping user inputs
  useEffect(() => {
    setCartItems(prev => {
      let changed = false;
      const updated = prev.map(item => {
        const fresh = products.find(p => p.id === item.product.id);
        if (fresh && fresh !== item.product) {
          changed = true;
          return { ...item, product: fresh };
        }
        return item;
      });
      return changed ? updated : prev;
    });
  }, [products]);

  // Uncounted products for active Stok Opname (in selected sector or scope)
  const uncountedAuditProducts = useMemo(() => {
    if (actionType !== 'audit') return [];
    const countedIdSet = new Set(cartItems.map(item => item.product.id));
    return filteredProductsForAudit.filter(p => !countedIdSet.has(p.id));
  }, [actionType, cartItems, filteredProductsForAudit]);

  const filteredModalUncounted = useMemo(() => {
    if (!uncountedSearchQuery.trim()) return uncountedAuditProducts;
    const q = uncountedSearchQuery.toLowerCase().trim();
    return uncountedAuditProducts.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.location && p.location.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }, [uncountedAuditProducts, uncountedSearchQuery]);

  const handleAddProductToAudit = (prod: Product, initialQty?: number) => {
    setCartItems(prev => {
      const exists = prev.some(item => item.product.id === prod.id);
      if (exists) return prev;
      return [...prev, {
        product: prod,
        qty: initialQty !== undefined ? initialQty : prod.qty,
        note: '',
      }];
    });
  };

  const handleAddAllUncountedToAudit = (defaultToSystem: boolean = false) => {
    setCartItems(prev => {
      const existingIds = new Set(prev.map(i => i.product.id));
      const newItems: CartItem[] = [];
      for (const prod of filteredProductsForAudit) {
        if (!existingIds.has(prod.id)) {
          newItems.push({
            product: prod,
            qty: defaultToSystem ? prod.qty : 0,
            note: '',
          });
        }
      }
      return [...prev, ...newItems];
    });
  };

  // Cart operations helpers
  const handleRemoveFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleUpdateCartQty = (productId: string, newQty: number | string) => {
    if (typeof newQty === 'string') {
      setCartItems(prev => prev.map(item => {
        if (item.product.id === productId) {
          return { ...item, qty: newQty };
        }
        return item;
      }));
      return;
    }

    if (actionType === 'audit') {
      if (newQty < 0) return;
    } else {
      if (newQty < 0) return;
    }
    setCartItems(prev => prev.map(item => {
      if (item.product.id === productId) {
        const roundedQty = Math.round(newQty * 1000) / 1000;
        return { ...item, qty: roundedQty };
      }
      return item;
    }));
  };

  const handleUpdateCartNote = (productId: string, note: string) => {
    setCartItems(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, note };
      }
      return item;
    }));
  };

  const handleUpdateCartPrice = (productId: string, newPrice: number | string) => {
    setCartItems(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, price: newPrice };
      }
      return item;
    }));
  };

  const handleUpdateCartBatchNumber = (productId: string, batchNumber: string) => {
    setCartItems(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, batchNumber };
      }
      return item;
    }));
  };

  const handleUpdateCartExpiryDate = (productId: string, expiryDate: string) => {
    setCartItems(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, expiryDate };
      }
      return item;
    }));
  };

  const handleUpdateCartLocation = (productId: string, location: string) => {
    setCartItems(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, location };
      }
      return item;
    }));
  };

  const handleClearCart = () => {
    setCartItems([]);
    setScannedProduct(null);
    try {
      sessionStorage.removeItem('gudang_active_cart');
    } catch {}
  };

  // Simulated Camera UI States
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isScannerExpanded, setIsScannerExpanded] = useState(false);
  const [realCameraDeviceAvailable, setRealCameraDeviceAvailable] = useState<boolean>(false);
  const [simulatedLinePosition, setSimulatedLinePosition] = useState(10);
  const [isScanningSimulated, setIsScanningSimulated] = useState(false);

  const lastScannedCodeRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  // Animated laser scan effect falling down and rising up
  useEffect(() => {
    let interval: any;
    if (isCameraActive) {
      interval = setInterval(() => {
        setSimulatedLinePosition((prev) => {
          if (prev >= 90) return 10;
          return prev + 2.5;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isCameraActive]);

  // Keep a ref of handleScanSKU to prevent stale closure capture in the third-party lib callback
  const scanCallbackRef = useRef<(code: string) => void>(() => {});
  useEffect(() => {
    scanCallbackRef.current = handleScanSKU;
  }, [handleScanSKU]);

  // Auto-close barcode scan popup after 1.5 seconds for snappier workflow
  useEffect(() => {
    if (scanPopup && scanPopup.isOpen) {
      const timer = setTimeout(() => {
        setScanPopup(prev => prev ? { ...prev, isOpen: false } : null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [scanPopup]);

  // Handle camera starting and stopping with real barcode decoding via html5-qrcode
  useEffect(() => {
    let qrScanner: any = null;
    let isMounted = true;

    async function startScanner() {
      if (!isCameraActive) return;

      const elementId = "qr-reader-viewport";
      const element = document.getElementById(elementId);
      if (!element) {
        // Retry shortly if node is not yet rendered in DOM
        setTimeout(() => {
          if (isMounted && isCameraActive && isScannerExpanded) {
            startScanner();
          }
        }, 150);
        return;
      }

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (!isMounted || !isCameraActive || !isScannerExpanded) return;

        qrScanner = new Html5Qrcode(elementId, {
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

        const qrCodeSuccessCallback = (decodedText: string, decodedResult: any) => {
          const now = Date.now();
          const cleanCode = decodedText.trim();
          
          // Debounce duplicate barcode within 3 seconds, or any scan within 1.5 seconds to limit spam
          if (
            (cleanCode === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 3000) ||
            (now - lastScannedTimeRef.current < 1500)
          ) {
            return;
          }

          lastScannedCodeRef.current = cleanCode;
          lastScannedTimeRef.current = now;

          console.log("Barcode match deciphered:", cleanCode);
          if (scanCallbackRef.current) {
            scanCallbackRef.current(cleanCode);
          }
        };

        const config = {
          fps: 12,
          qrbox: (width: number, height: number) => {
            // Dynamic scanner active horizontal box
            const qrWidth = Math.min(width, 400) * 0.8;
            const qrHeight = Math.min(height, 250) * 0.55;
            return { width: Math.max(220, qrWidth), height: Math.max(110, qrHeight) };
          },
          aspectRatio: 1.3333333
        };
        
        if (!isMounted || !isCameraActive || !isScannerExpanded) return;

        await qrScanner.start(
          { facingMode: "environment" },
          config,
          qrCodeSuccessCallback,
          () => {} // Silent on intermediate frames with no decode hits
        );

        if (isMounted) {
          setRealCameraDeviceAvailable(true);
        }
      } catch (e) {
        console.warn("Could not start real camera barcode scanner (either camera blocked or sandbox constraints):", e);
        if (isMounted) {
          setRealCameraDeviceAvailable(false);
        }
      }
    }

    startScanner();

    return () => {
      isMounted = false;
      if (qrScanner) {
        if (qrScanner.isScanning) {
          qrScanner.stop().catch((e: any) => console.warn("Failed to stop QrScanner on unmount/rebuilding:", e));
        }
      }
    };
  }, [isCameraActive, isScannerExpanded]);

  // Triggering scanned action on SKU matching
  function handleScanSKU(code: string) {
    setIsScanningSimulated(true);
    setScanMessage(null);
    
    // Quick laser indicator flash
    setTimeout(() => {
      setIsScanningSimulated(false);
    }, 150);

    const cleanedCode = code.trim();
    const rawProduct = products.find(p => p.sku === cleanedCode);

    const userLocs = currentUser.location ? currentUser.location.split(',').map(l => l.trim().toLowerCase()) : [];
    if (rawProduct && isUserRestricted && !userLocs.includes(rawProduct.location.trim().toLowerCase())) {
      setScannedProduct(null);
      setScanMessage({
        type: 'error',
        text: `Akses Ditolak: Produk "${rawProduct.name}" berada di lokasi "${rawProduct.location}", sedangkan Anda hanya diizinkan untuk mengakses lokasi "${currentUser.location}".`
      });

      // Set Popup for Access Denied Error
      setScanPopup({
        isOpen: true,
        type: 'error',
        title: 'Pemindaian Gagal / Akses Ditolak!',
        message: `Produk "${rawProduct.name}" berada di lokasi "${rawProduct.location}", bukan di lokasi Anda (${currentUser.location}).`,
        sku: cleanedCode,
        productName: rawProduct.name,
        imageUrl: rawProduct.imageUrl
      });
      return;
    }

    const product = accessibleProducts.find(p => p.sku === cleanedCode);

    if (product) {
      if (actionType === 'in' || actionType === 'out') {
        setSelectedFormProduct(product);
        setFormPrice(product.price ? String(product.price) : '');
      }
      setScannedProduct(product);
      setScanMessage({
        type: 'success',
        text: `Barcode ${cleanedCode} Terbaca! "${product.name}" ditambahkan ke keranjang.`
      });

      // Set Popup for Scan Success
      setScanPopup({
        isOpen: true,
        type: 'success',
        title: 'Scan Barcode Sukses!',
        message: `Produk "${product.name}" berhasil dikenali dan ditambahkan ke keranjang transaksi.`,
        sku: cleanedCode,
        productName: product.name,
        imageUrl: product.imageUrl
      });
      
      // Auto-add or increment in cart
      setCartItems(prev => {
        const existsIndex = prev.findIndex(item => item.product.id === product.id);
        if (existsIndex > -1) {
          const updated = [...prev];
          updated[existsIndex] = {
            ...updated[existsIndex],
            qty: (parseFloat(String(updated[existsIndex].qty).replace(/,/g, '.')) || 0) + 1
          };
          return updated;
        } else {
          const initialQty = (actionType === 'audit' || actionType === 'adjust') ? product.qty : 1;
          const matchingBOM = boms?.find(b => 
            b.name.trim().toLowerCase() === product.name.trim().toLowerCase() && 
            b.location.trim().toLowerCase() === product.location.trim().toLowerCase()
          );
          if (matchingBOM) {
            setAutoConsumeItemIds(prevAuto => ({ ...prevAuto, [product.id]: true }));
          }
          const nextDefaultBatch = actionType === 'in'
            ? generateNextBatchNumber([...products, ...prev], 'LOT')
            : (product.batchNumber || generateNextBatchNumber(products, 'LOT'));
          return [...prev, { 
            product, 
            qty: initialQty, 
            price: product.price, 
            note: '',
            batchNumber: nextDefaultBatch,
            expiryDate: product.expiryDate || ''
          }];
        }
      });

      onAddLog('Scan Barcode Sukses', currentUser.name, `Memindai SKU / Barcode: ${cleanedCode}`);
    } else {
      setScannedProduct(null);
      setScanMessage({
        type: 'error',
        text: `Barcode ${cleanedCode} terbaca, namun tidak terdaftar di inventaris gudang!`
      });

      // Set Popup for Unregistered Barcode Error
      setScanPopup({
        isOpen: true,
        type: 'error',
        title: 'Barcode Tidak Terdaftar!',
        message: `SKU atau kode Barcode "${cleanedCode}" belum terdaftar di database sistem gudang.`,
        sku: cleanedCode
      });

      onAddLog('Scan Barcode Gagal', currentUser.name, `Mencoba memindai SKU tak dikenal: ${cleanedCode}`);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuInput) return;
    handleScanSKU(skuInput);
    setSkuInput('');
    setShowSearchDropdown(false);
  };

  const filteredSearchProducts = useMemo(() => {
    let list = accessibleProducts;
    
    if (currentUser.role === 'admin' && adminLocationFilter !== 'all') {
      list = list.filter(p => p.location && p.location.trim().toLowerCase() === adminLocationFilter.trim().toLowerCase());
    }

    if (productTypeFilter === 'bahan') {
      list = list.filter(p => {
        const isBOM = p.category === 'Hasil BOM' || (boms && boms.some(b => 
          b.name.trim().toLowerCase() === p.name.trim().toLowerCase() && 
          b.location.trim().toLowerCase() === p.location.trim().toLowerCase()
        ));
        return !isBOM;
      });
    } else if (productTypeFilter === 'bom') {
      list = list.filter(p => {
        const isBOM = p.category === 'Hasil BOM' || (boms && boms.some(b => 
          b.name.trim().toLowerCase() === p.name.trim().toLowerCase() && 
          b.location.trim().toLowerCase() === p.location.trim().toLowerCase()
        ));
        return isBOM;
      });
    }

    if (!skuInput) return list.slice(0, 5); // Show first 5 if empty
    const query = skuInput.toLowerCase();
    return list.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.sku.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query)
    ).slice(0, 10); // Limit results
  }, [skuInput, accessibleProducts, productTypeFilter, boms, currentUser.role, adminLocationFilter]);

  const opnameProductsToPrint = useMemo(() => {
    const selectedLoc = adminLocationFilter;
    if (selectedLoc === 'all') {
      return products;
    }
    return products.filter(p => p.location && p.location.trim().toLowerCase() === selectedLoc.trim().toLowerCase());
  }, [products, adminLocationFilter]);

  const handlePrintOpnameSheet = () => {
    const locName = adminLocationFilter === 'all' ? 'Semua Sektor / Rak' : adminLocationFilter;
    setPrintingOpnameLocation(locName);
    setIsPrintingOpname(true);
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print stock opname failed:', err);
      } finally {
        setTimeout(() => {
          setIsPrintingOpname(false);
        }, 1200);
      }
    }, 400);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // RBAC check: Staff can do transaction, supervisor and admin can as well.
    // But check authorization
    if (!currentUser.permissions.canRecordTransaction) {
      alert('Anda tidak memiliki izin merekam transaksi logistik.');
      return;
    }

    // Validasi Stok Opname: TIDAK BOLEH SELESAI jika ada barang yang belum dihitung!
    if (actionType === 'audit') {
      if (filteredProductsForAudit.length === 0) {
        alert('Tidak ada barang terdaftar di sektor / rak ini untuk dihitung.');
        return;
      }

      const uncounted = filteredProductsForAudit.filter(
        expectedProd => !cartItems.some(item => item.product.id === expectedProd.id)
      );

      if (uncounted.length > 0) {
        setShowUncountedModal(true);
        return; // Tidak boleh selesai, tampilkan modal popup barang yang belum dihitung
      }
    }

    if (cartItems.length === 0) {
      alert('Keranjang transaksi kosong. Pindai atau cari barang terlebih dahulu.');
      return;
    }

    // Safety checks
    for (const item of cartItems) {
      const parsedQty = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
      if (actionType !== 'audit' && parsedQty <= 0) {
        alert(`Jumlah unit untuk "${item.product.name}" harus lebih besar dari 0.`);
        return;
      }
      if (actionType === 'audit' && parsedQty < 0) {
        alert(`Hitung fisik untuk "${item.product.name}" tidak boleh kurang dari 0.`);
        return;
      }
    }

    if (actionType === 'out' || actionType === 'transfer') {
      let overdrawnItems: string[] = [];
      for (const item of cartItems) {
        const parsedQty = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
        if (item.product.qty < parsedQty) {
          overdrawnItems.push(`- ${item.product.name} (Stok: ${item.product.qty}, Keluar: ${parsedQty})`);
        }
      }
      if (overdrawnItems.length > 0) {
        alert(`⚠️ PERINGATAN STOK KURANG:\n\nTransaksi berikut melebihi stok tersedia:\n${overdrawnItems.join('\n')}\n\nTransaksi tetap akan diproses.`);
      }
    }

    if (actionType === 'transfer' && originWarehouse === targetWarehouse) {
      alert('Gudang asal dan gudang tujuan tidak boleh sama!');
      return;
    }

    try {
      setIsSubmitting(true);
      const customIsoDate = transactionDate ? new Date(transactionDate).toISOString() : undefined;
      const totalCount = cartItems.length;

      const actionTitle = 
        actionType === 'in' ? 'Barang Masuk (IN)' :
        actionType === 'out' ? 'Barang Keluar (OUT)' :
        actionType === 'transfer' ? 'Mutasi Barang' :
        actionType === 'audit' ? 'Stok Opname' :
        'Penyesuaian Stok';

      setLoadingProgress({
        isOpen: true,
        percentage: 15,
        title: `Menyimpan Transaksi ${actionTitle}`,
        detail: `Menyimpan ${totalCount} item transaksi ke database...`,
        currentItem: 0,
        totalItems: totalCount
      });

      // Save all cart items as transactions
      const itemsToRecord: any[] = [];
      
      const batchTimestamp = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const yr = String(batchTimestamp.getFullYear()).slice(-2);
      const mo = pad(batchTimestamp.getMonth() + 1);
      const dy = pad(batchTimestamp.getDate());
      const hr = pad(batchTimestamp.getHours());
      const mn = pad(batchTimestamp.getMinutes());
      const sc = pad(batchTimestamp.getSeconds());
      const timeStr = `${dy}${mo}${yr}-${hr}${mn}${sc}`;
      
      const batchFormNo = actionType === 'audit' || actionType === 'adjust'
        ? `OP-${timeStr}`
        : actionType === 'transfer'
          ? `TR-${timeStr}`
          : formNo; // Default to formNo state for in/out
      
      for (const item of cartItems) {
        const parsedQty = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
        
        if (actionType === 'audit' || actionType === 'adjust') {
          // Calculate difference
          const diff = parsedQty - item.product.qty;
          const defaultNote = actionType === 'adjust'
            ? `Penyesuaian Stok Opname. Stok Sistem: ${item.product.qty} | Stok Fisik: ${parsedQty} | Penyesuaian: ${diff > 0 ? '+' : ''}${diff}`
            : `Audit Stok Opname berkala. Sistem: ${item.product.qty} | Fisik: ${parsedQty} | Selisih: ${diff > 0 ? '+' : ''}${diff}`;
          const noteToSave = item.note.trim() 
            ? `${item.note.trim()} (${defaultNote}) [Form: ${batchFormNo}]` 
            : `${defaultNote} [Form: ${batchFormNo}]`;
          
          if (diff > 0) {
            itemsToRecord.push({
              productId: item.product.id,
              productName: item.product.name,
              sku: item.product.sku,
              type: 'in',
              qty: diff,
              note: noteToSave,
              isAudit: true,
              systemQty: item.product.qty,
              physicalQty: parsedQty,
              difference: diff,
              customDate: customIsoDate,
              location: item.location || item.product.location || 'Rak A-01'
            });
          } else if (diff < 0) {
            itemsToRecord.push({
              productId: item.product.id,
              productName: item.product.name,
              sku: item.product.sku,
              type: 'out',
              qty: Math.abs(diff),
              note: noteToSave,
              isAudit: true,
              systemQty: item.product.qty,
              physicalQty: parsedQty,
              difference: diff,
              customDate: customIsoDate,
              location: item.location || item.product.location || 'Rak A-01'
            });
          } else {
            itemsToRecord.push({
              productId: item.product.id,
              productName: item.product.name,
              sku: item.product.sku,
              type: 'in',
              qty: 0,
              note: noteToSave,
              isAudit: true,
              systemQty: item.product.qty,
              physicalQty: parsedQty,
              difference: diff,
              customDate: customIsoDate,
              location: item.location || item.product.location || 'Rak A-01'
            });
          }
        } else {
          if (actionType === 'transfer') {
            const defaultNote = `Inisiasi Mutasi dari ${originWarehouse} ke ${targetWarehouse}`;
            const noteToSave = item.note.trim() 
              ? `${item.note.trim()} (${defaultNote}) [Form: ${batchFormNo}]` 
              : `${defaultNote} [Form: ${batchFormNo}]`;
            itemsToRecord.push({
              productId: item.product.id,
              productName: item.product.name,
              sku: item.product.sku,
              isTransfer: true,
              qty: parsedQty,
              note: noteToSave,
              originWarehouse,
              targetWarehouse,
              customDate: customIsoDate,
              location: originWarehouse || item.location || item.product.location || 'Rak A-01'
            });
          } else {
            const savedType: 'in' | 'out' = actionType === 'in' ? 'in' : 'out';
            const defaultNote = actionType === 'in' 
              ? `Faktur Pembelian ${formNo}${suratJalanNo.trim() ? ` (SJ: ${suratJalanNo.trim()})` : ''}` 
              : actionType === 'out'
                ? `Faktur Penjualan / PO ${formNo}${suratJalanNo.trim() ? ` (SJ: ${suratJalanNo.trim()})` : ''}`
                : 'Pengeluaran via multi-item (Multi-Item)';
                
            const noteToSave = item.note.trim() 
              ? `${item.note.trim()} (${defaultNote}) [Form: ${formNo}]` 
              : `${defaultNote} [Form: ${formNo}]`;
            const itemPriceRaw = item.price !== undefined ? item.price : item.product.price;
            const parsedPrice = parseFloat(String(itemPriceRaw).replace(/,/g, '.')) || 0;
            
            itemsToRecord.push({
              productId: item.product.id,
              productName: item.product.name,
              sku: item.product.sku,
              type: savedType,
              qty: parsedQty,
              note: noteToSave,
              customDate: customIsoDate,
              newPrice: actionType === 'in' ? parsedPrice : undefined,
              batchNumber: actionType === 'in' ? (item.batchNumber || item.product.batchNumber) : undefined,
              expiryDate: actionType === 'in' ? (item.expiryDate || item.product.expiryDate) : undefined,
              location: item.location || item.product.location || 'Rak A-01'
            });

            // AUTO-CONSUME BOM INTEGRATION
            if (autoConsumeItemIds[item.product.id]) {
              const matchingBOM = boms.find(b => 
                b.name.trim().toLowerCase() === item.product.name.trim().toLowerCase() && 
                b.location.trim().toLowerCase() === item.product.location.trim().toLowerCase()
              );
              if (matchingBOM) {
                const batchCount = parsedQty / (matchingBOM.yieldQty || 1);
                // Process each ingredient
                for (const component of matchingBOM.items) {
                  const matchedCompProduct = products.find(p => 
                    p.name.trim().toLowerCase() === component.productName.trim().toLowerCase() && 
                    p.location.trim().toLowerCase() === item.product.location.trim().toLowerCase()
                  );
                  if (matchedCompProduct) {
                    const reqQty = component.qty * batchCount;
                    const compNote = `Dipotong otomatis untuk perakitan BOM "${item.product.name}" (${parsedQty} ${matchingBOM.yieldUnit}) [Form: ${formNo}]`;
                    itemsToRecord.push({
                      productId: matchedCompProduct.id,
                      productName: matchedCompProduct.name,
                      sku: matchedCompProduct.sku,
                      type: 'out',
                      qty: reqQty,
                      note: compNote,
                      customDate: customIsoDate,
                      location: matchedCompProduct.location || item.product.location || 'Rak A-01'
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Execute atomic batch insert/update
      if (onRecordMultipleChanges) {
        await onRecordMultipleChanges(itemsToRecord);
      } else {
        // Fallback sequentially if not defined
        for (const record of itemsToRecord) {
          if (record.isTransfer) {
            await onInitiateTransfer(record.productId, record.originWarehouse, record.targetWarehouse, record.qty, record.note, record.customDate);
          } else {
            await onRecordStockChange(
              record.productId,
              record.type,
              record.qty,
              record.note,
              record.isAudit,
              record.systemQty,
              record.physicalQty,
              record.difference,
              record.customDate,
              record.newPrice,
              record.batchNumber,
              record.expiryDate,
              record.location
            );
          }
        }
      }

      // Complete progress to 100% immediately
      setLoadingProgress({
        isOpen: true,
        percentage: 100,
        title: `Transaksi ${actionTitle} Selesai!`,
        detail: `Berhasil menyimpan ${totalCount} item transaksi.`,
        currentItem: totalCount,
        totalItems: totalCount
      });

      // Quick visual feedback (100ms) so user sees confirmation without waiting
      await new Promise(resolve => setTimeout(resolve, 100));

      setScanMessage({
        type: 'success',
        text: actionType === 'transfer'
          ? `Permintaan transfer stok dari "${originWarehouse}" ke "${targetWarehouse}" telah diajukan! Menunggu persetujuan (approval) oleh personil di gudang tujuan agar barang bertambah di sana.`
          : actionType === 'adjust'
            ? `Berhasil melakukan penyesuaian stok opname untuk ${cartItems.length} produk sekaligus! Stok di inventaris telah diperbarui.`
            : actionType === 'audit'
              ? `Berhasil mencatatkan audit Stok Opname untuk ${cartItems.length} produk sekaligus!`
              : `Berhasil mencatatkan transaksi ${actionType === 'in' ? 'masuk' : 'keluar'} untuk ${cartItems.length} produk sekaligus!`
      });

      // Populate post-transaction print items list if Barang Masuk
      if (actionType === 'in' && cartItems.length > 0) {
        const printItemsList = cartItems.map(item => {
          const parsedQty = Math.max(1, Math.round(parseFloat(String(item.qty).replace(/,/g, '.')) || 1));
          return {
            product: item.product,
            qtyIn: parsedQty,
            printQty: parsedQty,
            selected: true,
          };
        });
        setPostTxPrintItems(printItemsList);
        setShowPostTxPrintModal(true);
      }

      // Clear basket on success
      if (actionType === 'in' || actionType === 'out') {
        const currentSeqMatch = formNo.match(/^(\d+)/);
        if (currentSeqMatch) {
          const seqNum = parseInt(currentSeqMatch[1], 10);
          const storageKey = actionType === 'out' ? 'gudang_last_form_no_seq_out' : 'gudang_last_form_no_seq_in';
          localStorage.setItem(storageKey, String(seqNum));
        }
      }
      setCartItems([]);
      setScannedProduct(null);
      try {
        sessionStorage.removeItem('gudang_active_cart');
      } catch {}
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat merekam transaksi.');
    } finally {
      setIsSubmitting(false);
      setLoadingProgress(null);
    }
  };

  return (
    <div className="space-y-6" id="scanner-view-workspace">
      {((currentAction: string) => (currentAction === 'in' || currentAction === 'out') ? (
        /* ==================== FORM TRANSAKSI BARANG MASUK (FAKTUR PEMBELIAN) ==================== */
        <div className="w-full space-y-0 animate-in fade-in duration-200">
          {/* Header Biru: Faktur Pembelian */}
          <div className="w-full bg-[#0080ff] text-white px-4 sm:px-6 py-3.5 rounded-t-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-black tracking-wide text-white">
                {currentAction === 'in' ? 'Faktur Pembelian' : 'Faktur Penjualan / Barang Keluar'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  title="Tutup / Kembali"
                  className="w-7 h-7 rounded-full border border-white/80 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Optional Scanner Kamera bila dibuka */}
          <AnimatePresence>
            {isScannerExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-black p-3 border-x border-blue-200 dark:border-zinc-800"
              >
                <div className="relative rounded-xl border-2 border-white/20 bg-zinc-950 overflow-hidden h-[240px] flex flex-col justify-between">
                  {isCameraActive && (
                    <div className="absolute inset-0 w-full h-full bg-black overflow-hidden">
                      <div 
                        id="qr-reader-viewport" 
                        className="w-full h-full [&>video]:absolute [&>video]:inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover overflow-hidden bg-black"
                      />
                      <div 
                        className="absolute left-0 right-0 h-0.5 bg-rose-500 shadow-[0_0_12px_#f43f5e] z-10 transition-all duration-75"
                        style={{ top: `${simulatedLinePosition}%` }}
                      />
                    </div>
                  )}
                  <div className="relative z-10 p-2 flex justify-between items-center bg-gradient-to-b from-black/70 to-transparent">
                    <span className="text-[11px] text-white/90 font-mono font-bold">Arahkan barcode / QR code barang ke kamera</span>
                    <button
                      type="button"
                      onClick={() => setIsScannerExpanded(false)}
                      className="text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded font-bold cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form Card: Background biru-abu muda matching desain faktur */}
          <div className="bg-[#eaf2fb] dark:bg-zinc-900 border-x border-b border-blue-200 dark:border-zinc-800 p-4 sm:p-6 rounded-b-xl shadow-xs space-y-6">
            {/* Bagian Atas: Filter Rak, Tgl Invoice, Form No, No Srt Jalan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-8 items-start">
              {/* Kolom Kiri: Filter Rak & Tgl Invoice */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 w-28 shrink-0">
                    Filter Rak
                  </label>
                  <div className="flex-1 min-w-0">
                    <select
                      value={adminLocationFilter}
                      onChange={(e) => setAdminLocationFilter(e.target.value)}
                      className="w-full max-w-sm px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 dark:text-zinc-200 focus:outline-blue-500 font-medium cursor-pointer shadow-2xs"
                    >
                      {!isUserRestricted && <option value="all">Semua Sektor / Rak</option>}
                      {availableRacks.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 w-28 shrink-0">
                    Tgl Invoice
                  </label>
                  <div className="flex-1 min-w-0">
                    <input
                      type="date"
                      value={transactionDate ? transactionDate.slice(0, 10) : ''}
                      onChange={(e) => {
                        const time = transactionDate ? transactionDate.slice(11) : '12:00';
                        setTransactionDate(`${e.target.value}T${time || '12:00'}`);
                      }}
                      className="w-full max-w-sm px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 dark:text-zinc-200 focus:outline-blue-500 font-mono cursor-pointer shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Kolom Kanan: Form No & No Srt Jalan */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 w-28 shrink-0">
                    Form No
                  </label>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={formNo}
                      readOnly
                      className="w-full max-w-sm px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-zinc-700 bg-gray-200/80 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-mono shadow-2xs cursor-not-allowed select-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 w-28 shrink-0">
                    {currentAction === 'in' ? 'No Srt Jalan' : 'No Srt Jalan / DO'}
                  </label>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={suratJalanNo}
                      onChange={(e) => setSuratJalanNo(e.target.value)}
                      placeholder="Nomor Surat Jalan..."
                      className="w-full max-w-sm px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 dark:text-zinc-200 focus:outline-blue-500 shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Baris Input Form Bahan: Kode Bahan, Nama Bahan, Qty, Satuan, Harga Beli, Catatan, + Button */}
            <div className="pt-2">
              <div className="flex flex-wrap lg:flex-nowrap gap-1.5 items-end">
                {/* Kode Bahan - Diklik muncul pop up data barang & Scanner Kamera disampingnya */}
                <div className="w-full sm:w-44 lg:w-44 shrink-0">
                  <div className="bg-[#0080ff] dark:bg-blue-600 text-white font-bold text-xs py-1 px-2 text-center uppercase tracking-wide">
                    Kode Bahan
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowProductModal(true)}
                      className="flex-1 min-w-0 h-9 bg-white dark:bg-zinc-800 hover:bg-blue-50/70 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-650 px-2 text-xs font-mono font-bold text-left flex items-center justify-between cursor-pointer transition-colors shadow-2xs"
                      title="Klik untuk memilih bahan"
                    >
                      <span className={selectedFormProduct ? "text-blue-700 dark:text-blue-400 font-bold truncate" : "text-gray-400 italic text-[11px]"}>
                        {selectedFormProduct ? selectedFormProduct.sku : 'Pilih...'}
                      </span>
                      <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsScannerExpanded(!isScannerExpanded)}
                      className={`w-9 h-9 shrink-0 flex items-center justify-center border transition-colors cursor-pointer shadow-2xs ${
                        isScannerExpanded
                          ? 'bg-[#0080ff] text-white border-blue-600'
                          : 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-zinc-650 hover:bg-blue-50 dark:hover:bg-zinc-700'
                      }`}
                      title={isScannerExpanded ? 'Tutup Scanner Kamera' : 'Buka Scanner Barcode Kamera'}
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Nama Bahan - Otomatis terisi */}
                <div className="w-full sm:flex-1 min-w-[180px]">
                  <div className="bg-[#0080ff] dark:bg-blue-600 text-white font-bold text-xs py-1 px-3 text-center uppercase tracking-wide">
                    Nama Bahan
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={selectedFormProduct ? selectedFormProduct.name : ''}
                    placeholder="Nama Bahan Otomatis"
                    className="w-full h-9 bg-gray-200/80 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200 font-bold text-xs px-3 border border-gray-300 dark:border-zinc-650 cursor-not-allowed select-none truncate"
                  />
                </div>

                {/* Qty */}
                <div className="w-20 sm:w-20 shrink-0">
                  <div className="bg-[#0080ff] dark:bg-blue-600 text-white font-bold text-xs py-1 px-1 text-center uppercase tracking-wide">
                    Qty
                  </div>
                  <input
                    ref={qtyInputRef}
                    type="text"
                    inputMode="decimal"
                    value={formQty}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^[0-9]*[.,]?[0-9]*$/.test(val)) {
                        setFormQty(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRowToCart();
                      }
                    }}
                    placeholder=""
                    className="w-full h-9 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white font-mono font-bold text-xs text-center px-1 border border-gray-300 dark:border-zinc-650 focus:outline-blue-500 shadow-2xs"
                  />
                </div>

                {/* Satuan */}
                <div className="w-24 sm:w-24 shrink-0">
                  <div className="bg-[#0080ff] dark:bg-blue-600 text-white font-bold text-xs py-1 px-2 text-center uppercase tracking-wide">
                    Satuan
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={selectedFormProduct ? (selectedFormProduct.purchaseUnit || selectedFormProduct.unit || 'UNIT') : ''}
                    placeholder=""
                    className="w-full h-9 bg-gray-200/80 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200 font-mono font-bold text-xs uppercase text-center px-2 border border-gray-300 dark:border-zinc-650 cursor-not-allowed select-none"
                  />
                </div>

                {/* Harga Beli */}
                <div className="w-28 sm:w-28 shrink-0">
                  <div className="bg-[#0080ff] dark:bg-blue-600 text-white font-bold text-xs py-1 px-2 text-center uppercase tracking-wide">
                    {currentAction === 'in' ? 'Harga Beli' : 'Harga Jual'}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^[0-9]*[.,]?[0-9]*$/.test(val)) {
                        setFormPrice(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRowToCart();
                      }
                    }}
                    placeholder=""
                    className="w-full h-9 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white font-mono font-bold text-xs text-right px-2.5 border border-gray-300 dark:border-zinc-650 focus:outline-blue-500 shadow-2xs"
                  />
                </div>

                {/* Catatan */}
                <div className="w-full sm:flex-1 min-w-[140px]">
                  <div className="bg-[#0080ff] dark:bg-blue-600 text-white font-bold text-xs py-1 px-2 text-center uppercase tracking-wide">
                    Catatan
                  </div>
                  <input
                    type="text"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRowToCart();
                      }
                    }}
                    placeholder="Catatan..."
                    className="w-full h-9 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-xs px-2.5 border border-gray-300 dark:border-zinc-650 focus:outline-blue-500 shadow-2xs"
                  />
                </div>

                {/* Tombol + : Memasukkan ke daftar barang transaksi */}
                <div className="shrink-0 self-end">
                  <button
                    type="button"
                    onClick={handleAddRowToCart}
                    className="w-9 h-9 bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xl rounded flex items-center justify-center cursor-pointer shadow-sm transition-transform active:scale-95"
                    title="Tambahkan barang ke daftar transaksi"
                  >
                    <Plus className="w-5 h-5 stroke-[3]" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tabel: Daftar Barang Transaksi */}
            <div className="overflow-x-auto rounded border border-blue-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#0080ff] dark:bg-blue-600 text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 text-center w-12 border-r border-blue-400 dark:border-blue-500">No</th>
                    <th className="py-2.5 px-3 border-r border-blue-400 dark:border-blue-500 whitespace-nowrap">Kode Bahan</th>
                    <th className="py-2.5 px-4 border-r border-blue-400 dark:border-blue-500">Nama Bahan</th>
                    <th className="py-2.5 px-3 text-center border-r border-blue-400 dark:border-blue-500 whitespace-nowrap">Jumlah</th>
                    <th className="py-2.5 px-3 text-center border-r border-blue-400 dark:border-blue-500 whitespace-nowrap">Satuan</th>
                    <th className="py-2.5 px-3 text-right border-r border-blue-400 dark:border-blue-500 whitespace-nowrap">{currentAction === 'in' ? 'Harga Beli' : 'Harga Jual'}</th>
                    <th className="py-2.5 px-3 text-right border-r border-blue-400 dark:border-blue-500 whitespace-nowrap">SubTotal</th>
                    <th className="py-2.5 px-3 border-r border-blue-400 dark:border-blue-500">Catatan</th>
                    <th className="py-2.5 px-3 text-center w-16 whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
                  {cartItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-gray-400 dark:text-zinc-500 italic bg-gray-50/50 dark:bg-zinc-900/50">
                        Daftar barang transaksi masih kosong. Klik pada <b>Kode Bahan</b> di atas untuk memilih barang.
                      </td>
                    </tr>
                  ) : (
                    cartItems.map((item, idx) => {
                      const qtyVal = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
                      const priceVal = parseFloat(String(item.price !== undefined ? item.price : (item.product.price || 0)).replace(/,/g, '.')) || 0;
                      const subTotal = qtyVal * priceVal;

                      return (
                        <tr key={item.product.id} className="hover:bg-blue-50/30 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="py-2.5 px-3 text-center font-bold text-gray-500 dark:text-zinc-400 border-r border-gray-200 dark:border-zinc-800">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700 dark:text-blue-400 border-r border-gray-200 dark:border-zinc-800 whitespace-nowrap">
                            {item.product.sku}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-zinc-800">
                            <div>{item.product.name}</div>
                            {item.product.category && (
                              <span className="text-[10px] text-gray-400 font-normal">
                                {item.product.category} • {item.location || item.product.location || 'Rak A-01'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-zinc-800 whitespace-nowrap">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.qty}
                              onChange={(e) => handleUpdateCartQty(item.product.id, e.target.value)}
                              className="w-16 text-center font-mono font-bold bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded px-1 py-0.5"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono uppercase text-gray-600 dark:text-zinc-300 border-r border-gray-200 dark:border-zinc-800 whitespace-nowrap">
                            {item.product.purchaseUnit || item.product.unit || 'UNIT'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-700 dark:text-zinc-300 border-r border-gray-200 dark:border-zinc-800 whitespace-nowrap">
                            {priceVal.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700 dark:text-blue-400 border-r border-gray-200 dark:border-zinc-800 whitespace-nowrap">
                            {subTotal.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-zinc-300 border-r border-gray-200 dark:border-zinc-800">
                            <input
                              type="text"
                              value={item.note || ''}
                              onChange={(e) => handleUpdateCartNote(item.product.id, e.target.value)}
                              placeholder="Catatan..."
                              className="w-full text-xs bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(item.product.id)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer transition-colors"
                              title="Hapus dari daftar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Invoice & Simpan Data Row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
              <button
                type="button"
                onClick={(e) => handleSaveTransaction(e as any)}
                disabled={cartItems.length === 0 || isSubmitting}
                className="bg-[#0080ff] hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 w-fit"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Menyimpan Data...' : 'Simpan Data'}</span>
              </button>

              <div className="flex items-center gap-3 justify-end">
                <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-zinc-300">
                  Total Invoice :
                </span>
                <div className="bg-gray-200/80 dark:bg-zinc-800 px-4 py-2 rounded border border-gray-300 dark:border-zinc-700 font-mono font-black text-sm min-w-[140px] text-right text-gray-900 dark:text-white">
                  {totalInvoiceAmount.toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== FORM TRANSAKSI REGULER (OUT, TRANSFER, AUDIT, ADJUST) ==================== */
        <div className="space-y-6">
      {/* Active Transaction Header & Back Navigation */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
              title="Kembali ke Menu Transaksi"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali</span>
            </button>
          )}

          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
              actionType === 'in' 
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : actionType === 'out'
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                : actionType === 'transfer'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                : actionType === 'audit'
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
            }`}>
              {actionType === 'in' && <ArrowDownLeft className="w-4.5 h-4.5" />}
              {actionType === 'out' && <ArrowUpRight className="w-4.5 h-4.5" />}
              {actionType === 'transfer' && <RefreshCw className="w-4.5 h-4.5" />}
              {actionType === 'audit' && <ClipboardList className="w-4.5 h-4.5" />}
              {actionType === 'adjust' && <CheckCircle2 className="w-4.5 h-4.5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-gray-950 dark:text-white leading-tight truncate">
                {actionType === 'in' && 'Transaksi: Barang Masuk (IN)'}
                {actionType === 'out' && 'Transaksi: Barang Keluar (OUT)'}
                {actionType === 'transfer' && 'Transaksi: Mutasi Antar Gudang (TRANSFER)'}
                {actionType === 'audit' && 'Transaksi: Audit Stok Opname'}
                {actionType === 'adjust' && 'Transaksi: Penyesuaian Stok'}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 truncate">
                {actionType === 'in' && 'Pencatatan penerimaan dan penambahan stok barang'}
                {actionType === 'out' && 'Pencatatan pengeluaran dan pengurangan stok barang'}
                {actionType === 'transfer' && 'Perpindahan stok barang antar lokasi / gudang'}
                {actionType === 'audit' && 'Pencocokan stok fisik dengan kuantitas sistem'}
                {actionType === 'adjust' && 'Koreksi penyesuaian kuantitas stok'}
              </p>
            </div>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Tutup / Batal Transaksi"
            className="p-2 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Title / Controls Container */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="w-full">
          {/* Controls Filter: Sektor/Rak, Input SKU Manual, Tanggal Transaksi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end animate-in fade-in duration-200">
            {/* Filter Lokasi Rak untuk Admin atau saat Stok Opname */}
            {(currentUser.role === 'admin' || actionType === 'audit') && (
              <div className="space-y-1.5">
                <select
                  value={adminLocationFilter}
                  onChange={(e) => {
                    setAdminLocationFilter(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200 focus:outline-indigo-550 font-medium cursor-pointer transition-all hover:border-gray-300 dark:hover:border-zinc-700 shadow-xs h-[38px]"
                >
                  {!isUserRestricted && <option value="all">Semua Sektor / Rak</option>}
                  {WAREHOUSES_OPTIONS.filter(loc => {
                    if (currentUser.role === 'admin') return true;
                    const userLocs = currentUser.location ? currentUser.location.split(',').map(l => l.trim().toLowerCase()) : [];
                    if (userLocs.includes('semua gudang')) return true;
                    return userLocs.includes(loc.toLowerCase());
                  }).map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Input SKU Manual */}
            <div className={`space-y-1.5 min-w-0 ${(currentUser.role === 'admin' || actionType === 'audit') ? 'sm:col-span-2 lg:col-span-2' : 'sm:col-span-2 lg:col-span-3'}`}>
              <form onSubmit={handleManualSubmit} className="flex gap-1.5 relative">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    placeholder={actionType === 'audit' ? "Pindai / Cari SKU untuk dihitung..." : "Kode SKU / Barcode..."}
                    value={skuInput}
                    onChange={(e) => {
                      setSkuInput(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setShowSearchDropdown(false), 200);
                    }}
                    className="w-full pl-2.5 pr-7 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200 focus:outline-indigo-550 font-mono h-[38px]"
                  />
                  <Scan className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  
                  {/* Search Dropdown */}
                  {showSearchDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 min-w-[260px]">
                      {filteredSearchProducts.length > 0 ? (
                        <div className="max-h-60 overflow-y-auto">
                          <div className="px-3 py-1.5 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-805">
                            <span className="text-[9px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest">
                              {actionType === 'audit' ? 'Pilih Item untuk Dihitung' : 'Pilih Item'} dari {adminLocationFilter !== 'all' ? adminLocationFilter : (currentUser.location || 'Gudang')}
                            </span>
                          </div>
                          {filteredSearchProducts.map(p => {
                            const matchingBOM = boms.find(b => 
                              b.name.trim().toLowerCase() === p.name.trim().toLowerCase() && 
                              b.location.trim().toLowerCase() === p.location.trim().toLowerCase()
                            );

                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  handleScanSKU(p.sku);
                                  setSkuInput('');
                                  setShowSearchDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 border-b border-gray-50 dark:border-zinc-855/50 transition-colors flex flex-col items-start cursor-pointer group"
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div className="min-w-0 pr-2">
                                    <p className="text-xs font-bold text-gray-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                      {p.name}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="text-[9px] font-mono bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 px-1.5 py-0.2 rounded font-semibold">
                                        {p.sku || 'TANPA SKU'}
                                      </span>
                                      <span className="text-[9px] text-gray-400 dark:text-zinc-500 uppercase font-medium">
                                        {p.location || 'Gudang Utama'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right ml-2 shrink-0">
                                    <span className="text-[10px] font-bold text-indigo-650 dark:text-indigo-450">{p.qty} unit</span>
                                  </div>
                                </div>
                                {matchingBOM && (
                                  <div className="mt-1.5 flex flex-wrap gap-1 text-[9px] text-indigo-600 dark:text-indigo-400 bg-indigo-50/55 dark:bg-indigo-950/30 p-1.5 rounded-lg border border-indigo-100/30 dark:border-indigo-900/30 w-full pointer-events-none">
                                    <p className="font-extrabold uppercase w-full mb-0.5 tracking-widest text-[8px]">KOMPONEN RESEP ({matchingBOM.items.length} ITEM):</p>
                                    {matchingBOM.items.map((bItem, bIdx) => (
                                      <span key={bIdx} className="bg-white/90 dark:bg-zinc-900 px-1 py-0.5 rounded text-[8px] font-black border border-gray-150/40 dark:border-zinc-800">
                                        {bItem.productName} ({bItem.qty} {bItem.unit})
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-xs text-gray-400 italic">Barang tidak ditemukan</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsScannerExpanded(!isScannerExpanded)}
                  title={isScannerExpanded ? 'Tutup Scanner' : 'Buka Kamera Scanner'}
                  className={`px-2.5 h-[38px] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shrink-0 ${
                    isScannerExpanded 
                      ? 'bg-rose-600 text-white' 
                      : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                  }`}
                >
                  {isScannerExpanded ? <X className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                </button>
                <button
                  type="submit"
                  className="px-3 bg-gray-900 hover:bg-gray-800 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-white text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer h-[38px] shrink-0"
                >
                  Cari
                </button>
              </form>
            </div>

            {/* Tanggal & Waktu Transaksi */}
            <div className="space-y-1.5">
              <input
                type="datetime-local"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200 focus:outline-indigo-550 font-mono cursor-pointer h-[38px]"
                required
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">

        {/* Column 1: Scanner Device Viewport - Shown only when expanded */}
        <AnimatePresence>
          {isScannerExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:col-span-12 overflow-hidden mb-4"
            >
              <div className="relative rounded-2xl border-4 border-gray-900 dark:border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl h-[340px] flex flex-col justify-between">
                
                {/* Real Camera Video Tag Target */}
                {isCameraActive ? (
                  <div className="absolute inset-0 w-full h-full bg-black overflow-hidden">
                    {/* Isolated viewport for html5-qrcode to prevent React 19 virtual DOM mismatch crashes */}
                    <div 
                      id="qr-reader-viewport" 
                      className="w-full h-full [&>video]:absolute [&>video]:inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover overflow-hidden bg-black"
                    />
                    
                    {/* React-controlled overlay styled as absolute sibling */}
                    {!realCameraDeviceAvailable && (
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black flex flex-col items-center justify-center p-6 text-center z-10">
                        <div className="w-16 h-16 rounded-full bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-400 animate-pulse">
                          <Video className="w-8 h-8" />
                        </div>
                        <p className="text-sm font-sans font-semibold text-zinc-350">Menghubungkan Kamera...</p>
                        <p className="text-xs text-zinc-550 max-w-sm mt-1">Silakan berikan izin kamera jika diminta. Bila terhalang sandbox, Anda juga bisa menggunakan list tag preset di bawah.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-650">
                      <Video className="w-8 h-8 opacity-45" />
                    </div>
                    <p className="text-sm font-sans font-semibold text-zinc-500 text-center font-mono">KAMERA NONAKTIF</p>
                    <button
                      type="button"
                      onClick={() => setIsCameraActive(true)}
                      className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                    >
                      Aktifkan Kamera
                    </button>
                  </div>
                )}

                {/* Radar layout & Scan Line Laser simulation */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
                  
                  {/* Corner target outlines */}
                  <div className="flex justify-between">
                    <div className="w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-md"></div>
                    <div className="w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-md"></div>
                  </div>

                  {/* Hologram Box alignment in the center */}
                  <div className="mx-auto w-64 sm:w-80 h-32 border border-dashed border-indigo-400/40 bg-indigo-500/5 rounded-lg flex items-center justify-center relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-500/10 to-transparent"></div>
                    <Barcode className="w-20 h-20 text-indigo-400/30 animate-pulse" />
                    {isScanningSimulated && (
                      <div className="absolute inset-0 bg-indigo-600/30 backdrop-blur-xs flex items-center justify-center rounded-lg">
                        <RefreshCw className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Simulated red neon laser scanning bar */}
                  <div 
                    className="absolute left-0 right-0 h-0.5 bg-rose-500 shadow-[0_0_10px_#f43f5e] transition-all duration-75"
                    style={{ top: `${simulatedLinePosition}%` }}
                  ></div>

                  <div className="flex justify-between">
                    <div className="w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-md"></div>
                    <div className="w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-tr-md"></div>
                  </div>

                </div>

                {/* Top Info Hub overlay & Close X button */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
                  <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-mono text-indigo-300">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                    LASER SENSOR ACTIVE
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScannerExpanded(false)}
                    title="Tutup Scanner"
                    className="p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-full backdrop-blur-md transition-all cursor-pointer pointer-events-auto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Bottom Controls panel */}
                <div className="relative z-10 w-full bg-gradient-to-t from-black via-black/85 to-transparent p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-zinc-400 text-xs">
                  <span className="font-mono text-[11px]">Sistem Scan: <b className="text-zinc-200">Kamera Web 120 FPS</b></span>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setIsCameraActive(!isCameraActive)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs cursor-pointer transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {isCameraActive ? 'Matikan Kamera' : 'Aktifkan Kamera'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsScannerExpanded(false)}
                      title="Tutup Scanner"
                      className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer transition-colors flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Column 2: Results & Restocking/Withdrawal action form - Main Content */}
        <div className="lg:col-span-12 space-y-4">
          {scanMessage && (
            <div className={`p-4 rounded-xl flex items-start gap-2 text-xs border ${
              scanMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-350 border-emerald-150 dark:border-emerald-900/30'
                : 'bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-350 border-rose-150 dark:border-rose-900/30'
            }`}>
              {scanMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
              )}
              <p className="leading-tight">{scanMessage.text}</p>
            </div>
          )}

          {/* Detailed multi-item transaction cart */}
            <div className="p-5 rounded-2xl border border-indigo-150/70 dark:border-indigo-900/40 bg-gradient-to-b from-indigo-50/10 to-transparent dark:from-indigo-950/10 dark:to-transparent shadow-md space-y-4">
            
            {/* Cart Header */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-150 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-gray-900 dark:text-white leading-tight">
                    Daftar Barang Transaksi
                  </h4>
                  <p className="text-[10px] text-gray-500 font-sans">
                    {cartItems.length} item dimasukkan
                  </p>
                </div>
              </div>
              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-650 dark:text-rose-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all border border-rose-200 dark:border-neutral-800"
                >
                  <Trash2 className="w-3 h-3" />
                  Reset
                </button>
              )}
            </div>


            {/* In / Out Direction indication */}
            <div className="w-full">
              {actionType === 'in' && (
                <div
                  className="p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40 select-none animate-fade-in"
                >
                  <ArrowDownLeft className="w-4 h-4 text-emerald-500 animate-bounce" />
                  Tipe Transaksi: Barang Masuk (IN)
                </div>
              )}
              {actionType === 'out' && (
                <div
                  className="p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40 select-none animate-fade-in"
                >
                  <ArrowUpRight className="w-4 h-4 text-rose-500 animate-bounce" />
                  Tipe Transaksi: Barang Keluar (OUT)
                </div>
              )}

              {actionType === 'transfer' && (
                <div className="space-y-3 animate-fade-in">
                  <div
                    className="p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 bg-indigo-50 border-indigo-300 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/40 select-none"
                  >
                    <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />
                    Tipe Transaksi: Mutasi Barang (TRANSFER)
                  </div>
                  
                  {/* Warehouse input fields */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                        Gudang Asal
                      </label>
                      <select
                        value={originWarehouse}
                        onChange={(e) => setOriginWarehouse(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500"
                      >
                        {WAREHOUSES_OPTIONS.map((wh) => (
                          <option key={wh} value={wh}>{wh}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                        Gudang Tujuan
                      </label>
                      <select
                        value={targetWarehouse}
                        onChange={(e) => setTargetWarehouse(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500"
                      >
                        {WAREHOUSES_OPTIONS.map((wh) => (
                          <option key={wh} value={wh}>{wh}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {actionType === 'adjust' && (
                <div
                  className="p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40 select-none animate-fade-in"
                >
                  <CheckCircle2 className="w-4 h-4 text-blue-500 animate-pulse" />
                  Tipe Transaksi: Penyesuaian Stok (ADJUSTMENT)
                </div>
              )}
              {actionType === 'audit' && (
                <div className="p-3 rounded-xl border font-sans text-xs bg-amber-50/80 border-amber-300 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50 space-y-2 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                      <span className="font-bold">
                        Audit Stok Opname — Lokasi: <span className="underline font-mono">{adminLocationFilter === 'all' ? 'Semua Sektor / Rak' : adminLocationFilter}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/80 dark:bg-zinc-900 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                        {cartItems.length} dari {filteredProductsForAudit.length} barang masuk hitungan
                      </span>

                      {uncountedAuditProducts.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowUncountedModal(true)}
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 hover:bg-rose-700 text-white shadow-xs flex items-center gap-1 cursor-pointer transition-colors animate-pulse"
                        >
                          <AlertCircle className="w-3 h-3" />
                          <span>{uncountedAuditProducts.length} Belum Dihitung</span>
                        </button>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-xs flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Semua Selesai Dihitung</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {uncountedAuditProducts.length > 0 && (
                    <div className="pt-1 border-t border-amber-200/80 dark:border-amber-900/40 text-[11px]">
                      <span className="text-amber-800/90 dark:text-amber-300/80">
                        * Pindai barcode / cari SKU barang di atas satu per satu untuk menghitung stok fisik.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cart Items List */}
            {cartItems.length === 0 ? (
              <div className="py-12 text-center text-gray-450 dark:text-zinc-500">
                {actionType === 'audit' ? (
                  <div className="max-w-md mx-auto space-y-3">
                    <ClipboardList className="w-12 h-12 mx-auto text-amber-500/60 animate-pulse" />
                    <h4 className="text-sm font-bold text-gray-800 dark:text-zinc-200 uppercase tracking-wider">
                      Daftar Hitungan Opname Masih Kosong
                    </h4>
                    {filteredProductsForAudit.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
                        Tidak ada barang terdaftar di sektor / rak ini. Silakan tambahkan barang ke sektor ini di Manajemen Inventory terlebih dahulu, atau pilih sektor lain.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-zinc-400 max-w-[340px] mx-auto leading-relaxed">
                        Pindai barcode atau cari SKU barang di kolom pencarian di atas untuk mulai memasukkan hitungan fisik barang.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <Scan className="w-10 h-10 mx-auto text-indigo-400/50 mb-2.5 animate-pulse" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Hasil Pencarian SKU Kosong</h4>
                    <p className="text-[11px] mt-1.5 max-w-[240px] mx-auto leading-relaxed font-sans">
                      Pindai tag preset di kiri, arahkan kamera ke barcode, atau ketik SKU manual untuk menyusun daftar {actionType === 'in' ? 'barang masuk' : actionType === 'out' ? 'barang keluar' : actionType === 'transfer' ? 'barang transfer' : actionType === 'adjust' ? 'penyesuaian stok' : 'stok opname'}.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleSaveTransaction} className="space-y-4">
                
                {/* Scrollable Table View Container */}
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xs max-h-[380px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 z-10">
                      <tr>
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3">NAMA BARANG</th>
                        {actionType === 'in' && (
                          <>
                            <th className="py-2.5 px-3">TGL KADALUARSA (ED)</th>
                            <th className="py-2.5 px-3">NO. BATCH / LOT</th>
                            <th className="py-2.5 px-3 text-right">
                              HARGA <span className="text-[8px] font-normal text-emerald-600 dark:text-emerald-400 lowercase">(Hanya IN)</span>
                            </th>
                          </>
                        )}
                        {actionType === 'adjust' || actionType === 'audit' ? (
                          <>
                            <th className="py-2.5 px-3 text-center">STOK SISTEM</th>
                            <th className="py-2.5 px-3 text-center">{actionType === 'audit' ? 'STOK FISIK (OPNAME)' : 'STOK FISIK (ADJUST)'}</th>
                            <th className="py-2.5 px-3 text-center">SELISIH</th>
                          </>
                        ) : (
                          <th className="py-2.5 px-3 text-center">QTY</th>
                        )}
                        <th className="py-2.5 px-3">KETERANGAN</th>
                        <th className="py-2.5 px-2 text-center w-10">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-850">
                      {cartItems.map((item) => {
                        const matchingBOM = boms.find(b => 
                          b.name.trim().toLowerCase() === item.product.name.trim().toLowerCase() && 
                          b.location.trim().toLowerCase() === item.product.location.trim().toLowerCase()
                        );

                        return (
                          <tr key={item.product.id} className="hover:bg-gray-50/70 dark:hover:bg-zinc-900/50 transition-colors">
                            {/* SKU */}
                            <td className="py-3 px-3 font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 align-top whitespace-nowrap">
                              {item.product.sku || '-'}
                            </td>

                            {/* NAMA BARANG */}
                            <td className="py-3 px-3 align-top min-w-[180px]">
                              <div className="font-bold text-gray-900 dark:text-white text-xs">
                                {item.product.name}
                              </div>
                              <div className="text-[10px] text-gray-450 dark:text-zinc-500 mt-0.5 flex flex-wrap gap-1.5 items-center">
                                <span className="bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.2 rounded font-medium">{item.product.category}</span>
                                <span className="inline-flex items-center gap-1">
                                  • Rak:
                                  <input
                                    type="text"
                                    list="cart-rack-options"
                                    value={item.location !== undefined ? item.location : item.product.location}
                                    onChange={(e) => handleUpdateCartLocation(item.product.id, e.target.value)}
                                    className="text-[10px] font-bold text-gray-800 dark:text-zinc-200 bg-gray-100/90 dark:bg-zinc-800/90 px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-700 hover:border-indigo-400 focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 outline-none w-24 transition-all"
                                    title="Tentukan lokasi rak untuk mutasi barang ini"
                                    placeholder="Lokasi Rak"
                                  />
                                </span>
                                <span>• Stok: <b className="text-gray-700 dark:text-zinc-300">{item.product.qty} {item.product.purchaseUnit || item.product.unit}</b></span>
                              </div>

                              {/* Formula BOM if any */}
                              {matchingBOM && (
                                <div className="mt-2 bg-indigo-50/40 dark:bg-zinc-900/50 p-2 rounded-lg border border-indigo-100/30 dark:border-zinc-800/80 space-y-1 text-[9px]">
                                  <div className="flex items-center justify-between">
                                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider text-[8px]">
                                      Formula BOM ({matchingBOM.items.length} Komponen)
                                    </span>
                                    <span className="text-[8px] font-bold text-gray-400">
                                      Yield: {matchingBOM.yieldQty} {matchingBOM.yieldUnit}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-gray-600 dark:text-zinc-400 text-[8.5px] max-h-20 overflow-y-auto">
                                    {matchingBOM.items.map((component, idx) => {
                                      const transQty = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
                                      const batchCount = transQty / (matchingBOM.yieldQty || 1);
                                      const reqQty = component.qty * batchCount;
                                      return (
                                        <div key={idx} className="flex justify-between border-b border-gray-100/40 dark:border-zinc-850/40 py-0.5">
                                          <span className="truncate pr-1">• {component.productName}</span>
                                          <span className="font-bold font-mono">
                                            {(reqQty || 0).toFixed(2).replace(/\.00$/, '')} {component.unit}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {(actionType === 'in' || actionType === 'out') && (
                                    <label className="flex items-center gap-1.5 mt-1 pt-1 border-t border-indigo-100/30 dark:border-zinc-800/80 text-[9px] font-bold text-indigo-750 dark:text-indigo-350 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={!!autoConsumeItemIds[item.product.id]}
                                        onChange={(e) => {
                                          setAutoConsumeItemIds(prev => ({
                                            ...prev,
                                            [item.product.id]: e.target.checked
                                          }));
                                        }}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3 cursor-pointer"
                                      />
                                      <span>
                                        {actionType === 'in' 
                                          ? 'Potong Stok Komponen Otomatis (Assembling)' 
                                          : 'Pengurangan Potong Komponen'}
                                      </span>
                                    </label>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* ED, BATCH & HARGA (Hanya transaksi IN) */}
                            {actionType === 'in' && (
                              <>
                                {/* Tanggal Kadaluarsa */}
                                <td className="py-3 px-3 align-top min-w-[140px]">
                                  <input
                                    type="date"
                                    className="font-mono text-xs text-gray-900 dark:text-white w-full px-2 py-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                                    value={item.expiryDate || ''}
                                    onChange={(e) => handleUpdateCartExpiryDate(item.product.id, e.target.value)}
                                  />
                                  <div className="text-[9px] font-normal text-amber-600 dark:text-amber-400 font-sans mt-0.5">
                                    *Batch FEFO
                                  </div>
                                </td>

                                {/* Nomor Batch / Lot */}
                                <td className="py-3 px-3 align-top min-w-[130px]">
                                  <div className="flex flex-col gap-0.5">
                                    <input
                                      type="text"
                                      placeholder="LOT-2026-001"
                                      className="font-mono text-xs text-gray-500 dark:text-zinc-400 w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-850 bg-gray-50/70 dark:bg-zinc-950/60 shadow-inner focus:outline-none cursor-not-allowed select-none"
                                      value={item.batchNumber || ''}
                                      readOnly
                                    />
                                    <span className="text-[9px] font-semibold text-indigo-650 dark:text-indigo-400 font-sans mt-0.5">
                                      *Batch Otomatis
                                    </span>
                                  </div>
                                </td>

                                {/* HARGA */}
                                <td className="py-3 px-3 align-top whitespace-nowrap text-right min-w-[140px]">
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-[10px] font-bold text-gray-400">Rp</span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="font-mono font-bold text-xs text-right text-gray-900 dark:text-white w-24 px-2 py-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none"
                                      value={item.price !== undefined ? item.price : item.product.price}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^[0-9]*[.,]?[0-9]*$/.test(val)) {
                                          handleUpdateCartPrice(item.product.id, val);
                                        }
                                      }}
                                    />
                                  </div>
                                  <div className="text-[9px] font-normal text-gray-400 dark:text-zinc-500 font-sans mt-0.5 text-right">
                                    per {item.product.purchaseUnit || item.product.unit || 'Unit'}
                                  </div>
                                </td>
                              </>
                            )}

                            {/* QTY or ADJUST/AUDIT COLUMNS */}
                            {actionType === 'adjust' || actionType === 'audit' ? (
                              <>
                                {/* STOK SISTEM */}
                                <td className="py-3 px-3 text-center align-top font-bold text-gray-700 dark:text-zinc-300 font-mono text-xs">
                                  {item.product.qty} {item.product.purchaseUnit || item.product.unit}
                                </td>

                                {/* STOK FISIK (ADJUST / OPNAME) */}
                                <td className="py-3 px-3 align-top min-w-[130px]">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      disabled={(parseFloat(String(item.qty).replace(/,/g, '.')) || 0) <= 0}
                                      onClick={() => {
                                        const currentVal = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
                                        if (currentVal > 0) handleUpdateCartQty(item.product.id, currentVal - 1);
                                      }}
                                      className="p-1 px-1.5 rounded bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-white transition-colors disabled:opacity-40 cursor-pointer text-[10px]"
                                    >
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>

                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className={`font-mono font-extrabold text-xs text-center text-gray-900 dark:text-white w-14 px-1 py-0.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-inner focus:ring-1 outline-none ${
                                        actionType === 'audit' ? 'focus:ring-amber-500' : 'focus:ring-blue-500'
                                      }`}
                                      value={item.qty}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^[0-9]*[.,]?[0-9]*$/.test(val)) {
                                          handleUpdateCartQty(item.product.id, val);
                                        }
                                      }}
                                    />

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentVal = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
                                        handleUpdateCartQty(item.product.id, currentVal + 1);
                                      }}
                                      className="p-1 px-1.5 rounded bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-white transition-colors cursor-pointer text-[10px]"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </td>

                                {/* SELISIH */}
                                <td className="py-3 px-3 text-center align-top font-mono text-xs font-bold whitespace-nowrap">
                                  {(() => {
                                    const itemQtyVal = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
                                    const diff = itemQtyVal - item.product.qty;
                                    if (diff === 0) return <span className="text-gray-400 dark:text-zinc-500 font-semibold">0 (Sesuai)</span>;
                                    if (diff > 0) return <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">+{diff.toFixed(2).replace(/\.00$/, '')} (Surplus)</span>;
                                    return <span className="text-rose-600 dark:text-rose-400 font-extrabold">{diff.toFixed(2).replace(/\.00$/, '')} (Defisit)</span>;
                                  })()}
                                </td>
                              </>
                            ) : (
                              <td className="py-3 px-3 align-top min-w-[130px]">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    disabled={(parseFloat(String(item.qty).replace(/,/g, '.')) || 0) <= 0.1}
                                    onClick={() => {
                                      const currentVal = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
                                      handleUpdateCartQty(item.product.id, currentVal - 1);
                                    }}
                                    className="p-1 px-1.5 rounded bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-white transition-colors disabled:opacity-40 cursor-pointer text-[10px]"
                                  >
                                    <Minus className="w-2.5 h-2.5" />
                                  </button>

                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="font-mono font-extrabold text-xs text-center text-gray-900 dark:text-white w-14 px-1 py-0.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none"
                                    value={item.qty}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '' || /^[0-9]*[.,]?[0-9]*$/.test(val)) {
                                        handleUpdateCartQty(item.product.id, val);
                                      }
                                    }}
                                  />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentVal = parseFloat(String(item.qty).replace(/,/g, '.')) || 0;
                                      handleUpdateCartQty(item.product.id, currentVal + 1);
                                    }}
                                    className="p-1 px-1.5 rounded bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-white transition-colors cursor-pointer text-[10px]"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </td>
                            )}

                            {/* KETERANGAN */}
                            <td className="py-3 px-3 align-top min-w-[150px]">
                              <input
                                type="text"
                                placeholder={
                                  actionType === 'in' 
                                    ? "Catatan barang masuk..." 
                                    : actionType === 'out' 
                                      ? "Catatan barang keluar..." 
                                      : actionType === 'transfer'
                                        ? "Catatan mutasi barang..."
                                        : actionType === 'adjust'
                                          ? "Catatan penyesuaian stok..."
                                          : "Catatan audit opname..."
                                }
                                value={item.note}
                                onChange={(e) => handleUpdateCartNote(item.product.id, e.target.value)}
                                className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:text-white focus:outline-indigo-500 font-sans w-full"
                              />
                            </td>

                            {/* AKSI */}
                            <td className="py-3 px-2 text-center align-top">
                              <button
                                type="button"
                                onClick={() => handleRemoveFromCart(item.product.id)}
                                className="p-1.5 text-gray-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                title="Hapus item ini dari daftar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <datalist id="cart-rack-options">
                    {availableRacks.map(rack => (
                      <option key={rack} value={rack} />
                    ))}
                  </datalist>
                </div>

                {/* Cumulate stats & Active Operator signature details */}
                <div className="p-3 bg-gray-50/50 dark:bg-zinc-850/40 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-1.5 text-[10px] text-gray-550 dark:text-zinc-400 font-mono">
                  <div className="flex justify-between">
                    <span>Jumlah Multi-Barang:</span>
                    <span className="font-bold text-gray-850 dark:text-white">{cartItems.length} Jenis</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Volume Unit:</span>
                    <span className={`font-bold ${
                      actionType === 'in' 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : actionType === 'out' 
                          ? 'text-rose-600 dark:text-rose-400' 
                          : actionType === 'transfer'
                            ? 'text-indigo-650 dark:text-indigo-400'
                            : actionType === 'adjust'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {actionType === 'audit' || actionType === 'adjust'
                        ? `${cartItems.reduce((acc, curr) => acc + (parseFloat(String(curr.qty).replace(/,/g, '.')) || 0), 0).toFixed(2).replace(/\.00$/, '')} Unit Fisik (${
                              cartItems.reduce((acc, curr) => acc + ((parseFloat(String(curr.qty).replace(/,/g, '.')) || 0) - curr.product.qty), 0) >= 0 ? '+' : ''
                            }${cartItems.reduce((acc, curr) => acc + ((parseFloat(String(curr.qty).replace(/,/g, '.')) || 0) - curr.product.qty), 0).toFixed(2).replace(/\.00$/, '')} Selisih)`
                        : `${cartItems.reduce((acc, curr) => acc + (parseFloat(String(curr.qty).replace(/,/g, '.')) || 0), 0).toFixed(2).replace(/\.00$/, '')} Unit`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-gray-200 dark:border-zinc-800 pt-1.5 mt-1">
                    <span>Petugas Validasi:</span>
                    <span className="font-bold text-gray-800 dark:text-zinc-300 truncate max-w-[130px]">{currentUser.name} ({currentUser.role})</span>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-100 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer disabled:opacity-50 select-none text-center"
                >
                  {isSubmitting 
                    ? 'Berjalan mencatat...' 
                    : actionType === 'adjust'
                      ? `Konfirmasi & Simpan Penyesuaian Stok (${cartItems.length} Barang) ✓`
                      : actionType === 'audit'
                        ? `Konfirmasi & Simpan Audit Stok Opname (${cartItems.length} Barang) ✓`
                        : `Konfirmasi & Simpan Transaksi (${cartItems.length} Barang) ✓`}
                </button>
              </form>
            )}

          </div>

        </div>

      </div>
        </div>
      ))(actionType)}

      {/* Pop-up Modal Pilih Data Barang / Bahan (Dibuka saat Kode Bahan di-klik) */}
      <AnimatePresence>
        {showProductModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-sans">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[88vh]"
            >
              {/* Modal Header */}
              <div className="bg-[#0080ff] dark:bg-blue-600 text-white px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-white" />
                  <div>
                    <h3 className="text-sm sm:text-base font-black tracking-wide text-white">
                      Pilih Data Barang / Bahan
                    </h3>
                    <p className="text-[10px] text-blue-100">
                      Klik pada baris atau tombol 'Pilih' untuk memasukkan barang ke faktur
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Toolbar: Search & Rack Filter */}
              <div className="p-4 bg-gray-50 dark:bg-zinc-850 border-b border-gray-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    autoFocus
                    value={productModalSearch}
                    onChange={(e) => setProductModalSearch(e.target.value)}
                    placeholder="Cari berdasarkan nama bahan, kode SKU, atau kategori..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 dark:text-zinc-100 focus:outline-blue-500 shadow-2xs"
                  />
                </div>

                <div className="sm:w-56">
                  <select
                    value={productModalRack}
                    onChange={(e) => setProductModalRack(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 dark:text-zinc-100 focus:outline-blue-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Semua Lokasi / Rak</option>
                    {availableRacks.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal Table Content */}
              <div className="overflow-y-auto flex-1 p-2 sm:p-4">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200 dark:border-zinc-700">
                      <th className="py-2.5 px-3">Kode SKU</th>
                      <th className="py-2.5 px-3">Nama Barang</th>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-3">Lokasi Rak</th>
                      <th className="py-2.5 px-3 text-center">Stok</th>
                      <th className="py-2.5 px-3 text-right">Harga Beli</th>
                      <th className="py-2.5 px-3 text-center w-20">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {filteredModalProducts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-gray-400 dark:text-zinc-500 italic">
                          Tidak ada data barang yang sesuai pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredModalProducts.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => handleSelectProductFromModal(p)}
                          className="hover:bg-blue-50/60 dark:hover:bg-zinc-800 cursor-pointer transition-colors group"
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                            {p.sku}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-gray-900 dark:text-white">
                            {p.name}
                          </td>
                          <td className="py-2.5 px-3 text-gray-500 dark:text-zinc-400">
                            <span className="bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">
                              {p.category || 'Umum'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-600 dark:text-zinc-300">
                            {p.location || 'Rak A-01'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-800 dark:text-zinc-200">
                            {p.qty} {p.purchaseUnit || p.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-700 dark:text-zinc-300">
                            Rp {(p.price || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectProductFromModal(p);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] shadow-xs cursor-pointer transition-transform group-hover:scale-105"
                            >
                              Pilih
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-gray-50 dark:bg-zinc-850 border-t border-gray-200 dark:border-zinc-800 flex justify-between items-center text-xs text-gray-500 dark:text-zinc-400">
                <span>Menampilkan <b>{filteredModalProducts.length}</b> barang</span>
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 font-bold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Absolute Centered Scan Status Popup Modal */}
      <AnimatePresence>
        {scanPopup && scanPopup.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 font-sans">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border bg-white dark:bg-zinc-900 ${
                scanPopup.type === 'success' 
                  ? 'border-emerald-500/30 dark:border-emerald-500/20' 
                  : 'border-rose-500/30 dark:border-rose-500/20'
              }`}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                
                {/* Icon Status */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  scanPopup.type === 'success' 
                    ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                }`}>
                  {scanPopup.type === 'success' ? (
                    <CheckCircle2 className="w-8 h-8 animate-bounce" />
                  ) : (
                    <AlertCircle className="w-8 h-8 animate-pulse" />
                  )}
                </div>

                {/* Title & Desc */}
                <div className="space-y-1">
                  <h3 className={`text-base font-black tracking-tight uppercase ${
                    scanPopup.type === 'success' 
                      ? 'text-emerald-700 dark:text-emerald-400' 
                      : 'text-rose-700 dark:text-rose-400'
                  }`}>
                    {scanPopup.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    {scanPopup.message}
                  </p>
                </div>

                {/* Scanned Badge Info */}
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-950/60 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-zinc-800/80 text-[11px] font-mono font-bold w-full justify-center">
                  <span className="text-gray-400 uppercase">Barcode/SKU:</span>
                  <span className="text-gray-800 dark:text-zinc-250 select-all">{scanPopup.sku}</span>
                </div>

                {/* Product Thumbnail Section */}
                {scanPopup.type === 'success' && scanPopup.productName && (
                  <div className="flex items-center gap-3 bg-indigo-50/20 dark:bg-zinc-955/20 border border-indigo-100/30 dark:border-zinc-800/60 p-2 rounded-2xl w-full text-left">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden font-black text-[11px] text-indigo-500">
                      {scanPopup.imageUrl ? (
                        <img src={scanPopup.imageUrl} alt={scanPopup.productName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        scanPopup.productName.substring(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Nama Barang</p>
                      <p className="text-xs font-bold text-gray-950 dark:text-gray-150 truncate leading-tight mt-0.5">{scanPopup.productName}</p>
                    </div>
                  </div>
                )}

                {/* Confirmation Dismiss Button */}
                <button
                  type="button"
                  onClick={() => setScanPopup(prev => prev ? { ...prev, isOpen: false } : null)}
                  className={`w-full py-2 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md select-none text-center ${
                    scanPopup.type === 'success'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/10'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/10'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Ok, Lanjutkan
                </button>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Pop-Up Cetak Label Barcode Transaksi Barang Masuk */}
        {showPostTxPrintModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-indigo-500/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 shrink-0">
                  <Printer className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                    <span>Cetak Label Barcode Barang Masuk</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
                      Sukses Masuk
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                    Pilih barang dan sesuaikan jumlah cetak label barcode yang Anda inginkan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPostTxPrintModal(false)}
                className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Toolbar / Select All Controls */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-zinc-950/50 border-b border-gray-150 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <label className="flex items-center gap-2 font-bold text-gray-700 dark:text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={postTxPrintItems.length > 0 && postTxPrintItems.every(i => i.selected)}
                  onChange={(e) => {
                    const checkAll = e.target.checked;
                    setPostTxPrintItems(prev => prev.map(i => ({ ...i, selected: checkAll })));
                  }}
                  className="rounded border-gray-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Pilih Semua ({totalSelectedPostTxItems} dari {postTxPrintItems.length} jenis barang)</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPostTxPrintItems(prev => prev.map(i => ({ ...i, printQty: i.qtyIn })));
                  }}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Atur ke Qty Masuk
                </button>
                <span className="text-gray-300 dark:text-zinc-700">•</span>
                <span className="font-extrabold text-xs px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                  Total Label: {postTxBarcodePrintList.length} Lembar
                </span>
              </div>
            </div>

            {/* Items Scrollable List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 max-h-[48vh]">
              {postTxPrintItems.map((item, index) => (
                <div
                  key={item.product.id || index}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    item.selected
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 shadow-xs'
                      : 'bg-white dark:bg-zinc-900 border-gray-150 dark:border-zinc-800 opacity-60'
                  }`}
                >
                  {/* Item Info */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => {
                        setPostTxPrintItems(prev => prev.map((it, idx) => idx === index ? { ...it, selected: !it.selected } : it));
                      }}
                      className="mt-1 rounded border-gray-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200 dark:border-zinc-700">
                      {item.product.imageUrl ? (
                        <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Barcode className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-gray-900 dark:text-white leading-snug">
                        {item.product.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-zinc-400 font-mono mt-0.5">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">SKU: {item.product.sku}</span>
                        <span>•</span>
                        <span>Lokasi: {item.product.location}</span>
                        <span>•</span>
                        <span className="text-emerald-600 font-bold">Qty Masuk: {item.qtyIn} {item.product.unit || 'Unit'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Print Quantity Adjuster */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-zinc-800 shrink-0">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400">
                      Cetak Label:
                    </span>
                    <div className="flex items-center gap-1 bg-white dark:bg-zinc-950 p-1 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-inner">
                      <button
                        type="button"
                        disabled={!item.selected || item.printQty <= 1}
                        onClick={() => {
                          setPostTxPrintItems(prev => prev.map((it, idx) => idx === index ? { ...it, printQty: Math.max(1, it.printQty - 1) } : it));
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 text-gray-700 dark:text-zinc-200 disabled:opacity-30 cursor-pointer font-extrabold text-xs"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        disabled={!item.selected}
                        value={item.printQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setPostTxPrintItems(prev => prev.map((it, idx) => idx === index ? { ...it, printQty: Math.max(1, val) } : it));
                        }}
                        className="w-12 text-center font-mono font-extrabold text-xs text-gray-900 dark:text-white bg-transparent outline-none"
                      />
                      <button
                        type="button"
                        disabled={!item.selected}
                        onClick={() => {
                          setPostTxPrintItems(prev => prev.map((it, idx) => idx === index ? { ...it, printQty: it.printQty + 1 } : it));
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 text-gray-700 dark:text-zinc-200 disabled:opacity-30 cursor-pointer font-extrabold text-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Label Live Preview Area */}
            {postTxBarcodePrintList.length > 0 && (
              <div className="px-4 py-3 bg-gray-50/80 dark:bg-zinc-950/80 border-t border-gray-150 dark:border-zinc-800">
                <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                  Pratinjau Format Label Barcode (33mm x 15mm)
                </p>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                  {postTxPrintItems.filter(i => i.selected).slice(0, 5).map((item, i) => (
                    <div key={i} className="bg-white text-black p-1.5 rounded-lg border border-gray-200 shadow-xs shrink-0 flex flex-col items-center justify-between w-[130px] h-[58px] text-center overflow-hidden">
                      <p className="font-bold text-[7px] truncate w-full uppercase">{item.product.name}</p>
                      <div className="max-h-[30px] flex items-center justify-center my-0.5">
                        <BarcodeComponent
                          value={item.product.sku || '0000'}
                          width={0.65}
                          height={14}
                          fontSize={6}
                          margin={0}
                          displayValue={true}
                          renderer="svg"
                        />
                      </div>
                    </div>
                  ))}
                  {postTxPrintItems.filter(i => i.selected).length > 5 && (
                    <div className="bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center shrink-0">
                      +{postTxPrintItems.filter(i => i.selected).length - 5} Jenis Barang Lain
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-150 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowPostTxPrintModal(false)}
                className="px-4 py-2.5 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Nanti / Selesai
              </button>

              <button
                type="button"
                disabled={postTxBarcodePrintList.length === 0 || isPrintingPostTxBarcodes}
                onClick={handlePrintPostTxBarcodes}
                className="px-5 py-2.5 text-xs font-extrabold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isPrintingPostTxBarcodes ? 'Mempersiapkan Printer...' : `Cetak ${postTxBarcodePrintList.length} Label Barcode`}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Pop-up Barang Belum Dihitung untuk Stok Opname (Audit) */}
      <AnimatePresence>
        {showUncountedModal && (
          <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-[120] flex items-center justify-center p-4 font-sans">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-amber-300 dark:border-amber-700/50 flex flex-col max-h-[85vh] overflow-hidden"
            >
              {/* Header Modal */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20 border-b border-amber-200 dark:border-amber-800/60 flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">
                        Daftar Barang Belum Dihitung
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-extrabold bg-rose-600 text-white shadow-xs">
                        {uncountedAuditProducts.length} Barang Tersisa
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-zinc-400 mt-1 leading-relaxed">
                      Stok Opname tidak dapat diselesaikan karena masih ada barang di sektor ini yang belum dihitung. Silakan pindai barcode atau masukkan barang di bawah ke dalam tabel hitungan.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowUncountedModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-200 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action & Filter Toolbar */}
              <div className="p-3 sm:px-5 bg-gray-50/80 dark:bg-zinc-950/60 border-b border-gray-100 dark:border-zinc-800/80 flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between shrink-0">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={uncountedSearchQuery}
                    onChange={(e) => setUncountedSearchQuery(e.target.value)}
                    placeholder="Cari nama barang, SKU, atau rak..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-amber-500"
                  />
                  {uncountedSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUncountedSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[11px]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {uncountedAuditProducts.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        handleAddAllUncountedToAudit(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Muat Semua Sisa ({uncountedAuditProducts.length})</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Product List Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2 divide-y divide-gray-100 dark:divide-zinc-800/60">
                {uncountedAuditProducts.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wider">
                      Semua Barang Telah Dihitung!
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 max-w-xs mx-auto">
                      Seluruh barang di sektor ini sudah dimasukkan ke tabel audit. Anda sekarang dapat memeriksa kuantitas fisik dan menyelesaikan Stok Opname.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowUncountedModal(false)}
                      className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors"
                    >
                      Kembali ke Form Hitungan
                    </button>
                  </div>
                ) : filteredModalUncounted.length === 0 ? (
                  <div className="py-10 text-center text-gray-450 dark:text-zinc-500 text-xs">
                    Tidak ada barang belum dihitung yang cocok dengan pencarian "{uncountedSearchQuery}".
                  </div>
                ) : (
                  filteredModalUncounted.map((prod) => (
                    <div
                      key={prod.id}
                      className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-xl hover:bg-gray-50/80 dark:hover:bg-zinc-850/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden font-black text-xs text-gray-500">
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            prod.name.substring(0, 2).toUpperCase()
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                              {prod.name}
                            </span>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-650 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40">
                              {prod.sku}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Kategori: <b>{prod.category}</b></span>
                            <span>• Rak: <b>{prod.location}</b></span>
                            <span>• Stok Sistem: <b className="text-gray-800 dark:text-zinc-200">{prod.qty} {prod.purchaseUnit || prod.unit}</b></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleAddProductToAudit(prod, 0)}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                          title="Tambahkan ke tabel dengan nilai hitungan 0"
                        >
                          <Plus className="w-3 h-3 text-gray-400" />
                          <span>Hitung (0)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddProductToAudit(prod, prod.qty)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                          title="Tambahkan ke tabel dengan nilai default sama dengan stok sistem"
                        >
                          <Check className="w-3 h-3" />
                          <span>Hitung ({prod.qty})</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Modal */}
              <div className="p-3 sm:px-5 bg-gray-50 dark:bg-zinc-950/80 border-t border-gray-100 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs">
                <span className="text-gray-500 dark:text-zinc-400 text-[11px]">
                  Total <b>{uncountedAuditProducts.length}</b> barang di sektor ini belum dimasukkan ke form audit.
                </span>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowUncountedModal(false)}
                    className="px-4 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Tutup & Pindai Barcode
                  </button>

                  {uncountedAuditProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        handleAddAllUncountedToAudit(false);
                        setShowUncountedModal(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors"
                    >
                      + Masukkan Semua & Lanjutkan
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Print Container for Post-Transaction Barcode Labels */}
      {isPrintingPostTxBarcodes && createPortal(
        <div id="post-tx-barcode-print-root" className="fixed top-0 left-0 invisible pointer-events-none">
          <style>
            {`
              @media print {
                body {
                  visibility: hidden !important;
                  background: white !important;
                  color: black !important;
                  font-family: sans-serif !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                #root {
                  display: none !important;
                }
                #post-tx-barcode-print-root {
                  visibility: visible !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  width: 100% !important;
                  display: flex !important;
                  flex-wrap: wrap !important;
                  gap: 2mm !important;
                  padding: 4mm !important;
                  background: white !important;
                  color: black !important;
                  box-sizing: border-box !important;
                }
                .post-tx-barcode-label-card {
                  width: 33mm !important;
                  height: 15mm !important;
                  overflow: hidden !important;
                  padding: 1mm 0.8mm 0.5mm 0.8mm !important;
                  box-sizing: border-box !important;
                  border: 1px dashed #cccccc !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  justify-content: space-between !important;
                  text-align: center !important;
                  background: white !important;
                }
                * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
              }
            `}
          </style>
          {postTxBarcodePrintList.map((item, idx) => (
            <div key={idx} className="post-tx-barcode-label-card">
              <div className="w-full flex justify-center items-center max-h-[4.8mm] overflow-hidden">
                <p
                  className="font-bold text-black font-sans uppercase text-center w-full"
                  style={{
                    fontSize: item.product.name.length > 25 ? '5.5px' : item.product.name.length > 15 ? '6.5px' : '7.5px',
                    lineHeight: '1.2',
                    wordBreak: 'break-word',
                    margin: 0,
                    padding: 0
                  }}
                >
                  {item.product.name}
                </p>
              </div>
              <div className="barcode-container flex justify-center items-center w-full max-h-[8.5mm] overflow-hidden my-auto">
                <BarcodeComponent
                  value={item.product.sku || '0000'}
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
          ))}
        </div>,
        document.body
      )}

      {/* Transaction Loading Progress Modal */}
      {loadingProgress && (
        <TransactionLoadingModal
          isOpen={loadingProgress.isOpen}
          percentage={loadingProgress.percentage}
          title={loadingProgress.title}
          detail={loadingProgress.detail}
          currentItem={loadingProgress.currentItem}
          totalItems={loadingProgress.totalItems}
        />
      )}
    </div>
  );
}

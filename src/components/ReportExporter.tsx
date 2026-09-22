/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { 
  FileSpreadsheet, 
  FileText, 
  Printer, 
  Download, 
  Calendar, 
  ShieldCheck, 
  Building2, 
  Briefcase,
  Layers,
  ArrowUpDown,
  Copy,
  Check,
  ExternalLink,
  Eraser,
  PenTool,
  MapPin,
  AlertTriangle,
  X,
  ClipboardList,
  PackagePlus,
  PackageMinus
} from 'lucide-react';
import { Product, User, Transaction, StockAlert, BOM, MenuItem, ProductBatch } from '../types';
import { getExpiryStatus } from '../lib/expiryUtils';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

export interface ExpiredEntry {
  text: string;
  csvText: string;
  dateStr: string;
  qty: number;
  status: 'expired' | 'near_expiry' | 'ok' | 'none';
  diffDays: number;
  badgeLabel?: string;
}

// Helper to format expired info list according to requested standard: "exp : 2026-08-23 (nominal jumlah)"
// Rules:
// 1. If stock/qty is 0 (or undefined <= 0), do not display (returns empty array)
// 2. If near expiry (<= 30 days) or expired (<= 0 days), provide warning badges and indicators
const formatExpiredDataEntries = (
  expiryDate?: string,
  qty?: number,
  batches?: ProductBatch[]
): ExpiredEntry[] => {
  // If product has multiple batches with active qty and valid expiry dates
  if (batches && Array.isArray(batches) && batches.length > 0) {
    const activeBatches = batches.filter(b => (b.qty ?? 0) > 0 && b.expiryDate && b.expiryDate.trim());
    if (activeBatches.length > 0) {
      return activeBatches.map(b => {
        const dateStr = b.expiryDate!.trim();
        const expStatus = getExpiryStatus(dateStr);
        const baseText = `exp : ${dateStr} (${b.qty})`;
        let badgeLabel = '';
        let csvText = baseText;

        if (expStatus.status === 'expired') {
          badgeLabel = expStatus.diffDays === 0 ? 'Kadaluarsa Hari Ini' : `Kadaluarsa (${Math.abs(expStatus.diffDays)} hr lalu)`;
          csvText = `${baseText} [🚨 ${badgeLabel}]`;
        } else if (expStatus.status === 'near_expiry') {
          badgeLabel = `Dekat Kadaluarsa (${expStatus.diffDays} hr lagi)`;
          csvText = `${baseText} [⚠️ ${badgeLabel}]`;
        }

        return {
          text: baseText,
          csvText,
          dateStr,
          qty: b.qty,
          status: expStatus.status,
          diffDays: expStatus.diffDays,
          badgeLabel
        };
      });
    }
  }

  // Fallback to top-level expiry date if available ONLY when stock/qty > 0
  const amount = qty !== undefined ? qty : 0;
  if (expiryDate && expiryDate.trim() && amount > 0) {
    const dateStr = expiryDate.trim();
    const expStatus = getExpiryStatus(dateStr);
    const baseText = `exp : ${dateStr} (${amount})`;
    let badgeLabel = '';
    let csvText = baseText;

    if (expStatus.status === 'expired') {
      badgeLabel = expStatus.diffDays === 0 ? 'Kadaluarsa Hari Ini' : `Kadaluarsa (${Math.abs(expStatus.diffDays)} hr lalu)`;
      csvText = `${baseText} [🚨 ${badgeLabel}]`;
    } else if (expStatus.status === 'near_expiry') {
      badgeLabel = `Dekat Kadaluarsa (${expStatus.diffDays} hr lagi)`;
      csvText = `${baseText} [⚠️ ${badgeLabel}]`;
    }

    return [{
      text: baseText,
      csvText,
      dateStr,
      qty: amount,
      status: expStatus.status,
      diffDays: expStatus.diffDays,
      badgeLabel
    }];
  }

  return [];
};

// Helper to extract manual notes only, stripping out system-generated "via scanner", "via multi-item", or system metrics.
const getManualNoteOnly = (note: string | undefined): string => {
  if (!note) return '';
  let trimmed = note.trim();
  
  // Strip out our transparent marker [Form: XXX] first
  trimmed = trimmed.replace(/\[Form:\s*[^\]]+\]/gi, '').trim();
  
  // Exact automated phrases
  const systemPhrases = [
    'Barang masuk via scanner (Multi-Item)',
    'Pengeluaran via multi-item (Multi-Item)',
    'Barang masuk via scanner',
    'Pengeluaran via multi-item',
    'Tidak ada keterangan tambahan.'
  ];
  
  if (systemPhrases.includes(trimmed)) {
    return '';
  }
  
  // Pure automatic prefixes
  if (trimmed.startsWith('Audit Stok Opname berkala.') || 
      (trimmed.startsWith('Inisiasi Mutasi dari ') && trimmed.includes(' ke '))) {
    return '';
  }

  // Suffix strip cases
  let cleaned = trimmed;
  cleaned = cleaned.replace(/\s*\(\s*Barang masuk via scanner \(Multi-Item\)\s*\)$/i, '');
  cleaned = cleaned.replace(/\s*\(\s*Pengeluaran via multi-item \(Multi-Item\)\s*\)$/i, '');
  cleaned = cleaned.replace(/\s*\(\s*Audit Stok Opname berkala\..*?\)$/i, '');
  cleaned = cleaned.replace(/\s*\(\s*Inisiasi Mutasi dari .*? ke .*?\)$/i, '');
  cleaned = cleaned.replace(/\s*\(\s*.*?via scanner.*?\)$/i, '');
  cleaned = cleaned.replace(/\s*\(\s*.*?via multi-item.*?\)$/i, '');

  const finalNote = cleaned.trim();

  // If after stripping it matches any automated tag or is extremely short, treat as empty
  const lower = finalNote.toLowerCase();
  if (
    lower === 'barang masuk via scanner' ||
    lower === 'pengeluaran via multi-item' ||
    lower.startsWith('audit stok opname') ||
    lower.startsWith('inisiasi mutasi')
  ) {
    return '';
  }

  return finalNote;
};

interface ReportExporterProps {
  products: Product[];
  transactions: Transaction[];
  alerts: StockAlert[];
  currentUser: User;
  boms?: BOM[];
  menus?: MenuItem[];
}

export default function ReportExporter({
  products,
  transactions,
  alerts,
  currentUser,
  boms = [],
  menus = []
}: ReportExporterProps) {
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

  const accessibleTransactions = useMemo(() => {
    let txs = transactions || [];
    if (!isUserRestricted || !currentUser || !currentUser.location) return txs;
    const allowedProductIds = new Set((accessibleProducts || []).map(p => p && p.id).filter(Boolean));
    return txs.filter(t => {
      if (!t || !t.productId) return false;
      const isProductMatch = allowedProductIds.has(t.productId);
      if (isProductMatch) return true;
      
      return t.operatorName === currentUser.name;
    });
  }, [transactions, isUserRestricted, accessibleProducts, currentUser]);

  const [reportType, setReportType] = useState<'inventory' | 'alerts' | 'transactions' | 'audit' | 'bom' | 'menu'>('inventory');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'in' | 'out' | 'audit' | 'produksi' | 'transfer'>('all');
  const [jenisBarangFilter, setJenisBarangFilter] = useState<'product' | 'bom' | 'menu'>('product');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showPhotosInReport, setShowPhotosInReport] = useState<boolean>(true);

  const uniqueLocations = useMemo(() => {
    const locSet = new Set<string>();
    products.forEach(p => {
      if (p.location) {
        p.location.split(',').forEach(loc => {
          const trimmed = loc.trim();
          if (trimmed) locSet.add(trimmed);
        });
      }
    });
    return Array.from(locSet).sort();
  }, [products]);

  const uniqueCategories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category))).sort();
    return cats;
  }, [products]);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [signedElectronically, setSignedElectronically] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Physical Form Printing & Excel Export States (Stok Opname, Barang Masuk, Barang Keluar)
  const [physicalFormType, setPhysicalFormType] = useState<'audit' | 'in' | 'out'>('audit');
  const [isPrintingPhysicalForm, setIsPrintingPhysicalForm] = useState(false);
  const [printingPhysicalFormLocation, setPrintingPhysicalFormLocation] = useState('');
  const [showPhysicalFormPreview, setShowPhysicalFormPreview] = useState(false);
  const [physicalFormStartDate, setPhysicalFormStartDate] = useState<string>(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  });
  const [physicalFormEndDate, setPhysicalFormEndDate] = useState<string>(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-10`;
  });

  const getOpnameColumns = () => {
    if (!physicalFormStartDate || !physicalFormEndDate) return [];
    try {
      const start = new Date(physicalFormStartDate);
      const end = new Date(physicalFormEndDate);
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

  const physicalFormProductsToPrint = useMemo(() => {
    const selectedLoc = locationFilter;
    if (isUserRestricted && selectedLoc === 'all' && currentUser.location) {
      return accessibleProducts;
    }
    if (selectedLoc === 'all') {
      return products;
    }
    return products.filter(p => p.location && p.location.trim().toLowerCase() === selectedLoc.trim().toLowerCase());
  }, [products, accessibleProducts, isUserRestricted, locationFilter, currentUser.location]);

  const handleOpenPhysicalFormPreview = (type: 'audit' | 'in' | 'out') => {
    setPhysicalFormType(type);
    const locName = locationFilter === 'all' ? 'Semua Sektor / Rak' : locationFilter;
    setPrintingPhysicalFormLocation(locName);
    setShowPhysicalFormPreview(true);
  };

  const handlePrintPhysicalForm = () => {
    const locName = locationFilter === 'all' ? 'Semua Sektor / Rak' : locationFilter;
    setPrintingPhysicalFormLocation(locName);
    setIsPrintingPhysicalForm(true);
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print physical form failed:', err);
      } finally {
        setTimeout(() => {
          setIsPrintingPhysicalForm(false);
        }, 1200);
      }
    }, 400);
  };

  const handleExportPhysicalFormExcel = (targetType?: 'audit' | 'in' | 'out') => {
    const type = targetType || physicalFormType;
    const loc = printingPhysicalFormLocation || (locationFilter === 'all' ? 'Semua Sektor / Rak' : locationFilter);
    const dateRangeText = formatAuditDateRange(physicalFormStartDate, physicalFormEndDate);

    let docTitle = 'FORMULIR STOK OPNAME BARANG';
    let docSubtitle = loc === 'Semua Sektor / Rak' ? 'SELURUH SEKTOR / RAK AKTIF' : loc.toUpperCase();
    let sheetName = 'Stok Opname';
    let filePrefix = 'Formulir_Stok_Opname';
    let totalCols = 3 + opnameCols.length;

    if (type === 'in') {
      docTitle = 'FORMULIR PENERIMAAN BARANG MASUK (INBOUND)';
      sheetName = 'Barang Masuk';
      filePrefix = 'Formulir_Penerimaan_Barang_Masuk';
      totalCols = 8;
    } else if (type === 'out') {
      docTitle = 'FORMULIR PENGELUARAN BARANG KELUAR (OUTBOUND)';
      sheetName = 'Barang Keluar';
      filePrefix = 'Formulir_Pengeluaran_Barang_Keluar';
      totalCols = 8;
    }

    const col1Span = Math.max(1, Math.floor(totalCols / 3));
    const col2Span = Math.max(1, Math.floor((totalCols - col1Span) / 2));
    const col3Span = Math.max(1, totalCols - col1Span - col2Span);

    let tableHeaderHtml = '';
    let tableRowsHtml = '';

    const dayHeadersHtml = opnameCols.map(c => `<th class="header-cell" style="width: 45px;">${c}</th>`).join('');
    tableHeaderHtml = `
      <tr>
        <th class="header-cell" style="width: 40px;">No</th>
        <th class="header-cell" style="width: 260px; text-align: left;">Nama Barang</th>
        <th class="header-cell" style="width: 80px;">Satuan</th>
        ${dayHeadersHtml}
      </tr>
    `;

    if (physicalFormProductsToPrint.length === 0) {
      tableRowsHtml = `
        <tr>
          <td colspan="${totalCols}" class="data-cell data-center" style="color: #888; font-style: italic; padding: 20px;">
            Tidak ada barang terdaftar di lokasi / rak yang dipilih.
          </td>
        </tr>
      `;
    } else {
      tableRowsHtml = physicalFormProductsToPrint.map((p, idx) => {
        const blankDayCells = opnameCols.map(() => `<td class="data-cell data-center" style="height: 24px;"></td>`).join('');
        return `
          <tr>
            <td class="data-cell data-center">${idx + 1}</td>
            <td class="data-cell data-left data-bold">${p.name || '-'}</td>
            <td class="data-cell data-center" style="text-transform: uppercase;">${p.unit || 'pcs'}</td>
            ${blankDayCells}
          </tr>
        `;
      }).join('');
    }

    const leftColSpan = Math.ceil(totalCols / 2);
    const rightColSpan = totalCols - leftColSpan;

    const sig1Title = type === 'in' ? 'Diterima Oleh,' : type === 'out' ? 'Diserahkan Oleh,' : 'Dibuat Oleh,';
    const sig1Role = type === 'in' ? 'Petugas Gudang' : type === 'out' ? 'Petugas Gudang' : 'Pemeriksaan Fisik';
    const sig2Title = type === 'in' ? 'Pengirim / Ekspedisi,' : type === 'out' ? 'Diterima Oleh (Pemohon),' : 'Saksi Lapangan,';
    const sig2Role = type === 'in' ? 'Supplier / Driver' : type === 'out' ? 'Penerima / Driver' : 'Saksi Lapangan';
    const sig3Title = 'Divalidasi Oleh,';
    const sig3Role = 'Kepala Gudang / Admin';

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
        <!--[if gte mso 9]>
        <xml>
         <x:ExcelWorkbook>
          <x:ExcelWorksheets>
           <x:ExcelWorksheet>
            <x:Name>${sheetName}</x:Name>
            <x:WorksheetOptions>
             <x:DisplayGridlines/>
             <x:Print>
              <x:ValidPrinterInfo/>
              <x:PaperSizeIndex>9</x:PaperSizeIndex>
              <x:HorizontalResolution>600</x:HorizontalResolution>
              <x:VerticalResolution>600</x:VerticalResolution>
             </x:Print>
            </x:WorksheetOptions>
           </x:ExcelWorksheet>
          </x:ExcelWorksheets>
         </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000; }
          table { border-collapse: collapse; width: 100%; }
          .title { font-size: 15pt; font-weight: bold; text-align: center; height: 32px; vertical-align: middle; }
          .subtitle { font-size: 10pt; color: #555555; text-align: center; height: 20px; vertical-align: middle; font-weight: bold; }
          .meta-row { height: 22px; }
          .meta-left { font-size: 10pt; text-align: left; vertical-align: middle; }
          .meta-right { font-size: 10pt; text-align: right; vertical-align: middle; }
          .header-cell { background-color: #f3f4f6; font-weight: bold; border: 1px solid #000000; text-align: center; vertical-align: middle; height: 26px; font-size: 10pt; }
          .data-cell { border: 1px solid #000000; vertical-align: middle; padding: 4px 6px; height: 22px; font-size: 10pt; }
          .data-center { text-align: center; }
          .data-left { text-align: left; }
          .data-right { text-align: right; }
          .data-bold { font-weight: bold; }
          .data-mono { font-family: Consolas, monospace; }
          .sig-title { font-weight: bold; text-align: center; vertical-align: bottom; height: 25px; font-size: 10pt; }
          .sig-space { height: 50px; }
          .sig-line { font-weight: bold; text-align: center; border-top: 1px solid #000000; text-transform: uppercase; font-size: 10pt; height: 24px; vertical-align: top; }
        </style>
      </head>
      <body>
        <table>
          <!-- Document Title -->
          <tr>
            <td colspan="${totalCols}" class="title">${docTitle}</td>
          </tr>
          <tr>
            <td colspan="${totalCols}" class="subtitle">${docSubtitle}</td>
          </tr>
          <tr>
            <td colspan="${totalCols}" style="height: 10px; border-bottom: 2px solid #000000;"></td>
          </tr>
          
          <!-- Document Metadata -->
          <tr class="meta-row">
            <td colspan="${leftColSpan}" class="meta-left" style="padding-top: 8px;"><strong>Gudang / Sektor:</strong> ${loc.toUpperCase()}</td>
            <td colspan="${rightColSpan}" class="meta-right" style="padding-top: 8px;"><strong>Periode Tanggal:</strong> ${dateRangeText}</td>
          </tr>
          <tr class="meta-row">
            <td colspan="${leftColSpan}" class="meta-left" style="padding-bottom: 12px;"><strong>Petugas Checker:</strong> ${currentUser.name} (${currentUser.role})</td>
            <td colspan="${rightColSpan}" class="meta-right" style="padding-bottom: 12px;"><strong>Tanggal Cetak:</strong> ${new Date().toLocaleDateString('id-ID')}</td>
          </tr>

          <!-- Data Table Header -->
          ${tableHeaderHtml}

          <!-- Data Table Rows -->
          ${tableRowsHtml}

          <!-- Spacing before signatures -->
          <tr>
            <td colspan="${totalCols}" style="height: 30px;"></td>
          </tr>

          <!-- Signatures Section -->
          <tr>
            <td colspan="${col1Span}" class="sig-title">${sig1Title}</td>
            <td colspan="${col2Span}" class="sig-title">${sig2Title}</td>
            <td colspan="${col3Span}" class="sig-title">${sig3Title}</td>
          </tr>
          <tr>
            <td colspan="${col1Span}" class="sig-space"></td>
            <td colspan="${col2Span}" class="sig-space"></td>
            <td colspan="${col3Span}" class="sig-space"></td>
          </tr>
          <tr>
            <td colspan="${col1Span}" class="sig-line">${sig1Role}</td>
            <td colspan="${col2Span}" class="sig-line">${sig2Role}</td>
            <td colspan="${col3Span}" class="sig-line">${sig3Role}</td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filePrefix}_${physicalFormStartDate}_sd_${physicalFormEndDate}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  // Editable Signatures State
  const [checkerTitle, setCheckerTitle] = useState('Petugas,');
  const [checkerName, setCheckerName] = useState(currentUser.name);
  const [checkerRole, setCheckerRole] = useState(
    currentUser.role === 'admin' ? 'Administrator Pusat' : 
    currentUser.role === 'supervisor' ? 'Supervisor Gudang' : 
    'Penanggungjawab Sektor'
  );

  const [auditorTitle, setAuditorTitle] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [auditorRole, setAuditorRole] = useState('');

  const [managerTitle, setManagerTitle] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerRole, setManagerRole] = useState('');

  // Signature Refs
  const checkerSigRef = React.useRef<SignatureCanvas>(null);
  const auditorSigRef = React.useRef<SignatureCanvas>(null);
  const managerSigRef = React.useRef<SignatureCanvas>(null);

  const [activeSigningRole, setActiveSigningRole] = useState<'checker' | 'auditor' | 'manager' | null>(null);
  const modalSigRef = React.useRef<SignatureCanvas>(null);

  // Signature Images State (for printing)
  const [checkerSigImg, setCheckerSigImg] = useState<string | null>(null);
  const [auditorSigImg, setAuditorSigImg] = useState<string | null>(null);
  const [managerSigImg, setManagerSigImg] = useState<string | null>(null);

  const saveSignature = (ref: React.RefObject<SignatureCanvas | null>, setter: (val: string | null) => void) => {
    if (ref.current && !ref.current.isEmpty()) {
      setter(ref.current.getTrimmedCanvas().toDataURL('image/png'));
    }
  };

  const clearSignature = (ref: React.RefObject<SignatureCanvas | null>, setter: (val: string | null) => void) => {
    if (ref.current) {
      ref.current.clear();
      setter(null);
    }
  };

  const formatDateIndo = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const [documentSeqNumber, setDocumentSeqNumber] = useState<string>('01');

  const getJenisTransaksiAbbr = useCallback(() => {
    if (reportType === 'inventory') return 'STOK';
    if (reportType === 'bom') return 'BOM';
    if (reportType === 'menu') return 'MENU';
    if (reportType === 'alerts') return 'ALERTS';
    if (reportType === 'audit') return 'OPNAME';
    
    if (reportType === 'transactions') {
      if (txTypeFilter === 'in') return 'MASUK';
      if (txTypeFilter === 'out') return 'KELUAR';
      if (txTypeFilter === 'produksi') return 'PRODUKSI';
      if (txTypeFilter === 'transfer') return 'TRANSFER';
      return 'M-TRX';
    }
    return 'M-TRX';
  }, [reportType, txTypeFilter]);

  const getTodayFormatted = useCallback(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${month}${year}`;
  }, []);

  const reportNumber = useMemo(() => {
    const jenisTx = getJenisTransaksiAbbr();
    const todayStr = getTodayFormatted();
    return `TNSP/${jenisTx}/${documentSeqNumber}/${todayStr}`;
  }, [getJenisTransaksiAbbr, getTodayFormatted, documentSeqNumber]);

  // Convert numbers to IDR currency
  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // 1. Filtered data depending on choices
  const preparedData = useMemo(() => {
    const productMap = new Map(products.map(p => [p.id, p]));
    const productSkuMap = new Map(products.map(p => [p.sku.toLowerCase(), p]));
    // Collect all names belonging to BOM (recipe name and ingredient names)
    const bomMatchedNames = new Set<string>();
    boms.forEach(b => {
      if (b.name) bomMatchedNames.add(b.name.trim().toLowerCase());
      if (b.items) {
        b.items.forEach(item => {
          if (item.productName) {
            bomMatchedNames.add(item.productName.trim().toLowerCase());
          }
        });
      }
    });
    // Fallback: Also include any product in the system that has a category related to BOM
    products.forEach(p => {
      if (p.category && p.category.toLowerCase().includes('bom')) {
        bomMatchedNames.add(p.name.trim().toLowerCase());
      }
    });

    // Collect all names belonging to Menu items (menu name and ingredient names)
    const menuMatchedNames = new Set<string>();
    menus.forEach(m => {
      if (m.name) menuMatchedNames.add(m.name.trim().toLowerCase());
      if (m.ingredients) {
        m.ingredients.forEach(ing => {
          if (ing.name) {
            menuMatchedNames.add(ing.name.trim().toLowerCase());
          }
        });
      }
    });
    // Fallback: Also include any product in the system that has a category related to Menu
    products.forEach(p => {
      if (p.category && p.category.toLowerCase().includes('menu')) {
        menuMatchedNames.add(p.name.trim().toLowerCase());
      }
    });

    // Trace transactions backwards per product to find startQty and endQty for each transaction
    const productTxStockMap = new Map<string, { startQty: number; endQty: number }>();
    const txsByProduct = new Map<string, Transaction[]>();
    (transactions || []).forEach(t => {
      if (!t.productId) return;
      if (!txsByProduct.has(t.productId)) {
        txsByProduct.set(t.productId, []);
      }
      txsByProduct.get(t.productId)!.push(t);
    });

    const calculateQtyAtDate = (p: Product, targetDateStr: string) => {
      if (!targetDateStr) return p.qty;
      const productTxs = txsByProduct.get(p.id) || [];
      if (productTxs.length === 0) return p.qty;

      const sortedTxs = [...productTxs].sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });

      let runningQty = p.qty;
      let qtyAtTargetDate: number | null = null;

      for (const t of sortedTxs) {
        const tDateStr = t.date.split('T')[0];
        let startQty = 0;
        let endQty = runningQty;

        const isAudit = !!t.isAudit || (t.note || '').toLowerCase().includes('opname') || (t.note || '').toLowerCase().includes('penyesuaian stok');
        if (isAudit) {
          const physical = t.physicalQty !== undefined ? t.physicalQty : t.qty;
          const system = t.systemQty !== undefined ? t.systemQty : (physical - (t.difference ?? 0));
          startQty = system;
          endQty = physical;
          runningQty = system;
        } else if (t.type === 'out') {
          startQty = runningQty + t.qty;
          endQty = runningQty;
          runningQty = startQty;
        } else {
          startQty = runningQty - t.qty;
          endQty = runningQty;
          runningQty = startQty;
        }

        if (qtyAtTargetDate === null && tDateStr <= targetDateStr) {
          qtyAtTargetDate = endQty;
        }
      }

      if (qtyAtTargetDate === null) {
        qtyAtTargetDate = runningQty;
      }

      return qtyAtTargetDate;
    };

    (products || []).forEach(p => {
      const productTxs = txsByProduct.get(p.id) || [];
      const sortedTxs = [...productTxs].sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });

      let runningQty = p.qty;
      sortedTxs.forEach(t => {
        let startQty = 0;
        let endQty = runningQty;

        const isAudit = !!t.isAudit || (t.note || '').toLowerCase().includes('opname') || (t.note || '').toLowerCase().includes('penyesuaian stok');
        if (isAudit) {
          const physical = t.physicalQty !== undefined ? t.physicalQty : t.qty;
          const system = t.systemQty !== undefined ? t.systemQty : (physical - (t.difference ?? 0));
          startQty = system;
          endQty = physical;
          runningQty = system;
        } else if (t.type === 'out') {
          startQty = runningQty + t.qty;
          endQty = runningQty;
          runningQty = startQty;
        } else {
          startQty = runningQty - t.qty;
          endQty = runningQty;
          runningQty = startQty;
        }

        productTxStockMap.set(t.id, { startQty, endQty });
      });
    });

    txsByProduct.forEach((productTxs, prodId) => {
      const exists = products.some(p => p.id === prodId);
      if (!exists) {
        const sortedTxsAsc = [...productTxs].sort((a, b) => {
          const timeA = new Date(a.date).getTime();
          const timeB = new Date(b.date).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });
        let running = 0;
        sortedTxsAsc.forEach(t => {
          let startQty = running;
          let endQty = running;

          const isAudit = !!t.isAudit || (t.note || '').toLowerCase().includes('opname') || (t.note || '').toLowerCase().includes('penyesuaian stok');
          if (isAudit) {
            const physical = t.physicalQty !== undefined ? t.physicalQty : t.qty;
            const system = t.systemQty !== undefined ? t.systemQty : (physical - (t.difference ?? 0));
            startQty = system;
            endQty = physical;
            running = physical;
          } else if (t.type === 'out') {
            endQty = running - t.qty;
            running = endQty;
          } else {
            endQty = running + t.qty;
            running = endQty;
          }
          productTxStockMap.set(t.id, { startQty, endQty });
        });
      }
    });

    if (reportType === 'inventory') {
      let filtered = accessibleProducts;

      // Filter Lokasi & Kategori
      if (locationFilter !== 'all') {
        filtered = filtered.filter(p => p.location && p.location.split(',').map(l => l.trim().toLowerCase()).includes(locationFilter.toLowerCase()));
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === categoryFilter);
      }

      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(query) || 
          p.sku.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
        );
      }
      const targetDate = endDate || startDate;
      return filtered.map(p => {
        const stokOnDate = calculateQtyAtDate(p, targetDate);
        const expiredList = formatExpiredDataEntries(p.expiryDate, stokOnDate, p.batches);
        return {
          sku: p.sku,
          nama: p.name,
          kategori: p.category,
          stok: stokOnDate,
          minStok: p.minQty,
          lokasi: p.location,
          harga: p.price,
          totalNilai: stokOnDate * p.price,
          imageUrl: p.imageUrl,
          catatan: p.description || '',
          expiredList,
          expiredText: expiredList.length > 0 ? expiredList.map(e => e.csvText).join(' | ') : '-'
        };
      });
    } else if (reportType === 'alerts') {
      let filtered = accessibleProducts.filter(p => p.qty <= p.minQty);

      if (jenisBarangFilter === 'bom') {
        filtered = filtered.filter(p => bomMatchedNames.has(p.name.trim().toLowerCase()));
      } else if (jenisBarangFilter === 'menu') {
        filtered = filtered.filter(p => menuMatchedNames.has(p.name.trim().toLowerCase()));
      }

      // Filter Lokasi & Kategori
      if (locationFilter !== 'all') {
        filtered = filtered.filter(p => p.location && p.location.split(',').map(l => l.trim().toLowerCase()).includes(locationFilter.toLowerCase()));
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === categoryFilter);
      }

      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(query) || 
          p.sku.toLowerCase().includes(query)
        );
      }
      return filtered.map(p => {
        const expiredList = formatExpiredDataEntries(p.expiryDate, p.qty, p.batches);
        return {
          sku: p.sku,
          nama: p.name,
          kategori: p.category,
          stok: p.qty,
          minStok: p.minQty,
          lokasi: p.location,
          harga: p.price,
          defisit: p.minQty - p.qty,
          imageUrl: p.imageUrl,
          catatan: p.description || '',
          expiredList,
          expiredText: expiredList.length > 0 ? expiredList.map(e => e.csvText).join(' | ') : '-'
        };
      });
    } else if (reportType === 'transactions') {
      // Transactions filtered by date range
      let filtered = accessibleTransactions.filter(t => {
        if (!t || !t.date) return false;
        const itemDateStr = t.date.split('T')[0];
        if (startDate && itemDateStr < startDate) return false;
        if (endDate && itemDateStr > endDate) return false;
        return true;
      });

      if (jenisBarangFilter === 'bom') {
        filtered = filtered.filter(t => bomMatchedNames.has(t.productName.trim().toLowerCase()));
      } else if (jenisBarangFilter === 'menu') {
        filtered = filtered.filter(t => menuMatchedNames.has(t.productName.trim().toLowerCase()));
      }

      // Filter Lokasi & Kategori
      if (locationFilter !== 'all' || categoryFilter !== 'all') {
        const productMap = new Map(products.map(p => [p.id, p]));
        filtered = filtered.filter(t => {
          const product = productMap.get(t.productId);
          if (!product) return false;
          const matchesLoc = locationFilter === 'all' || (product.location && product.location.split(',').map(l => l.trim().toLowerCase()).includes(locationFilter.toLowerCase()));
          const matchesCat = categoryFilter === 'all' || product.category === categoryFilter;
          return matchesLoc && matchesCat;
        });
      }

      // Filter out POS records if they exist in history
      filtered = filtered.filter(t => !t.id.includes('-pos-') && !t.note.toLowerCase().includes('pos'));

      // Filter by flow type (all, in, out, audit, produksi, transfer)
      if (txTypeFilter !== 'all') {
        const checkIsProd = (t: any) => (t.note || '').toLowerCase().includes('produksi') || (t.id || '').toLowerCase().includes('-prod-');
        const checkIsAudit = (t: any) => !!t.isAudit || (t.note || '').toLowerCase().includes('opname') || (t.note || '').toLowerCase().includes('penyesuaian stok');
        const checkIsTransfer = (t: any) => (t.note || '').toLowerCase().includes('transfer') || (t.note || '').toLowerCase().includes('mutasi');
        
        if (txTypeFilter === 'audit') {
          filtered = filtered.filter(t => checkIsAudit(t));
        } else if (txTypeFilter === 'produksi') {
          filtered = filtered.filter(t => checkIsProd(t));
        } else if (txTypeFilter === 'transfer') {
          filtered = filtered.filter(t => checkIsTransfer(t));
        } else if (txTypeFilter === 'in') {
          filtered = filtered.filter(t => t.type === 'in' && !checkIsAudit(t) && !checkIsProd(t) && !checkIsTransfer(t));
        } else if (txTypeFilter === 'out') {
          filtered = filtered.filter(t => t.type === 'out' && !checkIsAudit(t) && !checkIsProd(t) && !checkIsTransfer(t));
        }
      }

      // Filter by search query
      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        filtered = filtered.filter(t => 
          t.productName.toLowerCase().includes(query) || 
          t.sku.toLowerCase().includes(query) ||
          (t.note && t.note.toLowerCase().includes(query)) ||
          t.operatorName.toLowerCase().includes(query)
        );
      }

      // Group filtered transactions by date and product SKU
      const groups = new Map<string, typeof filtered>();
      filtered.forEach(t => {
        const tDateStr = new Date(t.date).toLocaleDateString('id-ID');
        const key = `${tDateStr}_${t.sku.toLowerCase()}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(t);
      });

      const groupedData = Array.from(groups.values()).map(groupTxs => {
        // Sort chronologically within the group to correctly find start and end stock levels
        const sortedTxsInGroup = [...groupTxs].sort((a, b) => {
          const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (diff !== 0) return diff;
          return a.id.localeCompare(b.id);
        });

        const firstTx = sortedTxsInGroup[0];
        const lastTx = sortedTxsInGroup[sortedTxsInGroup.length - 1];

        const prod = productMap.get(firstTx.productId) || productSkuMap.get(firstTx.sku.toLowerCase());
        const firstStockInfo = productTxStockMap.get(firstTx.id) || { startQty: 0, endQty: 0 };
        const lastStockInfo = productTxStockMap.get(lastTx.id) || { startQty: 0, endQty: 0 };

        // Sum IN and OUT quantities
        let totalIn = 0;
        let totalOut = 0;
        sortedTxsInGroup.forEach(t => {
          if (t.type === 'out') {
            totalOut += t.qty;
          } else {
            totalIn += t.qty;
          }
        });

        // Unique operators
        const operators = Array.from(new Set(sortedTxsInGroup.map(t => t.operatorName))).filter(Boolean).join(', ');

        // Unique notes / descriptions (manual only)
        const notes = Array.from(new Set(sortedTxsInGroup.map(t => getManualNoteOnly(t.note)))).filter(Boolean).join('; ');

        // Combined type label or single/multiple representation
        const types = Array.from(new Set(sortedTxsInGroup.map(t => {
          const isProd = (t.note || '').toLowerCase().includes('produksi') || (t.id || '').toLowerCase().includes('-prod-');
          const isAudit = !!t.isAudit || (t.note || '').toLowerCase().includes('opname') || (t.note || '').toLowerCase().includes('penyesuaian stok');
          const isTransfer = (t.note || '').toLowerCase().includes('transfer') || (t.note || '').toLowerCase().includes('mutasi');
          if (isAudit) return 'AUDIT';
          if (isProd) return 'PRODUKSI';
          if (isTransfer) return 'TRANSFER';
          return t.type === 'in' ? 'IN' : 'OUT';
        })));
        const tipeLabel = types.join(', ');

        // Extract expired info from transactions in group or matching product
        const txsWithExp = sortedTxsInGroup.filter(t => t.expiryDate && t.expiryDate.trim() && (t.qty > 0));
        let expiredList: ExpiredEntry[] = [];
        if (txsWithExp.length > 0) {
          expiredList = txsWithExp.map(t => {
            const dateStr = t.expiryDate!.trim();
            const amount = t.qty ?? 0;
            const expStatus = getExpiryStatus(dateStr);
            const baseText = `exp : ${dateStr} (${amount})`;
            let badgeLabel = '';
            let csvText = baseText;
            if (expStatus.status === 'expired') {
              badgeLabel = expStatus.diffDays === 0 ? 'Kadaluarsa Hari Ini' : `Kadaluarsa (${Math.abs(expStatus.diffDays)} hr lalu)`;
              csvText = `${baseText} [🚨 ${badgeLabel}]`;
            } else if (expStatus.status === 'near_expiry') {
              badgeLabel = `Dekat Kadaluarsa (${expStatus.diffDays} hr lagi)`;
              csvText = `${baseText} [⚠️ ${badgeLabel}]`;
            }
            return {
              text: baseText,
              csvText,
              dateStr,
              qty: amount,
              status: expStatus.status,
              diffDays: expStatus.diffDays,
              badgeLabel
            };
          });
        } else if (prod && lastStockInfo.endQty > 0) {
          expiredList = formatExpiredDataEntries(prod.expiryDate, lastStockInfo.endQty, prod.batches);
        }

        return {
          tanggal: new Date(firstTx.date).toLocaleDateString('id-ID'),
          nama: firstTx.productName,
          sku: firstTx.sku,
          tipe: tipeLabel,
          inQty: totalIn,
          outQty: totalOut,
          qty: totalIn + totalOut,
          petugas: operators,
          keterangan: notes,
          imageUrl: prod?.imageUrl,
          stokAwal: firstStockInfo.startQty,
          stokAkhir: lastStockInfo.endQty,
          tipeArus: sortedTxsInGroup.length === 1 ? firstTx.type : 'mixed',
          expiredList,
          expiredText: expiredList.length > 0 ? expiredList.map(e => e.csvText).join(' | ') : '-'
        };
      });

      // Sort grouped data newest first
      return groupedData.sort((a, b) => {
        const parseDate = (dStr: string) => {
          const parts = dStr.split('/');
          if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
          }
          return 0;
        };
        const timeA = parseDate(a.tanggal);
        const timeB = parseDate(b.tanggal);
        if (timeA !== timeB) return timeB - timeA;
        return a.nama.localeCompare(b.nama);
      });
    } else if (reportType === 'bom') {
      let filtered = boms || [];

      // Filter Lokasi
      if (locationFilter !== 'all') {
        filtered = filtered.filter(b => b.location === locationFilter);
      }

      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        filtered = filtered.filter(b => 
          b.name.toLowerCase().includes(query) || 
          (b.items && b.items.some(item => item.productName.toLowerCase().includes(query)))
        );
      }

      return filtered.map(b => {
        const matchingProduct = (products || []).find(p => 
          p && p.name && p.location &&
          p.name.trim().toLowerCase() === b.name.trim().toLowerCase() && 
          p.location.split(',').map(l => l.trim().toLowerCase()).includes(b.location.trim().toLowerCase())
        );
        const currentStockVal = matchingProduct ? matchingProduct.qty : 0;
        return {
          id: b.id,
          nama: b.name,
          lokasi: b.location,
          stok: `${currentStockVal} ${b.yieldUnit}`,
          yield: `${b.yieldQty} ${b.yieldUnit}`,
          totalCost: b.totalCost,
          komponenText: b.items ? b.items.map(item => `${item.productName} (${item.qty} ${item.unit})`).join(', ') : '',
          items: b.items || []
        };
      });
    } else if (reportType === 'menu') {
      let filtered = menus || [];

      // Filter Lokasi
      if (locationFilter !== 'all') {
        filtered = filtered.filter(m => m.location === locationFilter);
      }
      // Filter Kategori
      if (categoryFilter !== 'all') {
        filtered = filtered.filter(m => m.category === categoryFilter);
      }

      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        filtered = filtered.filter(m => 
          m.name.toLowerCase().includes(query) || 
          m.category.toLowerCase().includes(query)
        );
      }

      return filtered.map(m => ({
        id: m.id,
        nama: m.name,
        lokasi: m.location,
        kategori: m.category,
        totalHPP: m.totalHPP,
        items: m.ingredients || []
      }));
    } else {
      // reportType === 'audit'
      // Get all audit transactions
      let filtered = accessibleTransactions.filter(t => 
        t.isAudit === true || 
        String(t.isAudit) === 'true' || 
        (t.note || '').toLowerCase().includes('opname') || 
        (t.note || '').toLowerCase().includes('penyesuaian')
      );

      if (jenisBarangFilter === 'bom') {
        filtered = filtered.filter(t => bomMatchedNames.has(t.productName.trim().toLowerCase()));
      } else if (jenisBarangFilter === 'menu') {
        filtered = filtered.filter(t => menuMatchedNames.has(t.productName.trim().toLowerCase()));
      }

      // Filter by date range
      filtered = filtered.filter(t => {
        if (!t || !t.date) return false;
        const itemDateStr = t.date.split('T')[0];
        if (startDate && itemDateStr < startDate) return false;
        if (endDate && itemDateStr > endDate) return false;
        return true;
      });

      // Filter Lokasi & Kategori
      if (locationFilter !== 'all' || categoryFilter !== 'all') {
        const productMap = new Map(products.map(p => [p.id, p]));
        filtered = filtered.filter(t => {
          const product = productMap.get(t.productId);
          if (!product) return false;
          const matchesLoc = locationFilter === 'all' || (product.location && product.location.split(',').map(l => l.trim().toLowerCase()).includes(locationFilter.toLowerCase()));
          const matchesCat = categoryFilter === 'all' || product.category === categoryFilter;
          return matchesLoc && matchesCat;
        });
      }

      // Filter by search query
      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        filtered = filtered.filter(t => 
          t.productName.toLowerCase().includes(query) || 
          t.sku.toLowerCase().includes(query) ||
          (t.note && t.note.toLowerCase().includes(query)) ||
          t.operatorName.toLowerCase().includes(query)
        );
      }

      return filtered.map(t => {
        const prod = productMap.get(t.productId) || productSkuMap.get(t.sku.toLowerCase());
        const auditQty = t.physicalQty !== undefined ? t.physicalQty : (prod ? prod.qty : 0);
        let expiredList: ExpiredEntry[] = [];
        if (auditQty > 0) {
          if (t.expiryDate && t.expiryDate.trim()) {
            const dateStr = t.expiryDate.trim();
            const expStatus = getExpiryStatus(dateStr);
            const baseText = `exp : ${dateStr} (${auditQty})`;
            let badgeLabel = '';
            let csvText = baseText;
            if (expStatus.status === 'expired') {
              badgeLabel = expStatus.diffDays === 0 ? 'Kadaluarsa Hari Ini' : `Kadaluarsa (${Math.abs(expStatus.diffDays)} hr lalu)`;
              csvText = `${baseText} [🚨 ${badgeLabel}]`;
            } else if (expStatus.status === 'near_expiry') {
              badgeLabel = `Dekat Kadaluarsa (${expStatus.diffDays} hr lagi)`;
              csvText = `${baseText} [⚠️ ${badgeLabel}]`;
            }
            expiredList = [{
              text: baseText,
              csvText,
              dateStr,
              qty: auditQty,
              status: expStatus.status,
              diffDays: expStatus.diffDays,
              badgeLabel
            }];
          } else if (prod) {
            expiredList = formatExpiredDataEntries(prod.expiryDate, auditQty, prod.batches);
          }
        }

        return {
          tanggal: new Date(t.date).toLocaleDateString('id-ID'),
          nama: t.productName,
          sku: t.sku,
          stokSistem: t.systemQty ?? 0,
          stokFisik: t.physicalQty ?? 0,
          selisih: t.difference ?? 0,
          petugas: t.operatorName,
          keterangan: t.note,
          imageUrl: prod?.imageUrl,
          expiredList,
          expiredText: expiredList.length > 0 ? expiredList.map(e => e.csvText).join(' | ') : '-'
        };
      });
    }
  }, [reportType, startDate, endDate, accessibleProducts, accessibleTransactions, searchFilter, txTypeFilter, locationFilter, categoryFilter, products, boms, menus, jenisBarangFilter]);

  const totalNilaiStokTerkini = useMemo(() => {
    let filtered = accessibleProducts;
    if (locationFilter !== 'all') {
      filtered = filtered.filter(p => p.location && p.location.split(',').map(l => l.trim().toLowerCase()).includes(locationFilter.toLowerCase()));
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    const txsByProduct = new Map<string, Transaction[]>();
    (transactions || []).forEach(t => {
      if (!t.productId) return;
      if (!txsByProduct.has(t.productId)) {
        txsByProduct.set(t.productId, []);
      }
      txsByProduct.get(t.productId)!.push(t);
    });

    const targetDate = endDate || startDate;

    return filtered.reduce((sum, p) => {
      const productTxs = txsByProduct.get(p.id) || [];
      let qtyOnDate = p.qty;
      if (productTxs.length > 0 && targetDate) {
        const sortedTxs = [...productTxs].sort((a, b) => {
          const timeA = new Date(a.date).getTime();
          const timeB = new Date(b.date).getTime();
          if (timeA !== timeB) return timeB - timeA;
          return b.id.localeCompare(a.id);
        });

        let runningQty = p.qty;
        let qtyAtTargetDate: number | null = null;

        for (const t of sortedTxs) {
          const tDateStr = t.date.split('T')[0];
          let startQty = 0;
          let endQty = runningQty;

          const isAudit = !!t.isAudit || (t.note || '').toLowerCase().includes('opname') || (t.note || '').toLowerCase().includes('penyesuaian stok');
          if (isAudit) {
            const physical = t.physicalQty !== undefined ? t.physicalQty : t.qty;
            const system = t.systemQty !== undefined ? t.systemQty : (physical - (t.difference ?? 0));
            startQty = system;
            endQty = physical;
            runningQty = system;
          } else if (t.type === 'out') {
            startQty = runningQty + t.qty;
            endQty = runningQty;
            runningQty = startQty;
          } else {
            startQty = runningQty - t.qty;
            endQty = runningQty;
            runningQty = startQty;
          }

          if (qtyAtTargetDate === null && tDateStr <= targetDate) {
            qtyAtTargetDate = endQty;
          }
        }

        if (qtyAtTargetDate !== null) {
          qtyOnDate = qtyAtTargetDate;
        } else {
          qtyOnDate = runningQty;
        }
      }
      return sum + (qtyOnDate * (p.price || 0));
    }, 0);
  }, [accessibleProducts, transactions, locationFilter, categoryFilter, endDate, startDate]);

  const reportSummaryBlock = useMemo(() => {
    if (reportType === 'inventory') {
      const items = preparedData;
      const totalStok = items.reduce((sum, item: any) => sum + item.stok, 0);
      const totalNilai = items.reduce((sum, item: any) => sum + item.totalNilai, 0);
      return {
        label1: 'Total Jenis SKU',
        val1: `${items.length} Item`,
        label2: 'Total Volume Barang',
        val2: `${totalStok} Unit`,
        label3: 'Total Valuasi Aset',
        val3: formatIDR(totalNilai)
      };
    } else if (reportType === 'alerts') {
      const items = preparedData;
      return {
        label1: 'Total SKU Kritis',
        val1: `${items.length} Item`,
        label2: 'Kebutuhan Restock',
        val2: `${items.reduce((sum, item: any) => sum + item.defisit, 0)} Unit`,
        label3: 'Tingkat Kerawanan',
        val3: items.length > 2 ? 'Tinggi (⚠️)' : 'Rendah (✓)'
      };
    } else if (reportType === 'transactions') {
      const items = preparedData;
      return {
        label1: '',
        val1: '',
        label2: '',
        val2: '',
        label3: 'Total Transaksi',
        val3: `${items.length} Transaksi`
      };
    } else if (reportType === 'bom') {
      const items = preparedData;
      const totalCost = items.reduce((sum, item: any) => sum + (item.totalCost || 0), 0);
      return {
        label1: 'TOTAL ITEM BOM',
        val1: `${items.length}`,
        label2: 'TOTAL NILAI ITEM BOM',
        val2: formatIDR(totalCost),
        label3: '',
        val3: ''
      };
    } else if (reportType === 'menu') {
      const items = preparedData;
      const totalHPP = items.reduce((sum, item: any) => sum + (item.totalHPP || 0), 0);
      const avgHPP = items.length > 0 ? totalHPP / items.length : 0;
      return {
        label1: 'TOTAL MENU',
        val1: `${items.length}`,
        label2: 'RATA-RATA HPP MENU',
        val2: formatIDR(avgHPP),
        label3: '',
        val3: ''
      };
    } else {
      // reportType === 'audit'
      const items = preparedData;
      const totalSelisih = items.reduce((sum, item: any) => sum + item.selisih, 0);
      const selisihMatch = items.filter((item: any) => item.selisih === 0).length;
      const selisihMismatch = items.filter((item: any) => item.selisih !== 0).length;
      return {
        label1: 'Total SKU Diaudit',
        val1: `${items.length} Item`,
        label2: 'Stok Sesuai (Cocok)',
        val2: `${selisihMatch} Sektor`,
        label3: 'Selisih Unit Ditemukan',
        val3: `${selisihMismatch} Kasus (${totalSelisih >= 0 ? '+' : ''}${totalSelisih} Unit)`
      };
    }
  }, [reportType, preparedData]);

  // 2. EXCEL EXPORT HANDLER (Generates styled spreadsheet XLS/CSV simulation content)
  const handleExportExcel = () => {
    let csvContent = '\uFEFF'; // UTF-8 BOM
    
    // Add Report Header
    csvContent += `"TNSP SYSTEM LOGISTICS HUB"\n`;
    csvContent += `"LAPORAN AUDIT RESMI - ${reportType.toUpperCase()}"\n`;
    csvContent += `"Nomor Laporan:","${reportNumber}"\n`;
    csvContent += `"Periode:","${formatDateIndo(startDate)} s/d ${formatDateIndo(endDate)}"\n\n`;

    if (reportType === 'inventory') {
      // Columns
      csvContent += `"Kode SKU / Barcode","Nama Barang","Kategori","Sektor Rak","Data Expired","Stok Aktual","Batas Minimum","Valuasi Satuan","Total Nilai Aset"\n`;
      preparedData.forEach((row: any) => {
        csvContent += `"${row.sku}","${row.nama}","${row.kategori}","${row.lokasi}","${row.expiredText}",${row.stok},${row.minStok},${row.harga},${row.totalNilai}\n`;
      });
    } else if (reportType === 'alerts') {
      csvContent += `"Kode SKU / Barcode","Nama Barang","Kategori","Sektor Rak","Stok Aktual","Batas Minimum","Defisit Pembelian"\n`;
      preparedData.forEach((row: any) => {
        csvContent += `"${row.sku}","${row.nama}","${row.kategori}","${row.lokasi}",${row.stok},${row.minStok},${row.defisit}\n`;
      });
    } else if (reportType === 'transactions') {
      csvContent += `"Tanggal Operasi","Kode SKU","Nama Barang","Jenis Mutasi","Stok Awal","IN","OUT","Stok Akhir","Validator Petugas","Catatan Logistik"\n`;
      preparedData.forEach((row: any) => {
        csvContent += `"${row.tanggal}","${row.sku}","${row.nama}","${row.tipe}",${row.stokAwal},${row.inQty},${row.outQty},${row.stokAkhir},"${row.petugas}","${row.keterangan}"\n`;
      });
    } else if (reportType === 'bom') {
      csvContent += `"Kode BOM","Nama Formula","Lokasi Produksi","Stok Fisik","Nilai HPP Formula"\n`;
      preparedData.forEach((row: any) => {
        csvContent += `"${row.id}","${row.nama}","${row.lokasi}","${row.stok}",${row.totalCost}\n`;
      });
    } else if (reportType === 'menu') {
      csvContent += `"Kode Menu","Nama Menu","Kategori","Gudang / Sektor","Total HPP"\n`;
      preparedData.forEach((row: any) => {
        csvContent += `"${row.id}","${row.nama}","${row.kategori}","${row.lokasi}",${row.totalHPP}\n`;
      });
    } else {
      // reportType === 'audit'
      csvContent += `"Tanggal Audit","Kode SKU","Nama Barang","Stok Sistem","Hitung Fisik","Selisih Penyesuaian","Anditor Petugas","Catatan Audit"\n`;
      preparedData.forEach((row: any) => {
        csvContent += `"${row.tanggal}","${row.sku}","${row.nama}",${row.stokSistem},${row.stokFisik},${row.selisih},"${row.petugas}","${row.keterangan}"\n`;
      });
    }

    // Download dynamic blob file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Laporan_Gudang_${reportType}_${startDate}_s_d_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyRawData = () => {
    let text = `TNSP SYSTEM LOGISTICS HUB\nLAPORAN AUDIT RESMI - ${reportType.toUpperCase()}\nNomor Laporan: ${reportNumber}\nPeriode: ${formatDateIndo(startDate)} s/d ${formatDateIndo(endDate)}\n\n`;
    
    if (reportType === 'inventory') {
      text += `SKU\tNama Barang\tKategori\tSektor\tData Expired\tStok\tMin\tHarga\tTotal\n`;
      preparedData.forEach((row: any) => {
        text += `${row.sku}\t${row.nama}\t${row.kategori}\t${row.lokasi}\t${row.expiredText}\t${row.stok}\t${row.minStok}\t${row.harga}\t${row.totalNilai}\n`;
      });
    } else if (reportType === 'alerts') {
      text += `SKU\tNama Barang\tKategori\tSektor\tStok\tMin\tDefisit\n`;
      preparedData.forEach((row: any) => {
        text += `${row.sku}\t${row.nama}\t${row.kategori}\t${row.lokasi}\t${row.stok}\t${row.minStok}\t${row.defisit}\n`;
      });
    } else if (reportType === 'transactions') {
      text += `Tanggal\tNama Barang\tSKU\tArus\tStok Awal\tIN\tOUT\tStok Akhir\tPetugas\tCatatan\n`;
      preparedData.forEach((row: any) => {
        text += `${row.tanggal}\t${row.nama}\t${row.sku}\t${row.tipe}\t${row.stokAwal}\t${row.inQty}\t${row.outQty}\t${row.stokAkhir}\t${row.petugas}\t${row.keterangan}\n`;
      });
    } else if (reportType === 'bom') {
      text += `ID BOM\tNama Formula\tLokasi\tStok Fisik\tTotal HPP\n`;
      preparedData.forEach((row: any) => {
        text += `${row.id}\t${row.nama}\t${row.lokasi}\t${row.stok}\t${row.totalCost}\n`;
      });
    } else if (reportType === 'menu') {
      text += `ID Menu\tNama Menu\tKategori\tLokasi\tTotal HPP\n`;
      preparedData.forEach((row: any) => {
        text += `${row.id}\t${row.nama}\t${row.kategori}\t${row.lokasi}\t${row.totalHPP}\n`;
      });
    } else {
      text += `Tanggal\tNama SKU\tSistem\tFisik\tSelisih\tValidator\n`;
      preparedData.forEach((row: any) => {
        text += `${row.tanggal}\t${row.nama}\t${row.stokSistem}\t${row.stokFisik}\t${row.selisih}\t${row.petugas}\n`;
      });
    }

    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // 3. PRINT / PDF EMULATOR ROUTINE WITH USER ASSISTANT OVERLAY
  const handlePrintPDF = () => {
    try {
      window.print();
    } catch (err) {
      console.warn("window.print() not available or blocked in current frame", err);
    }
    // Open the print assistant modal to guide the user and allow dynamic operations
    setShowPrintModal(true);
  };

  return (
    <div className="space-y-6" id="exporter-tab-workspace">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div></div>
      </div>

      {isUserRestricted && (
        <div className="flex print:hidden">
          <button
            type="button"
            className="inline-flex items-center gap-2.5 px-3 py-1.5 bg-indigo-50/70 hover:bg-indigo-100/75 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 border border-indigo-100/50 dark:border-zinc-800 rounded-full text-xs font-semibold text-indigo-700 dark:text-indigo-400 shadow-xs transition-all cursor-pointer select-none"
            title={`Laporan Tersegmentasi. Sebagai staf/supervisor di "${currentUser.location}", seluruh data spreadsheet dan rekap PDF secara otomatis difilter demi privasi dan keamanan wilayah Anda.`}
          >
            <MapPin className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] leading-none tracking-tight">
              Laporan Tersegmentasi: <strong className="text-indigo-800 dark:text-indigo-300 font-bold">{currentUser.location}</strong>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0"></span>
          </button>
        </div>
      )}

      {/* Control configurations block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8 gap-4 p-4 rounded-xl border border-gray-150 dark:border-zinc-855 bg-white dark:bg-zinc-900 shadow-sm print:hidden">
        
        {/* 1. JENIS TRANSAKSI */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Jenis Transaksi</label>
          <select
            value={
              reportType === 'inventory' || reportType === 'bom' || reportType === 'menu' ? 'inventory' :
              reportType === 'alerts' ? 'alerts' :
              reportType === 'audit' ? 'audit' :
              txTypeFilter === 'in' ? 'in' :
              txTypeFilter === 'out' ? 'out' :
              txTypeFilter === 'produksi' ? 'produksi' :
              txTypeFilter === 'transfer' ? 'transfer' :
              'all'
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'inventory') {
                if (jenisBarangFilter === 'bom') {
                  setReportType('bom');
                } else if (jenisBarangFilter === 'menu') {
                  setReportType('menu');
                } else {
                  setReportType('inventory');
                }
                setTxTypeFilter('all');
              } else if (val === 'alerts') {
                setReportType('alerts');
                setTxTypeFilter('all');
              } else if (val === 'audit') {
                setReportType('audit');
                setTxTypeFilter('audit');
              } else if (val === 'in') {
                setReportType('transactions');
                setTxTypeFilter('in');
              } else if (val === 'out') {
                setReportType('transactions');
                setTxTypeFilter('out');
              } else if (val === 'produksi') {
                setReportType('transactions');
                setTxTypeFilter('produksi');
              } else if (val === 'transfer') {
                setReportType('transactions');
                setTxTypeFilter('transfer');
              } else {
                setReportType('transactions');
                setTxTypeFilter('all');
              }
            }}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          >
            <option value="inventory">
              {jenisBarangFilter === 'bom' ? 'FORMULA & RESEP BOM' :
               jenisBarangFilter === 'menu' ? 'DAFTAR MENU (HPP)' :
               'STOK AKTUAL (INVENTARIS)'}
            </option>
            <option value="alerts">SIAGA STOK KRITIS (STOK TIPIS)</option>
            <option value="all">SEMUA MUTASI / TRANSAKSI</option>
            <option value="in">MASUK</option>
            <option value="out">KELUAR</option>
            <option value="audit">STOK OPNAME</option>
            <option value="produksi">PRODUKSI</option>
            <option value="transfer">TRANSFER</option>
          </select>
        </div>

        {/* 2. JENIS BARANG */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Jenis Barang</label>
          <select
            value={jenisBarangFilter}
            onChange={(e) => {
              const val = e.target.value as any;
              setJenisBarangFilter(val);
              if (val === 'bom') {
                if (reportType === 'inventory' || reportType === 'menu') {
                  setReportType('bom');
                }
              } else if (val === 'menu') {
                if (reportType === 'inventory' || reportType === 'bom') {
                  setReportType('menu');
                }
              } else {
                if (reportType === 'bom' || reportType === 'menu') {
                  setReportType('inventory');
                }
              }
            }}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          >
            <option value="product">DATA BARANG</option>
            <option value="bom">BOM</option>
            <option value="menu">MENU</option>
          </select>
        </div>

        {/* Tanggal Awal (Start Date) */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Tanggal Awal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          />
        </div>

        {/* Tanggal Akhir (End Date) */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Tanggal Akhir</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          />
        </div>

        {/* Search Input Filter */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Cari SKU / Nama</label>
          <div className="relative">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Ketik kata kunci..."
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 placeholder-gray-400"
            />
          </div>
        </div>

        {currentUser.role === 'admin' && (
          <>
            {/* Filter Lokasi */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Filter Lokasi</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
              >
                <option value="all">Semua Lokasi</option>
                {uniqueLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            {/* Filter Kategori */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Filter Kategori</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
              >
                <option value="all">Semua Kategori</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Toggle Foto Barang */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Foto Barang</label>
          <button
            type="button"
            onClick={() => setShowPhotosInReport(!showPhotosInReport)}
            className={`w-full px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              showPhotosInReport 
                ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-400' 
                : 'bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-850 text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showPhotosInReport ? 'bg-indigo-500' : 'bg-gray-300'}`}></span>
            {showPhotosInReport ? 'Aktif' : 'Nonaktif'}
          </button>
        </div>

        {/* Action triggers */}
        <div className="flex items-end gap-2">
          
          {/* Print PDF */}
          <button
            onClick={handlePrintPDF}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-zinc-855 dark:hover:bg-zinc-755 text-white cursor-pointer transition-colors"
            title="Cetak via browser atau Simpan PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            PDF
          </button>

          {/* Export spreadsheet Excel */}
          <button
            onClick={handleExportExcel}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-sm"
            title="Download Spreadsheet Excel (CSV format)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>

        </div>

      </div>

      {/* Action Banner for Physical Checklist / Audit Forms */}
      {reportType === 'audit' && (
        <div className="p-4.5 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                Formulir Pemeriksaan Fisik Stok Opname
              </h4>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Cetak lembar formulir fisik kosong untuk audit manual di rak atau ekspor format spreadsheet Excel siap pakai.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportPhysicalFormExcel('audit')}
              className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              title="Unduh template Excel Formulir Stok Opname"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor Excel</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenPhysicalFormPreview('audit')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] transition-all text-white rounded-xl font-bold text-xs shadow-md shadow-amber-600/10 cursor-pointer flex items-center gap-1.5 border-0"
              title="Pratinjau dan cetak formulir stok opname"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Formulir</span>
            </button>
          </div>
        </div>
      )}

      {reportType === 'transactions' && txTypeFilter === 'in' && (
        <div className="p-4.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                Formulir Penerimaan Barang Masuk (Inbound)
              </h4>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Cetak lembar checklist penerimaan fisik di area receiving gudang atau unduh format spreadsheet Excel siap pakai.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportPhysicalFormExcel('in')}
              className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              title="Unduh template Excel Formulir Penerimaan Barang Masuk"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor Excel</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenPhysicalFormPreview('in')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/10 cursor-pointer flex items-center gap-1.5 border-0"
              title="Pratinjau dan cetak formulir penerimaan barang masuk"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Formulir</span>
            </button>
          </div>
        </div>
      )}

      {reportType === 'transactions' && txTypeFilter === 'out' && (
        <div className="p-4.5 rounded-2xl border border-sky-500/20 bg-sky-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-sky-500/10 text-sky-600 rounded-xl">
              <PackageMinus className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-800 dark:text-sky-400">
                Formulir Pengeluaran / Surat Jalan Barang Keluar (Outbound)
              </h4>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Cetak formulir pengeluaran fisik untuk tanda terima staf/ekspedisi atau unduh format spreadsheet Excel siap pakai.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportPhysicalFormExcel('out')}
              className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              title="Unduh template Excel Formulir Pengeluaran Barang Keluar"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor Excel</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenPhysicalFormPreview('out')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 active:scale-[0.98] transition-all text-white rounded-xl font-bold text-xs shadow-md shadow-sky-600/10 cursor-pointer flex items-center gap-1.5 border-0"
              title="Pratinjau dan cetak formulir pengeluaran barang keluar"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Formulir</span>
            </button>
          </div>
        </div>
      )}

      {reportType === 'transactions' && txTypeFilter !== 'in' && txTypeFilter !== 'out' && txTypeFilter !== 'audit' && (
        <div className="p-4.5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-800 dark:text-indigo-400">
                Formulir Pemeriksaan Fisik Logistik Lapangan
              </h4>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Pilih formulir fisik kosong untuk keperluan cetak atau ekspor Excel pencatatan manual di lapangan:
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Barang Masuk */}
            <div className="inline-flex rounded-xl shadow-xs border border-emerald-500/30 overflow-hidden">
              <button
                type="button"
                onClick={() => handleOpenPhysicalFormPreview('in')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                title="Cetak Formulir Penerimaan Barang Masuk"
              >
                <Printer className="w-3 h-3" />
                <span>Masuk</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportPhysicalFormExcel('in')}
                className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-zinc-800 dark:text-emerald-400 font-bold text-xs flex items-center cursor-pointer transition-colors border-l border-emerald-500/20"
                title="Ekspor Excel Formulir Masuk"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Barang Keluar */}
            <div className="inline-flex rounded-xl shadow-xs border border-sky-500/30 overflow-hidden">
              <button
                type="button"
                onClick={() => handleOpenPhysicalFormPreview('out')}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                title="Cetak Formulir Pengeluaran Barang Keluar"
              >
                <Printer className="w-3 h-3" />
                <span>Keluar</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportPhysicalFormExcel('out')}
                className="px-2 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 dark:bg-zinc-800 dark:text-sky-400 font-bold text-xs flex items-center cursor-pointer transition-colors border-l border-sky-500/20"
                title="Ekspor Excel Formulir Keluar"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Stok Opname */}
            <div className="inline-flex rounded-xl shadow-xs border border-amber-500/30 overflow-hidden">
              <button
                type="button"
                onClick={() => handleOpenPhysicalFormPreview('audit')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                title="Cetak Formulir Stok Opname"
              >
                <Printer className="w-3 h-3" />
                <span>Opname</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportPhysicalFormExcel('audit')}
                className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-zinc-800 dark:text-amber-400 font-bold text-xs flex items-center cursor-pointer transition-colors border-l border-amber-500/20"
                title="Ekspor Excel Formulir Stok Opname"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official styled letterhead paper container for printing or preview */}
      <div 
        id="official-document-sheet"
        className="mx-auto max-w-4xl min-h-[700px] bg-white text-zinc-900 border border-gray-150 rounded-2xl shadow-xl p-8 sm:p-12 relative font-sans overflow-hidden dark:text-zinc-900 dark:bg-white"
      >
           {/* Letter Header */}
        <div className="flex flex-col sm:flex-row items-center sm:justify-between border-b-4 border-zinc-800 pb-5 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-zinc-200 bg-white flex items-center justify-center shrink-0">
              <img 
                referrerPolicy="no-referrer"
                src="https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w300" 
                alt="TNSP Logo" 
                className="w-full h-full object-contain"
                id="report-logo-image"
              />
            </div>
            <div className="text-left">
              <h3 className="font-extrabold text-xl tracking-tight uppercase">TNSP SYSTEM</h3>
              <p className="text-[10px] text-gray-550 font-sans">Jl. A. Yani No.Km. 1, Pal 1, Sungai Baru, Kec. Banjarmasin Tengah, Kota Banjarmasin, Kalimantan Selatan 70122</p>
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end text-left sm:text-right border-t sm:border-t-0 sm:border-l-2 border-zinc-200 pt-2 sm:pt-0 sm:pl-4">
            <span className="text-[9px] uppercase font-bold text-gray-400">
              NOMOR DOKUMEN
            </span>
            <div className="flex items-center gap-0 flex-wrap justify-start sm:justify-end">
              <span className="text-xs font-mono font-bold text-zinc-700">TNSP/{getJenisTransaksiAbbr()}/</span>
              <input
                type="text"
                value={documentSeqNumber}
                onChange={(e) => setDocumentSeqNumber(e.target.value)}
                className="text-xs font-mono font-bold text-zinc-700 w-6 text-center bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 rounded p-0.5 focus:ring-1 focus:ring-indigo-500 outline-none print:border-0 print:bg-transparent print:p-0 print:w-auto"
                title="Ubah nomor urut dokumen"
              />
              <span className="text-xs font-mono font-bold text-zinc-700">/{getTodayFormatted()}</span>
            </div>
          </div>
        </div>

        {/* Legal Title */}
        <div className="my-6 text-center text-zinc-900">
          <h4 className="font-bold text-base tracking-widest uppercase decoration-double underline">
            {reportType === 'inventory' && 'LAPORAN STOK BARANG'}
            {reportType === 'alerts' && 'LAPORAN BARANG STOK MENIPIS'}
            {reportType === 'transactions' && 'LAPORAN MUTASI ALIRAN TRANSAKSI LOGISTIK'}
            {reportType === 'audit' && 'LAPORAN REKONSILIASI HASIL STOK OPNAME'}
            {reportType === 'bom' && 'LAPORAN FORMULASI & RESEP BILL OF MATERIALS (BOM)'}
            {reportType === 'menu' && 'LAPORAN DAFTAR MENU DAN TRANSAKSI KASIR HPP'}
          </h4>
          <div className="flex flex-col items-center gap-1 mt-1 font-sans">
            <p className="text-[10px] text-gray-550 uppercase font-medium">
              Periode Audit: {formatDateIndo(startDate)} s/d {formatDateIndo(endDate)}
            </p>
            {(locationFilter !== 'all' || categoryFilter !== 'all') && (
              <p className="text-[9px] text-indigo-600 font-bold uppercase tracking-tight">
                {locationFilter !== 'all' && `LOKASI: ${locationFilter}`}
                {locationFilter !== 'all' && categoryFilter !== 'all' && ' | '}
                {categoryFilter !== 'all' && `KATEGORI: ${categoryFilter}`}
              </p>
            )}
            <p className="text-[8px] text-gray-400 uppercase">Status Dokumen: SALINAN SAH</p>
          </div>
        </div>

        {/* Overview boxes styled */}
        {(reportType === 'bom' || reportType === 'menu') ? (
          <div className="grid grid-cols-2 gap-4 my-6 bg-white border border-zinc-900 rounded-xl p-5 sm:p-6 text-xs">
            <div className="text-left border-r border-zinc-200/80 pr-4 sm:pr-8">
              <p className="text-gray-400 uppercase tracking-wider text-[9px] font-bold">{reportSummaryBlock.label1}</p>
              <p className="font-extrabold text-xl sm:text-2xl text-zinc-950 mt-1">{reportSummaryBlock.val1}</p>
            </div>
            <div className="text-left pl-4 sm:pl-8">
              {reportType === 'menu' && (
                <p className="text-gray-400 uppercase tracking-wider text-[9px] font-bold">{reportSummaryBlock.label2}</p>
              )}
              <p className="font-extrabold text-xl sm:text-2xl text-zinc-950 mt-1">{reportSummaryBlock.val2}</p>
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${reportSummaryBlock.label1 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4 my-6 bg-zinc-50 border p-4 rounded-xl text-xs`}>
            {reportSummaryBlock.label1 ? (
              <>
                <div className="text-left sm:border-r pr-4">
                  <p className="text-gray-400 uppercase tracking-wider text-[9px] font-bold">{reportSummaryBlock.label1}</p>
                  <p className="font-extrabold text-base text-zinc-900 mt-1">{reportSummaryBlock.val1}</p>
                </div>
                <div className="text-left sm:border-r pr-4 sm:pl-4">
                  <p className="text-gray-400 uppercase tracking-wider text-[9px] font-bold">{reportSummaryBlock.label3}</p>
                  <p className="font-extrabold text-sm text-zinc-900 mt-1 truncate">{reportSummaryBlock.val3}</p>
                </div>
              </>
            ) : (
              <div className="text-left sm:border-r pr-4">
                <p className="text-gray-400 uppercase tracking-wider text-[9px] font-bold">{reportSummaryBlock.label3}</p>
                <p className="font-extrabold text-base text-zinc-900 mt-1 truncate">{reportSummaryBlock.val3}</p>
              </div>
            )}
            <div className="text-left sm:pl-4">
              <p className="text-gray-400 uppercase tracking-wider text-[9px] font-bold">
                Total Nilai Stok {endDate ? `(Per ${formatDateIndo(endDate)})` : 'Terkini'}
              </p>
              <p className="font-extrabold text-sm text-emerald-600 font-mono mt-1">{formatIDR(totalNilaiStokTerkini)}</p>
            </div>
          </div>
        )}

        {/* Table Content data */}
        <div className="my-6 overflow-x-auto">
          <table className="w-full text-[11px] text-left border-collapse border border-zinc-200">
            <thead>
              <tr className="bg-zinc-150 border-b border-zinc-300 text-zinc-800 font-bold">
                {reportType === 'inventory' && (
                  <>
                    <th className="py-2.5 px-3 border border-zinc-200">SKU Barcode</th>
                    {showPhotosInReport && <th className="py-2.5 px-3 border border-zinc-200 text-center w-12">Foto</th>}
                    <th className="py-2.5 px-3 border border-zinc-200">Nama Barang</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Sektor</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-left min-w-[170px]">Data Expired</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center min-w-[70px]">Aktual</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Harga Satuan</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-right">Aset Valuasi</th>
                  </>
                )}
                {reportType === 'alerts' && (
                  <>
                    <th className="py-2.5 px-3 border border-zinc-200">SKU Barcode</th>
                    {showPhotosInReport && <th className="py-2.5 px-3 border border-zinc-200 text-center w-12">Foto</th>}
                    <th className="py-2.5 px-3 border border-zinc-200">Nama Barang</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Sektor</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Aktual</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Batas Min</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-right">Defisit Resi</th>
                  </>
                )}
                {reportType === 'transactions' && (
                  <>
                    <th className="py-2.5 px-3 border border-zinc-200">Tanggal</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Foto & Barang</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Stok Awal</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">IN</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">OUT</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Stok Akhir</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Catatan</th>
                  </>
                )}
                {reportType === 'audit' && (
                  <>
                    <th className="py-2.5 px-3 border border-zinc-200">Tanggal Audit</th>
                    {showPhotosInReport && <th className="py-2.5 px-3 border border-zinc-200 text-center w-12">Foto</th>}
                    <th className="py-2.5 px-3 border border-zinc-200">Nama SKU</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Stok Sistem</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Hitung Fisik</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Selisih</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Validator</th>
                  </>
                )}
                {reportType === 'bom' && (
                  <>
                    <th className="py-2.5 px-3 border border-zinc-200">ID BOM</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Nama Formula BOM</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Gudang / Sektor</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-center">Stok</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-right">Biaya/HPP</th>
                  </>
                )}
                {reportType === 'menu' && (
                  <>
                    <th className="py-2.5 px-3 border border-zinc-200">ID Menu</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Nama Menu</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Kategori</th>
                    <th className="py-2.5 px-3 border border-zinc-200">Gudang / Sektor</th>
                    <th className="py-2.5 px-3 border border-zinc-200 text-right">Total HPP</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-850">
              {preparedData.length === 0 ? (
                <tr>
                  <td colSpan={
                    (reportType === 'bom' || reportType === 'menu') ? 5 :
                    reportType === 'inventory' ? (showPhotosInReport ? 8 : 7) :
                    reportType === 'alerts' ? (showPhotosInReport ? 7 : 6) :
                    reportType === 'transactions' ? 7 :
                    showPhotosInReport ? 7 : 6
                  } className="py-8 text-center text-gray-400 font-medium italic">
                    Belum ada rekaman logistik pada filter terpilih.
                  </td>
                </tr>
              ) : (
                preparedData.map((row: any, index) => (
                  <tr key={index} className="odd:bg-zinc-50/40">
                    
                    {reportType === 'inventory' && (
                      <>
                        <td className="py-2 px-3 font-mono font-bold border border-zinc-200">{row.sku}</td>
                        {showPhotosInReport && (
                          <td className="py-1 px-2 border border-zinc-200 text-center w-12">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 bg-gray-50 flex items-center justify-center mx-auto shadow-xs">
                              {row.imageUrl ? (
                                <img
                                  referrerPolicy="no-referrer"
                                  src={row.imageUrl}
                                  alt={row.nama}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/100x100?text=No+Photo";
                                  }}
                                />
                              ) : (
                                <div className="text-[9px] font-bold text-gray-400 leading-none">N/A</div>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="py-2 px-3 border border-zinc-200 pr-4 font-semibold">
                          {row.nama}
                          {row.catatan && (
                            <span className="block text-[10px] font-normal text-gray-500 dark:text-zinc-450 italic mt-0.5">
                              Catatan: {row.catatan}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono border border-zinc-200">{row.lokasi}</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-xs min-w-[170px]">
                          {row.expiredList && row.expiredList.length > 0 ? (
                            <div className="space-y-1">
                              {row.expiredList.map((expEntry: ExpiredEntry, expIdx: number) => (
                                <div key={expIdx} className="flex flex-col gap-0.5 items-start">
                                  <span className={`font-semibold ${
                                    expEntry.status === 'expired' 
                                      ? 'text-rose-600 dark:text-rose-400' 
                                      : expEntry.status === 'near_expiry' 
                                        ? 'text-amber-700 dark:text-amber-400' 
                                        : 'text-zinc-700 dark:text-zinc-300'
                                  }`}>
                                    {expEntry.text}
                                  </span>
                                  {expEntry.status === 'near_expiry' && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700">
                                      <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                      <span>Dekat Exp ({expEntry.diffDays} hr)</span>
                                    </span>
                                  )}
                                  {expEntry.status === 'expired' && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700">
                                      <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                      <span>{expEntry.diffDays === 0 ? 'Exp Hari Ini' : `Exp (-${Math.abs(expEntry.diffDays)} hr)`}</span>
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-zinc-400 font-normal">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center font-bold min-w-[70px] whitespace-nowrap">{row.stok}</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200">{formatIDR(row.harga)}</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-right font-bold">{formatIDR(row.totalNilai)}</td>
                      </>
                    )}

                    {reportType === 'alerts' && (
                      <>
                        <td className="py-2 px-3 font-mono font-bold border border-zinc-200">{row.sku}</td>
                        {showPhotosInReport && (
                          <td className="py-1 px-2 border border-zinc-200 text-center w-12">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 bg-gray-50 flex items-center justify-center mx-auto shadow-xs">
                              {row.imageUrl ? (
                                <img
                                  referrerPolicy="no-referrer"
                                  src={row.imageUrl}
                                  alt={row.nama}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/100x100?text=No+Photo";
                                  }}
                                />
                              ) : (
                                <div className="text-[9px] font-bold text-gray-400 leading-none">N/A</div>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="py-2 px-3 border border-zinc-200 pr-4 font-semibold">
                          {row.nama}
                          {row.catatan && (
                            <span className="block text-[10px] font-normal text-gray-500 dark:text-zinc-450 italic mt-0.5">
                              Catatan: {row.catatan}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono border border-zinc-200">{row.lokasi}</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center text-rose-600 font-bold">{row.stok}</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center">{row.minStok}</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-right text-rose-500 font-bold">-{row.defisit}u</td>
                      </>
                    )}

                    {reportType === 'transactions' && (
                      <>
                        <td className="py-2 px-3 font-mono border border-zinc-200 shrink-0 text-xs">{row.tanggal}</td>
                        <td className="py-2 px-3 border border-zinc-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 bg-gray-50 flex items-center justify-center shrink-0 shadow-xs">
                              {row.imageUrl ? (
                                <img
                                  referrerPolicy="no-referrer"
                                  src={row.imageUrl}
                                  alt={row.nama}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/100x100?text=No+Photo";
                                  }}
                                />
                              ) : (
                                <div className="text-[9px] font-bold text-gray-400 leading-none">N/A</div>
                              )}
                            </div>
                            <div className="text-left">
                              <span className="font-semibold text-gray-900 dark:text-zinc-100 block text-xs line-clamp-2 leading-snug">{row.nama}</span>
                              <span className="font-mono text-[9px] text-gray-400 block mt-0.5">SKU: {row.sku}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center text-zinc-500 font-medium text-xs">{row.stokAwal}</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center text-xs">
                          {row.inQty > 0 ? (
                            <span className="text-emerald-600 font-bold">{row.inQty}</span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center text-xs">
                          {row.outQty > 0 ? (
                            <span className="text-rose-600 font-bold">{row.outQty}</span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center text-indigo-600 font-bold text-xs">{row.stokAkhir}</td>
                        <td className="py-2 px-3 border border-zinc-200 text-xs text-gray-800 dark:text-zinc-200">
                          {row.keterangan || ""}
                        </td>
                      </>
                    )}

                    {reportType === 'audit' && (
                      <>
                        <td className="py-2 px-3 font-mono border border-zinc-200 shrink-0">{row.tanggal}</td>
                        {showPhotosInReport && (
                          <td className="py-1 px-2 border border-zinc-200 text-center w-12">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 bg-gray-50 flex items-center justify-center mx-auto shadow-xs">
                              {row.imageUrl ? (
                                <img
                                  referrerPolicy="no-referrer"
                                  src={row.imageUrl}
                                  alt={row.nama}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/100x100?text=No+Photo";
                                  }}
                                />
                              ) : (
                                <div className="text-[9px] font-bold text-gray-400 leading-none">N/A</div>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="py-2 px-3 border border-zinc-200 max-w-[140px] truncate font-semibold" title={row.nama}>{row.nama} <span className="block text-[8px] font-mono font-normal text-gray-400">SKU: {row.sku}</span></td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center">{row.stokSistem} Unit</td>
                        <td className="py-2 px-3 font-mono border border-zinc-200 text-center font-semibold text-amber-600">{row.stokFisik} Unit</td>
                        <td className={`py-2 px-3 font-mono border border-zinc-200 text-center font-bold ${row.selisih === 0 ? 'text-gray-500' : row.selisih > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {row.selisih > 0 ? '+' : ''}{row.selisih} Unit
                        </td>
                        <td className="py-2 px-3 border border-zinc-200" title={row.keterangan}>{row.petugas}</td>
                      </>
                    )}

                    {reportType === 'bom' && (
                      <>
                        <td className="py-3 px-3 font-mono font-bold border border-zinc-200 text-zinc-900">{row.id}</td>
                        <td className="py-3 px-3 border border-zinc-200 font-bold text-zinc-900 uppercase">{row.nama?.toUpperCase()}</td>
                        <td className="py-3 px-3 font-mono border border-zinc-200 uppercase text-zinc-900">{row.lokasi?.toUpperCase()}</td>
                        <td className="py-3 px-3 border border-zinc-200 text-center font-bold text-zinc-900 uppercase font-mono">{row.stok?.toUpperCase()}</td>
                        <td className="py-3 px-3 font-mono border border-zinc-200 text-right font-extrabold text-zinc-900">{formatIDR(row.totalCost)}</td>
                      </>
                    )}

                    {reportType === 'menu' && (
                      <>
                        <td className="py-3 px-3 font-mono font-bold border border-zinc-200 text-zinc-900">{row.id}</td>
                        <td className="py-3 px-3 border border-zinc-200 font-bold text-zinc-900 uppercase">{row.nama?.toUpperCase()}</td>
                        <td className="py-3 px-3 border border-zinc-200 text-zinc-950 uppercase">{row.kategori?.toUpperCase()}</td>
                        <td className="py-3 px-3 font-mono border border-zinc-200 uppercase text-zinc-900">{row.lokasi?.toUpperCase()}</td>
                        <td className="py-3 px-3 font-mono border border-zinc-200 text-right font-extrabold text-zinc-900">{formatIDR(row.totalHPP)}</td>
                      </>
                    )}

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Declarative statement text */}
        <p className="text-[10px] text-gray-500 italic leading-relaxed text-left my-6 border-l-2 pl-3">
          Demikian Berita Acara inventori ini diterbitkan secara transparan, akurat, dan sesuai dengan sistem pelacakan persediaan real-time TNSP SYSTEM untuk keperluan audit kepatuhan internal, pelaporan pajak logistik, serta stok opname berkala.
        </p>

        {/* Legal Signatures workspace */}
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t font-sans text-[11px] text-center mt-12 ${(!checkerSigImg && !auditorSigImg && !managerSigImg && !signedElectronically) ? 'print:hidden' : ''}`}>
          
          <div className={`flex flex-col justify-between h-44 group ${!checkerSigImg ? 'print:hidden' : ''}`}>
            <input 
              type="text" 
              value={checkerTitle} 
              onChange={(e) => setCheckerTitle(e.target.value)} 
              className="text-gray-500 bg-transparent border-0 text-center w-full focus:ring-1 focus:ring-indigo-500 outline-none hover:bg-zinc-150/40 rounded px-1 transition-colors print:hidden"
              title="Klik untuk mengubah jabatan persetujuan"
            />
            <p className="hidden print:block text-gray-500 text-center w-full font-medium">{checkerTitle}</p>
            
            <div className="relative flex flex-col items-center flex-1 justify-center py-2 w-full">
              {/* Interactive Pad Placeholder - Click to sign */}
              {!checkerSigImg && (
                <button
                  type="button"
                  onClick={() => setActiveSigningRole('checker')}
                  className="w-full h-24 bg-gray-50/50 hover:bg-gray-100/70 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group print:hidden"
                >
                  <PenTool className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium text-gray-450 group-hover:text-indigo-600 transition-colors">
                    Klik untuk Tanda Tangan
                  </span>
                </button>
              )}

              {/* Static result for display & print */}
              {checkerSigImg && (
                <div className="relative group/sig">
                  <img src={checkerSigImg} alt="Signature" className="max-h-24 mx-auto" />
                  <button 
                    onClick={() => setCheckerSigImg(null)}
                    className="absolute -top-2 -right-2 p-1 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-rose-500 transition-colors shadow-sm print:hidden"
                    title="Buat ulang tanda tangan"
                  >
                    <Eraser className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Just text if nothing is drawn */}
              {!checkerSigImg && (
                <p className="hidden print:block text-gray-300 italic text-[9px] mt-4">(Tanda Tangan Asli)</p>
              )}
            </div>

            <div>
              <input 
                type="text" 
                value={checkerName} 
                onChange={(e) => setCheckerName(e.target.value)} 
                className="font-extrabold text-zinc-900 border-b border-zinc-400 pb-1 max-w-[150px] mx-auto text-center bg-transparent focus:ring-1 focus:ring-indigo-550 outline-none w-full block print:hidden"
                title="Klik untuk mengubah nama penandatangan"
              />
              <p className="hidden print:block font-extrabold text-zinc-900 border-b border-zinc-400 pb-1 max-w-[150px] mx-auto text-center font-sans">{checkerName}</p>
              
              <input 
                type="text" 
                value={checkerRole} 
                onChange={(e) => setCheckerRole(e.target.value)} 
                className="text-[10px] text-gray-400 bg-transparent border-0 text-center w-full focus:ring-1 focus:ring-indigo-500 outline-none hover:bg-zinc-150/40 rounded px-1 transition-colors print:hidden mt-1"
                title="Klik untuk mengubah deskripsi/peran"
              />
              <p className="hidden print:block text-[10px] text-gray-400 text-center w-full font-sans mt-1">{checkerRole}</p>
            </div>
          </div>

          <div className={`flex flex-col justify-between h-44 group ${!auditorSigImg ? 'print:hidden' : ''}`}>
            <input 
              type="text" 
              value={auditorTitle} 
              onChange={(e) => setAuditorTitle(e.target.value)} 
              className="text-gray-500 bg-transparent border-0 text-center w-full focus:ring-1 focus:ring-indigo-500 outline-none hover:bg-zinc-150/40 rounded px-1 transition-colors print:hidden"
              title="Klik untuk mengubah jabatan persetujuan"
              placeholder="Pendamping,"
            />
            <p className="hidden print:block text-gray-500 text-center w-full font-medium">{auditorTitle}</p>
            
            <div className="relative flex flex-col items-center flex-1 justify-center py-2 w-full">
              {/* Interactive Pad Placeholder - Click to sign */}
              {!auditorSigImg && (
                <button
                  type="button"
                  onClick={() => setActiveSigningRole('auditor')}
                  className="w-full h-24 bg-gray-50/50 hover:bg-gray-100/70 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group print:hidden"
                >
                  <PenTool className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium text-gray-450 group-hover:text-indigo-600 transition-colors">
                    Klik untuk Tanda Tangan
                  </span>
                </button>
              )}

              {/* Static result for display & print */}
              {auditorSigImg && (
                <div className="relative group/sig">
                  <img src={auditorSigImg} alt="Signature" className="max-h-24 mx-auto" />
                  <button 
                    onClick={() => setAuditorSigImg(null)}
                    className="absolute -top-2 -right-2 p-1 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-rose-500 transition-colors shadow-sm print:hidden"
                    title="Buat ulang tanda tangan"
                  >
                    <Eraser className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Just text if nothing is drawn */}
              {!auditorSigImg && (
                <p className="hidden print:block text-gray-300 italic text-[9px] mt-4">(Tanda Tangan Asli)</p>
              )}
            </div>

            <div>
              <input 
                type="text" 
                value={auditorName} 
                onChange={(e) => setAuditorName(e.target.value)} 
                className="font-extrabold text-zinc-900 border-b border-zinc-400 pb-1 max-w-[150px] mx-auto text-center bg-transparent focus:ring-1 focus:ring-indigo-550 outline-none w-full block print:hidden"
                title="Klik untuk mengubah nama penandatangan"
                placeholder="Nama Pendamping"
              />
              <p className="hidden print:block font-extrabold text-zinc-900 border-b border-zinc-400 pb-1 max-w-[150px] mx-auto text-center font-sans">{auditorName || '(Nama Pendamping)'}</p>
              
              <input 
                type="text" 
                value={auditorRole} 
                onChange={(e) => setAuditorRole(e.target.value)} 
                className="text-[10px] text-gray-400 bg-transparent border-0 text-center w-full focus:ring-1 focus:ring-indigo-500 outline-none hover:bg-zinc-150/40 rounded px-1 transition-colors print:hidden mt-1"
                title="Klik untuk mengubah deskripsi/peran"
                placeholder="Kepala Auditor Gudang"
              />
              <p className="hidden print:block text-[10px] text-gray-400 text-center w-full font-sans mt-1">{auditorRole || '(Jabatan/Peran)'}</p>
            </div>
          </div>

          <div className={`flex flex-col justify-between h-44 relative group ${(!managerSigImg && !signedElectronically) ? 'print:hidden' : ''}`}>
            <input 
              type="text" 
              value={managerTitle} 
              onChange={(e) => setManagerTitle(e.target.value)} 
              className="text-gray-500 bg-transparent border-0 text-center w-full focus:ring-1 focus:ring-indigo-500 outline-none hover:bg-zinc-150/40 rounded px-1 transition-colors print:hidden"
              title="Klik untuk mengubah jabatan persetujuan"
              placeholder="Kepala Divisi,"
            />
            <p className="hidden print:block text-gray-500 text-center w-full font-medium">{managerTitle}</p>
            
            <div className="relative flex flex-col items-center flex-1 justify-center py-2 w-full">
              {/* Dynamic Electronic Secure Signature Stamp */}
              {signedElectronically && (
                <div className="absolute top-0 left-[50%] -translate-x-[50%] w-32 border-2 border-emerald-600 border-dashed text-emerald-600 bg-emerald-50/90 rounded p-1.5 font-mono text-[7px] text-center leading-tight rotate-3 shadow-md z-10 pointer-events-none dark:bg-zinc-950/95 dark:text-emerald-400 dark:border-emerald-500/50 select-none">
                  <div className="flex items-center justify-center gap-1 font-bold text-[8px] mb-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>NG ELECTRONIC</span>
                  </div>
                  <p className="font-bold text-[7px]">VERIFIKASI DIGITAL</p>
                  <p>KODE: NG-{startDate.replace(/-/g, '')}-819C</p>
                  <p className="font-bold">GEN: OK / SECURE LOCK</p>
                </div>
              )}

              {/* Interactive Pad Placeholder - Click to sign */}
              {!managerSigImg && (
                <button
                  type="button"
                  onClick={() => setActiveSigningRole('manager')}
                  className="w-full h-24 bg-gray-50/50 hover:bg-gray-100/70 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group print:hidden"
                >
                  <PenTool className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium text-gray-450 group-hover:text-indigo-600 transition-colors">
                    Klik untuk Tanda Tangan
                  </span>
                </button>
              )}

              {/* Static result for display & print */}
              {managerSigImg && (
                <div className="relative group/sig">
                  <img src={managerSigImg} alt="Signature" className="max-h-24 mx-auto" />
                  <button 
                    onClick={() => setManagerSigImg(null)}
                    className="absolute -top-2 -right-2 p-1 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-rose-500 transition-colors shadow-sm print:hidden"
                    title="Buat ulang tanda tangan"
                  >
                    <Eraser className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Just text if nothing is drawn */}
              {!managerSigImg && !signedElectronically && (
                <p className="hidden print:block text-gray-300 italic text-[9px] mt-4">(Tanda Tangan Asli)</p>
              )}
            </div>

            <div>
              <input 
                type="text" 
                value={managerName} 
                onChange={(e) => setManagerName(e.target.value)} 
                className="font-extrabold text-zinc-900 border-b border-zinc-400 pb-1 max-w-[150px] mx-auto text-center bg-transparent focus:ring-1 focus:ring-indigo-550 outline-none w-full block print:hidden"
                title="Klik untuk mengubah nama penandatangan"
                placeholder="Nama Manajer"
              />
              <p className="hidden print:block font-extrabold text-zinc-900 border-b border-zinc-400 pb-1 max-w-[150px] mx-auto text-center font-sans">{managerName || '(Nama Manajer)'}</p>
              
              <input 
                type="text" 
                value={managerRole} 
                onChange={(e) => setManagerRole(e.target.value)} 
                className="text-[10px] text-gray-400 bg-transparent border-0 text-center w-full focus:ring-1 focus:ring-indigo-500 outline-none hover:bg-zinc-150/40 rounded px-1 transition-colors print:hidden mt-1"
                title="Klik untuk mengubah deskripsi/peran"
                placeholder="Manajer Kargo Utama"
              />
              <p className="hidden print:block text-[10px] text-gray-400 text-center w-full font-sans mt-1">{managerRole || '(Jabatan/Peran)'}</p>
            </div>
          </div>

        </div>

      </div>

      {/* Print Assistant & Guidance Overlay Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm print:hidden">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-150 dark:border-zinc-850 bg-zinc-50 dark:bg-zinc-900 w-full flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/50 rounded-lg">
                  <Printer className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white">TNSP SYSTEM Cetak Asisten</h3>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Status: Dokumen Siap Ekspor</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-450 dark:text-zinc-400 transition-colors text-xs font-bold px-2.5 cursor-pointer border border-zinc-200 dark:border-zinc-800"
              >
                Tutup
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              
              {/* Iframe Warnings and Instructions */}
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-xl text-amber-900 dark:text-amber-200 space-y-2 text-left">
                <div className="flex items-center gap-2 font-bold text-[11px]">
                  <span>💡 Informasi Penting Browser Iframe</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  Browser mematikan fungsi cetak <code>window.print()</code> jika dijalankan di dalam panel editor (iframe). Untuk hasil cetakan resmi terbaik, silakan pilih salah satu opsi di bawah:
                </p>
              </div>

              {/* Action grid */}
              <div className="space-y-2.5 pt-1">
                
                {/* 1. Open New Tab to Print */}
                <button
                  onClick={() => {
                    window.open(window.location.href, '_blank', 'noreferrer');
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-indigo-150 dark:border-indigo-900/40 bg-indigo-50/50 hover:bg-indigo-50 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1 px-1.5 rounded-md bg-indigo-600 text-white">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs">Buka di Tab Baru (Disarankan)</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Membuka lembar bebas frame, cetak dengan pintasan Ctrl+P.</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-indigo-500 shrink-0" />
                </button>

                {/* 2. Digital stamp signer */}
                <button
                  onClick={() => setSignedElectronically(!signedElectronically)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer text-left ${
                    signedElectronically 
                      ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20' 
                      : 'border-zinc-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${signedElectronically ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs">
                        {signedElectronically ? 'Tanda Tangan Digital Aktif ✓' : 'Tanda Tangani Berkas Secara Digital'}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Menyematkan stempel validasi kriptografi resmi ke dokumen.</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${signedElectronically ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                    {signedElectronically ? 'AKTIF' : 'SEMATKAN'}
                  </span>
                </button>

                {/* 3. Try standard print anyway */}
                <button
                  onClick={() => {
                    try {
                      window.print();
                    } catch (err) {
                      alert('Tidak dapat mencetak dalam frame ini. Silakan pilih opsi "Buka di Tab Baru" di atas.');
                    }
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 text-left transition-colors cursor-pointer"
                >
                  <div className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-850 text-zinc-650 dark:text-zinc-350">
                    <Printer className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs">Coba Cetak via Browser Langsung</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Memaksa browser membuka dialog cetak jika diizinkan sistem.</p>
                  </div>
                </button>

                {/* 4. Copy data to clipboard */}
                <button
                  onClick={handleCopyRawData}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-850 text-zinc-650 dark:text-zinc-350">
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600 animate-bounce" /> : <Copy className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs">Salin Data Teks Laporan</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Menyalin seluruh isi tabel ke clipboard komputer Anda.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-zinc-500">
                    {copiedText ? 'Tersalin !' : 'Salin'}
                  </span>
                </button>

              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-150 dark:border-zinc-850 bg-zinc-50 dark:bg-zinc-900 flex justify-end gap-2">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg border border-zinc-250 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                Kembali ke Dokumen
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Full-Screen signature drawing canvas modal */}
      {activeSigningRole && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-xs flex items-center justify-center p-0 sm:p-6 md:p-8 animate-in fade-in duration-250">
          <div className="bg-white dark:bg-zinc-900 w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-150 dark:border-zinc-800">
            {/* Header */}
            <div className="p-5 border-b border-gray-150 dark:border-zinc-850 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/20">
              <div>
                <h3 className="font-sans font-extrabold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                  <PenTool className="w-4.5 h-4.5 text-indigo-550" />
                  <span>Tanda Tangan Digital</span>
                </h3>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                  {activeSigningRole === 'checker' ? 'Menandatangani dokumen sebagai: ' + (checkerName || 'Petugas') :
                   activeSigningRole === 'auditor' ? 'Menandatangani dokumen sebagai: ' + (auditorName || 'Pendamping') :
                   'Menandatangani dokumen sebagai: ' + (managerName || 'Manajer')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSigningRole(null)}
                className="p-1.5 hover:bg-gray-150 dark:hover:bg-zinc-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors cursor-pointer text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 flex flex-col min-h-[320px] sm:min-h-[360px] justify-center">
              <div className="flex-1 bg-white rounded-2xl border-2 border-dashed border-gray-250 dark:border-zinc-800 relative overflow-hidden shadow-inner flex items-center justify-center min-h-[240px]">
                <SignatureCanvas
                  ref={modalSigRef}
                  penColor="black"
                  canvasProps={{ className: 'absolute inset-0 w-full h-full cursor-crosshair' }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5 select-none">
                  <PenTool className="w-16 h-16 text-black" />
                </div>
              </div>
              
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 text-center mt-3 font-sans">
                Silakan gambar tanda tangan Anda di atas area putih kosong. Gunakan jari pada layar sentuh, stylus, atau kursor mouse.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-t border-gray-150 dark:border-zinc-850 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (modalSigRef.current) {
                    modalSigRef.current.clear();
                  }
                }}
                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Bersihkan</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSigningRole(null)}
                  className="px-4 py-2.5 border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-850 text-gray-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (modalSigRef.current && !modalSigRef.current.isEmpty()) {
                      const dataUrl = modalSigRef.current.getTrimmedCanvas().toDataURL('image/png');
                      if (activeSigningRole === 'checker') {
                        setCheckerSigImg(dataUrl);
                      } else if (activeSigningRole === 'auditor') {
                        setAuditorSigImg(dataUrl);
                      } else if (activeSigningRole === 'manager') {
                        setManagerSigImg(dataUrl);
                      }
                      setActiveSigningRole(null);
                    }
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md active:translate-y-[1px] cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Simpan Tanda Tangan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Physical Form Print Preview Modal (Stok Opname, Masuk, Keluar) */}
      <AnimatePresence>
        {showPhysicalFormPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-zinc-850 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-gray-950 dark:text-gray-100 font-sans"
            >
              {/* Modal Header */}
              <div className="px-6 py-4.5 border-b border-gray-150/80 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-gray-50/50 dark:bg-zinc-900/40">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    physicalFormType === 'in' ? 'bg-emerald-500/10 text-emerald-600' :
                    physicalFormType === 'out' ? 'bg-sky-500/10 text-sky-600' :
                    'bg-amber-500/10 text-amber-600'
                  }`}>
                    {physicalFormType === 'in' ? <PackagePlus className="w-5 h-5" /> :
                     physicalFormType === 'out' ? <PackageMinus className="w-5 h-5" /> :
                     <ClipboardList className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-gray-850 dark:text-zinc-250">
                      {physicalFormType === 'in' ? 'Pratinjau Formulir Penerimaan Barang Masuk' :
                       physicalFormType === 'out' ? 'Pratinjau Formulir Pengeluaran Barang Keluar' :
                       'Pratinjau Formulir Stok Opname'}
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold block mt-0.5">
                      Silakan periksa lembar formulir fisik di bawah sebelum dikirim ke printer atau diunduh ke Excel.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-gray-550 dark:text-zinc-400">Mulai:</span>
                      <input
                        type="date"
                        value={physicalFormStartDate}
                        onChange={(e) => setPhysicalFormStartDate(e.target.value)}
                        className="px-2.5 py-1 text-xs bg-white dark:bg-zinc-805 border border-gray-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-gray-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-gray-550 dark:text-zinc-400">Akhir:</span>
                      <input
                        type="date"
                        value={physicalFormEndDate}
                        onChange={(e) => setPhysicalFormEndDate(e.target.value)}
                        className="px-2.5 py-1 text-xs bg-white dark:bg-zinc-805 border border-gray-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPhysicalFormPreview(false)}
                    className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body (Scrollable Sheet Backdrop) */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-100 dark:bg-zinc-950 flex justify-center">
                <div className="bg-white text-black shadow-lg rounded-2xl border border-gray-200 w-full max-w-[21cm] p-[1.2cm] min-h-[29.7cm] flex flex-col font-sans relative box-border selection:bg-amber-100 text-left">
                  
                  {/* Decorative Watermark */}
                  <div className="absolute top-3 right-6 text-[9px] font-mono font-bold text-gray-400 select-none">
                    Digital Form Preview
                  </div>

                  {/* Document Header */}
                  <div className="border-b-2 border-black pb-4 mb-6">
                    <h1 className="text-xl font-extrabold text-center tracking-tight text-black uppercase mb-1">
                      {physicalFormType === 'in' ? 'FORMULIR PENERIMAAN BARANG MASUK (INBOUND)' :
                       physicalFormType === 'out' ? 'FORMULIR PENGELUARAN BARANG KELUAR (OUTBOUND)' :
                       'FORMULIR STOK OPNAME BARANG'}
                    </h1>
                    <p className="text-xs text-center text-gray-500 font-mono tracking-wide leading-none">
                      {printingPhysicalFormLocation === 'Semua Sektor / Rak' ? 'SELURUH SEKTOR / RAK AKTIF' : printingPhysicalFormLocation.toUpperCase()}
                    </p>
                    
                    <div className="flex justify-between items-start text-[11px] mt-6 leading-relaxed text-black">
                      <div className="space-y-1">
                        <p><strong>Gudang / Sektor:</strong> <span className="uppercase">{printingPhysicalFormLocation}</span></p>
                        <p><strong>Petugas Checker:</strong> {currentUser.name} ({currentUser.role})</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p><strong>Periode Tanggal:</strong> {formatAuditDateRange(physicalFormStartDate, physicalFormEndDate)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Document Table */}
                  <table className="w-full border-collapse border border-black text-[11px] text-black">
                    <thead>
                      <tr className="bg-gray-100 font-bold">
                        <th className="border border-black p-2 text-center" style={{ width: '4%' }}>No</th>
                        <th className="border border-black p-2 text-left" style={{ width: '30%' }}>Nama Barang</th>
                        <th className="border border-black p-2 text-center" style={{ width: '10%' }}>Satuan</th>
                        {opnameCols.map(num => (
                          <th key={num} className="border border-black p-2 text-center font-mono text-[10px]" style={{ width: opnameColWidth }}>{num}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {physicalFormProductsToPrint.length === 0 ? (
                        <tr>
                          <td colSpan={3 + opnameCols.length} className="border border-black p-6 text-center text-gray-400 italic">
                            Tidak ada barang terdaftar di lokasi / rak yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        physicalFormProductsToPrint.map((prod, index) => (
                          <tr key={prod.id}>
                            <td className="border border-black p-2 text-center">{index + 1}</td>
                            <td className="border border-black p-2 font-bold">{prod.name}</td>
                            <td className="border border-black p-2 text-center uppercase">{prod.unit || 'pcs'}</td>
                            {opnameCols.map(num => (
                              <td key={num} className="border border-black p-2 text-center font-mono text-gray-205 select-none" style={{ width: opnameColWidth }}>
                                <div className="h-4 border border-dashed border-gray-200 rounded-xs"></div>
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {/* Document Signatures */}
                  <div className="grid grid-cols-3 gap-6 text-center text-[11px] mt-auto pt-16">
                    <div>
                      <p className="font-semibold text-black">
                        {physicalFormType === 'in' ? 'Diterima Oleh,' :
                         physicalFormType === 'out' ? 'Diserahkan Oleh,' :
                         'Dibuat Oleh,'}
                      </p>
                      <div className="border-t border-black mt-16 pt-1 font-bold text-black uppercase">
                        {physicalFormType === 'in' ? 'Petugas Gudang' :
                         physicalFormType === 'out' ? 'Petugas Gudang' :
                         'Pemeriksaan Fisik'}
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-black">
                        {physicalFormType === 'in' ? 'Pengirim / Ekspedisi,' :
                         physicalFormType === 'out' ? 'Diterima Oleh (Pemohon),' :
                         'Saksi Lapangan,'}
                      </p>
                      <div className="border-t border-black mt-16 pt-1 font-bold text-black uppercase">
                        {physicalFormType === 'in' ? 'Supplier / Driver' :
                         physicalFormType === 'out' ? 'Penerima / Driver' :
                         'Saksi Lapangan'}
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-black">Divalidasi Oleh,</p>
                      <div className="border-t border-black mt-16 pt-1 font-bold text-black uppercase">
                        Kepala Gudang / Admin
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4.5 border-t border-gray-150 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-gray-50/50 dark:bg-zinc-900/40">
                <button
                  type="button"
                  onClick={() => setShowPhysicalFormPreview(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-805 cursor-pointer transition-colors"
                >
                  Tutup / Batal
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleExportPhysicalFormExcel();
                    }}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl bg-white dark:bg-zinc-800 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-gray-50 dark:hover:bg-zinc-700 cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Ekspor Excel Format Formulir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePrintPhysicalForm();
                      setShowPhysicalFormPreview(false);
                    }}
                    className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl text-white shadow-lg cursor-pointer transition-all flex items-center gap-1.5 active:scale-[0.98] ${
                      physicalFormType === 'in' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10' :
                      physicalFormType === 'out' ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/10' :
                      'bg-amber-600 hover:bg-amber-700 shadow-amber-600/10'
                    }`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak Formulir Sekarang</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Physical Form Print Layout */}
      {isPrintingPhysicalForm && createPortal(
        <div id="physical-form-print-root" className="fixed top-0 left-0 invisible pointer-events-none">
          <style>
            {`
              @media print {
                body {
                  visibility: hidden !important;
                  background: white !important;
                  color: black !important;
                  font-family: sans-serif !important;
                }
                #root {
                  display: none !important;
                }
                #physical-form-print-root {
                  visibility: visible !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  width: 100% !important;
                  display: block !important;
                  background: white !important;
                  color: black !important;
                  padding: 20px !important;
                  box-sizing: border-box !important;
                }
                .print-table {
                  width: 100% !important;
                  border-collapse: collapse !important;
                  margin-top: 15px !important;
                }
                .print-table th {
                  background-color: #f3f4f6 !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  border: 1px solid #111111 !important;
                  padding: 8px 6px !important;
                  font-size: 11px !important;
                  font-weight: bold !important;
                  text-align: left !important;
                  text-transform: uppercase !important;
                }
                .print-table td {
                  border: 1px solid #111111 !important;
                  padding: 8px 6px !important;
                  font-size: 11px !important;
                  vertical-align: middle !important;
                }
                .print-header {
                  border-bottom: 2px solid #000000 !important;
                  padding-bottom: 10px !important;
                  margin-bottom: 15px !important;
                }
                .print-title {
                  font-size: 18px !important;
                  font-weight: bold !important;
                  text-align: center !important;
                }
                .print-meta {
                  display: flex !important;
                  justify-content: space-between !important;
                  font-size: 11px !important;
                  margin-top: 8px !important;
                }
                .print-signatures {
                  margin-top: 50px !important;
                  display: grid !important;
                  grid-template-columns: repeat(3, 1fr) !important;
                  gap: 20px !important;
                  text-align: center !important;
                  font-size: 11px !important;
                  page-break-inside: avoid !important;
                }
                .sig-line {
                  border-top: 1px solid #000000 !important;
                  margin-top: 45px !important;
                  padding-top: 4px !important;
                }
                tr {
                  page-break-inside: avoid !important;
                }
              }
            `}
          </style>

          <div className="print-header">
            <h1 className="print-title">
              {physicalFormType === 'in' ? 'FORMULIR PENERIMAAN BARANG MASUK (INBOUND)' :
               physicalFormType === 'out' ? 'FORMULIR PENGELUARAN BARANG KELUAR (OUTBOUND)' :
               'FORMULIR STOK OPNAME BARANG'}
            </h1>
            <div className="print-meta">
              <div>
                <p><strong>Gudang / Sektor:</strong> {printingPhysicalFormLocation}</p>
                <p><strong>Dicetak Oleh:</strong> {currentUser.name} ({currentUser.role})</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p><strong>Periode Tanggal:</strong> {formatAuditDateRange(physicalFormStartDate, physicalFormEndDate)}</p>
              </div>
            </div>
          </div>

          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '4%', textAlign: 'center' }}>No</th>
                <th style={{ width: '30%', textAlign: 'left' }}>Nama Barang</th>
                <th style={{ width: '10%', textAlign: 'center' }}>Satuan</th>
                {opnameCols.map(num => (
                  <th key={num} style={{ width: opnameColWidth, textAlign: 'center', fontFamily: 'monospace' }}>{num}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {physicalFormProductsToPrint.length === 0 ? (
                <tr>
                  <td colSpan={3 + opnameCols.length} style={{ textAlign: 'center', padding: '20px' }}>
                    Tidak ada barang terdaftar di lokasi ini.
                  </td>
                </tr>
              ) : (
                physicalFormProductsToPrint.map((prod, index) => (
                  <tr key={prod.id}>
                    <td style={{ textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ fontWeight: 'bold' }}>{prod.name}</td>
                    <td style={{ textAlign: 'center', textTransform: 'uppercase' }}>{prod.unit || 'pcs'}</td>
                    {opnameCols.map(num => (
                      <td key={num} style={{ textAlign: 'center', padding: '10px 4px', width: opnameColWidth }}></td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="print-signatures">
            <div>
              <p>
                {physicalFormType === 'in' ? 'Diterima Oleh,' :
                 physicalFormType === 'out' ? 'Diserahkan Oleh,' :
                 'Dibuat Oleh,'}
              </p>
              <div className="sig-line">
                {physicalFormType === 'in' ? 'Petugas Gudang' :
                 physicalFormType === 'out' ? 'Petugas Gudang' :
                 'Pemeriksaan Fisik'}
              </div>
            </div>
            <div>
              <p>
                {physicalFormType === 'in' ? 'Pengirim / Ekspedisi,' :
                 physicalFormType === 'out' ? 'Diterima Oleh,' :
                 'Saksi Lapangan,'}
              </p>
              <div className="sig-line">
                {physicalFormType === 'in' ? 'Supplier / Driver' :
                 physicalFormType === 'out' ? 'Penerima / Driver' :
                 'Saksi Lapangan'}
              </div>
            </div>
            <div>
              <p>Divalidasi Oleh,</p>
              <div className="sig-line">Kepala Gudang / Admin</div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

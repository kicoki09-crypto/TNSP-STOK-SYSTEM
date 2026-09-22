/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  History, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Calendar, 
  User as UserIcon, 
  Tag, 
  FileText,
  Clock,
  RotateCcw,
  Plus,
  Minus,
  ArrowRightLeft,
  ClipboardList,
  Layers,
  Edit,
  Trash2,
  X,
  MapPin,
  Lock,
  CheckCircle2,
  SlidersHorizontal
} from 'lucide-react';
import { Transaction, Product, User } from '../types';


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

export interface GroupedTransaction {
  formNo: string;
  suratJalan: string;
  date: string;
  type: 'in' | 'out' | 'transfer' | 'audit' | 'produksi';
  isAudit: boolean;
  operatorName: string;
  operatorRole: string;
  items: Transaction[];
  totalInvoice: number;
}

export const parseFormNoAndSj = (note: string | undefined, txId: string) => {
  if (!note) return { formNo: `TX-${txId.slice(-5).toUpperCase()}`, suratJalan: '-' };
  
  // 1. Direct match for our custom transparent marker [Form: XXX]
  const formMatch = note.match(/\[Form:\s*([^\]]+)\]/);
  const sjMatch = note.match(/\(SJ:\s*([^)]+)\)/i);
  const suratJalan = sjMatch && sjMatch[1] ? sjMatch[1] : '-';

  if (formMatch && formMatch[1]) {
    return { formNo: formMatch[1].trim(), suratJalan };
  }

  // Fallback to old parsing logic for historical transactions
  // Identify Form No
  let cleaned = note;
  cleaned = cleaned.replace(/\[Form:\s*[^\]]+\]/gi, ''); // remove marker if present
  cleaned = cleaned.replace(/\(SJ:\s*[^)]+\)/gi, '');
  cleaned = cleaned.replace(/Faktur Pembelian/gi, '');
  cleaned = cleaned.replace(/Faktur Penjualan \/\s*(?:PO|SJ)/gi, '');
  cleaned = cleaned.replace(/Faktur Penjualan/gi, '');
  cleaned = cleaned.replace(/Pengeluaran via multi-item\s*\(Multi-Item\)/gi, '');
  cleaned = cleaned.replace(/\(Multi-Item\)/gi, '');
  cleaned = cleaned.replace(/\([^)]+\)/gi, '');
  
  let formNo = cleaned.trim();
  
  if (!formNo || formNo.length < 3 || formNo.toLowerCase().includes('pengeluaran via') || formNo.toLowerCase().includes('barang masuk')) {
    const directMatch = note.match(/(\d{5}-(?:PI|PO)-\d{2}-\d{2})/);
    if (directMatch) {
      formNo = directMatch[1];
    } else {
      formNo = `TX-${txId.slice(-5).toUpperCase()}`;
    }
  }
  
  return { formNo, suratJalan };
};

interface TransactionHistoryProps {
  transactions: Transaction[];
  products: Product[];
  currentUser: User;
  onChangeTab?: (tab: string) => void;
  onIntentChange?: (intent: 'in' | 'out' | 'transfer' | 'audit' | 'adjust') => void;
  onEditTransaction?: (tx: Transaction) => void;
  onEditMultipleTransactions?: (originalTxs: Transaction[], updatedTxs: Transaction[], deletedTxIds: string[]) => Promise<void>;
  onDeleteTransaction?: (txId: string) => void;
  onDeleteMultipleTransactions?: (txIds: string[]) => Promise<void>;
  onAdjustStockOpname?: (txId?: string) => void;
  locationsList?: string[];
}

export default function TransactionHistory({ 
  transactions,
  products,
  currentUser,
  onChangeTab,
  onIntentChange,
  onEditTransaction,
  onEditMultipleTransactions,
  onDeleteTransaction,
  onDeleteMultipleTransactions,
  onAdjustStockOpname,
  locationsList = []
}: TransactionHistoryProps) {
  const isUserRestricted = useMemo(() => {
    if (currentUser.role === 'admin') return false;
    if (!currentUser.location) return false;
    const locs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return !locs.includes('semua gudang');
  }, [currentUser]);

  const accessibleProducts = useMemo(() => {
    const list = products || [];
    if (!isUserRestricted || !currentUser.location) return list;
    const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return list.filter(p => p && p.location && userLocs.includes(p.location.trim().toLowerCase()));
  }, [products, isUserRestricted, currentUser.location]);

  const accessibleTransactions = useMemo(() => {
    const list = transactions || [];
    if (!isUserRestricted || !currentUser.location) return list;
    const allowedProductIds = new Set(accessibleProducts.map(p => p && p.id).filter(Boolean));
    return list.filter(t => {
      if (!t || !t.productId) return false;
      const isProductMatch = allowedProductIds.has(t.productId);
      if (isProductMatch) return true;

      // Juga tampilkan jika transaksi dilakukan oleh pengguna ini sendiri
      return t.operatorName === currentUser.name;
    });
  }, [transactions, isUserRestricted, accessibleProducts, currentUser.name]);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out' | 'transfer' | 'audit' | 'produksi'>('all');
  const [operatorFilter, setOperatorFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  const pendingAuditAdjustments = useMemo(() => {
    return accessibleTransactions.filter(t => t && t.isAudit && (t.difference ?? 0) !== 0);
  }, [accessibleTransactions]);

  // Page index
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Edit and Delete states
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedGroupedTx, setSelectedGroupedTx] = useState<GroupedTransaction | null>(null);

  const handleBulkDeleteConfirm = async () => {
    if (!currentUser.permissions.canDeleteTransaction) {
      alert('Anda tidak memiliki hak akses untuk menghapus riwayat transaksi (Hapus Transaksi).');
      return;
    }
    if (selectedTxIds.length === 0) return;
    
    try {
      await onDeleteMultipleTransactions?.(selectedTxIds);
      setSelectedTxIds([]);
      setShowBulkDeleteModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Form states for Editing
  const [editingGroupedTx, setEditingGroupedTx] = useState<GroupedTransaction | null>(null);
  const [editGroupFormNo, setEditGroupFormNo] = useState<string>('');
  const [editGroupSuratJalan, setEditGroupSuratJalan] = useState<string>('');
  const [editGroupDate, setEditGroupDate] = useState<string>('');
  const [editGroupOperatorName, setEditGroupOperatorName] = useState<string>('');
  const [editGroupItems, setEditGroupItems] = useState<Transaction[]>([]);
  const [editGroupDeletedIds, setEditGroupDeletedIds] = useState<string[]>([]);

  // States for Adding New Items during edit
  const [addItemProductId, setAddItemProductId] = useState<string>('');
  const [addItemBatchNumber, setAddItemBatchNumber] = useState<string>('');
  const [addItemQty, setAddItemQty] = useState<number>(1);
  const [addItemPrice, setAddItemPrice] = useState<number>(0);
  const [addItemLocation, setAddItemLocation] = useState<string>('');
  const [addItemNote, setAddItemNote] = useState<string>('');

  // Auto populate defaults when a product is selected to add
  useEffect(() => {
    if (!addItemProductId) return;
    const product = products.find(p => p.id === addItemProductId);
    if (product) {
      setAddItemPrice(product.price || 0);
      setAddItemLocation(product.location || '');
      if (product.batches && product.batches.length > 0) {
        setAddItemBatchNumber(product.batches[0].batchNumber || '');
      } else {
        setAddItemBatchNumber('');
      }
    }
  }, [addItemProductId, products]);

  const handleAddNewItemToEditGroup = () => {
    if (!editingGroupedTx) return;
    if (!addItemProductId) {
      alert('Pilih barang terlebih dahulu!');
      return;
    }
    const product = products.find(p => p.id === addItemProductId);
    if (!product) return;

    // Create new transaction structure matching the edit group
    const newTxItem: Transaction = {
      id: `new-tx-${Date.now()}-${Math.random()}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      type: (editingGroupedTx.type === 'audit' || editingGroupedTx.type === 'transfer') ? 'in' : editingGroupedTx.type as 'in' | 'out',
      qty: addItemQty || 1,
      note: addItemNote,
      date: editGroupDate ? new Date(editGroupDate).toISOString() : new Date().toISOString(),
      operatorName: editGroupOperatorName || currentUser.name,
      operatorRole: currentUser.role,
      unit: product.unit || 'pcs',
      batchNumber: addItemBatchNumber || '',
      location: addItemLocation || product.location || '',
      price: addItemPrice || product.price || 0,
      isAudit: editingGroupedTx.isAudit
    };

    if (editingGroupedTx.isAudit) {
      const system = product.qty || 0;
      const physical = addItemQty;
      const diff = physical - system;
      newTxItem.systemQty = system;
      newTxItem.physicalQty = physical;
      newTxItem.difference = diff;
      newTxItem.qty = Math.abs(diff);
    }

    setEditGroupItems(prev => [...prev, newTxItem]);

    // Reset fields
    setAddItemProductId('');
    setAddItemBatchNumber('');
    setAddItemQty(1);
    setAddItemPrice(0);
    setAddItemLocation('');
    setAddItemNote('');
  };

  const handleOpenGroupedEdit = (group: GroupedTransaction) => {
    if (!currentUser.permissions.canEditTransaction) {
      alert('Anda tidak memiliki hak akses untuk mengubah riwayat transaksi (Edit Transaksi).');
      return;
    }
    setEditingGroupedTx(group);
    setEditGroupFormNo(group.formNo);
    setEditGroupSuratJalan(group.suratJalan !== '-' ? group.suratJalan : '');
    setEditGroupOperatorName(group.operatorName);
    setEditGroupDeletedIds([]);
    setEditGroupItems(group.items.map(item => ({ ...item })));
    
    if (group.date) {
      try {
        const d = new Date(group.date);
        if (!isNaN(d.getTime())) {
          const pad = (num: number) => String(num).padStart(2, '0');
          const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          setEditGroupDate(dateStr);
        } else {
          setEditGroupDate('');
        }
      } catch (err) {
        setEditGroupDate('');
      }
    } else {
      setEditGroupDate('');
    }

    setAddItemProductId('');
    setAddItemBatchNumber('');
    setAddItemQty(1);
    setAddItemPrice(0);
    setAddItemLocation('');
    setAddItemNote('');
  };

  const handleSaveGroupedEdit = async () => {
    if (!editingGroupedTx || !onEditMultipleTransactions) return;

    const updatedTxs = editGroupItems.map(item => {
      let updatedNote = getManualNoteOnly(item.note);
      const sjStr = editGroupSuratJalan.trim() ? ` (SJ: ${editGroupSuratJalan.trim()})` : '';
      let defaultNote = '';

      const isTransfer = item.note.toLowerCase().includes('transfer') || item.note.toLowerCase().includes('mutasi');

      if (item.isAudit) {
        const diff = (item.physicalQty ?? 0) - (item.systemQty ?? 0);
        const isAdjust = item.note.toLowerCase().includes('penyesuaian') || item.note.toLowerCase().includes('adjust');
        defaultNote = isAdjust 
          ? `Penyesuaian Stok Opname. Stok Sistem: ${item.systemQty} | Stok Fisik: ${item.physicalQty} | Penyesuaian: ${diff > 0 ? '+' : ''}${diff}`
          : `Audit Stok Opname berkala. Sistem: ${item.systemQty} | Fisik: ${item.physicalQty} | Selisih: ${diff > 0 ? '+' : ''}${diff}`;
      } else if (isTransfer) {
        const transferMatch = item.note.match(/Inisiasi Mutasi dari (.*) ke (.*)/);
        const originW = transferMatch ? transferMatch[1] : 'Gudang';
        const targetW = transferMatch ? transferMatch[2] : 'Gudang';
        defaultNote = `Inisiasi Mutasi dari ${originW} ke ${targetW}`;
      } else {
        defaultNote = item.type === 'in'
          ? `Penerimaan Barang / Surat Jalan PO ${editGroupFormNo}${sjStr}`
          : `Faktur Penjualan / PO ${editGroupFormNo}${sjStr}`;
      }
      
      const formNoToSave = editGroupFormNo.trim() || editingGroupedTx.formNo;
      const combinedNote = updatedNote 
        ? `${updatedNote} (${defaultNote}) [Form: ${formNoToSave}]` 
        : `${defaultNote} [Form: ${formNoToSave}]`;

      let savedDate = item.date;
      if (editGroupDate) {
        savedDate = new Date(editGroupDate).toISOString();
      }

      return {
        ...item,
        date: savedDate,
        operatorName: editGroupOperatorName.trim() || item.operatorName,
        note: combinedNote,
        qty: item.qty,
        location: item.location
      };
    });

    try {
      await onEditMultipleTransactions(
        editingGroupedTx.items,
        updatedTxs,
        editGroupDeletedIds
      );
      setEditingGroupedTx(null);
    } catch (err) {
      console.error(err);
    }
  };

  const updateItemField = (index: number, field: keyof Transaction, value: any) => {
    setEditGroupItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      
      if (field === 'systemQty' || field === 'physicalQty') {
        const system = field === 'systemQty' ? parseFloat(value) || 0 : (item.systemQty ?? 0);
        const physical = field === 'physicalQty' ? parseFloat(value) || 0 : (item.physicalQty ?? 0);
        const diff = physical - system;
        return {
          ...item,
          [field]: value,
          difference: diff,
          qty: Math.abs(diff)
        };
      }
      
      return { ...item, [field]: value };
    }));
  };

  const handleDeleteItemFromEditGroup = (index: number) => {
    const targetItem = editGroupItems[index];
    if (targetItem.id) {
      setEditGroupDeletedIds(prev => [...prev, targetItem.id]);
    }
    setEditGroupItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const [editQty, setEditQty] = useState<number>(0);
  const [editNote, setEditNote] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editOperatorName, setEditOperatorName] = useState<string>('');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editSystemQty, setEditSystemQty] = useState<number>(0);
  const [editPhysicalQty, setEditPhysicalQty] = useState<number>(0);

  const handleOpenEdit = (tx: Transaction) => {
    if (!currentUser.permissions.canEditTransaction) {
      alert('Anda tidak memiliki hak akses untuk mengubah riwayat transaksi (Edit Transaksi).');
      return;
    }
    const prod = productMap.get(tx.productId);
    setEditingTx(tx);
    setEditQty(tx.qty);
    setEditNote(tx.note || '');
    setEditOperatorName(tx.operatorName || '');
    setEditLocation(tx.location || prod?.location || '');
    setEditSystemQty(tx.systemQty ?? 0);
    setEditPhysicalQty(tx.physicalQty ?? 0);
    
    // Ensure accurate dateTime formatting for datetime-local input
    if (tx.date) {
      try {
        const d = new Date(tx.date);
        if (!isNaN(d.getTime())) {
          const pad = (num: number) => String(num).padStart(2, '0');
          const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          setEditDate(dateStr);
        } else {
          setEditDate('');
        }
      } catch (err) {
        setEditDate('');
      }
    } else {
      setEditDate('');
    }
  };

  const handleSaveEdit = () => {
    if (!editingTx) return;

    let updatedQty = editQty;
    let computedDifference = editingTx.difference;

    if (editingTx.isAudit) {
      computedDifference = editPhysicalQty - editSystemQty;
      updatedQty = Math.abs(computedDifference);
    }

    const updatedTx: Transaction = {
      ...editingTx,
      qty: updatedQty,
      note: editNote,
      date: editDate ? new Date(editDate).toISOString() : new Date().toISOString(),
      operatorName: editOperatorName,
      location: editLocation.trim() || editingTx.location || 'Rak A-01',
      systemQty: editingTx.isAudit ? editSystemQty : undefined,
      physicalQty: editingTx.isAudit ? editPhysicalQty : undefined,
      difference: editingTx.isAudit ? computedDifference : undefined,
    };

    onEditTransaction?.(updatedTx);
    setEditingTx(null);
  };

  const handleDeleteConfirm = () => {
    if (!currentUser.permissions.canDeleteTransaction) {
      alert('Anda tidak memiliki hak akses untuk menghapus riwayat transaksi (Hapus Transaksi).');
      return;
    }
    if (!deletingTxId) return;
    onDeleteTransaction?.(deletingTxId);
    setDeletingTxId(null);
  };

  // Map of productId to Product for fast location lookup
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    (products || []).forEach(p => {
      if (p && p.id) map.set(p.id, p);
    });
    return map;
  }, [products]);

  // Extract unique location / sektor / rak options list
  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    if (locationsList) {
      locationsList.forEach(l => {
        if (l && l.trim() && l.trim().toLowerCase() !== 'semua gudang') {
          set.add(l.trim());
        }
      });
    }
    (products || []).forEach(p => {
      if (p && p.location && p.location.trim() && p.location.trim().toLowerCase() !== 'semua gudang') {
        set.add(p.location.trim());
      }
    });
    (transactions || []).forEach(t => {
      if (t && t.location && t.location.trim() && t.location.trim().toLowerCase() !== 'semua gudang') {
        set.add(t.location.trim());
      }
    });
    return Array.from(set).sort();
  }, [locationsList, products, transactions]);

  // Extract unique operator list
  const operators = useMemo(() => {
    try {
      const arr = accessibleTransactions || [];
      const list = new Set(arr.filter(t => t && t.operatorName).map(t => t.operatorName));
      return ['all', ...Array.from(list)];
    } catch (e) {
      console.error('Error calculating operators in TransactionHistory:', e);
      return ['all'];
    }
  }, [accessibleTransactions]);

  // Filters logic
  const filteredTransactions = useMemo(() => {
    try {
      const arr = accessibleTransactions || [];
      return arr.filter(t => {
        if (!t) return false;
        const productName = t.productName || '';
        const sku = t.sku || '';
        const note = t.note || '';

        const matchSearch = productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            sku.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            note.toLowerCase().includes(searchTerm.toLowerCase());
        
        let matchType = true;
        if (typeFilter !== 'all') {
          const lowerNote = note.toLowerCase();
          if (typeFilter === 'transfer') {
            matchType = lowerNote.includes('transfer') || lowerNote.includes('mutasi');
          } else if (typeFilter === 'audit') {
            matchType = !!t.isAudit || lowerNote.includes('opname') || lowerNote.includes('penyesuaian stok');
          } else if (typeFilter === 'produksi') {
            matchType = lowerNote.includes('produksi') || (t.id || '').toLowerCase().includes('-prod-');
          } else {
            matchType = t.type === typeFilter;
          }
        }
        const matchOperator = operatorFilter === 'all' || t.operatorName === operatorFilter;

        let matchLocation = true;
        if (locationFilter !== 'all') {
          const prod = productMap.get(t.productId);
          const txLoc = (t.location || prod?.location || '').trim().toLowerCase();
          matchLocation = txLoc === locationFilter.trim().toLowerCase();
        }

        let matchDate = true;
        if (startDate || endDate) {
          if (!t.date) {
            matchDate = false;
          } else {
            const itemDateStr = t.date.split('T')[0];
            if (startDate && itemDateStr < startDate) matchDate = false;
            if (endDate && itemDateStr > endDate) matchDate = false;
          }
        }

        return matchSearch && matchType && matchOperator && matchLocation && matchDate;
      });
    } catch (e) {
      console.error('Error filtering transactions in TransactionHistory:', e);
      return [];
    }
  }, [accessibleTransactions, searchTerm, typeFilter, operatorFilter, locationFilter, startDate, endDate, productMap]);

  // Group filtered transactions by Form No
  const groupedTransactions = useMemo(() => {
    try {
      const groups: { [key: string]: GroupedTransaction } = {};
      const arr = filteredTransactions || [];
      
      arr.forEach(t => {
        if (!t) return;
        
        const { formNo, suratJalan } = parseFormNoAndSj(t.note, t.id);
        const prod = productMap.get(t.productId);
        const prodPrice = prod ? (prod.price || 0) : 0;
        const lineTotal = t.qty * prodPrice;

        if (!groups[formNo]) {
          groups[formNo] = {
            formNo,
            suratJalan,
            date: t.date,
            type: t.isAudit ? 'audit' : t.type,
            isAudit: !!t.isAudit,
            operatorName: t.operatorName || '',
            operatorRole: t.operatorRole || '',
            items: [],
            totalInvoice: 0
          };
        }
        
        groups[formNo].items.push(t);
        groups[formNo].totalInvoice += lineTotal;
        if (suratJalan !== '-' && groups[formNo].suratJalan === '-') {
          groups[formNo].suratJalan = suratJalan;
        }
      });
      
      return Object.values(groups).sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    } catch (e) {
      console.error('Error grouping transactions in TransactionHistory:', e);
      return [];
    }
  }, [filteredTransactions, productMap]);

  // Paginated records based on grouped transactions
  const paginatedGroupedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return groupedTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [groupedTransactions, currentPage]);

  const totalPages = Math.ceil(groupedTransactions.length / itemsPerPage) || 1;

  const isAllPageSelected = useMemo(() => {
    if (paginatedGroupedTransactions.length === 0) return false;
    return paginatedGroupedTransactions.every(group => 
      group.items.every(item => selectedTxIds.includes(item.id))
    );
  }, [paginatedGroupedTransactions, selectedTxIds]);

  const toggleAllPageSelection = (checked: boolean) => {
    const allPageIds = paginatedGroupedTransactions.flatMap(group => group.items.map(i => i.id));
    if (checked) {
      setSelectedTxIds(prev => Array.from(new Set([...prev, ...allPageIds])));
    } else {
      setSelectedTxIds(prev => prev.filter(id => !allPageIds.includes(id)));
    }
  };

  const toggleGroupSelection = (group: GroupedTransaction) => {
    const itemIds = group.items.map(i => i.id);
    const allSelected = itemIds.every(id => selectedTxIds.includes(id));
    if (allSelected) {
      setSelectedTxIds(prev => prev.filter(id => !itemIds.includes(id)));
    } else {
      setSelectedTxIds(prev => Array.from(new Set([...prev, ...itemIds])));
    }
  };

  const formatIDRCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="space-y-6" id="transactions-tab-workspace">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold font-sans tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <History className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          TRANSAKSI
        </h2>
      </div>

      {isUserRestricted && (
        <div className="flex">
          <button
            type="button"
            className="inline-flex items-center gap-2.5 px-3 py-1.5 bg-indigo-50/70 hover:bg-indigo-100/75 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 border border-indigo-100/50 dark:border-zinc-800 rounded-full text-xs font-semibold text-indigo-700 dark:text-indigo-400 shadow-xs transition-all cursor-pointer select-none"
            title={`Riwayat Tersegmentasi. Menampilkan catatan riwayat mutasi bongkar-muat barang yang tersimpan khusus untuk lokasi gudang "${currentUser.location}" saja.`}
          >
            <MapPin className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] leading-none tracking-tight">
              Riwayat Tersegmentasi: <strong className="text-indigo-800 dark:text-indigo-300 font-bold">{currentUser.location}</strong>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0"></span>
          </button>
        </div>
      )}

      {/* Quick Transaction Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button 
          onClick={() => {
            if (!currentUser.permissions.canRecordBarangMasuk) {
              alert('Anda tidak memiliki hak akses untuk mencatat transaksi barang masuk (Barang Masuk).');
              return;
            }
            onIntentChange?.('in');
            onChangeTab?.('barcode');
          }} 
          className={`bento-cell p-3.5 flex items-center gap-3 group cursor-pointer transition-all ${
            currentUser.permissions.canRecordBarangMasuk
              ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/30'
              : 'opacity-55 grayscale cursor-not-allowed border-gray-150 dark:border-zinc-850 bg-gray-50/10'
          }`}
        >
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform relative shrink-0">
            <Plus className="w-5 h-5" />
            {!currentUser.permissions.canRecordBarangMasuk && (
              <Lock className="absolute -bottom-1 -right-1 w-3 h-3 text-rose-600 bg-white dark:bg-zinc-900 rounded-full p-0.5 shadow-sm" />
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
              Barang
              {!currentUser.permissions.canRecordBarangMasuk && <span className="text-[8px] text-rose-500 font-extrabold">(Kunci)</span>}
            </p>
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-none">MASUK</p>
          </div>
        </button>

        <button 
          onClick={() => {
            if (!currentUser.permissions.canRecordBarangKeluar) {
              alert('Anda tidak memiliki hak akses untuk mencatat transaksi barang keluar (Barang Keluar).');
              return;
            }
            onIntentChange?.('out');
            onChangeTab?.('barcode');
          }} 
          className={`bento-cell p-3.5 flex items-center gap-3 group cursor-pointer transition-all ${
            currentUser.permissions.canRecordBarangKeluar
              ? 'bg-rose-50/30 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/30'
              : 'opacity-55 grayscale cursor-not-allowed border-gray-150 dark:border-zinc-850 bg-gray-50/10'
          }`}
        >
          <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform relative shrink-0">
            <Minus className="w-5 h-5" />
            {!currentUser.permissions.canRecordBarangKeluar && (
              <Lock className="absolute -bottom-1 -right-1 w-3 h-3 text-rose-600 bg-white dark:bg-zinc-900 rounded-full p-0.5 shadow-sm" />
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-[10px] font-bold text-rose-600 dark:text-rose-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
              Barang
              {!currentUser.permissions.canRecordBarangKeluar && <span className="text-[8px] text-rose-500 font-extrabold">(Kunci)</span>}
            </p>
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-none">KELUAR</p>
          </div>
        </button>

        <button 
          onClick={() => {
            if (!currentUser.permissions.canPerformAudit) {
              alert('Anda tidak memiliki hak akses untuk melakukan audit stok opname (Audit Stok Opname).');
              return;
            }
            onIntentChange?.('audit');
            onChangeTab?.('barcode');
          }} 
          className={`bento-cell p-3.5 flex items-center gap-3 group cursor-pointer transition-all ${
            currentUser.permissions.canPerformAudit
              ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200 dark:border-amber-950/30'
              : 'opacity-55 grayscale cursor-not-allowed border-gray-150 dark:border-zinc-850 bg-gray-50/10'
          }`}
        >
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform relative shrink-0">
            <ClipboardList className="w-5 h-5" />
            {!currentUser.permissions.canPerformAudit && (
              <Lock className="absolute -bottom-1 -right-1 w-3 h-3 text-rose-600 bg-white dark:bg-zinc-900 rounded-full p-0.5 shadow-sm" />
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-[10px] font-bold text-amber-650 dark:text-amber-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
              Audit
              {!currentUser.permissions.canPerformAudit && <span className="text-[8px] text-rose-500 font-extrabold">(Kunci)</span>}
            </p>
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-none">STOK OPNAME</p>
          </div>
        </button>

        <button 
          onClick={() => {
            if (!currentUser.permissions.canPerformAudit && currentUser.role !== 'admin' && !currentUser.permissions.canEditTransaction) {
              alert('Anda tidak memiliki hak akses untuk melakukan penyesuaian stok opname.');
              return;
            }
            onIntentChange?.('adjust');
            onChangeTab?.('barcode');
          }} 
          className={`bento-cell p-3.5 flex items-center gap-3 group cursor-pointer transition-all relative ${
            (currentUser.permissions.canPerformAudit || currentUser.role === 'admin' || currentUser.permissions.canEditTransaction)
              ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 hover:border-blue-300 dark:hover:border-blue-800'
              : 'opacity-55 grayscale cursor-not-allowed border-gray-150 dark:border-zinc-850 bg-gray-50/10'
          }`}
        >
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform relative shrink-0">
            <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {pendingAuditAdjustments.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white font-extrabold text-[9px] rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 animate-pulse">
                {pendingAuditAdjustments.length}
              </span>
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
              Rekonsiliasi
            </p>
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-none">PENYESUAIAN STOK</p>
          </div>
        </button>
      </div>

      {/* Filter and controls header layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 rounded-xl border border-gray-150 dark:border-zinc-805 bg-white dark:bg-zinc-900 shadow-sm items-end">
        
        {/* Search */}
        <div className="relative sm:col-span-2 md:col-span-3 lg:col-span-2">
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Cari Barang / SKU</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Cari kata kunci barang, SKU, riwayat..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Sektor / Rak Filter */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
            Sektor / Rak
          </label>
          <select
            value={locationFilter}
            onChange={(e) => { setLocationFilter(e.target.value); setCurrentPage(1); }}
            className="w-full pl-3 pr-4 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Sektor/Rak</option>
            {availableLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Start Date Filter */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Tanggal Awal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          />
        </div>

        {/* End Date Filter */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Tanggal Akhir</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          />
        </div>

        {/* Direction Filter */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-1.5">Aliran Mutasi</label>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as any); setCurrentPage(1); }}
            className="w-full pl-3 pr-4 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Aliran</option>
            <option value="in">Barang Masuk (IN)</option>
            <option value="out">Barang Keluar (OUT)</option>
            <option value="transfer">TRANSFER</option>
            <option value="audit">STOK OPNAME</option>
            <option value="produksi">PRODUKSI</option>
          </select>
        </div>

      </div>

      {/* Selected Items Panel */}
      {selectedTxIds.length > 0 && (
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-150 dark:bg-indigo-950/20 dark:border-indigo-900/35 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-150 shadow-sm">
          <div className="flex items-center gap-3 text-left">
            <div className="w-6 h-6 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <History className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-indigo-900 dark:text-indigo-300">
                {selectedTxIds.length} Transaksi Terpilih
              </p>
              <p className="text-[10px] text-indigo-700/80 dark:text-indigo-400 font-sans block mt-0.5">
                Anda dapat menghapus seluruh transaksi terpilih sekaligus. Persediaan barang akan dipulihkan otomatis.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedTxIds([])}
              className="px-3.5 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 dark:border-indigo-850 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950 text-xs font-bold transition-all cursor-pointer"
            >
              Batalkan Pilihan
            </button>
            {currentUser.permissions.canDeleteTransaction && (
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-lg shadow-rose-600/10 cursor-pointer transition-all active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Terpilih
              </button>
            )}
          </div>
        </div>
      )}

      {/* Select All Option Row */}
      {paginatedGroupedTransactions.length > 0 && (
        <div className="flex items-center justify-between px-2 py-1 bg-gray-50/50 dark:bg-zinc-900/30 p-2.5 rounded-xl border border-gray-100 dark:border-zinc-805/50 text-xs select-none">
          <label className="flex items-center gap-2.5 font-bold text-gray-600 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isAllPageSelected}
              onChange={(e) => toggleAllPageSelection(e.target.checked)}
              className="w-4 h-4 text-indigo-650 border-gray-300 dark:border-zinc-700 rounded focus:ring-indigo-500 bg-white dark:bg-zinc-950 cursor-pointer"
            />
            <span>Pilih Semua di Halaman Ini ({paginatedGroupedTransactions.length} Dokumen / Faktur)</span>
          </label>

          {selectedTxIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTxIds([])}
              className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-bold cursor-pointer"
            >
              Bersihkan Semua Pilihan ({selectedTxIds.length} Transaksi)
            </button>
          )}
        </div>
      )}

      {/* Datatable Layout */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-blue-600 dark:bg-blue-700 text-white font-bold text-left select-none border-b border-gray-200 dark:border-zinc-800">
              <th className="py-3.5 px-4 w-12 text-center">No</th>
              <th className="py-3.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  onChange={(e) => toggleAllPageSelection(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
              </th>
              <th className="py-3.5 px-4 font-mono uppercase tracking-wider text-[11px]">Form No</th>
              <th className="py-3.5 px-4 uppercase tracking-wider text-[11px]">Tgl Invoice</th>
              <th className="py-3.5 px-4 uppercase tracking-wider text-[11px]">No SrtJln</th>
              <th className="py-3.5 px-4 uppercase tracking-wider text-[11px]">Jth Tempo</th>
              <th className="py-3.5 px-4 text-right uppercase tracking-wider text-[11px]">Total Invoice</th>
              <th className="py-3.5 px-4 text-right uppercase tracking-wider text-[11px]">Total Bayar</th>
              <th className="py-3.5 px-4 text-center uppercase tracking-wider text-[11px] w-48">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-150 dark:divide-zinc-805">
            {paginatedGroupedTransactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-gray-400 dark:text-zinc-500 bg-white dark:bg-zinc-900 font-medium">
                  <Clock className="w-8 h-8 mx-auto text-gray-300 dark:text-zinc-750 mb-2" />
                  Tidak ada data transaksi yang ditemukan.
                </td>
              </tr>
            ) : (
              paginatedGroupedTransactions.map((group, idx) => {
                const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                const isGroupFullySelected = group.items.every(item => selectedTxIds.includes(item.id));
                const hasSomeSelected = group.items.some(item => selectedTxIds.includes(item.id)) && !isGroupFullySelected;

                // Format date
                let dateFormatted = '-';
                if (group.date) {
                  try {
                    const d = new Date(group.date);
                    if (!isNaN(d.getTime())) {
                      const day = String(d.getDate()).padStart(2, '0');
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const year = d.getFullYear();
                      dateFormatted = `${day}-${month}-${year}`;
                    }
                  } catch (e) {
                    dateFormatted = '-';
                  }
                }

                return (
                  <tr 
                    key={group.formNo} 
                    className="hover:bg-gray-50/75 dark:hover:bg-zinc-850/40 text-gray-700 dark:text-zinc-200 transition-colors"
                  >
                    {/* No */}
                    <td className="py-3 px-4 text-center font-bold text-gray-500 dark:text-zinc-400">
                      {globalIdx}
                    </td>

                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        ref={el => {
                          if (el) el.indeterminate = hasSomeSelected;
                        }}
                        checked={isGroupFullySelected}
                        onChange={() => toggleGroupSelection(group)}
                        className="w-3.5 h-3.5 text-blue-650 border-gray-300 dark:border-zinc-700 rounded focus:ring-blue-500 bg-white dark:bg-zinc-950 cursor-pointer"
                      />
                    </td>

                    {/* Form No */}
                    <td className="py-3 px-4 font-mono font-bold text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          group.isAudit 
                            ? 'bg-amber-500' 
                            : group.type === 'in' 
                              ? 'bg-emerald-500' 
                              : 'bg-indigo-500'
                        }`} title={group.isAudit ? 'Stok Opname' : group.type === 'in' ? 'Masuk' : 'Keluar'} />
                        <span className="select-all truncate">{group.formNo}</span>
                      </div>
                    </td>

                    {/* Tgl Invoice */}
                    <td className="py-3 px-4 font-medium text-gray-600 dark:text-zinc-300">
                      {dateFormatted}
                    </td>

                    {/* No Surat Jalan */}
                    <td className="py-3 px-4 font-medium text-gray-500 dark:text-zinc-450">
                      {group.suratJalan !== '-' ? group.suratJalan : <span className="text-gray-300 dark:text-zinc-700">-</span>}
                    </td>

                    {/* Jatuh Tempo */}
                    <td className="py-3 px-4 font-medium text-gray-600 dark:text-zinc-300">
                      {dateFormatted}
                    </td>

                    {/* Total Invoice */}
                    <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white font-mono">
                      {formatIDRCurrency(group.totalInvoice)}
                    </td>

                    {/* Total Bayar */}
                    <td className="py-3 px-4 text-right font-bold text-gray-500 dark:text-zinc-400 font-mono">
                      0
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 justify-center">
                        
                        {/* Edit Button */}
                        {currentUser.permissions.canEditTransaction && (
                          <button
                            type="button"
                            onClick={() => handleOpenGroupedEdit(group)}
                            className="bg-[#2ecc71] hover:bg-[#27ae60] text-white font-bold px-2 py-1 rounded text-[10px] uppercase transition-all scale-95 hover:scale-100 active:scale-95 cursor-pointer"
                          >
                            Edit
                          </button>
                        )}

                        {/* Detail Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedGroupedTx(group)}
                          className="bg-[#3498db] hover:bg-[#2980b9] text-white font-bold px-2 py-1 rounded text-[10px] uppercase transition-all scale-95 hover:scale-100 active:scale-95 cursor-pointer"
                        >
                          Detail
                        </button>

                        {/* Print Button */}
                        <button
                          type="button"
                          onClick={() => {
                            alert(`Faktur ${group.formNo} siap dicetak.`);
                            window.print();
                          }}
                          className="bg-[#0088cc] hover:bg-[#006699] text-white font-bold px-2 py-1 rounded text-[10px] uppercase transition-all scale-95 hover:scale-100 active:scale-95 cursor-pointer"
                        >
                          Print
                        </button>

                        {/* Image Button */}
                        <button
                          type="button"
                          onClick={() => {
                            alert(`Visual Dokumen Faktur ${group.formNo} telah dimuat.`);
                          }}
                          className="bg-[#f1c40f] hover:bg-[#f39c12] text-white font-bold px-2 py-1 rounded text-[10px] uppercase transition-all scale-95 hover:scale-100 active:scale-95 cursor-pointer"
                        >
                          Image
                        </button>

                        {/* Void Button */}
                        {currentUser.permissions.canDeleteTransaction && (
                          <button
                            type="button"
                            onClick={() => {
                              const ids = group.items.map(i => i.id);
                              setSelectedTxIds(ids);
                              setShowBulkDeleteModal(true);
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-1 rounded text-[10px] uppercase transition-all scale-95 hover:scale-100 active:scale-95 cursor-pointer"
                            title="Batalkan / Void seluruh transaksi dalam dokumen ini"
                          >
                            Void
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-zinc-400 pt-4 select-none">
          <span>Halaman {currentPage} dari {totalPages} riwayat transaksi</span>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Kembali
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Lanjut
            </button>
          </div>
        </div>
      )}

      {/* Edit Grouped Transaction Modal */}
      {editingGroupedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-zinc-850 w-full max-w-4xl overflow-hidden text-gray-950 dark:text-gray-100 font-sans animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/40 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-200">Koreksi Dokumen Transaksi</h3>
                  <p className="text-[10px] text-gray-400 font-bold block mt-0.5">
                    Form: <span className="font-mono text-indigo-600 dark:text-indigo-400">{editingGroupedTx.formNo}</span> • Aliran: <span className="uppercase text-amber-600">{editingGroupedTx.type.toUpperCase()}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingGroupedTx(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto text-left flex-1">
              {/* Card 1: Metadata Form */}
              <div className="p-4 bg-gray-50/50 dark:bg-zinc-950/20 border border-gray-150 dark:border-zinc-800/80 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-gray-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  Informasi Dokumen / Faktur
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Form No */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Nomor Form / Invoice</label>
                    <input
                      type="text"
                      value={editGroupFormNo}
                      onChange={(e) => setEditGroupFormNo(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white font-mono focus:outline-indigo-500"
                      placeholder="Masukkan nomor form..."
                    />
                  </div>

                  {/* No Surat Jalan (for in/out) */}
                  {editingGroupedTx.type !== 'audit' && editingGroupedTx.type !== 'transfer' && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">No Surat Jalan</label>
                      <input
                        type="text"
                        value={editGroupSuratJalan}
                        onChange={(e) => setEditGroupSuratJalan(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white font-mono focus:outline-indigo-500"
                        placeholder="Contoh: SJ-001..."
                      />
                    </div>
                  )}

                  {/* Operator / Petugas */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Otorisator / Petugas</label>
                    <input
                      type="text"
                      value={editGroupOperatorName}
                      onChange={(e) => setEditGroupOperatorName(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500"
                      placeholder="Nama petugas otorisator"
                    />
                  </div>

                  {/* Tanggal & Waktu */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Tanggal & Waktu</label>
                    <input
                      type="datetime-local"
                      value={editGroupDate}
                      onChange={(e) => setEditGroupDate(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Card: Tambah Barang Baru ke Dokumen */}
              <div className="p-4 bg-indigo-50/25 dark:bg-zinc-950/45 border border-indigo-100/50 dark:border-zinc-800/80 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  Tambah Barang Baru ke Dokumen
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Barang Dropdown */}
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Pilih Barang / Produk</label>
                    <select
                      value={addItemProductId}
                      onChange={(e) => setAddItemProductId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer h-[38px]"
                    >
                      <option value="">-- Pilih Barang --</option>
                      {accessibleProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) - Stok: {p.qty} {p.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Batch Number */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Nomor Batch (Opsional)</label>
                    {addItemProductId && products.find(p => p.id === addItemProductId)?.batches?.length ? (
                      <select
                        value={addItemBatchNumber}
                        onChange={(e) => setAddItemBatchNumber(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer h-[38px]"
                      >
                        <option value="">-- Pilih Batch --</option>
                        {products.find(p => p.id === addItemProductId)?.batches?.map(b => (
                          <option key={b.id} value={b.batchNumber}>
                            {b.batchNumber} - Stok: {b.qty}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={addItemBatchNumber}
                        onChange={(e) => setAddItemBatchNumber(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white font-mono focus:outline-indigo-500 h-[38px]"
                        placeholder="Contoh: B-01..."
                      />
                    )}
                  </div>

                  {/* Kuantitas */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">
                      {editingGroupedTx.type === 'audit' ? 'Hitung Fisik' : 'Jumlah (Volume)'}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        value={addItemQty}
                        onChange={(e) => setAddItemQty(parseFloat(e.target.value) || 0)}
                        className="w-full pl-3.5 pr-10 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono h-[38px]"
                        placeholder="1"
                      />
                      <span className="absolute right-3.5 top-2.5 text-[9px] font-bold text-gray-400 uppercase">
                        {addItemProductId ? products.find(p => p.id === addItemProductId)?.unit || 'pcs' : 'pcs'}
                      </span>
                    </div>
                  </div>

                  {/* Harga Satuan */}
                  {editingGroupedTx.type !== 'audit' && (
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Harga Unit (Rp)</label>
                      <input
                        type="number"
                        step="any"
                        value={addItemPrice}
                        onChange={(e) => setAddItemPrice(parseFloat(e.target.value) || 0)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono h-[38px]"
                        placeholder="0"
                      />
                    </div>
                  )}

                  {/* Rak / Sektor */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Rak / Sektor</label>
                    <input
                      type="text"
                      list="edit-location-options-grouped"
                      value={addItemLocation}
                      onChange={(e) => setAddItemLocation(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 h-[38px]"
                      placeholder="Rak A-01..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  {/* Catatan / Keterangan */}
                  <div className="md:col-span-10">
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Catatan Item (Opsional)</label>
                    <input
                      type="text"
                      value={addItemNote}
                      onChange={(e) => setAddItemNote(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 h-[38px]"
                      placeholder="Contoh: Barang cacat, retur pabrik, dll."
                    />
                  </div>

                  {/* Tombol Tambah */}
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddNewItemToEditGroup}
                      className="w-full h-[38px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Tambah
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 2: Items List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    Daftar Barang dalam Dokumen ({editGroupItems.length} Item)
                  </h4>
                </div>

                {editGroupItems.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl bg-gray-50/20">
                    <p className="text-xs text-gray-400 font-bold">Seluruh item dalam dokumen ini telah dihapus.</p>
                    <p className="text-[10px] text-gray-400 mt-1">Gunakan tombol Batal di bawah untuk membatalkan koreksi.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {editGroupItems.map((item, index) => {
                      const manualNote = getManualNoteOnly(item.note);
                      
                      return (
                        <div 
                          key={item.id} 
                          className="p-4 border border-gray-150 dark:border-zinc-800/80 rounded-2xl bg-white dark:bg-zinc-950 relative space-y-3 shadow-xs"
                        >
                          {/* Item Card Header */}
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="text-xs font-bold text-gray-800 dark:text-zinc-150">{item.productName}</p>
                              <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-mono mt-0.5">
                                SKU: {item.sku} {item.batchNumber ? `• Batch: ${item.batchNumber}` : ''}
                              </p>
                            </div>
                            
                            {/* Delete Button for Item */}
                            <button
                              type="button"
                              onClick={() => handleDeleteItemFromEditGroup(index)}
                              className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer transition-all"
                              title="Hapus barang dari dokumen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Fields inside each item card */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-900">
                            {item.isAudit ? (
                              <>
                                {/* System Qty */}
                                <div className="md:col-span-3">
                                  <label className="block text-[9px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Stok Sistem</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.systemQty ?? 0}
                                    onChange={(e) => updateItemField(index, 'systemQty', parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono text-gray-600 dark:text-zinc-300 focus:outline-indigo-500"
                                  />
                                </div>

                                {/* Physical Qty */}
                                <div className="md:col-span-3">
                                  <label className="block text-[9px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Hitung Fisik</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.physicalQty ?? 0}
                                    onChange={(e) => updateItemField(index, 'physicalQty', parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono font-bold text-gray-900 dark:text-white focus:outline-indigo-500"
                                  />
                                </div>

                                {/* Difference display */}
                                <div className="md:col-span-3 flex flex-col justify-end">
                                  <div className="p-1.5 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100/50 dark:border-amber-900/20 rounded-lg text-[10px] text-center font-mono">
                                    <span className="block text-[8px] font-bold text-amber-800 dark:text-amber-500 uppercase">Selisih</span>
                                    <span className="font-bold text-amber-900 dark:text-amber-450">
                                      {(item.difference ?? 0) > 0 ? '+' : ''}
                                      {item.difference ?? 0} {item.unit || 'pcs'}
                                    </span>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Qty */}
                                <div className="md:col-span-3">
                                  <label className="block text-[9px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Jumlah (Volume)</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="any"
                                      min="0.0001"
                                      value={item.qty}
                                      onChange={(e) => updateItemField(index, 'qty', parseFloat(e.target.value) || 0)}
                                      className="w-full pl-3 pr-8 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-indigo-500 font-mono"
                                    />
                                    <span className="absolute right-2 top-2 text-[9px] font-bold text-gray-400 uppercase">{item.unit || 'pcs'}</span>
                                  </div>
                                </div>

                                {/* Price (In/Out only) */}
                                {(!item.note.toLowerCase().includes('transfer') && !item.note.toLowerCase().includes('mutasi')) && (
                                  <div className="md:col-span-3">
                                    <label className="block text-[9px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Harga Unit (Rp)</label>
                                    <input
                                      type="number"
                                      step="any"
                                      value={item.price ?? 0}
                                      onChange={(e) => updateItemField(index, 'price', parseFloat(e.target.value) || 0)}
                                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-indigo-500 font-mono"
                                    />
                                  </div>
                                )}

                                {/* Location */}
                                <div className="md:col-span-3">
                                  <label className="block text-[9px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Rak / Sektor</label>
                                  <input
                                    type="text"
                                    list="edit-location-options-grouped"
                                    value={item.location || ''}
                                    onChange={(e) => updateItemField(index, 'location', e.target.value)}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-indigo-500"
                                    placeholder="Rak A-01..."
                                  />
                                </div>
                              </>
                            )}

                            {/* Note / Keterangan item */}
                            <div className={item.isAudit ? "md:col-span-3" : (item.note.toLowerCase().includes('transfer') || item.note.toLowerCase().includes('mutasi')) ? "md:col-span-6" : "md:col-span-3"}>
                              <label className="block text-[9px] font-bold text-gray-400 dark:text-zinc-500 mb-1 uppercase">Keterangan Item</label>
                              <input
                                type="text"
                                value={manualNote}
                                onChange={(e) => updateItemField(index, 'note', e.target.value)}
                                className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-indigo-500"
                                placeholder="Keterangan opsional..."
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-150 dark:border-zinc-800 flex items-center justify-end gap-3 bg-gray-50/50 dark:bg-zinc-900/40 shrink-0">
              <button
                type="button"
                onClick={() => setEditingGroupedTx(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 text-gray-550 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-805 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveGroupedEdit}
                disabled={editGroupItems.length === 0}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-650/10 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simpan Penyesuaian Dokumen
              </button>
            </div>
          </div>
          
          <datalist id="edit-location-options-grouped">
            {locationsList.map(loc => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-zinc-850 w-full max-w-sm overflow-hidden text-gray-950 dark:text-gray-100 font-sans animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/40">
              <h3 className="text-sm font-bold text-rose-650 dark:text-rose-400">Hapus Log Transaksi?</h3>
              <button
                type="button"
                onClick={() => setDeletingTxId(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 text-left">
              <p className="text-xs text-gray-600 dark:text-zinc-300 leading-relaxed font-sans">
                Apakah Anda yakin ingin menghapus catatan log ini dari riwayat audit? Tindakan ini <b>akan memulihkan otomatis</b> kuantitas stok barang dan data batch/lot ke kondisi sebelum transaksi dilakukan.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-150 dark:border-zinc-800 flex items-center justify-end gap-3 bg-gray-50/50 dark:bg-zinc-900/40">
              <button
                type="button"
                onClick={() => setDeletingTxId(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 text-gray-550 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-805 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/10 cursor-pointer transition-all"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-zinc-850 w-full max-w-sm overflow-hidden text-gray-950 dark:text-gray-100 font-sans animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/40">
              <h3 className="text-sm font-bold text-rose-650 dark:text-rose-400">Hapus {selectedTxIds.length} Transaksi?</h3>
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 text-left">
              <p className="text-xs text-gray-600 dark:text-zinc-300 leading-relaxed font-sans">
                Apakah Anda yakin ingin menghapus <b>{selectedTxIds.length} transaksi</b> yang dipilih? Tindakan ini <b>akan memulihkan otomatis</b> kuantitas stok barang dan data batch/lot terkait di database ke kondisi semula.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-150 dark:border-zinc-800 flex items-center justify-end gap-3 bg-gray-50/50 dark:bg-zinc-900/40">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 text-gray-550 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-805 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/10 cursor-pointer transition-all"
              >
                Hapus Massal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Penyesuaian Stok Opname Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-zinc-850 w-full max-w-lg overflow-hidden text-gray-950 dark:text-gray-100 font-sans animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-blue-900 dark:text-blue-300">Penyesuaian Stok Opname</h3>
                  <p className="text-[10px] text-gray-500 dark:text-zinc-400">Rekonsiliasi stok sistem agar sesuai dengan hasil hitung fisik opname</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {pendingAuditAdjustments.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-extrabold text-gray-900 dark:text-white">Semua Stok Sudah Sesuai</h4>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 max-w-xs mx-auto">
                    Tidak ada transaksi stok opname yang memiliki selisih stok saat ini. Semua laporan dan inventaris sudah seimbang.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-150 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                    <SlidersHorizontal className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Ditemukan {pendingAuditAdjustments.length} Barang dengan Selisih Opname</p>
                      <p className="text-[11px] opacity-90 mt-0.5">
                        Melakukan penyesuaian akan memperbarui kuantitas stok di gudang sesuai dengan hasil hitung fisik. Selisih pada laporan opname akan otomatis menjadi 0 (sesuai).
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-zinc-800">
                    {pendingAuditAdjustments.map((tx) => (
                      <div key={tx.id} className="p-3 flex items-center justify-between text-xs hover:bg-gray-50/50 dark:hover:bg-zinc-850/50 transition-colors">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">{tx.productName}</p>
                          <p className="text-[10px] text-gray-400 font-mono">SKU: {tx.sku}</p>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <div className="text-[11px]">
                            <span className="text-gray-400 block text-[9px]">Sistem → Fisik</span>
                            <span className="font-mono font-bold text-gray-700 dark:text-zinc-300">
                              {tx.systemQty ?? 0} → <b className="text-amber-600 dark:text-amber-400">{tx.physicalQty ?? tx.qty}</b> {tx.unit || 'unit'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onAdjustStockOpname?.(tx.id);
                            }}
                            className="px-2.5 py-1 text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg cursor-pointer transition-all shrink-0"
                          >
                            Sesuaikan
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/40">
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 text-gray-550 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-805 cursor-pointer transition-colors"
              >
                Tutup
              </button>
              {pendingAuditAdjustments.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onAdjustStockOpname?.();
                    setShowAdjustModal(false);
                  }}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Sesuaikan Semua ({pendingAuditAdjustments.length})
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Detail Grouped Transaction Modal */}
      {selectedGroupedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-zinc-850 w-full max-w-2xl overflow-hidden text-gray-950 dark:text-gray-100 font-sans animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  selectedGroupedTx.isAudit 
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' 
                    : selectedGroupedTx.type === 'in' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                      : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400'
                }`}>
                  {selectedGroupedTx.isAudit ? <ClipboardList className="w-5 h-5" /> : selectedGroupedTx.type === 'in' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-blue-900 dark:text-blue-300">Rincian Dokumen Transaksi</h3>
                  <p className="text-[10px] font-mono font-bold text-gray-500 dark:text-zinc-400">NO: {selectedGroupedTx.formNo}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGroupedTx(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-805 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
              
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-zinc-850/30 border border-gray-100 dark:border-zinc-800 text-xs">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Tanggal Mutasi</span>
                  <span className="font-bold text-gray-800 dark:text-zinc-200">
                    {(() => {
                      try {
                        const d = new Date(selectedGroupedTx.date);
                        if (isNaN(d.getTime())) return '-';
                        const months = [
                          'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
                        ];
                        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} - ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                      } catch (e) {
                        return '-';
                      }
                    })()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Petugas Otorisator</span>
                  <span className="font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-1.5 capitalize">
                    <UserIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    {selectedGroupedTx.operatorName || 'System'} ({selectedGroupedTx.operatorRole || '-'})
                  </span>
                </div>
                {selectedGroupedTx.suratJalan !== '-' && (
                  <div className="col-span-2 border-t border-gray-100 dark:border-zinc-800 pt-2.5">
                    <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider mb-0.5">No Surat Jalan (SJ)</span>
                    <span className="font-mono font-bold text-gray-800 dark:text-zinc-200">{selectedGroupedTx.suratJalan}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Daftar Barang Terlampir</h4>
                <div className="overflow-hidden rounded-xl border border-gray-150 dark:border-zinc-800">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-zinc-805 text-gray-700 dark:text-zinc-200 font-bold border-b border-gray-150 dark:border-zinc-800">
                        <th className="py-2.5 px-3 text-center w-10">No</th>
                        <th className="py-2.5 px-3">Barang / SKU</th>
                        <th className="py-2.5 px-3 text-center">Rak</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Harga</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                      {selectedGroupedTx.items.map((item, idx) => {
                        const prod = productMap.get(item.productId);
                        const price = prod ? (prod.price || 0) : 0;
                        const subtotal = item.qty * price;
                        const loc = item.location || prod?.location || '-';

                        return (
                          <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-850/20">
                            <td className="py-2.5 px-3 text-center text-gray-400 font-bold">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-gray-900 dark:text-white leading-tight">{item.productName}</p>
                              <p className="text-[10px] text-gray-400 font-mono mt-0.5 select-all">SKU: {item.sku}</p>
                              {item.batchNumber && (
                                <p className="text-[9px] bg-indigo-50/80 dark:bg-zinc-800 text-indigo-700 dark:text-zinc-300 rounded px-1 py-0.2 mt-1 inline-block font-mono">
                                  Batch: {item.batchNumber}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-emerald-650 dark:text-emerald-400 font-sans">
                              {loc}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-white font-mono">
                              {item.qty} {item.unit || 'unit'}
                            </td>
                            <td className="py-2.5 px-3 text-right text-gray-500 font-mono">
                              {formatIDRCurrency(price)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-white font-mono">
                              {formatIDRCurrency(subtotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary Block */}
              <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/20 flex justify-between items-center select-none">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider">Kuantitas Total</span>
                  <span className="text-sm font-extrabold text-indigo-900 dark:text-indigo-300 font-mono">
                    {selectedGroupedTx.items.reduce((sum, i) => sum + i.qty, 0)} {selectedGroupedTx.items[0]?.unit || 'unit'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider">Nilai Total Faktur</span>
                  <span className="text-lg font-black text-indigo-650 dark:text-indigo-400 font-mono">
                    Rp {formatIDRCurrency(selectedGroupedTx.totalInvoice)}
                  </span>
                </div>
              </div>

              {/* Note view if applicable */}
              {selectedGroupedTx.items.some(i => getManualNoteOnly(i.note)) && (
                <div className="space-y-1.5 text-xs text-left">
                  <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Catatan Tambahan</h4>
                  <div className="p-3 rounded-xl bg-amber-50/20 border border-amber-100 dark:bg-amber-950/10 dark:border-amber-900/30 font-sans italic text-gray-600 dark:text-zinc-300">
                    {selectedGroupedTx.items.map((item, idx) => {
                      const note = getManualNoteOnly(item.note);
                      if (!note) return null;
                      return (
                        <p key={item.id} className="leading-relaxed">
                          💡 <b>{item.productName}:</b> {note}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/40">
              <button
                type="button"
                onClick={() => {
                  alert(`Invoice ${selectedGroupedTx.formNo} siap dicetak.`);
                  window.print();
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-805 cursor-pointer transition-colors"
              >
                Cetak Faktur
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroupedTx(null)}
                className="px-5 py-2.5 text-xs font-black rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/15 cursor-pointer transition-all active:scale-95"
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

/**
 * Utility functions for tracking product expiry dates (Tanggal Kadaluarsa)
 */

export interface ExpiryStatus {
  status: 'expired' | 'near_expiry' | 'ok' | 'none';
  label: string;
  shortLabel: string;
  diffDays: number;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
}

export function getExpiryStatus(expiryDate?: string): ExpiryStatus {
  if (!expiryDate || !expiryDate.trim()) {
    return {
      status: 'none',
      label: 'Tanpa Tgl Kadaluarsa',
      shortLabel: 'N/A',
      diffDays: 9999,
      badgeBg: 'bg-gray-100 dark:bg-zinc-800/60',
      badgeText: 'text-gray-500 dark:text-zinc-400',
      borderClass: 'border-gray-200 dark:border-zinc-700'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(expiryDate);
  if (isNaN(exp.getTime())) {
    return {
      status: 'none',
      label: 'Format Tgl Tidak Valid',
      shortLabel: 'N/A',
      diffDays: 9999,
      badgeBg: 'bg-gray-100 dark:bg-zinc-800/60',
      badgeText: 'text-gray-500 dark:text-zinc-400',
      borderClass: 'border-gray-200 dark:border-zinc-700'
    };
  }

  exp.setHours(0, 0, 0, 0);

  const diffTime = exp.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    const daysAgo = Math.abs(diffDays);
    return {
      status: 'expired',
      label: diffDays === 0 ? 'Kadaluarsa Hari Ini' : `Kadaluarsa (${daysAgo} hr lalu)`,
      shortLabel: diffDays === 0 ? 'Kadaluarsa Hari Ini' : `Kadaluarsa (-${daysAgo}hr)`,
      diffDays,
      badgeBg: 'bg-rose-100 dark:bg-rose-950/70',
      badgeText: 'text-rose-700 dark:text-rose-300 font-extrabold',
      borderClass: 'border-rose-300 dark:border-rose-800'
    };
  } else if (diffDays <= 30) {
    return {
      status: 'near_expiry',
      label: `Kadaluarsa dlm ${diffDays} hari`,
      shortLabel: `${diffDays} hr lagi`,
      diffDays,
      badgeBg: 'bg-amber-100 dark:bg-amber-950/70',
      badgeText: 'text-amber-800 dark:text-amber-300 font-bold',
      borderClass: 'border-amber-300 dark:border-amber-800'
    };
  } else {
    return {
      status: 'ok',
      label: `Aman (${diffDays} hr lagi)`,
      shortLabel: 'Aman',
      diffDays,
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      badgeText: 'text-emerald-700 dark:text-emerald-400 font-semibold',
      borderClass: 'border-emerald-200 dark:border-emerald-800/50'
    };
  }
}

export function formatDateIndo(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Generates the next sequential batch code (e.g. LOT-2026-001, LOT-2026-002)
 */
export function generateNextBatchNumber(
  existingItems: { batchNumber?: string; batches?: { batchNumber: string }[] }[],
  prefix: string = 'LOT'
): string {
  const currentYear = new Date().getFullYear();
  let maxSeq = 0;

  const pattern = new RegExp(`^${prefix}-${currentYear}-(\\d+)$`, 'i');

  existingItems.forEach((item) => {
    if (item.batchNumber) {
      const trimmed = item.batchNumber.trim();
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    if (item.batches && Array.isArray(item.batches)) {
      item.batches.forEach(b => {
        if (!b.batchNumber) return;
        const trimmed = b.batchNumber.trim();
        const match = trimmed.match(pattern);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      });
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}-${currentYear}-${nextSeq}`;
}

import { Product, ProductBatch } from '../types';

/**
 * Normalizes and syncs a Product's master fields (qty, expiryDate, batchNumber)
 * based on its underlying batches array sorted by FEFO (First Expired First Out).
 */
export function syncProductBatches(product: Product): Product {
  if (!product.batches || product.batches.length === 0) {
    return product;
  }

  // Filter batches with non-zero quantity or keep all
  const activeBatches = product.batches
    .filter(b => b.qty !== 0)
    .sort((a, b) => {
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

  const totalQty = Math.round(product.batches.reduce((sum, b) => sum + (Number(b.qty) || 0), 0) * 10000) / 10000;

  if (activeBatches.length > 0) {
    const earliest = activeBatches[0];
    return {
      ...product,
      qty: totalQty,
      expiryDate: earliest.expiryDate,
      batchNumber: activeBatches.length > 1 
        ? `${earliest.batchNumber} (+${activeBatches.length - 1} lot)` 
        : earliest.batchNumber,
      batches: product.batches
    };
  } else {
    // No active batches
    return {
      ...product,
      qty: totalQty,
      batches: product.batches
    };
  }
}

/**
 * Adds incoming stock to a product batch.
 * If batch already exists (matching batchNumber + expiryDate), increases its qty.
 * Otherwise creates a new batch entry.
 */
export function addBatchToProduct(
  product: Product,
  batchNumber: string,
  expiryDate: string,
  qtyToAdd: number
): Product {
  const currentBatches: ProductBatch[] = product.batches ? [...product.batches] : [];

  // If product previously had no batches but had stock, create an initial default batch for existing stock
  if (currentBatches.length === 0 && product.qty > 0) {
    currentBatches.push({
      id: `batch-init-${Date.now()}`,
      batchNumber: product.batchNumber || 'BATCH-INIT',
      expiryDate: product.expiryDate || '',
      qty: product.qty,
      createdAt: product.createdAt
    });
  }

  // Check if matching batch exists
  const existingIdx = currentBatches.findIndex(
    b => b.batchNumber.trim().toLowerCase() === batchNumber.trim().toLowerCase() &&
         b.expiryDate === expiryDate
  );

  if (existingIdx !== -1) {
    currentBatches[existingIdx] = {
      ...currentBatches[existingIdx],
      qty: Math.round((currentBatches[existingIdx].qty + qtyToAdd) * 10000) / 10000
    };
  } else {
    currentBatches.push({
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      batchNumber: batchNumber || `LOT-${new Date().getFullYear()}-001`,
      expiryDate: expiryDate,
      qty: qtyToAdd,
      createdAt: new Date().toISOString()
    });
  }

  return syncProductBatches({
    ...product,
    batches: currentBatches
  });
}

/**
 * Deducts stock from a product using FEFO priority (earliest expiring batch first).
 */
export function deductFEFOFromProduct(
  product: Product,
  qtyToDeduct: number
): { updatedProduct: Product; summaryNote: string } {
  if (!product.batches || product.batches.length === 0) {
    // Standard product without sub-batches
    const newQty = Math.round((product.qty - qtyToDeduct) * 10000) / 10000;
    return {
      updatedProduct: { ...product, qty: newQty },
      summaryNote: ''
    };
  }

  // Sort batches by FEFO (earliest expiry first)
  const sortedBatches = [...product.batches].sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });

  let remainingToDeduct = qtyToDeduct;
  const deductedLogs: string[] = [];

  const updatedBatches = sortedBatches.map(b => {
    if (remainingToDeduct <= 0) return b;
    if (b.qty <= 0) return b;

    const take = Math.min(b.qty, remainingToDeduct);
    remainingToDeduct = Math.round((remainingToDeduct - take) * 10000) / 10000;
    deductedLogs.push(`${take} pcs dari Batch ${b.batchNumber} (ED: ${b.expiryDate})`);

    return {
      ...b,
      qty: Math.round((b.qty - take) * 10000) / 10000
    };
  });

  if (remainingToDeduct > 0 && updatedBatches.length > 0) {
    const lastBatchIdx = updatedBatches.length - 1;
    const lastBatch = updatedBatches[lastBatchIdx];
    updatedBatches[lastBatchIdx] = {
      ...lastBatch,
      qty: Math.round((lastBatch.qty - remainingToDeduct) * 10000) / 10000
    };
    deductedLogs.push(`${remainingToDeduct} pcs (Minus) dari Batch ${lastBatch.batchNumber}`);
    remainingToDeduct = 0;
  }

  const summaryNote = deductedLogs.length > 0
    ? `[FEFO Auto-Pick: ${deductedLogs.join(', ')}]`
    : '';

  const updatedProduct = syncProductBatches({
    ...product,
    batches: updatedBatches
  });

  return { updatedProduct, summaryNote };
}

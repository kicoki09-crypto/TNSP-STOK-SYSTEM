/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Role = 'admin' | 'staff' | 'supervisor' | 'kasir' | 'cashier';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  location?: string; // Assigned warehouse location, e.g. "Sektor A-1"
  password?: string; // Optional custom password stored in database
  useRecipeUnits?: boolean; // If true, this user works with recipe units and conversion factors
  permissions: {
    canAddProduct: boolean;
    canEditProduct: boolean;
    canDeleteProduct: boolean;
    canRecordTransaction: boolean;
    canViewReports: boolean;
    canManageUsers: boolean;
    canViewDashboard?: boolean;
    canViewDataBarang?: boolean;
    canViewTransaksi?: boolean;
    canViewLaporan?: boolean;
    canViewPengaturan?: boolean;
    canImportCSV?: boolean;
    canExportCSV?: boolean;
    canPrintProduct?: boolean;
    canRecordBarangMasuk?: boolean;
    canRecordBarangKeluar?: boolean;
    canPerformAudit?: boolean;
    canEditTransaction?: boolean;
    canDeleteTransaction?: boolean;
  };
}

export interface ProductBatch {
  id: string;
  batchNumber: string; // e.g., "LOT-2026-001"
  expiryDate: string;  // e.g., "2026-07-31"
  qty: number;         // Stock in this batch
  createdAt?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string; // Used as Barcode
  description: string;
  category: string;
  qty: number;
  minQty: number; // Low stock limit
  location: string; // e.g., "Sektor A-1", "Sektor B-4"
  price: number; // Purchase price
  unit: string; // Base unit (e.g., "Gram", "Pcs")
  purchaseUnit: string; // Unit used for purchasing (e.g., "Box", "Kg")
  recipeUnit: string; // Unit used for usage/recipe (e.g., "Gram", "Ml")
  conversionFactor: number; // How many recipeUnits in one unit? Or purchaseUnit to unit?
  unitPrice: number; // Calculated: price / conversionFactor
  imageUrl?: string;
  expiryDate?: string; // Tanggal Kadaluarsa terdekat (YYYY-MM-DD)
  batchNumber?: string; // Nomor Batch utama / terdekat
  batches?: ProductBatch[]; // Rincian per-batch / lot (Multi-Batch Tracking)
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: string; // Name of staff
}

export type TransactionType = 'in' | 'out';

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: TransactionType;
  qty: number;
  note: string;
  date: string;
  operatorName: string;
  operatorRole: Role;
  unit?: string;
  isAudit?: boolean;
  systemQty?: number;
  physicalQty?: number;
  difference?: number;
  expiryDate?: string;
  batchNumber?: string;
  location?: string;
  price?: number;
}

export interface StockAlert {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  minQty: number;
  location?: string;
  timestamp: string;
  isRead: boolean;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

export interface TransferRequest {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  qty: number;
  originWarehouse: string;
  targetWarehouse: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  requestedBy: string;
  approvedBy?: string;
  approvedDate?: string;
}

export interface BOMItem {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  unit: string;
  price: number; // Price per recipe unit
}

export interface BOM {
  id: string;
  name: string;
  location: string;
  yieldQty: number; // Conversion/hasil jadi
  yieldUnit: string; // Unit of yield
  items: BOMItem[];
  totalCost: number;
  createdAt: string;
}

export interface MenuIngredient {
  id: string;
  type: 'bom' | 'product';
  referenceId: string;
  name: string;
  qty: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
}

export interface MenuItem {
  id: string;
  name: string;
  unit: string;
  location: string;
  category: string;
  ingredients: MenuIngredient[];
  totalHPP: number;
  createdAt: string;
}


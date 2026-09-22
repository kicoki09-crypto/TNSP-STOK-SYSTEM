/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vite/client" />

import { Product, Transaction, StockAlert, SystemLog, Role, TransferRequest, User, BOM, MenuItem } from '../types';
import { storageGet, storageSet, storageRemove, safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './storageEngine';
import { getAccessToken } from './googleAuth';
import {
  readSheet,
  writeRow,
  writeMultipleRows,
  writeAllRows,
  updateRowById,
  updateMultipleRowsById,
  deleteRowById,
  deleteRowsByIds
} from './googleSheetsService';

export let isSupabaseConfigured = false;
export function setCloudConnected(connected: boolean) {
  isSupabaseConfigured = connected;
}
export const supabase = null;

// Initial Mock Data inside local storage if not available yet
const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Samsung Galaxy Tab A8 Warehouse Pack',
    sku: '8991234560012',
    description: 'Unit tablet inventarisasi gudang untuk pencatatan digital lapangan berbasis Android 10.5 inci.',
    category: 'Elektronik',
    qty: 12,
    minQty: 15, // This is low stock! (ALERT)
    location: 'Rak A-01',
    price: 3499000,
    unit: 'Unit',
    purchaseUnit: 'Box',
    recipeUnit: 'Pcs',
    conversionFactor: 1,
    unitPrice: 3499000,
    createdAt: '2026-02-15T08:30:00Z',
    updatedAt: '2026-05-20T14:45:00Z',
    lastUpdatedBy: 'Admin Utama'
  },
  {
    id: 'prod-2',
    name: 'Bor Listrik Impact Bosch GSB RE',
    sku: '8997230010928',
    description: 'Mesin bor listrik heavy duty untuk perbaikan kemasan kayu dan perakitan palet logistik.',
    category: 'Peralatan',
    qty: 3,
    minQty: 8, // This is low stock! (ALERT)
    location: 'Rak B-12',
    price: 1250000,
    unit: 'Unit',
    purchaseUnit: 'Unit',
    recipeUnit: 'Unit',
    conversionFactor: 1,
    unitPrice: 1250000,
    createdAt: '2026-02-18T10:15:00Z',
    updatedAt: '2026-05-24T09:12:00Z',
    lastUpdatedBy: 'Rizwan Staff'
  },
  {
    id: 'prod-3',
    name: 'Kursi Kerja Ergonomik Foam-Z',
    sku: '7501031311309',
    description: 'Fasilitas kursi ergonomis kantor admin kontrol gudang dengan sandaran punggung lumbar support.',
    category: 'Alat Kantor',
    qty: 18,
    minQty: 10,
    location: 'Zona C-03',
    price: 1850000,
    unit: 'Unit',
    purchaseUnit: 'Pcs',
    recipeUnit: 'Pcs',
    conversionFactor: 1,
    unitPrice: 1850000,
    createdAt: '2026-03-01T04:20:00Z',
    updatedAt: '2026-05-10T11:30:00Z',
    lastUpdatedBy: 'Yusuf Supervisor'
  },
  {
    id: 'prod-4',
    name: 'Kabel Fiber Optic 100m FTTH Roll',
    sku: '8886008101091',
    description: 'Gulungan kabel serat optik untuk instalasi sistem jaringan internal CCTV dan sensor keamanan.',
    category: 'Elektronik',
    qty: 25,
    minQty: 10,
    location: 'Rak A-05',
    price: 890000,
    unit: 'Roll',
    purchaseUnit: 'Roll',
    recipeUnit: 'Meter',
    conversionFactor: 100,
    unitPrice: 8900,
    createdAt: '2026-03-10T07:11:00Z',
    updatedAt: '2026-05-27T16:00:00Z',
    lastUpdatedBy: 'Admin Utama'
  },
  {
    id: 'prod-5',
    name: 'Cairan Pembersih Industri Solvent-X',
    sku: '4902505111162',
    description: 'Cairan pelarut khusus untuk pembersihan berkala tumpahan oli dan forklift pad di lantai gudang.',
    category: 'Bahan Kimia',
    qty: 2,
    minQty: 5, // This is low stock! (ALERT)
    location: 'Sektor Khusus K-02',
    price: 210000,
    unit: 'Liter',
    purchaseUnit: 'Jerigen 5L',
    recipeUnit: 'Liter',
    conversionFactor: 5,
    unitPrice: 42000,
    expiryDate: '2026-08-15',
    batchNumber: 'LOT-2026-SOLV01',
    createdAt: '2026-03-12T09:00:00Z',
    updatedAt: '2026-05-18T15:20:00Z',
    lastUpdatedBy: 'Rizwan Staff'
  },
  {
    id: 'prod-6',
    name: 'Kardus Packing Double Wall C-Flute 40x40x40',
    sku: '8992689531021',
    description: 'Kardus tebal kemasan proteksi tinggi untuk barang elektronik sebelum didistribusikan.',
    category: 'Logistik & Kemasan',
    qty: 180,
    minQty: 50,
    location: 'Zona D-01',
    price: 6500,
    unit: 'Lembar',
    purchaseUnit: 'Pack 25',
    recipeUnit: 'Lembar',
    conversionFactor: 25,
    unitPrice: 260,
    createdAt: '2026-01-20T03:00:00Z',
    updatedAt: '2026-05-28T07:00:00Z',
    lastUpdatedBy: 'Rizwan Staff'
  }
];

const INITIAL_TRANSACTIONS: Transaction[] = [
  // History starting from earlier months for graph visualization
  {
    id: 'tx-1',
    productId: 'prod-6',
    productName: 'Kardus Packing Double Wall C-Flute 40x40x40',
    sku: '8992689531021',
    type: 'in',
    qty: 200,
    note: 'Stok awal masuk pemasok lokal',
    date: '2026-02-05T09:00:00Z',
    operatorName: 'Admin Utama',
    operatorRole: 'admin',
    location: 'Zona D-01'
  },
  {
    id: 'tx-2',
    productId: 'prod-6',
    productName: 'Kardus Packing Double Wall C-Flute 40x40x40',
    sku: '8992689531021',
    type: 'out',
    qty: 50,
    note: 'Pemakaian tim packing kargo',
    date: '2026-02-15T11:30:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Zona D-01'
  },
  // March Transactions
  {
    id: 'tx-3',
    productId: 'prod-1',
    productName: 'Samsung Galaxy Tab A8 Warehouse Pack',
    sku: '8991234560012',
    type: 'in',
    qty: 25,
    note: 'Pengadaan Divisi IT Lapangan',
    date: '2026-03-02T10:00:00Z',
    operatorName: 'Yusuf Supervisor',
    operatorRole: 'supervisor',
    location: 'Rak A-01'
  },
  {
    id: 'tx-4',
    productId: 'prod-1',
    productName: 'Samsung Galaxy Tab A8 Warehouse Pack',
    sku: '8991234560012',
    type: 'out',
    qty: 10,
    note: 'Didistribusikan ke kru checker gudang luar',
    date: '2026-03-24T14:00:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Rak A-02'
  },
  // April Transactions
  {
    id: 'tx-5',
    productId: 'prod-4',
    productName: 'Kabel Fiber Optic 100m FTTH Roll',
    sku: '8886008101091',
    type: 'in',
    qty: 20,
    note: 'Restock kabel divisi infrastruktur internal',
    date: '2026-04-10T08:00:00Z',
    operatorName: 'Admin Utama',
    operatorRole: 'admin',
    location: 'Rak A-05'
  },
  {
    id: 'tx-6',
    productId: 'prod-5',
    productName: 'Cairan Pembersih Industri Solvent-X',
    sku: '4902505111162',
    type: 'in',
    qty: 10,
    note: 'Pengadaan stok kebersihan triwulan',
    date: '2026-04-15T09:30:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Sektor Khusus K-02'
  },
  {
    id: 'tx-7',
    productId: 'prod-5',
    productName: 'Cairan Pembersih Industri Solvent-X',
    sku: '4902505111162',
    type: 'out',
    qty: 8,
    note: 'Pembersihan tumpahan oli koridor utama',
    date: '2026-04-20T10:00:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Sektor Khusus K-02'
  },
  // May Transactions (Current Month)
  {
    id: 'tx-8',
    productId: 'prod-2',
    productName: 'Bor Listrik Impact Bosch GSB RE',
    sku: '8997230010928',
    type: 'in',
    qty: 5,
    note: 'Pengadaan alat bantu pertukangan',
    date: '2026-05-02T13:40:00Z',
    operatorName: 'Yusuf Supervisor',
    operatorRole: 'supervisor',
    location: 'Rak B-02'
  },
  {
    id: 'tx-9',
    productId: 'prod-2',
    productName: 'Bor Listrik Impact Bosch GSB RE',
    sku: '8997230010928',
    type: 'out',
    qty: 2,
    note: 'Dipinjam untuk perakitan rak pallet sektor E',
    date: '2026-05-15T15:00:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Rak B-03'
  },
  {
    id: 'tx-10',
    productId: 'prod-1',
    productName: 'Samsung Galaxy Tab A8 Warehouse Pack',
    sku: '8991234560012',
    type: 'out',
    qty: 3,
    note: 'Penggantian unit checker rusak',
    date: '2026-05-20T16:20:00Z',
    operatorName: 'Admin Utama',
    operatorRole: 'admin',
    location: 'Rak A-01'
  },
  {
    id: 'tx-11',
    productId: 'prod-4',
    productName: 'Kabel Fiber Optic 100m FTTH Roll',
    sku: '8886008101091',
    type: 'in',
    qty: 5,
    note: 'Sisa instalasi dikembalikan ke gudang',
    date: '2026-05-27T11:15:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Rak A-05'
  },
  {
    id: 'tx-12',
    productId: 'prod-6',
    productName: 'Kardus Packing Double Wall C-Flute 40x40x40',
    sku: '8992689531021',
    type: 'in',
    qty: 30,
    note: 'Pengembalian retur dus sisa kirim',
    date: '2026-05-28T07:00:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Zona D-02'
  },
  {
    id: 'tx-13',
    productId: 'prod-3',
    productName: 'Kursi Kerja Ergonomik Foam-Z',
    sku: '7501031311309',
    type: 'in',
    qty: 18,
    note: 'Pengadaan perabot baru ruang kontrol',
    date: '2026-03-01T04:20:00Z',
    operatorName: 'Yusuf Supervisor',
    operatorRole: 'supervisor',
    location: 'Zona C-03'
  },
  {
    id: 'tx-14',
    productId: 'prod-3',
    productName: 'Kursi Kerja Ergonomik Foam-Z',
    sku: '7501031311309',
    type: 'out',
    qty: 4,
    note: 'Penempatan ke pos keamanan pintu utara',
    date: '2026-04-05T08:30:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Zona C-01'
  },
  {
    id: 'tx-15',
    productId: 'prod-2',
    productName: 'Bor Listrik Impact Bosch GSB RE',
    sku: '8997230010928',
    type: 'in',
    qty: 3,
    note: 'Penerimaan restock perkakas tangan tambahan',
    date: '2026-05-22T10:15:00Z',
    operatorName: 'Rizwan Staff',
    operatorRole: 'staff',
    location: 'Rak B-01'
  },
  {
    id: 'tx-16',
    productId: 'prod-1',
    productName: 'Samsung Galaxy Tab A8 Warehouse Pack',
    sku: '8991234560012',
    type: 'in',
    qty: 6,
    note: 'Penerimaan unit tablet cadangan baru',
    date: '2026-05-25T14:30:00Z',
    operatorName: 'Admin Utama',
    operatorRole: 'admin',
    location: 'Rak Transit TR-01'
  },
  {
    id: 'tx-17',
    productId: 'prod-5',
    productName: 'Cairan Pembersih Industri Solvent-X',
    sku: '4902505111162',
    type: 'in',
    qty: 5,
    note: 'Pengadaan cadangan darurat penanganan limbah',
    date: '2026-05-26T11:00:00Z',
    operatorName: 'Yusuf Supervisor',
    operatorRole: 'supervisor',
    location: 'Sektor E-01'
  }
];

const INITIAL_ALERTS: StockAlert[] = [
  {
    id: 'alert-1',
    productId: 'prod-1',
    productName: 'Samsung Galaxy Tab A8 Warehouse Pack',
    sku: '8991234560012',
    qty: 12,
    minQty: 15,
    timestamp: '2026-05-20T14:45:00Z',
    isRead: false
  },
  {
    id: 'alert-2',
    productId: 'prod-2',
    productName: 'Bor Listrik Impact Bosch GSB RE',
    sku: '8997230010928',
    qty: 3,
    minQty: 8,
    timestamp: '2026-05-24T09:12:00Z',
    isRead: false
  },
  {
    id: 'alert-3',
    productId: 'prod-5',
    productName: 'Cairan Pembersih Industri Solvent-X',
    sku: '4902505111162',
    qty: 2,
    minQty: 5,
    timestamp: '2026-05-18T15:20:00Z',
    isRead: true
  }
];

const INITIAL_LOGS: SystemLog[] = [
  {
    id: 'log-1',
    timestamp: '2026-05-28T07:00:00Z',
    action: 'Restock Barang',
    user: 'Rizwan Staff',
    details: 'Berhasil mendaftarkan penambahan 30 unit Kardus Packing'
  },
  {
    id: 'log-2',
    timestamp: '2026-05-27T16:00:00Z',
    action: 'Edit Detail Barang',
    user: 'Admin Utama',
    details: 'Melakukan penyesuaian deskripsi produk Kabel Fiber Optic'
  },
  {
    id: 'log-3',
    timestamp: '2026-05-27T11:15:00Z',
    action: 'Retur / Barang Masuk',
    user: 'Rizwan Staff',
    details: 'Memasukkan 5 unit sisa instalasi Kabel Fiber Optic'
  }
];

const INITIAL_TRANSFERS: TransferRequest[] = [
  {
    id: 'tr-demo-1',
    productId: 'prod-2',
    productName: 'Bor Listrik Impact Bosch GSB RE',
    productSku: '8997230010928',
    qty: 2,
    originWarehouse: 'Rak B-12',
    targetWarehouse: 'Sektor A-1',
    status: 'pending',
    date: '2026-05-29T07:30:00Z',
    requestedBy: 'Rizwan Staff'
  }
];

// Local Repository Helpers
const getLocalStorage = <T>(key: string, initial: T): T => {
  return safeLocalStorageGet<T>(key, initial);
};

const setLocalStorage = <T>(key: string, data: T): void => {
  safeLocalStorageSet(key, data);
};

// Default System Users
const INITIAL_SYSTEM_USERS: User[] = [
  {
    id: 'u-kicoki',
    name: 'Kicoki Admin',
    email: 'kicoki09@gmail.com',
    role: 'admin',
    location: 'Semua Gudang',
    permissions: {
      canAddProduct: true,
      canEditProduct: true,
      canDeleteProduct: true,
      canRecordTransaction: true,
      canViewReports: true,
      canManageUsers: true,
      canViewDashboard: true,
      canViewDataBarang: true,
      canViewTransaksi: true,
      canViewLaporan: true,
      canViewPengaturan: true
    }
  },
  {
    id: 'u-1',
    name: 'Admin Utama',
    email: 'admin@tnsp.co.id',
    role: 'admin',
    location: 'Semua Gudang',
    permissions: {
      canAddProduct: true,
      canEditProduct: true,
      canDeleteProduct: true,
      canRecordTransaction: true,
      canViewReports: true,
      canManageUsers: true,
      canViewDashboard: true,
      canViewDataBarang: true,
      canViewTransaksi: true,
      canViewLaporan: true,
      canViewPengaturan: true
    }
  },
  {
    id: 'u-2',
    name: 'Yusuf Supervisor',
    email: 'yusuf@tnsp.co.id',
    role: 'supervisor',
    location: 'Sektor A-1',
    permissions: {
      canAddProduct: false,
      canEditProduct: true,
      canDeleteProduct: false,
      canRecordTransaction: true,
      canViewReports: true,
      canManageUsers: false,
      canViewDashboard: true,
      canViewDataBarang: true,
      canViewTransaksi: true,
      canViewLaporan: true,
      canViewPengaturan: false
    }
  },
  {
    id: 'u-3',
    name: 'Rizwan Staff',
    email: 'rizwan@tnsp.co.id',
    role: 'staff',
    location: 'Sektor B-4',
    permissions: {
      canAddProduct: false,
      canEditProduct: false,
      canDeleteProduct: false,
      canRecordTransaction: true,
      canViewReports: false,
      canManageUsers: false,
      canViewDashboard: true,
      canViewDataBarang: true,
      canViewTransaksi: true,
      canViewLaporan: false,
      canViewPengaturan: false
    }
  },
  {
    id: 'u-4',
    name: 'Dewi Kasir',
    email: 'kasir@tnsp.co.id',
    role: 'kasir',
    location: 'Sektor A-1',
    permissions: {
      canAddProduct: false,
      canEditProduct: false,
      canDeleteProduct: false,
      canRecordTransaction: true,
      canViewReports: true,
      canManageUsers: false,
      canViewDashboard: true,
      canViewDataBarang: true,
      canViewTransaksi: true,
      canViewLaporan: true,
      canViewPengaturan: false
    }
  }
];

// Main Export Service
export const dbService = {
  // Categories & Locations management
  async getCategories(): Promise<string[]> {
    const defaultCategories = ['Elektronik', 'Peralatan', 'Alat Kantor', 'Bahan Kimia', 'Logistik & Kemasan'];
    const token = await getAccessToken();
    if (token) {
      try {
        const cats = await readSheet<{ id: string; name: string }>('Categories');
        if (cats && cats.length > 0) {
          return cats.map(c => c.name);
        }
        return defaultCategories;
      } catch (e) {
        console.warn('Google Sheets fetch categories failed:', e);
        throw e;
      }
    }
    return await storageGet<string[]>('gudang_custom_categories', defaultCategories);
  },

  async saveCategories(categories: string[]): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        const payload = categories.map((c, idx) => ({
          id: `cat-${idx}-${Date.now()}`,
          name: c
        }));
        await writeAllRows('Categories', payload);
        return;
      } catch (e) {
        console.warn('Google Sheets save categories failed:', e);
        throw e;
      }
    }
    await storageSet('gudang_custom_categories', categories);
  },

  async getLocations(): Promise<string[]> {
    const defaultLocations = ['Semua Gudang', 'Sektor A-1', 'Sektor B-4', 'Sektor C-1', 'Gudang Utama', 'Gudang Samping', 'Rak A-01', 'Rak B-12', 'Zona C-03', 'Rak A-05', 'Rak C-02', 'Rak B-10'];
    const token = await getAccessToken();
    if (token) {
      try {
        const locs = await readSheet<{ id: string; name: string }>('Locations');
        if (locs && locs.length > 0) {
          return locs.map(l => l.name);
        }
        return defaultLocations;
      } catch (e) {
        console.warn('Google Sheets fetch locations failed:', e);
        throw e;
      }
    }
    return await storageGet<string[]>('gudang_custom_locations', defaultLocations);
  },

  async saveLocations(locations: string[]): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        const payload = locations.map((l, idx) => ({
          id: `loc-${idx}-${Date.now()}`,
          name: l
        }));
        await writeAllRows('Locations', payload);
        return;
      } catch (e) {
        console.warn('Google Sheets save locations failed:', e);
        throw e;
      }
    }
    await storageSet('gudang_custom_locations', locations);
  },

  // System Users
  async getUsers(): Promise<User[]> {
    const token = await getAccessToken();
    if (token) {
      try {
        const users = await readSheet<User>('Users');
        if (users && users.length > 0) {
          const mappedUsers = users.map(u => {
            if (typeof u.permissions === 'string') {
              try { u.permissions = JSON.parse(u.permissions); } catch {}
            }
            const useRecipeUnits = (u.useRecipeUnits as any) === 'true' || u.useRecipeUnits === true;
            const userPassword = u.password || safeLocalStorageGet(`user_password_${u.id}`, '') || (u.role ? `${u.role}123` : '');
            if (userPassword) {
              safeLocalStorageSet(`user_password_${u.id}`, userPassword);
            }

            return {
              ...u,
              role: u.role as Role,
              password: userPassword,
              useRecipeUnits,
            };
          });

          // Also mirror to local storage cache for offline login
          await storageSet('gudang_users', mappedUsers);
          return mappedUsers;
        }
      } catch (e) {
        console.warn('Google Sheets fetch users failed, falling back to local storage:', e);
      }
    }

    const localUsers = await storageGet<User[]>('gudang_users', INITIAL_SYSTEM_USERS);
    return localUsers.map(u => {
      const userPassword = u.password || safeLocalStorageGet(`user_password_${u.id}`, '') || (u.role ? `${u.role}123` : '');
      if (userPassword) {
        safeLocalStorageSet(`user_password_${u.id}`, userPassword);
      }
      return {
        ...u,
        role: u.role as Role,
        password: userPassword,
      };
    });
  },

  async saveUser(user: User): Promise<void> {
    if (user.password) {
      safeLocalStorageSet(`user_password_${user.id}`, user.password);
    }

    // Always keep local storage updated so manual login succeeds offline & online
    try {
      const usersList = await storageGet<User[]>('gudang_users', INITIAL_SYSTEM_USERS);
      const index = usersList.findIndex(u => u.id === user.id);
      if (index > -1) {
        usersList[index] = { ...usersList[index], ...user };
      } else {
        usersList.push(user);
      }
      await storageSet('gudang_users', usersList);
    } catch (err) {
      console.warn('Failed to cache user locally in saveUser:', err);
    }

    const token = await getAccessToken();
    if (token) {
      try {
        const payload = {
          ...user,
          permissions: typeof user.permissions === 'object' ? JSON.stringify(user.permissions) : user.permissions
        };
        await updateRowById<any>('Users', user.id, payload);
      } catch (e) {
        console.warn('Google Sheets save user failed:', e);
      }
    }
  },

  async deleteUser(id: string): Promise<void> {
    safeLocalStorageRemove(`user_password_${id}`);

    const token = await getAccessToken();
    if (token) {
      try {
        await deleteRowById<User>('Users', id);
        return;
      } catch (e) {
        console.warn('Google Sheets delete user failed:', e);
        throw e;
      }
    }

    const usersList = await storageGet<User[]>('gudang_users', INITIAL_SYSTEM_USERS);
    const filtered = usersList.filter(u => u.id !== id);
    await storageSet('gudang_users', filtered);
  },

  // Products
  async getProducts(): Promise<Product[]> {
    const token = await getAccessToken();
    if (token) {
      try {
        const products = await readSheet<Product>('Products');
        if (products && products.length > 0) {
          // Read local cached products to self-heal any missing imageUrl
          const localProducts = await storageGet<Product[]>('gudang_products', []);
          const localImageMap = new Map<string, string>();
          localProducts.forEach(p => {
            if (p && p.id && p.imageUrl) {
              localImageMap.set(p.id, p.imageUrl);
            }
          });

          const mappedProducts = products.map(p => {
            if (typeof p.batches === 'string') {
              try { p.batches = JSON.parse(p.batches); } catch { p.batches = []; }
            }
            // If p.imageUrl is missing from sheet, but exists in local cache, restore it!
            const restoredImageUrl = p.imageUrl || localImageMap.get(p.id) || undefined;

            return {
              ...p,
              imageUrl: restoredImageUrl,
              qty: Number(p.qty) || 0,
              minQty: Number(p.minQty) || 0,
              price: Number(p.price) || 0,
              conversionFactor: Number(p.conversionFactor) || 1,
              unitPrice: Number(p.unitPrice) || 0,
              batches: Array.isArray(p.batches) ? p.batches : []
            };
          });

          // Mirror to local cache so offline or instant reads have full images
          await storageSet('gudang_products', mappedProducts);
          return mappedProducts;
        }
        return [];
      } catch (e) {
        console.warn('Google Sheets fetch products failed:', e);
        throw e;
      }
    }
    return await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
  },

  async saveProduct(product: Product): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        const payload = {
          ...product,
          batches: typeof product.batches === 'object' ? JSON.stringify(product.batches) : product.batches
        };
        await updateRowById<any>('Products', product.id, payload);

        // Also keep local storage cache updated with imageUrl
        const localProducts = await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
        const index = localProducts.findIndex((p) => p.id === product.id);
        if (index > -1) {
          localProducts[index] = product;
        } else {
          localProducts.unshift(product);
        }
        await storageSet('gudang_products', localProducts);
        return;
      } catch (e) {
        console.warn('Google Sheets save product failed:', e);
        throw e;
      }
    }

    const products = await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
    const index = products.findIndex((p) => p.id === product.id);
    if (index > -1) {
      products[index] = product;
    } else {
      products.push(product);
    }
    await storageSet('gudang_products', products);
  },

  async saveMultipleProducts(productsToSave: Product[]): Promise<void> {
    if (!productsToSave || productsToSave.length === 0) return;
    const token = await getAccessToken();
    if (token) {
      try {
        const payloads = productsToSave.map(p => ({
          ...p,
          batches: typeof p.batches === 'object' ? JSON.stringify(p.batches) : p.batches
        }));
        await updateMultipleRowsById<any>('Products', payloads);

        // Also keep local storage cache updated
        const localProducts = await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
        for (const p of productsToSave) {
          const index = localProducts.findIndex((x) => x.id === p.id);
          if (index > -1) {
            localProducts[index] = p;
          } else {
            localProducts.push(p);
          }
        }
        await storageSet('gudang_products', localProducts);
        return;
      } catch (e) {
        console.warn('Google Sheets save multiple products failed:', e);
        throw e;
      }
    }

    const products = await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
    for (const p of productsToSave) {
      const index = products.findIndex((x) => x.id === p.id);
      if (index > -1) {
        products[index] = p;
      } else {
        products.push(p);
      }
    }
    await storageSet('gudang_products', products);
  },

  async syncProductsToSheet(overrideProducts?: Product[]): Promise<void> {
    const products = overrideProducts && overrideProducts.length > 0
      ? overrideProducts 
      : await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
    const token = await getAccessToken();
    if (token) {
      const payloads = products.map(p => ({
        ...p,
        batches: typeof p.batches === 'object' ? JSON.stringify(p.batches) : p.batches
      }));
      await writeAllRows<any>('Products', payloads);
    }
  },

  async deleteProduct(id: string): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await deleteRowById<Product>('Products', id);
        return;
      } catch (e) {
        console.warn('Google Sheets delete product failed:', e);
        throw e;
      }
    }

    const products = await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
    const filtered = products.filter((p) => p.id !== id);
    await storageSet('gudang_products', filtered);
  },

  async deleteMultipleProducts(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const token = await getAccessToken();
    if (token) {
      try {
        await deleteRowsByIds<Product>('Products', ids);
        return;
      } catch (e) {
        console.warn('Google Sheets delete multiple products failed:', e);
        throw e;
      }
    }

    const products = await storageGet<Product[]>('gudang_products', INITIAL_PRODUCTS);
    const idSet = new Set(ids);
    const filtered = products.filter((p) => !idSet.has(p.id));
    await storageSet('gudang_products', filtered);
  },

  // Helper: Retrieve all deleted transaction IDs from local storage & Supabase sync logs
  async getDeletedTransactionIds(): Promise<Set<string>> {
    const localDeleted = await storageGet<string[]>('gudang_deleted_transactions', []);
    const deletedSet = new Set<string>(localDeleted || []);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('gudang_logs')
          .select('details')
          .eq('action', 'HAPUS_TRANSAKSI_TOMBSTONE')
          .order('timestamp', { ascending: false })
          .limit(1000);

        if (!error && data) {
          for (const item of data) {
            if (item && item.details) {
              try {
                const parsed = typeof item.details === 'string' ? JSON.parse(item.details) : item.details;
                if (Array.isArray(parsed.ids)) {
                  parsed.ids.forEach((id: string) => deletedSet.add(id));
                } else if (typeof parsed.id === 'string') {
                  deletedSet.add(parsed.id);
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load remote transaction tombstones:', e);
      }
    }

    // Update local cache of deleted IDs
    await storageSet('gudang_deleted_transactions', Array.from(deletedSet));
    return deletedSet;
  },

  // Helper: Retrieve any synced transaction updates
  async getSyncedTransactionUpdates(): Promise<Map<string, Partial<Transaction>>> {
    const updatesMap = new Map<string, Partial<Transaction>>();
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('gudang_logs')
          .select('details, timestamp')
          .eq('action', 'UPDATE_TRANSACTION_SYNC')
          .order('timestamp', { ascending: true })
          .limit(500);

        if (!error && data) {
          for (const item of data) {
            if (item && item.details) {
              try {
                const parsed = typeof item.details === 'string' ? JSON.parse(item.details) : item.details;
                if (parsed && parsed.id) {
                  updatesMap.set(parsed.id, parsed);
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load remote transaction updates:', e);
      }
    }
    return updatesMap;
  },

  // Transactions
  async getTransactions(): Promise<Transaction[]> {
    const token = await getAccessToken();
    if (token) {
      try {
        const txs = await readSheet<Transaction>('Transactions');
        if (txs && txs.length > 0) {
          return txs.map(t => {
            t.qty = Number(t.qty) || 0;
            t.systemQty = t.systemQty !== undefined ? Number(t.systemQty) : undefined;
            t.physicalQty = t.physicalQty !== undefined ? Number(t.physicalQty) : undefined;
            t.difference = t.difference !== undefined ? Number(t.difference) : undefined;
            t.isAudit = (t.isAudit as any) === 'true' || t.isAudit === true;
            if (!t.location || !t.location.trim()) {
              const initMatch = INITIAL_TRANSACTIONS.find(it => it.id === t.id);
              const prod = INITIAL_PRODUCTS.find(p => p.id === t.productId || p.sku === t.sku);
              t.location = initMatch?.location || prod?.location || 'Rak A-01';
            }
            return t;
          });
        }
        return [];
      } catch (e) {
        console.warn('Google Sheets fetch transactions failed:', e);
        throw e;
      }
    }
    const txs = await storageGet<Transaction[]>('gudang_transactions', INITIAL_TRANSACTIONS);
    let changed = false;
    const enriched = txs.map(t => {
      t.qty = Number(t.qty) || 0;
      if (!t.location || !t.location.trim()) {
        const initMatch = INITIAL_TRANSACTIONS.find(it => it.id === t.id);
        const prod = INITIAL_PRODUCTS.find(p => p.id === t.productId || p.sku === t.sku);
        t.location = initMatch?.location || prod?.location || 'Rak A-01';
        changed = true;
      }
      return t;
    });
    if (changed) {
      await storageSet('gudang_transactions', enriched);
    }
    return enriched;
  },

  async addTransaction(tx: Transaction): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await writeRow<Transaction>('Transactions', tx);
        return;
      } catch (e) {
        console.warn('Google Sheets add transaction failed:', e);
        throw e;
      }
    }

    const txs = await storageGet<Transaction[]>('gudang_transactions', INITIAL_TRANSACTIONS);
    txs.unshift(tx);
    await storageSet('gudang_transactions', txs);
  },

  async addMultipleTransactions(newTxs: Transaction[]): Promise<void> {
    if (!newTxs || newTxs.length === 0) return;
    const token = await getAccessToken();
    if (token) {
      try {
        await writeMultipleRows<Transaction>('Transactions', newTxs);
        // Also mirror to local storage cache immediately
        const txs = await storageGet<Transaction[]>('gudang_transactions', INITIAL_TRANSACTIONS);
        await storageSet('gudang_transactions', [...newTxs, ...txs]);
        return;
      } catch (e) {
        console.warn('Google Sheets add multiple transactions failed:', e);
        throw e;
      }
    }

    const txs = await storageGet<Transaction[]>('gudang_transactions', INITIAL_TRANSACTIONS);
    await storageSet('gudang_transactions', [...newTxs, ...txs]);
  },

  async updateTransaction(tx: Transaction): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await updateRowById<Transaction>('Transactions', tx.id, tx);
        return;
      } catch (e) {
        console.warn('Google Sheets update transaction failed:', e);
        throw e;
      }
    }

    const txs = await storageGet<Transaction[]>('gudang_transactions', INITIAL_TRANSACTIONS);
    const index = txs.findIndex(t => t.id === tx.id);
    if (index !== -1) {
      txs[index] = tx;
      await storageSet('gudang_transactions', txs);
    }
  },

  async deleteTransaction(txId: string): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await deleteRowById<Transaction>('Transactions', txId);
        return;
      } catch (e) {
        console.warn('Google Sheets delete transaction failed:', e);
        throw e;
      }
    }

    const txs = await storageGet<Transaction[]>('gudang_transactions', INITIAL_TRANSACTIONS);
    const filtered = txs.filter(t => t.id !== txId);
    await storageSet('gudang_transactions', filtered);
  },

  async deleteMultipleTransactions(txIds: string[]): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await deleteRowsByIds<Transaction>('Transactions', txIds);
        return;
      } catch (e) {
        console.warn('Google Sheets delete multiple transactions failed:', e);
        throw e;
      }
    }

    const txs = await storageGet<Transaction[]>('gudang_transactions', INITIAL_TRANSACTIONS);
    const idSet = new Set(txIds);
    const filtered = txs.filter(t => !idSet.has(t.id));
    await storageSet('gudang_transactions', filtered);
  },

  // Stock Alerts (Hanya dikelola & ditampilkan di aplikasi / client lokal, tidak dicatat ke database Google Sheets/Cloud)
  async getAlerts(): Promise<StockAlert[]> {
    const alerts = await storageGet<StockAlert[]>('gudang_alerts', INITIAL_ALERTS);
    return (alerts || []).map(a => ({
      ...a,
      qty: Number(a.qty) || 0,
      minQty: Number(a.minQty) || 0,
      isRead: (a.isRead as any) === 'true' || a.isRead === true
    }));
  },

  async saveAlert(alert: StockAlert): Promise<void> {
    const alerts = await storageGet<StockAlert[]>('gudang_alerts', INITIAL_ALERTS);
    const idx = alerts.findIndex((a) => a.id === alert.id);
    if (idx > -1) {
      alerts[idx] = alert;
    } else {
      alerts.unshift(alert);
    }
    await storageSet('gudang_alerts', alerts);
  },

  async markAlertAllAsRead(): Promise<void> {
    const alerts = await storageGet<StockAlert[]>('gudang_alerts', INITIAL_ALERTS);
    const updated = alerts.map((a) => ({ ...a, isRead: true }));
    await storageSet('gudang_alerts', updated);
  },

  // System Logs (Hanya dikelola & ditampilkan di aplikasi / client lokal, tidak dicatat ke database Google Sheets/Cloud)
  async getLogs(): Promise<SystemLog[]> {
    return await storageGet<SystemLog[]>('gudang_logs', INITIAL_LOGS);
  },

  async addLog(action: string, userName: string, details: string): Promise<void> {
    const newLog: SystemLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action,
      user: userName,
      details,
    };

    const logs = await storageGet<SystemLog[]>('gudang_logs', INITIAL_LOGS);
    logs.unshift(newLog);
    // Batasi log lokal maksimal 200 entri terbaru agar penyimpanan lokal tetap ringan dan optimal
    if (logs.length > 200) {
      logs.length = 200;
    }
    await storageSet('gudang_logs', logs);
  },

  async checkStockLevel(product: Product): Promise<StockAlert | null> {
    if (product.qty <= product.minQty) {
      const alerts = await this.getAlerts();
      const alreadyHasUnread = alerts.some((a) => a.productId === product.id && !a.isRead);
      if (!alreadyHasUnread) {
        const newAlert: StockAlert = {
          id: `alert-${Date.now()}`,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          qty: product.qty,
          minQty: product.minQty,
          location: product.location,
          timestamp: new Date().toISOString(),
          isRead: false
        };
        await this.saveAlert(newAlert);
        return newAlert;
      }
    } else {
      // Jika stok sudah kembali di atas batas minimum (restocked), bersihkan alert terkait di aplikasi
      const alerts = await this.getAlerts();
      const filtered = alerts.filter((a) => a.productId !== product.id);
      if (filtered.length !== alerts.length) {
        await storageSet('gudang_alerts', filtered);
      }
    }
    return null;
  },

  // Transfer Requests
  async getTransfers(): Promise<TransferRequest[]> {
    const token = await getAccessToken();
    if (token) {
      try {
        const transfers = await readSheet<TransferRequest>('Transfers');
        if (transfers) {
          return transfers.map(t => {
            t.qty = Number(t.qty) || 0;
            return t;
          });
        }
        return [];
      } catch (e) {
        console.warn('Google Sheets fetch transfers failed:', e);
        throw e;
      }
    }
    return await storageGet<TransferRequest[]>('gudang_transfers', INITIAL_TRANSFERS);
  },

  async saveTransfer(transfer: TransferRequest): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await updateRowById<TransferRequest>('Transfers', transfer.id, transfer);
        return;
      } catch (e) {
        console.warn('Google Sheets save transfer failed:', e);
        throw e;
      }
    }

    const transfers = await storageGet<TransferRequest[]>('gudang_transfers', INITIAL_TRANSFERS);
    const index = transfers.findIndex((t) => t.id === transfer.id);
    if (index > -1) {
      transfers[index] = transfer;
    } else {
      transfers.unshift(transfer);
    }
    await storageSet('gudang_transfers', transfers);
  },

  // Bill of Materials (BOM)
  async getBOMs(): Promise<BOM[]> {
    const token = await getAccessToken();
    if (token) {
      try {
        const boms = await readSheet<BOM>('BOMs');
        if (boms) {
          return boms.map(b => {
            if (typeof b.items === 'string') {
              try { b.items = JSON.parse(b.items); } catch { b.items = []; }
            }
            b.yieldQty = Number(b.yieldQty) || 1;
            b.totalCost = Number(b.totalCost) || 0;
            return b;
          });
        }
        return [];
      } catch (e) {
        console.warn('Google Sheets fetch BOMs failed:', e);
        throw e;
      }
    }
    return await storageGet<BOM[]>('gudang_boms', []);
  },

  async saveBOM(bom: BOM): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        const payload = {
          ...bom,
          items: typeof bom.items === 'object' ? JSON.stringify(bom.items) : bom.items
        };
        await updateRowById<any>('BOMs', bom.id, payload);
        return;
      } catch (e) {
        console.warn('Google Sheets save BOM failed:', e);
        throw e;
      }
    }

    const boms = await storageGet<BOM[]>('gudang_boms', []);
    const index = boms.findIndex(b => b.id === bom.id);
    if (index > -1) {
      boms[index] = bom;
    } else {
      boms.unshift(bom);
    }
    await storageSet('gudang_boms', boms);
  },

  async deleteBOM(id: string): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await deleteRowById<BOM>('BOMs', id);
        return;
      } catch (e) {
        console.warn('Google Sheets delete BOM failed:', e);
        throw e;
      }
    }

    const boms = await storageGet<BOM[]>('gudang_boms', []);
    const filtered = boms.filter(b => b.id !== id);
    await storageSet('gudang_boms', filtered);
  },

  // Menus
  async getMenus(): Promise<MenuItem[]> {
    const token = await getAccessToken();
    if (token) {
      try {
        const menus = await readSheet<MenuItem>('Menus');
        if (menus) {
          return menus.map(m => {
            if (typeof m.ingredients === 'string') {
              try { m.ingredients = JSON.parse(m.ingredients); } catch { m.ingredients = []; }
            }
            m.totalHPP = Number(m.totalHPP) || 0;
            return m;
          });
        }
        return [];
      } catch (e) {
        console.warn('Google Sheets fetch menus failed:', e);
        throw e;
      }
    }
    return await storageGet<MenuItem[]>('gudang_menus', []);
  },

  async saveMenu(menu: MenuItem): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        const payload = {
          ...menu,
          ingredients: typeof menu.ingredients === 'object' ? JSON.stringify(menu.ingredients) : menu.ingredients
        };
        await updateRowById<any>('Menus', menu.id, payload);
        return;
      } catch (e) {
        console.warn('Google Sheets save menu failed:', e);
        throw e;
      }
    }

    const menus = await storageGet<MenuItem[]>('gudang_menus', []);
    const index = menus.findIndex(m => m.id === menu.id);
    if (index > -1) {
      menus[index] = menu;
    } else {
      menus.unshift(menu);
    }
    await storageSet('gudang_menus', menus);
  },

  async deleteMenu(id: string): Promise<void> {
    const token = await getAccessToken();
    if (token) {
      try {
        await deleteRowById<MenuItem>('Menus', id);
        return;
      } catch (e) {
        console.warn('Google Sheets delete menu failed:', e);
        throw e;
      }
    }

    const menus = await storageGet<MenuItem[]>('gudang_menus', []);
    const filtered = menus.filter(m => m.id !== id);
    await storageSet('gudang_menus', filtered);
  }
};

// SQL Command helper script representation
// Quick Decimal migration SQL script for users who already have tables in Supabase
export const SQL_FIX_TRANSACTION_RLS = `-- =========================================================================
-- IZIN HAPUS & EDIT RIWAYAT TRANSAKSI SUPABASE (FIX ROW LEVEL SECURITY)
-- Salin dan jalankan skrip ini di SQL Editor Supabase Anda
-- =========================================================================
ALTER TABLE gudang_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon delete trans" ON gudang_transactions;
DROP POLICY IF EXISTS "Allow anon update trans" ON gudang_transactions;
CREATE POLICY "Allow anon delete trans" ON gudang_transactions FOR DELETE USING (true);
CREATE POLICY "Allow anon update trans" ON gudang_transactions FOR UPDATE USING (true);
`;

export const SQL_DECIMAL_MIGRATION = `-- =========================================================================
-- MIGRASI DUKUNGAN DESIMAL / PECAHAN (NUMERIC) UNTUK SUPABASE
-- Salin dan jalankan seluruh baris ini di SQL Editor Supabase Anda
-- =========================================================================
ALTER TABLE gudang_products ALTER COLUMN qty TYPE NUMERIC;
ALTER TABLE gudang_products ALTER COLUMN min_qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN system_qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN physical_qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN difference TYPE NUMERIC;
ALTER TABLE gudang_alerts ALTER COLUMN qty TYPE NUMERIC;
ALTER TABLE gudang_alerts ALTER COLUMN min_qty TYPE NUMERIC;
ALTER TABLE gudang_transfers ALTER COLUMN qty TYPE NUMERIC;
`;

export const SQL_SCHEMA_BLUEPRINT = `-- SQL SCRIPT BOOTSTRAP UNTUK SUPABASE
-- Silakan salin dan tempel seluruh kode ini di Panel 'SQL Editor' Supabase Anda

-- =========================================================================
-- OPSI 1: MIGRASI CEPAT (JIKA TABEL SUPABASE SUDAH TERBENTUK SEBELUMNYA)
-- Jalankan baris ini untuk mengaktifkan dukungan desimal & fitur terbaru:
-- =========================================================================
ALTER TABLE gudang_products ADD COLUMN IF NOT EXISTS expiry_date TEXT;
ALTER TABLE gudang_products ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE gudang_transactions ADD COLUMN IF NOT EXISTS expiry_date TEXT;
ALTER TABLE gudang_transactions ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE gudang_users ADD COLUMN IF NOT EXISTS password TEXT;

-- Konversi kolom kuantitas agar menerima angka desimal (NUMERIC)
ALTER TABLE gudang_products ALTER COLUMN qty TYPE NUMERIC;
ALTER TABLE gudang_products ALTER COLUMN min_qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN system_qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN physical_qty TYPE NUMERIC;
ALTER TABLE gudang_transactions ALTER COLUMN difference TYPE NUMERIC;
ALTER TABLE gudang_alerts ALTER COLUMN qty TYPE NUMERIC;
ALTER TABLE gudang_alerts ALTER COLUMN min_qty TYPE NUMERIC;
ALTER TABLE gudang_transfers ALTER COLUMN qty TYPE NUMERIC;

-- Izin Hapus & Edit Transaksi
ALTER TABLE gudang_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon delete trans" ON gudang_transactions;
DROP POLICY IF EXISTS "Allow anon update trans" ON gudang_transactions;
CREATE POLICY "Allow anon delete trans" ON gudang_transactions FOR DELETE USING (true);
CREATE POLICY "Allow anon update trans" ON gudang_transactions FOR UPDATE USING (true);

-- =========================================================================
-- OPSI 2: RE-CREATE SELURUH TABEL (JIKA INGIN SKEMA BERSIH DARI AWAL)
-- =========================================================================

-- Hapus tabel lama jika ada agar tidak bentrok skema
DROP TABLE IF EXISTS gudang_alerts CASCADE;
DROP TABLE IF EXISTS gudang_transactions CASCADE;
DROP TABLE IF EXISTS gudang_products CASCADE;
DROP TABLE IF EXISTS gudang_categories CASCADE;
DROP TABLE IF EXISTS gudang_locations CASCADE;
DROP TABLE IF EXISTS gudang_users CASCADE;
DROP TABLE IF EXISTS gudang_logs CASCADE;
DROP TABLE IF EXISTS gudang_transfers CASCADE;
DROP TABLE IF EXISTS gudang_boms CASCADE;
DROP TABLE IF EXISTS gudang_menus CASCADE;

-- 1. Table gudang_products
CREATE TABLE gudang_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0,
  min_qty NUMERIC NOT NULL DEFAULT 0,
  location TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'Unit',
  purchase_unit TEXT NOT NULL DEFAULT 'Unit',
  recipe_unit TEXT NOT NULL DEFAULT 'Unit',
  conversion_factor NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  expiry_date TEXT,
  batch_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_by TEXT NOT NULL,
  CONSTRAINT gudang_products_sku_location_key UNIQUE (sku, location)
);

-- Enable Row Level Security (RLS) but make it readable/writable for demo
ALTER TABLE gudang_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous read" ON gudang_products;
DROP POLICY IF EXISTS "Allow anonymous insert" ON gudang_products;
DROP POLICY IF EXISTS "Allow anonymous update" ON gudang_products;
DROP POLICY IF EXISTS "Allow anonymous delete" ON gudang_products;
CREATE POLICY "Allow anonymous read" ON gudang_products FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert" ON gudang_products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update" ON gudang_products FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete" ON gudang_products FOR DELETE USING (true);

-- 2. Table gudang_transactions
CREATE TABLE gudang_transactions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES gudang_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  qty NUMERIC NOT NULL,
  note TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  operator_name TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  is_audit BOOLEAN DEFAULT FALSE,
  system_qty NUMERIC,
  physical_qty NUMERIC,
  difference NUMERIC,
  expiry_date TEXT,
  batch_number TEXT
);

ALTER TABLE gudang_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon select trans" ON gudang_transactions;
DROP POLICY IF EXISTS "Allow anon insert trans" ON gudang_transactions;
DROP POLICY IF EXISTS "Allow anon delete trans" ON gudang_transactions;
DROP POLICY IF EXISTS "Allow anon update trans" ON gudang_transactions;
CREATE POLICY "Allow anon select trans" ON gudang_transactions FOR SELECT USING (true);
CREATE POLICY "Allow anon insert trans" ON gudang_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon delete trans" ON gudang_transactions FOR DELETE USING (true);
CREATE POLICY "Allow anon update trans" ON gudang_transactions FOR UPDATE USING (true);

-- 3. Table gudang_alerts
CREATE TABLE gudang_alerts (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES gudang_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  min_qty NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

ALTER TABLE gudang_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon select alerts" ON gudang_alerts;
DROP POLICY IF EXISTS "Allow anon insert alerts" ON gudang_alerts;
DROP POLICY IF EXISTS "Allow anon update alerts" ON gudang_alerts;
CREATE POLICY "Allow anon select alerts" ON gudang_alerts FOR SELECT USING (true);
CREATE POLICY "Allow anon insert alerts" ON gudang_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update alerts" ON gudang_alerts FOR UPDATE USING (true);

-- 4. Table gudang_categories
CREATE TABLE gudang_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
ALTER TABLE gudang_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon categories read" ON gudang_categories FOR SELECT USING (true);
CREATE POLICY "Allow anon categories insert" ON gudang_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon categories delete" ON gudang_categories FOR DELETE USING (true);

-- 5. Table gudang_locations
CREATE TABLE gudang_locations (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
ALTER TABLE gudang_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon locations read" ON gudang_locations FOR SELECT USING (true);
CREATE POLICY "Allow anon locations insert" ON gudang_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon locations delete" ON gudang_locations FOR DELETE USING (true);

-- 6. Table gudang_users
CREATE TABLE gudang_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  password TEXT,
  avatar_url TEXT,
  location TEXT,
  permissions JSONB NOT NULL
);
ALTER TABLE gudang_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon users read" ON gudang_users FOR SELECT USING (true);
CREATE POLICY "Allow anon users insert" ON gudang_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon users update" ON gudang_users FOR UPDATE USING (true);
CREATE POLICY "Allow anon users delete" ON gudang_users FOR DELETE USING (true);

-- 7. Table gudang_logs
CREATE TABLE gudang_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  action TEXT NOT NULL,
  user_name TEXT NOT NULL,
  details TEXT NOT NULL
);
ALTER TABLE gudang_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon logs read" ON gudang_logs FOR SELECT USING (true);
CREATE POLICY "Allow anon logs insert" ON gudang_logs FOR INSERT WITH CHECK (true);

-- 8. Table gudang_transfers
CREATE TABLE gudang_transfers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES gudang_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  origin_warehouse TEXT NOT NULL,
  target_warehouse TEXT NOT NULL,
  status TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  approved_date TIMESTAMPTZ
);
ALTER TABLE gudang_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon transfers read" ON gudang_transfers FOR SELECT USING (true);
CREATE POLICY "Allow anon transfers upsert" ON gudang_transfers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon transfers update" ON gudang_transfers FOR UPDATE USING (true);

-- 9. Table gudang_boms
CREATE TABLE gudang_boms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  yield_qty NUMERIC NOT NULL DEFAULT 1,
  yield_unit TEXT NOT NULL,
  items JSONB NOT NULL,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE gudang_boms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon boms read" ON gudang_boms FOR SELECT USING (true);
CREATE POLICY "Allow anon boms upsert" ON gudang_boms FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon boms update" ON gudang_boms FOR UPDATE USING (true);
CREATE POLICY "Allow anon boms delete" ON gudang_boms FOR DELETE USING (true);

-- 10. Table gudang_menus
CREATE TABLE gudang_menus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  ingredients JSONB NOT NULL,
  total_hpp NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE gudang_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon menus read" ON gudang_menus FOR SELECT USING (true);
CREATE POLICY "Allow anon menus upsert" ON gudang_menus FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon menus update" ON gudang_menus FOR UPDATE USING (true);
CREATE POLICY "Allow anon menus delete" ON gudang_menus FOR DELETE USING (true);
`;


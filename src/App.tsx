/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import BarcodeScanner from './components/BarcodeScanner';
import InventoryManager from './components/InventoryManager';
import TransactionHistory from './components/TransactionHistory';
import ReportExporter from './components/ReportExporter';
import UserControl from './components/UserControl';
import LoginPage from './components/LoginPage';
import AdminSettings from './components/AdminSettings';
import UserPasswordSettings from './components/UserPasswordSettings';
import ProductionManager from './components/ProductionManager';
import CriticalStockModal from './components/CriticalStockModal';
import AccountSettingsModal from './components/AccountSettingsModal';

import { Product, User, StockAlert, Transaction, Role, SystemLog, TransferRequest, BOM, MenuItem, MenuIngredient } from './types';
import { dbService, isSupabaseConfigured, supabase } from './lib/databaseService';
import { getAccessToken, extendGoogleTokenExpiry, logoutGoogle } from './lib/googleAuth';
import { loadSharedSheetsConfig } from './lib/googleSheetsService';
import { storageSet, storageRemove } from './lib/storageEngine';
import { sendBackgroundNotification } from './lib/pushNotification';
import { addBatchToProduct, deductFEFOFromProduct, syncProductBatches } from './lib/expiryUtils';
import { 
  Warehouse, 
  LayoutDashboard, 
  Scan, 
  History, 
  Users, 
  FileSpreadsheet, 
  AlertTriangle,
  X,
  Bell,
  CheckCircle2,
  ChevronRight,
  Settings
} from 'lucide-react';
import { motion } from 'motion/react';

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
      canViewPengaturan: true,
      canImportCSV: true,
      canExportCSV: true,
      canPrintProduct: true,
      canRecordBarangMasuk: true,
      canRecordBarangKeluar: true,
      canPerformAudit: true,
      canEditTransaction: true,
      canDeleteTransaction: true
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
      canViewPengaturan: true,
      canImportCSV: true,
      canExportCSV: true,
      canPrintProduct: true,
      canRecordBarangMasuk: true,
      canRecordBarangKeluar: true,
      canPerformAudit: true,
      canEditTransaction: true,
      canDeleteTransaction: true
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
      canViewPengaturan: false,
      canImportCSV: true,
      canExportCSV: true,
      canPrintProduct: true,
      canRecordBarangMasuk: true,
      canRecordBarangKeluar: true,
      canPerformAudit: true,
      canEditTransaction: true,
      canDeleteTransaction: false
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
      canViewPengaturan: false,
      canImportCSV: false,
      canExportCSV: false,
      canPrintProduct: true,
      canRecordBarangMasuk: true,
      canRecordBarangKeluar: true,
      canPerformAudit: false,
      canEditTransaction: false,
      canDeleteTransaction: false
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
      canViewPengaturan: false,
      canImportCSV: false,
      canExportCSV: true,
      canPrintProduct: true,
      canRecordBarangMasuk: true,
      canRecordBarangKeluar: true,
      canPerformAudit: false,
      canEditTransaction: false,
      canDeleteTransaction: false
    }
  }
];

export default function App() {
  // Page Tabs
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [scannerIntent, setScannerIntent] = useState<'in' | 'out' | 'transfer' | 'audit' | 'adjust'>('in');
  
  // Theme Configuration
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('gudang_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // DB States
  const [products, setProducts] = useState<Product[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);

  // Pop-up Modal Stok Kritis Screen State
  const [showCriticalModal, setShowCriticalModal] = useState<boolean>(false);
  const [hasAutoOpenedCriticalModal, setHasAutoOpenedCriticalModal] = useState<boolean>(false);
  
  // Track if users database has loaded initially to prevent local cache overwriting DB deletions on mount
  const [isUsersDbLoaded, setIsUsersDbLoaded] = useState<boolean>(false);

  // RBAC Account States
  const [systemUsers, setSystemUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('gudang_users');
    let usersList = INITIAL_SYSTEM_USERS;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          usersList = parsed;
        }
      } catch {
        usersList = INITIAL_SYSTEM_USERS;
      }
    }
    
    // Ensure kicoki09@gmail.com is always present as an admin in usersList
    const hasKicoki = usersList.some(u => u.email.toLowerCase() === 'kicoki09@gmail.com');
    if (!hasKicoki) {
      usersList = [
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
        ...usersList
      ];
    }
    return usersList;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const savedActiveId = localStorage.getItem('gudang_active_user_id');
      const matched = (systemUsers || []).find(u => u && u.id === savedActiveId);
      return matched || (systemUsers && systemUsers[0]) || INITIAL_SYSTEM_USERS[0];
    } catch (e) {
      console.error('Error initializing current user:', e);
      return INITIAL_SYSTEM_USERS[0];
    }
  });

  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    const wasLoggedIn = localStorage.getItem('gudang_is_logged_in') === 'true';
    if (wasLoggedIn) {
      const lastAct = localStorage.getItem('gudang_last_activity_time');
      if (lastAct) {
        const inactiveMs = Date.now() - parseInt(lastAct, 10);
        if (inactiveMs > 3 * 60 * 60 * 1000) {
          // Exceeded 3 hours, clean up session
          localStorage.setItem('gudang_is_logged_in', 'false');
          try {
            logoutGoogle();
          } catch {}
          return false;
        }
      }
    }
    return wasLoggedIn;
  });

  // Sidebar visibility state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // App Branding & Title states
  const [appTitle, setAppTitle] = useState<string>(() => {
    return localStorage.getItem('cfg_app_title') || 'TNSP SYSTEM';
  });

  const [appLogo, setAppLogo] = useState<string>(() => {
    return localStorage.getItem('cfg_app_logo') || 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200';
  });

  const [showAccountSettingsModal, setShowAccountSettingsModal] = useState<boolean>(false);

  // Google Sheets Connection State
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(false);

  useEffect(() => {
    const loadAndCheck = async () => {
      await loadSharedSheetsConfig();
      try {
        const token = await getAccessToken();
        setIsGoogleConnected(!!token);
      } catch {
        setIsGoogleConnected(false);
      }
    };
    loadAndCheck();
    const interval = setInterval(async () => {
      try {
        const token = await getAccessToken();
        setIsGoogleConnected(!!token);
      } catch {
        setIsGoogleConnected(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Synchronize document title
  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  // Global Activity Tracking and Auto-Logout (3 Hours Inactivity)
  useEffect(() => {
    if (!isLoggedIn) return;

    // Set initial activity time on mount if not exists
    if (!localStorage.getItem('gudang_last_activity_time')) {
      localStorage.setItem('gudang_last_activity_time', Date.now().toString());
    }

    let lastWriteTime = Date.now();

    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle localStorage updates to once every 10 seconds for optimal performance
      if (now - lastWriteTime > 10000) {
        localStorage.setItem('gudang_last_activity_time', now.toString());
        extendGoogleTokenExpiry(); // Also slide Google OAuth access token expiry if connected
        lastWriteTime = now;
      }
    };

    // Events to track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    // Check every 10 seconds if inactivity exceeds 3 hours
    const checkInterval = setInterval(() => {
      const lastAct = localStorage.getItem('gudang_last_activity_time');
      if (lastAct) {
        const inactiveMs = Date.now() - parseInt(lastAct, 10);
        if (inactiveMs > 3 * 60 * 60 * 1000) {
          // Log out the user due to 3 hours of inactivity
          setIsLoggedIn(false);
          localStorage.setItem('gudang_is_logged_in', 'false');
          logoutGoogle(); // Sign out of Google Auth as well
          triggerToast(
            'warn',
            'Sesi Berakhir (Inaktivitas)',
            'Sesi Anda telah berakhir secara otomatis karena tidak ada aktivitas selama 3 jam.'
          );
        }
      }
    }, 10000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
      clearInterval(checkInterval);
    };
  }, [isLoggedIn]);

  const handleSaveBranding = (newTitle: string, newLogo: string) => {
    setAppTitle(newTitle);
    setAppLogo(newLogo);
    localStorage.setItem('cfg_app_title', newTitle);
    localStorage.setItem('cfg_app_logo', newLogo);
    triggerToast('success', 'Branding Diperbarui', 'Judul dan logo aplikasi berhasil diperbarui.');
    handleAddLog('Pengaturan Akun Admin', currentUser.name, `Memperbarui logo & judul aplikasi menjadi "${newTitle}".`);
  };

  const handleUpdateAdminPassword = (newPassword: string) => {
    const updatedUser = { ...currentUser, password: newPassword };
    handleUpdateSystemUser(updatedUser);
    triggerToast('success', 'Password Diperbarui', `Kata sandi akun ${currentUser.name} berhasil diubah.`);
    handleAddLog('Pengaturan Akun Admin', currentUser.name, 'Mengubah password akun admin.');
    setShowAccountSettingsModal(false);
  };

  // Hot Notification Toast Drawer
  const [toast, setToast] = useState<{ type: 'warn' | 'success'; title: string; desc: string } | null>(null);

  // Dynamic categories and locations states
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [locationsList, setLocationsList] = useState<string[]>([]);

  // Load and bootstrap initial entities
  useEffect(() => {
    async function loadInitialData() {
      const [pData, tData, aData, transData, cats, locs, uData, bomsData, menusData] = await Promise.all([
        dbService.getProducts(),
        dbService.getTransactions(),
        dbService.getAlerts(),
        dbService.getTransfers(),
        dbService.getCategories(),
        dbService.getLocations(),
        dbService.getUsers(),
        dbService.getBOMs(),
        dbService.getMenus()
      ]);
      
      // Ensure products do not have duplicate IDs to prevent key rendering warnings
      const uniqueProducts: Product[] = [];
      const seenIds = new Set<string>();
      for (const p of pData) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          uniqueProducts.push(p);
        } else {
          // Self-heal: assign a new unique ID to resolve historical collisions
          const fixedProduct = { 
            ...p, 
            id: `prod-${Date.now()}-${Math.floor(Math.random() * 1000000)}` 
          };
          seenIds.add(fixedProduct.id);
          uniqueProducts.push(fixedProduct);
          dbService.saveProduct(fixedProduct).catch(err => console.error('Failed to save deduplicated product:', err));
        }
      }

      // Auto-harmonize BOMs to ensure each BOM always has a corresponding product record in standard master inventory
      const updatedProducts = [...uniqueProducts];
      let hasNewCreatedProducts = false;
      for (const bom of bomsData) {
        if (!bom) continue;
        const hasMatchingProduct = updatedProducts.some(p => 
          p && p.name && p.location &&
          p.name.trim().toLowerCase() === bom.name.trim().toLowerCase() && 
          p.location.trim().toLowerCase() === bom.location.trim().toLowerCase()
        );
        if (!hasMatchingProduct) {
          const prodId = `prod-bom-auto-${bom.id}`;
          const autoBOMProduct: Product = {
            id: prodId,
            name: bom.name,
            sku: `BOM-${bom.id}`,
            description: `Produk Jadi rakitan dari formulasi BOM: ${bom.name}`,
            category: 'Hasil BOM',
            qty: 0,
            minQty: 5,
            location: bom.location,
            price: bom.totalCost || 0,
            unit: bom.yieldUnit || 'Unit',
            purchaseUnit: bom.yieldUnit || 'Unit',
            recipeUnit: bom.yieldUnit || 'Unit',
            conversionFactor: 1,
            unitPrice: bom.totalCost || 0,
            createdAt: bom.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: 'System Auto-Sync'
          };
          updatedProducts.push(autoBOMProduct);
          hasNewCreatedProducts = true;
          dbService.saveProduct(autoBOMProduct).catch(err => console.error('Failed to auto-register missing BOM product:', err));
        }
      }

      setProducts(updatedProducts);
      setBoms(bomsData);
      setMenus(menusData);
      setTransactions(tData);
      setAlerts(aData);
      setTransfers(transData);
      setCategoriesList(cats);
      setLocationsList(locs);

      // Bootstrap and register user list
      let usersList = uData;
      const hasKicoki = usersList.some(u => u.email.toLowerCase() === 'kicoki09@gmail.com');
      if (!hasKicoki) {
        usersList = [
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
              canManageUsers: true
            }
          },
          ...usersList
        ];
      }
      setSystemUsers(usersList);

      const savedActiveId = localStorage.getItem('gudang_active_user_id');
      const matched = usersList.find(u => u.id === savedActiveId);
      if (matched) {
        setCurrentUser(matched);
      } else if (usersList.length > 0) {
        setCurrentUser(usersList[0]);
      }
      setIsUsersDbLoaded(true);
    }
    loadInitialData().catch(err => {
      console.error('Kritis: Gagal memuat data awal sistem:', err);
      // We still want the app to show something, so we don't block the UI entirely
    });

    // Cross-device sync: refresh fresh transactions, products, and alerts on tab focus or visibility change
    const syncFreshData = async () => {
      try {
        const [freshTxs, freshProds, freshAlerts] = await Promise.all([
          dbService.getTransactions(),
          dbService.getProducts(),
          dbService.getAlerts()
        ]);
        setTransactions(prev => (JSON.stringify(prev) === JSON.stringify(freshTxs) ? prev : freshTxs));
        setProducts(prev => {
          if (!freshProds || freshProds.length === 0) return prev;
          const merged = freshProds.map(freshP => {
            const existing = prev.find(p => p.id === freshP.id);
            if (existing && existing.imageUrl && !freshP.imageUrl) {
              return { ...freshP, imageUrl: existing.imageUrl };
            }
            return freshP;
          });
          return JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged;
        });
        setAlerts(prev => (JSON.stringify(prev) === JSON.stringify(freshAlerts) ? prev : freshAlerts));
      } catch (e) {
        console.warn('Cross-device background sync error:', e);
      }
    };

    window.addEventListener('focus', syncFreshData);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncFreshData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic light sync every 15 seconds to ensure changes made on other devices propagate seamlessly
    const syncInterval = setInterval(syncFreshData, 15000);

    // Supabase Realtime listener if configured
    let realtimeChannel: any = null;
    if (isSupabaseConfigured && supabase) {
      try {
        realtimeChannel = supabase
          .channel('warehouse-crossdevice-sync')
          .on('postgres_changes', { event: '*', schema: 'public' }, () => {
            syncFreshData();
          })
          .subscribe();
      } catch (e) {
        console.warn('Realtime channel error:', e);
      }
    }

    return () => {
      window.removeEventListener('focus', syncFreshData);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(syncInterval);
      if (realtimeChannel && supabase) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  const handleUpdateCategories = async (updated: string[]) => {
    setCategoriesList(updated);
    await dbService.saveCategories(updated);
  };

  const handleUpdateLocations = async (updated: string[]) => {
    setLocationsList(updated);
    await dbService.saveLocations(updated);
  };

  // Theme effect
  useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('gudang_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('gudang_theme', 'light');
      }
    } catch (e) {
      console.warn('Gagal menyimpan tema kustom ke local storage', e);
    }
  }, [darkMode]);

  // Automatic tab redirection placed below navigationMenuItems

  // Archived role-based tab restrictions
  /*
  useEffect(() => {
    return;
    if (roleLower === 'kasir' || roleLower === 'cashier') {
      if (currentTab !== 'pos' && currentTab !== 'laporan') {
        setCurrentTab('pos');
      }
    } else {
      // Redirect from 'pos' if not admin or kasir/cashier
      if (currentTab === 'pos' && roleLower !== 'admin') {
        setCurrentTab('dashboard');
      }
    }
  }, [currentUser.role, currentTab]); */

  // Responsive sidebar automatic viewport width detection on mount
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    handleResize(); // run on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save Users change locally
  useEffect(() => {
    if (!isUsersDbLoaded) return;
    try {
      localStorage.setItem('gudang_users', JSON.stringify(systemUsers));
    } catch (e) {
      console.warn('Gagal menyimpan data daftar pengguna lokal', e);
    }
  }, [systemUsers, isUsersDbLoaded]);

  useEffect(() => {
    try {
      localStorage.setItem('gudang_active_user_id', currentUser.id);
    } catch (e) {
      console.warn('Gagal menyimpan ID sesi aktif lokal', e);
    }
  }, [currentUser]);

  // Helper trigger to show custom float toasts
  const triggerToast = (type: 'warn' | 'success', title: string, desc: string) => {
    setToast({ type, title, desc });

    // Trigger native system pop-up notification if user is not using/looking at the app
    sendBackgroundNotification(title, { body: desc });

    setTimeout(() => {
      setToast(null);
    }, 5500); // Hide after 5.5s
  };

  // Switch current profile simulation handler
  const handleUserChange = (selectedUser: User) => {
    setCurrentUser(selectedUser);
    triggerToast(
      'success',
      'Masuk Akun Berhasil',
      `Sekarang Anda beroperasi menggunakan peran: ${selectedUser.role.toUpperCase()}`
    );
  };

  // Secure Authentication Handlers
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    try {
      localStorage.setItem('gudang_is_logged_in', 'true');
      localStorage.setItem('gudang_active_user_id', user.id);
      localStorage.setItem('gudang_last_activity_time', Date.now().toString());
    } catch (e) {
      console.warn('Gagal mendaftar status login lokal', e);
    }
  };

  const handleGoogleLoginSuccess = async (googleUser: any, token: string) => {
    const emailToFind = (googleUser.email || '').trim().toLowerCase();
    let matchedUser = systemUsers.find(u => u && u.email && u.email.toLowerCase() === emailToFind);

    if (!matchedUser) {
      const newId = `u-${Date.now()}`;
      const defaultUser: User = {
        id: newId,
        name: googleUser.name || googleUser.displayName || 'Petugas Google Workspace',
        email: emailToFind,
        role: 'staff',
        location: 'Semua Gudang',
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
          canViewPengaturan: false,
          canImportCSV: false,
          canExportCSV: true,
          canPrintProduct: true,
          canRecordBarangMasuk: true,
          canRecordBarangKeluar: true,
          canPerformAudit: false,
          canEditTransaction: false,
          canDeleteTransaction: false
        }
      };
      await dbService.saveUser(defaultUser);
      setSystemUsers(prev => [...prev, defaultUser]);
      matchedUser = defaultUser;
    }

    handleLoginSuccess(matchedUser);
    triggerToast(
      'success',
      'Google Workspace Terhubung',
      `Sesi aktif untuk ${matchedUser.name} (${matchedUser.role.toUpperCase()}) telah siap.`
    );
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    try {
      localStorage.setItem('gudang_is_logged_in', 'false');
    } catch (e) {
      console.warn('Gagal menghapus status login lokal', e);
    }
    triggerToast(
      'success',
      'Sesi Berakhir',
      'Anda telah keluar dari sistem logistik TNSP SYSTEM secara aman.'
    );
  };

  // Add Log helper proxy
  const handleAddLog = async (action: string, userName: string, details: string) => {
    await dbService.addLog(action, userName, details);
  };

  // Core Db mutations wrapper
  const handleRecordStockChange = async (
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
  ) => {
    // 1. Fetch matching product status
    const productList = [...products];
    const index = productList.findIndex(p => p.id === productId);
    if (index === -1) return;

    const product = productList[index];

    let updatedProduct: Product;
    let fefoNoteSuffix = '';

    if (type === 'in') {
      if (batchNumber && expiryDate) {
        updatedProduct = addBatchToProduct(product, batchNumber, expiryDate, qty);
      } else if (product.batches && product.batches.length > 0) {
        // Default batch name if not provided
        const defaultBatch = product.batchNumber || `LOT-${new Date().getFullYear()}-001`;
        const defaultExp = product.expiryDate || new Date().toISOString().split('T')[0];
        updatedProduct = addBatchToProduct(product, defaultBatch, defaultExp, qty);
      } else {
        const originalQty = product.qty;
        updatedProduct = { ...product, qty: Math.round((originalQty + qty) * 10000) / 10000 };
      }
    } else {
      // Type 'out'
      if (product.batches && product.batches.length > 0) {
        const res = deductFEFOFromProduct(product, qty);
        updatedProduct = res.updatedProduct;
        fefoNoteSuffix = res.summaryNote ? ` ${res.summaryNote}` : '';
      } else {
        const originalQty = product.qty;
        updatedProduct = { ...product, qty: Math.round((originalQty - qty) * 10000) / 10000 };
      }
    }

    // Apply price change if provided
    if (newPrice !== undefined && !isNaN(newPrice) && newPrice >= 0) {
      updatedProduct.price = newPrice;
    }
    updatedProduct.updatedAt = new Date().toISOString();
    updatedProduct.lastUpdatedBy = currentUser.name;

    const finalNote = (note + fefoNoteSuffix).trim();

    // 2. Prepare Transaction Resi
    const transaction: Transaction = {
      id: `tx-${Date.now()}`,
      productId,
      productName: product.name,
      sku: product.sku,
      type,
      qty,
      note: finalNote,
      date: customDate || new Date().toISOString(),
      operatorName: currentUser.name,
      operatorRole: currentUser.role,
      unit: product.unit,
      isAudit,
      systemQty,
      physicalQty,
      difference,
      batchNumber: batchNumber || product.batchNumber,
      expiryDate: expiryDate || product.expiryDate,
      location: location || product.location || 'Rak A-01'
    };

    // 3. Save to database in parallel
    await Promise.all([
      dbService.addTransaction(transaction),
      dbService.saveProduct(updatedProduct)
    ]);

    // 5. Update react states
    productList[index] = updatedProduct;
    setProducts(productList);
    
    const currentTxs = [transaction, ...transactions];
    setTransactions(currentTxs);

    const newQty = updatedProduct.qty;
    const isCritical = newQty <= product.minQty;
    const alertResult = await dbService.checkStockLevel(updatedProduct);
    if (alertResult || isCritical) {
      // New low stock alert registered! Refresh alerts
      const refreshedAlerts = await dbService.getAlerts();
      setAlerts(refreshedAlerts);

      // Open screen pop-up modal for critical stock
      setShowCriticalModal(true);

      // Trigger background / device system pop-up notification
      sendBackgroundNotification('🚨 PERINGATAN STOK KRITIS!', {
        body: `Barang ${product.name} mendrop ke level kritis (${newQty} unit). Silakan restock!`
      });

      // Toast automatic low-stock notice!
      triggerToast(
        'warn',
        'Stok Mencapai Batas Minimum!',
        `Barang ${product.name} mendrop ke level kritis (${newQty} unit). Silakan restock!`
      );
    } else {
      triggerToast(
        'success',
        'Stok Berhasil Diperbarui',
        `Stok ${product.name} sekarang: ${newQty} unit (${type === 'in' ? 'penambahan' : 'pengurangan'} ${qty} unit)`
      );
    }

    await dbService.addLog(
      type === 'in' ? 'Barang Masuk (IN)' : 'Barang Keluar (OUT)',
      currentUser.name,
      `Merubah stok barang: ${product.name} sebanyak ${qty} unit`
    );
  };

  const handleInitiateTransfer = async (
    productId: string,
    originWarehouse: string,
    targetWarehouse: string,
    qty: number,
    note: string,
    customDate?: string
  ) => {
    const productList = [...products];
    const index = productList.findIndex(p => p.id === productId);
    if (index === -1) return;
    const product = productList[index];

    const updatedQty = product.qty - qty;
    const updatedProduct = {
      ...product,
      qty: updatedQty,
      updatedAt: new Date().toISOString(),
      lastUpdatedBy: currentUser.name
    };
    await dbService.saveProduct(updatedProduct);
    productList[index] = updatedProduct;
    setProducts(productList);

    const recordNote = `Mutasi keluar dari ${originWarehouse} ke ${targetWarehouse}.${note ? ` Catatan: ${note}` : ''}`;
    const tx: Transaction = {
      id: `tx-${Date.now()}`,
      productId,
      productName: product.name,
      sku: product.sku,
      type: 'out',
      qty,
      note: recordNote,
      date: customDate || new Date().toISOString(),
      operatorName: currentUser.name,
      operatorRole: currentUser.role,
      unit: product.unit,
      location: originWarehouse || product.location || 'Rak A-01'
    };
    await dbService.addTransaction(tx);
    setTransactions(prev => [tx, ...prev]);

    const transferRequest: TransferRequest = {
      id: `tr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      productId,
      productName: product.name,
      productSku: product.sku,
      qty,
      originWarehouse: originWarehouse || product.location,
      targetWarehouse,
      status: 'pending',
      date: customDate || new Date().toISOString(),
      requestedBy: currentUser.name
    };
    await dbService.saveTransfer(transferRequest);
    setTransfers(prev => [transferRequest, ...prev]);

    await dbService.checkStockLevel(updatedProduct);
    const refreshedAlerts = await dbService.getAlerts();
    setAlerts(refreshedAlerts);

    await handleAddLog(
      'Permintaan Transfer',
      currentUser.name,
      `Meminta mutasi ${qty} unit ${product.name} dari ${originWarehouse} ke ${targetWarehouse}`
    );
  };

  const handleRecordMultipleChanges = async (
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
  ) => {
    // 1. Fetch current up-to-date products list from database
    const freshProducts = await dbService.getProducts();
    const productList = [...freshProducts];
    const newTransactions: Transaction[] = [];
    const newTransfersList: TransferRequest[] = [];

    const updatedProductsToSave: Product[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const index = productList.findIndex(p => 
        String(p.id).trim() === String(item.productId).trim() || 
        (Boolean(item.sku && p.sku) && p.sku.trim().toLowerCase() === item.sku!.trim().toLowerCase())
      );
      if (index === -1) {
        console.warn('Produk tidak ditemukan saat pencatatan multi item:', item);
        continue;
      }

      const product = productList[index];
      let updatedProduct: Product;
      let fefoNoteSuffix = '';

      if (item.isTransfer) {
        // Handle transfer initiation
        const updatedQty = product.qty - item.qty;
        updatedProduct = {
          ...product,
          qty: updatedQty,
          updatedAt: new Date().toISOString(),
          lastUpdatedBy: currentUser.name
        };
        const existingSaveIdx = updatedProductsToSave.findIndex(p => p.id === updatedProduct.id);
        if (existingSaveIdx > -1) {
          updatedProductsToSave[existingSaveIdx] = updatedProduct;
        } else {
          updatedProductsToSave.push(updatedProduct);
        }

        const recordNote = `Mutasi keluar dari ${item.originWarehouse} ke ${item.targetWarehouse}.${item.note ? ` Catatan: ${item.note}` : ''}`;
        
        // Generate unique TX id
        const uniqueTxId = `tx-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
        const tx: Transaction = {
          id: uniqueTxId,
          productId: item.productId,
          productName: product.name,
          sku: product.sku,
          type: 'out',
          qty: item.qty,
          note: recordNote,
          date: item.customDate || new Date().toISOString(),
          operatorName: currentUser.name,
          operatorRole: currentUser.role,
          unit: product.unit,
          location: item.originWarehouse || product.location || 'Rak A-01'
        };
        newTransactions.push(tx);

        const uniqueTrId = `tr-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
        const transferRequest: TransferRequest = {
          id: uniqueTrId,
          productId: item.productId,
          productName: product.name,
          productSku: product.sku,
          qty: item.qty,
          originWarehouse: item.originWarehouse || product.location,
          targetWarehouse: item.targetWarehouse || '',
          status: 'pending',
          requestedBy: currentUser.name,
          date: item.customDate || new Date().toISOString()
        };
        await dbService.saveTransfer(transferRequest);
        newTransfersList.push(transferRequest);

        await dbService.addLog(
          'Inisiasi Mutasi',
          currentUser.name,
          `Membuat mutasi transfer barang ${product.name} sebanyak ${item.qty} unit dari ${item.originWarehouse} ke ${item.targetWarehouse}`
        );

      } else {
        // Handle standard IN/OUT or Audit
        if (item.type === 'in') {
          if (item.batchNumber && item.expiryDate) {
            updatedProduct = addBatchToProduct(product, item.batchNumber, item.expiryDate, item.qty);
          } else if (product.batches && product.batches.length > 0) {
            const defaultBatch = product.batchNumber || `LOT-${new Date().getFullYear()}-001`;
            const defaultExp = product.expiryDate || new Date().toISOString().split('T')[0];
            updatedProduct = addBatchToProduct(product, defaultBatch, defaultExp, item.qty);
          } else {
            const originalQty = product.qty;
            updatedProduct = { ...product, qty: Math.round((originalQty + item.qty) * 10000) / 10000 };
          }
        } else {
          // Type 'out'
          if (product.batches && product.batches.length > 0) {
            const res = deductFEFOFromProduct(product, item.qty);
            updatedProduct = res.updatedProduct;
            fefoNoteSuffix = res.summaryNote ? ` ${res.summaryNote}` : '';
          } else {
            const originalQty = product.qty;
            updatedProduct = { ...product, qty: Math.round((originalQty - item.qty) * 10000) / 10000 };
          }
        }

        if (item.newPrice !== undefined && !isNaN(item.newPrice) && item.newPrice >= 0) {
          updatedProduct.price = item.newPrice;
        }
        updatedProduct.updatedAt = new Date().toISOString();
        updatedProduct.lastUpdatedBy = currentUser.name;

        const finalNote = (item.note + fefoNoteSuffix).trim();

        const uniqueTxId = `tx-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
        const transaction: Transaction = {
          id: uniqueTxId,
          productId: item.productId,
          productName: product.name,
          sku: product.sku,
          type: item.type,
          qty: item.qty,
          note: finalNote,
          date: item.customDate || new Date().toISOString(),
          operatorName: currentUser.name,
          operatorRole: currentUser.role,
          unit: product.unit,
          isAudit: item.isAudit,
          systemQty: item.systemQty,
          physicalQty: item.physicalQty,
          difference: item.difference,
          batchNumber: item.batchNumber || product.batchNumber,
          expiryDate: item.expiryDate || product.expiryDate,
          location: item.location || product.location || 'Rak A-01'
        };

        newTransactions.push(transaction);
        const existingSaveIdx = updatedProductsToSave.findIndex(p => p.id === updatedProduct.id);
        if (existingSaveIdx > -1) {
          updatedProductsToSave[existingSaveIdx] = updatedProduct;
        } else {
          updatedProductsToSave.push(updatedProduct);
        }

        await dbService.addLog(
          item.type === 'in' ? 'Barang Masuk (IN)' : 'Barang Keluar (OUT)',
          currentUser.name,
          `Merubah stok barang: ${product.name} sebanyak ${item.qty} unit (${item.type === 'in' ? 'penambahan' : 'pengurangan'})`
        );
      }

      await dbService.checkStockLevel(updatedProduct);
      productList[index] = updatedProduct;
    }

    // Persist all transactions first, then save updated products (sequential to prevent Google lock collision)
    await dbService.addMultipleTransactions(newTransactions);
    await dbService.saveMultipleProducts(updatedProductsToSave);

    const refreshedAlerts = await dbService.getAlerts();
    setAlerts(refreshedAlerts);

    // Refresh state once at the end
    setProducts(productList);
    setTransactions(prev => [...newTransactions, ...prev]);
    if (newTransfersList.length > 0) {
      setTransfers(prev => [...newTransfersList, ...prev]);
    }
  };

  const handleApproveTransfer = async (transferId: string) => {
    const updatedTransfers = [...transfers];
    const index = updatedTransfers.findIndex(t => t.id === transferId);
    if (index === -1) return;

    const request = updatedTransfers[index];
    if (request.status !== 'pending') return;

    // Find the original requester to see if they were using recipe units
    const requester = systemUsers.find(u => u.name === request.requestedBy);
    const requesterUsesRecipe = requester?.useRecipeUnits || false;
    const approverUsesRecipe = currentUser.useRecipeUnits || false;

    const productList = [...products];
    const originalProduct = products.find(p => p.sku.toLowerCase() === request.productSku.toLowerCase());
    const sourceProduct = products.find(
      p => p.sku.toLowerCase() === request.productSku.toLowerCase() && 
           p.location.trim().toLowerCase() === request.originWarehouse.trim().toLowerCase()
    ) || originalProduct;
    const factor = originalProduct?.conversionFactor || 1;

    // Determine the actual quantity to add based on transitions:
    // 1. Standard -> Recipe: qty * factor
    // 2. Recipe -> Standard: qty / factor
    // 3. Same type: qty
    let quantityToAdd = request.qty;
    if (!requesterUsesRecipe && approverUsesRecipe) {
      quantityToAdd = request.qty * factor;
    } else if (requesterUsesRecipe && !approverUsesRecipe) {
      quantityToAdd = request.qty / factor;
    }

    const matchedIndex = productList.findIndex(
      p => p.sku.toLowerCase() === request.productSku.toLowerCase() && 
           p.location.trim().toLowerCase() === request.targetWarehouse.trim().toLowerCase()
    );

    let targetProductId = '';
    
    if (matchedIndex > -1) {
      const targetProduct = productList[matchedIndex];
      const updatedQty = targetProduct.qty + quantityToAdd;
      const updatedProduct = {
        ...targetProduct,
        qty: updatedQty,
        // Attachment of photo from the origin warehouse if destination doesn't have it, or sync it
        imageUrl: targetProduct.imageUrl || sourceProduct?.imageUrl || undefined,
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: currentUser.name
      };
      await dbService.saveProduct(updatedProduct);
      productList[matchedIndex] = updatedProduct;
      targetProductId = targetProduct.id;
    } else {
      const newProduct: Product = {
        id: `prod-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        name: sourceProduct ? sourceProduct.name : (originalProduct ? originalProduct.name : request.productName),
        sku: request.productSku,
        description: sourceProduct ? sourceProduct.description : (originalProduct ? originalProduct.description : 'Produk hasil transfer antar gudang.'),
        category: sourceProduct ? sourceProduct.category : (originalProduct ? originalProduct.category : 'Logistik'),
        qty: quantityToAdd,
        minQty: sourceProduct ? (approverUsesRecipe ? sourceProduct.minQty * factor : sourceProduct.minQty) : (originalProduct ? (approverUsesRecipe ? originalProduct.minQty * factor : originalProduct.minQty) : 5),
        location: request.targetWarehouse,
        price: sourceProduct ? sourceProduct.price : (originalProduct ? originalProduct.price : 0),
        // IF approver uses recipe units, the BASE unit for this new location is the recipeUnit
        unit: approverUsesRecipe ? (sourceProduct?.recipeUnit || originalProduct?.recipeUnit || 'Gram') : (sourceProduct?.unit || originalProduct?.unit || 'Unit'),
        purchaseUnit: sourceProduct ? sourceProduct.purchaseUnit : (originalProduct ? originalProduct.purchaseUnit : 'Unit'),
        recipeUnit: sourceProduct ? sourceProduct.recipeUnit : (originalProduct ? originalProduct.recipeUnit : 'Unit'),
        conversionFactor: sourceProduct ? sourceProduct.conversionFactor : (originalProduct ? originalProduct.conversionFactor : 1),
        unitPrice: sourceProduct ? sourceProduct.unitPrice : (originalProduct ? originalProduct.unitPrice : 0),
        imageUrl: sourceProduct?.imageUrl || originalProduct?.imageUrl || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: currentUser.name
      };
      
      await dbService.saveProduct(newProduct);
      productList.push(newProduct);
      targetProductId = newProduct.id;
    }
    setProducts(productList);

    const conversionNote = (requesterUsesRecipe !== approverUsesRecipe) 
      ? ` (Konversi otomatis: ${request.qty} ${requesterUsesRecipe ? originalProduct?.recipeUnit : originalProduct?.unit} -> ${quantityToAdd} ${approverUsesRecipe ? originalProduct?.recipeUnit : originalProduct?.unit})`
      : '';

    const rxNote = `Mutasi masuk (Disetujui) dari ${request.originWarehouse} ke ${request.targetWarehouse}${conversionNote}`;
    const tx: Transaction = {
      id: `tx-${Date.now()}`,
      productId: targetProductId,
      productName: request.productName,
      sku: request.productSku,
      type: 'in',
      qty: quantityToAdd,
      note: rxNote,
      date: new Date().toISOString(),
      operatorName: currentUser.name,
      operatorRole: currentUser.role,
      unit: approverUsesRecipe ? (originalProduct?.recipeUnit || 'Gram') : (originalProduct?.unit || 'Unit'),
      location: request.targetWarehouse || 'Rak A-01'
    };
    await dbService.addTransaction(tx);
    setTransactions(prev => [tx, ...prev]);

    const updatedRequest: TransferRequest = {
      ...request,
      status: 'approved',
      approvedBy: currentUser.name,
      approvedDate: new Date().toISOString()
    };
    await dbService.saveTransfer(updatedRequest);
    updatedTransfers[index] = updatedRequest;
    setTransfers(updatedTransfers);

    await handleAddLog(
      'Persetujuan Transfer',
      currentUser.name,
      `Menyetujui mutasi masuk ${quantityToAdd} ${approverUsesRecipe ? originalProduct?.recipeUnit : originalProduct?.unit} ${request.productName} dari ${request.originWarehouse} ke ${request.targetWarehouse}${conversionNote}`
    );

    triggerToast(
      'success',
      'Transfer Disetujui',
      `Barang sebanyak ${quantityToAdd} unit berhasil ditambahkan ke gudang "${request.targetWarehouse}"`
    );
  };

  const handleRejectTransfer = async (transferId: string) => {
    const updatedTransfers = [...transfers];
    const index = updatedTransfers.findIndex(t => t.id === transferId);
    if (index === -1) return;

    const request = updatedTransfers[index];
    if (request.status !== 'pending') return;

    const productList = [...products];
    const originProductIdx = productList.findIndex(p => p.id === request.productId);
    
    // If the origin product record is still there, just add back the qty
    if (originProductIdx > -1) {
      const originProduct = productList[originProductIdx];
      const returnedQty = originProduct.qty + request.qty;
      const updatedProduct = {
        ...originProduct,
        qty: returnedQty,
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: currentUser.name
      };
      await dbService.saveProduct(updatedProduct);
      productList[originProductIdx] = updatedProduct;
      setProducts(productList);
      await dbService.checkStockLevel(updatedProduct);
    } else {
      // If the origin product record was deleted while transfer was pending, re-create it
      const sampleProduct = products.find(p => p.sku.toLowerCase() === request.productSku.toLowerCase());
      const newProduct: Product = {
        id: request.productId,
        name: sampleProduct ? sampleProduct.name : request.productName,
        sku: request.productSku,
        description: sampleProduct ? sampleProduct.description : 'Produk dikembalikan dari mutasi yang ditolak.',
        category: sampleProduct ? sampleProduct.category : 'Logistik',
        qty: request.qty,
        minQty: sampleProduct ? sampleProduct.minQty : 5,
        location: request.originWarehouse,
        price: sampleProduct ? sampleProduct.price : 0,
        unit: sampleProduct ? sampleProduct.unit : 'Unit',
        purchaseUnit: sampleProduct ? sampleProduct.purchaseUnit : 'Unit',
        recipeUnit: sampleProduct ? sampleProduct.recipeUnit : 'Unit',
        conversionFactor: sampleProduct ? sampleProduct.conversionFactor : 1,
        unitPrice: sampleProduct ? sampleProduct.unitPrice : 0,
        imageUrl: sampleProduct ? sampleProduct.imageUrl : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: currentUser.name
      };
      await dbService.saveProduct(newProduct);
      productList.push(newProduct);
      setProducts(productList);
      await dbService.checkStockLevel(newProduct);
    }

    const tx: Transaction = {
      id: `tx-${Date.now()}`,
      productId: request.productId,
      productName: request.productName,
      sku: request.productSku,
      type: 'in',
      qty: request.qty,
      note: `Retur pembatalan (Ditolak) transfer ke ${request.targetWarehouse}`,
      date: new Date().toISOString(),
      operatorName: currentUser.name,
      operatorRole: currentUser.role,
      unit: products.find(p => p.id === request.productId)?.unit || 'unit',
      location: request.originWarehouse || 'Rak A-01'
    };
    await dbService.addTransaction(tx);
    setTransactions(prev => [tx, ...prev]);

    const updatedRequest: TransferRequest = {
      ...request,
      status: 'rejected',
      approvedBy: currentUser.name,
      approvedDate: new Date().toISOString()
    };
    await dbService.saveTransfer(updatedRequest);
    updatedTransfers[index] = updatedRequest;
    setTransfers(updatedTransfers);

    await handleAddLog(
      'Penolakan Transfer',
      currentUser.name,
      `Menolak mutasi ${request.qty} unit ${request.productName} dari ${request.originWarehouse} ke ${request.targetWarehouse}`
    );

    const refreshedAlerts = await dbService.getAlerts();
    setAlerts(refreshedAlerts);

    triggerToast(
      'warn',
      'Transfer Ditolak',
      `Mutasi barang dibatalkan, kuantitas dikembalikan ke gudang asal (${request.originWarehouse}).`
    );
  };

  const handleEditTransaction = async (updatedTx: Transaction) => {
    try {
      const freshTransactions = await dbService.getTransactions();
      let originalTx = freshTransactions.find(t => t.id === updatedTx.id);
      if (!originalTx) {
        originalTx = transactions.find(t => t.id === updatedTx.id);
      }
      if (!originalTx) {
        throw new Error('Transaksi tidak ditemukan di database.');
      }

      await dbService.updateTransaction(updatedTx);
      setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));

      const freshProducts = await dbService.getProducts();
      const product = freshProducts.find(p => p.id === updatedTx.productId);

      if (product) {
        let updatedProduct = { ...product };
        const oldQty = Number(originalTx.qty) || 0;
        const newQty = Number(updatedTx.qty) || 0;
        const diffQty = newQty - oldQty;

        if (diffQty !== 0) {
          // Calculate net change to apply to product stock
          // For 'in' type: diffQty positive means add to stock, negative means subtract
          // For 'out' type: diffQty positive means subtract more from stock, negative means add back
          const netChange = updatedTx.type === 'in' ? diffQty : -diffQty;

          if (product.batches && product.batches.length > 0) {
            const currentBatches = [...product.batches];
            const batchNum = updatedTx.batchNumber || originalTx.batchNumber || product.batchNumber;
            const existingIdx = currentBatches.findIndex(b => b.batchNumber === batchNum);

            if (existingIdx !== -1) {
              currentBatches[existingIdx] = {
                ...currentBatches[existingIdx],
                qty: Math.max(0, currentBatches[existingIdx].qty + netChange)
              };
            } else if (netChange > 0) {
              currentBatches.push({
                id: `batch-adjust-${Date.now()}`,
                batchNumber: batchNum || 'ADJUSTED',
                expiryDate: updatedTx.expiryDate || originalTx.expiryDate || product.expiryDate || '',
                qty: netChange,
                createdAt: new Date().toISOString()
              });
            }
            updatedProduct.batches = currentBatches;
            updatedProduct = syncProductBatches(updatedProduct);
          } else {
            updatedProduct.qty = Math.max(0, product.qty + netChange);
          }

          updatedProduct.updatedAt = new Date().toISOString();
          updatedProduct.lastUpdatedBy = currentUser.name;

          await dbService.saveProduct(updatedProduct);
          setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));

          // Log transaction edit in system log for audit
          await dbService.addLog(
            'Edit Transaksi',
            currentUser.name,
            `Mengubah jumlah transaksi ${updatedTx.productName} dari ${oldQty} ke ${newQty} unit. Stok disesuaikan kembali (selisih: ${netChange} unit).`
          );

          // Check stock trigger right after update
          await dbService.checkStockLevel(updatedProduct);
          const refreshedAlerts = await dbService.getAlerts();
          setAlerts(refreshedAlerts);
        }
      }

      triggerToast('success', 'Transaksi Diubah', 'Catatan transaksi berhasil diperbaiki.');
    } catch (err: any) {
      console.error(err);
      triggerToast('warn', 'Gagal Mengubah', err.message || 'Ada kesalahan saat mengubah transaksi.');
    }
  };

  const handleEditMultipleTransactions = async (
    originalTxs: Transaction[],
    updatedTxs: Transaction[],
    deletedTxIds: string[]
  ) => {
    try {
      const freshTransactions = await dbService.getTransactions();
      const freshProducts = await dbService.getProducts();
      
      const updatedProductsToSave: Product[] = [];
      const updatedTxsToSave: Transaction[] = [];

      // 1. Process deleted transactions (revert stock impact)
      for (const delId of deletedTxIds) {
        const originalTx = freshTransactions.find(t => t.id === delId) || transactions.find(t => t.id === delId);
        if (!originalTx) continue;

        // Revert product stock
        const product = freshProducts.find(p => p.id === originalTx.productId);
        if (product) {
          let updatedProduct = updatedProductsToSave.find(p => p.id === product.id);
          if (!updatedProduct) {
            updatedProduct = { ...product };
            updatedProductsToSave.push(updatedProduct);
          }
          
          const qtyToRevert = Number(originalTx.qty) || 0;
          const netChange = originalTx.type === 'in' ? -qtyToRevert : qtyToRevert;

          if (updatedProduct.batches && updatedProduct.batches.length > 0) {
            const currentBatches = [...updatedProduct.batches];
            const batchNum = originalTx.batchNumber || updatedProduct.batchNumber;
            const existingIdx = currentBatches.findIndex(b => b.batchNumber === batchNum);
            if (existingIdx !== -1) {
              currentBatches[existingIdx] = {
                ...currentBatches[existingIdx],
                qty: Math.round((currentBatches[existingIdx].qty + netChange) * 10000) / 10000
              };
            }
            updatedProduct.batches = currentBatches;
            const synced = syncProductBatches(updatedProduct);
            updatedProduct.qty = synced.qty;
            updatedProduct.batches = synced.batches;
          } else {
            updatedProduct.qty = Math.round((updatedProduct.qty + netChange) * 10000) / 10000;
          }
          updatedProduct.updatedAt = new Date().toISOString();
          updatedProduct.lastUpdatedBy = currentUser.name;
        }

        // Delete from database
        await dbService.deleteTransaction(delId);
      }

      // 2. Process updated / saved transactions
      for (const updatedTx of updatedTxs) {
        const originalTx = freshTransactions.find(t => t.id === updatedTx.id) || transactions.find(t => t.id === updatedTx.id);
        
        // Save the updated transaction to DB
        await dbService.updateTransaction(updatedTx);
        updatedTxsToSave.push(updatedTx);

        if (originalTx) {
          const oldQty = Number(originalTx.qty) || 0;
          const newQty = Number(updatedTx.qty) || 0;
          const diffQty = newQty - oldQty;

          const product = freshProducts.find(p => p.id === updatedTx.productId);
          if (product) {
            let updatedProduct = updatedProductsToSave.find(p => p.id === product.id);
            if (!updatedProduct) {
              updatedProduct = { ...product };
              updatedProductsToSave.push(updatedProduct);
            }

            if (diffQty !== 0) {
              const netChange = updatedTx.type === 'in' ? diffQty : -diffQty;

              if (updatedProduct.batches && updatedProduct.batches.length > 0) {
                const currentBatches = [...updatedProduct.batches];
                const batchNum = updatedTx.batchNumber || originalTx.batchNumber || updatedProduct.batchNumber;
                const existingIdx = currentBatches.findIndex(b => b.batchNumber === batchNum);

                if (existingIdx !== -1) {
                  currentBatches[existingIdx] = {
                    ...currentBatches[existingIdx],
                    qty: Math.round((currentBatches[existingIdx].qty + netChange) * 10000) / 10000
                  };
                } else if (netChange > 0) {
                  currentBatches.push({
                    id: `batch-adjust-${Date.now()}`,
                    batchNumber: batchNum || 'ADJUSTED',
                    expiryDate: updatedTx.expiryDate || originalTx.expiryDate || updatedProduct.expiryDate || '',
                    qty: netChange,
                    createdAt: new Date().toISOString()
                  });
                }
                updatedProduct.batches = currentBatches;
                const synced = syncProductBatches(updatedProduct);
                updatedProduct.qty = synced.qty;
                updatedProduct.batches = synced.batches;
              } else {
                updatedProduct.qty = Math.round((updatedProduct.qty + netChange) * 10000) / 10000;
              }
            }
            updatedProduct.updatedAt = new Date().toISOString();
            updatedProduct.lastUpdatedBy = currentUser.name;
          }
        } else {
          // It's a newly added item in the edited document!
          const newQty = Number(updatedTx.qty) || 0;
          const product = freshProducts.find(p => p.id === updatedTx.productId);
          if (product && newQty > 0) {
            let updatedProduct = updatedProductsToSave.find(p => p.id === product.id);
            if (!updatedProduct) {
              updatedProduct = { ...product };
              updatedProductsToSave.push(updatedProduct);
            }
            
            const netChange = updatedTx.type === 'in' ? newQty : -newQty;
            
            if (updatedProduct.batches && updatedProduct.batches.length > 0) {
              const currentBatches = [...updatedProduct.batches];
              const batchNum = updatedTx.batchNumber || updatedProduct.batchNumber;
              const existingIdx = currentBatches.findIndex(b => b.batchNumber === batchNum);
              
              if (existingIdx !== -1) {
                currentBatches[existingIdx] = {
                  ...currentBatches[existingIdx],
                  qty: Math.round((currentBatches[existingIdx].qty + netChange) * 10000) / 10000
                };
              } else {
                currentBatches.push({
                  id: `batch-${Date.now()}-${Math.random()}`,
                  batchNumber: batchNum || 'NEW-BATCH',
                  expiryDate: updatedTx.expiryDate || updatedProduct.expiryDate || '',
                  qty: netChange,
                  createdAt: new Date().toISOString()
                });
              }
              updatedProduct.batches = currentBatches;
              const synced = syncProductBatches(updatedProduct);
              updatedProduct.qty = synced.qty;
              updatedProduct.batches = synced.batches;
            } else {
              updatedProduct.qty = Math.round((updatedProduct.qty + netChange) * 10000) / 10000;
            }
            updatedProduct.updatedAt = new Date().toISOString();
            updatedProduct.lastUpdatedBy = currentUser.name;
          }
        }
      }

      // 3. Save all updated products in database and local states
      for (const pToSave of updatedProductsToSave) {
        await dbService.saveProduct(pToSave);
        setProducts(prev => prev.map(p => p.id === pToSave.id ? pToSave : p));
        await dbService.checkStockLevel(pToSave);
      }

      // Update transactions state
      setTransactions(prev => {
        let next = prev.filter(t => !deletedTxIds.includes(t.id));
        next = next.map(t => {
          const found = updatedTxsToSave.find(ut => ut.id === t.id);
          return found ? found : t;
        });
        
        // Append new transactions (which are in updatedTxsToSave but not in prev)
        const existingIds = new Set(prev.map(t => t.id));
        const newTxs = updatedTxsToSave.filter(t => !existingIds.has(t.id));
        return [...next, ...newTxs];
      });

      const refreshedAlerts = await dbService.getAlerts();
      setAlerts(refreshedAlerts);

      await dbService.addLog(
        'Edit Transaksi Multi-Item',
        currentUser.name,
        `Mengoreksi dokumen transaksi. Jumlah item diubah: ${updatedTxs.length}, item dihapus: ${deletedTxIds.length}.`
      );

      triggerToast('success', 'Transaksi Diubah', 'Dokumen transaksi berhasil diperbaiki.');
    } catch (err: any) {
      console.error(err);
      triggerToast('warn', 'Gagal Mengubah', err.message || 'Ada kesalahan saat mengubah transaksi.');
    }
  };

  const handleAdjustStockOpname = async (txId?: string) => {
    try {
      // Find target audit transactions
      let targetTxs: Transaction[] = [];
      if (txId) {
        const found = transactions.find(t => t.id === txId);
        if (found && found.isAudit) {
          targetTxs = [found];
        }
      } else {
        // Adjust all audit transactions that currently have a difference
        targetTxs = transactions.filter(t => t.isAudit && (t.difference ?? 0) !== 0);
      }

      if (targetTxs.length === 0) {
        triggerToast('warn', 'Penyesuaian Stok', 'Tidak ada transaksi stok opname yang perlu disesuaikan.');
        return;
      }

      let updatedProductsList = [...products];
      let updatedTxsList = [...transactions];
      let adjustedCount = 0;

      for (const tx of targetTxs) {
        const physical = tx.physicalQty !== undefined ? tx.physicalQty : tx.qty;
        
        // Find corresponding product
        const pIndex = updatedProductsList.findIndex(
          p => p.id === tx.productId || (p.sku.toLowerCase() === tx.sku.toLowerCase() && p.location.trim().toLowerCase() === (tx.location || '').trim().toLowerCase())
        );

        if (pIndex !== -1) {
          const product = updatedProductsList[pIndex];
          const updatedProduct: Product = {
            ...product,
            qty: physical, // update actual system stock in inventory to physical count
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: currentUser.name
          };
          await dbService.saveProduct(updatedProduct);
          updatedProductsList[pIndex] = updatedProduct;
        }

        // Update the transaction record so systemQty matches physicalQty, difference = 0
        const cleanNote = (tx.note || '').replace(/\s*\(\s*Stok Disesuaikan\s*\)/gi, '').trim();
        const updatedTx: Transaction = {
          ...tx,
          systemQty: physical,
          physicalQty: physical,
          difference: 0,
          qty: physical,
          note: (cleanNote ? cleanNote + ' ' : '') + '(Stok Disesuaikan)'
        };

        await dbService.updateTransaction(updatedTx);
        updatedTxsList = updatedTxsList.map(t => t.id === tx.id ? updatedTx : t);
        adjustedCount++;
      }

      setProducts(updatedProductsList);
      setTransactions(updatedTxsList);

      triggerToast(
        'success',
        'Penyesuaian Stok Berhasil',
        `${adjustedCount} barang telah disesuaikan stoknya. Hasil laporan stok opname kini telah sesuai tanpa selisih.`
      );

      await handleAddLog(
        'Penyesuaian Stok Opname',
        currentUser.name,
        `Melakukan penyesuaian stok opname untuk ${adjustedCount} transaksi barang agar sesuai dengan fisik.`
      );
    } catch (err) {
      console.error('Error adjusting stock opname:', err);
      triggerToast('warn', 'Gagal Penyesuaian', 'Terjadi kesalahan saat menyesuaikan stok opname.');
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    try {
      // Fetch fresh transactions directly from database to avoid stale closure state
      const freshTransactions = await dbService.getTransactions();
      let txToDelete = freshTransactions.find(t => t.id === txId);
      
      if (!txToDelete) {
        txToDelete = transactions.find(t => t.id === txId);
      }
      
      if (!txToDelete) {
        throw new Error('Transaksi tidak ditemukan di database.');
      }

      await dbService.deleteTransaction(txId);
      setTransactions(prev => prev.filter(t => t.id !== txId));
      
      const freshProducts = await dbService.getProducts();
      const product = freshProducts.find(p => p.id === txToDelete.productId);

      if (product) {
        let updatedProduct = { ...product };
        const txQty = Number(txToDelete.qty) || 0;
        
        if (txToDelete.type === 'in') {
          if (product.batches && product.batches.length > 0) {
            const updatedBatches = product.batches.map(b => {
              if (b.batchNumber === txToDelete.batchNumber) {
                return { ...b, qty: Math.round((b.qty - txQty) * 10000) / 10000 };
              }
              return b;
            }).filter(b => b.qty !== 0);
            
            updatedProduct.batches = updatedBatches;
            updatedProduct = syncProductBatches(updatedProduct);
          } else {
            updatedProduct.qty = Math.round((product.qty - txQty) * 10000) / 10000;
          }
        } else if (txToDelete.type === 'out') {
          if (product.batches && product.batches.length > 0) {
            const currentBatches = [...product.batches];
            const existingIdx = currentBatches.findIndex(
              b => b.batchNumber === txToDelete.batchNumber
            );
            if (existingIdx !== -1) {
              currentBatches[existingIdx] = {
                ...currentBatches[existingIdx],
                qty: currentBatches[existingIdx].qty + txQty
              };
            } else {
              currentBatches.push({
                id: `batch-restore-${Date.now()}`,
                batchNumber: txToDelete.batchNumber || 'RESTORED',
                expiryDate: txToDelete.expiryDate || product.expiryDate || '',
                qty: txQty,
                createdAt: new Date().toISOString()
              });
            }
            updatedProduct.batches = currentBatches;
            updatedProduct = syncProductBatches(updatedProduct);
          } else {
            updatedProduct.qty = product.qty + txQty;
          }
        }
        
        updatedProduct.updatedAt = new Date().toISOString();
        updatedProduct.lastUpdatedBy = currentUser.name;
        
        await dbService.saveProduct(updatedProduct);
        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
        
        // Log transaction deletion in system log for audit
        await dbService.addLog(
          'Hapus Transaksi',
          currentUser.name,
          `Menghapus transaksi (${txToDelete.type === 'in' ? 'Masuk' : 'Keluar'}) sebesar ${txQty} unit untuk barang ${product.name}. Stok disesuaikan kembali.`
        );

        // Check stock trigger right after update
        await dbService.checkStockLevel(updatedProduct);
        const refreshedAlerts = await dbService.getAlerts();
        setAlerts(refreshedAlerts);
      }
      
      triggerToast('success', 'Transaksi Dihapus', 'Catatan transaksi telah dihapus dan stok barang serta batch berhasil disesuaikan otomatis.');
    } catch (err: any) {
      console.error(err);
      triggerToast('warn', 'Gagal Menghapus', err.message || 'Ada kesalahan saat menghapus transaksi.');
    }
  };

  const handleDeleteMultipleTransactions = async (txIds: string[]) => {
    try {
      if (!txIds || txIds.length === 0) return;

      // Fetch fresh transactions and products directly from database
      const freshTransactions = await dbService.getTransactions();
      const freshProducts = await dbService.getProducts();

      // Find the transactions to delete
      const txsToDelete = freshTransactions.filter(t => txIds.includes(t.id));
      if (txsToDelete.length === 0) {
        throw new Error('Tidak ada transaksi yang ditemukan untuk dihapus.');
      }

      // Group products to update so we update each product only once in memory first!
      const productUpdatesMap = new Map<string, Product>();

      for (const tx of txsToDelete) {
        const productId = tx.productId;
        // Get the latest state of this product (either from the updates map, or from freshProducts)
        let product = productUpdatesMap.get(productId) || freshProducts.find(p => p.id === productId);

        if (product) {
          let updatedProduct = { ...product };
          const txQty = Number(tx.qty) || 0;

          if (tx.type === 'in') {
            if (product.batches && product.batches.length > 0) {
              const updatedBatches = product.batches.map(b => {
                if (b.batchNumber === tx.batchNumber) {
                  return { ...b, qty: Math.round((b.qty - txQty) * 10000) / 10000 };
                }
                return b;
              }).filter(b => b.qty !== 0);

              updatedProduct.batches = updatedBatches;
              updatedProduct = syncProductBatches(updatedProduct);
            } else {
              updatedProduct.qty = Math.round((product.qty - txQty) * 10000) / 10000;
            }
          } else if (tx.type === 'out') {
            if (product.batches && product.batches.length > 0) {
              const currentBatches = [...product.batches];
              const existingIdx = currentBatches.findIndex(
                b => b.batchNumber === tx.batchNumber
              );
              if (existingIdx !== -1) {
                currentBatches[existingIdx] = {
                  ...currentBatches[existingIdx],
                  qty: currentBatches[existingIdx].qty + txQty
                };
              } else {
                currentBatches.push({
                  id: `batch-restore-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                  batchNumber: tx.batchNumber || 'RESTORED',
                  expiryDate: tx.expiryDate || product.expiryDate || '',
                  qty: txQty,
                  createdAt: new Date().toISOString()
                });
              }
              updatedProduct.batches = currentBatches;
              updatedProduct = syncProductBatches(updatedProduct);
            } else {
              updatedProduct.qty = product.qty + txQty;
            }
          }

          updatedProduct.updatedAt = new Date().toISOString();
          updatedProduct.lastUpdatedBy = currentUser.name;

          // Save the intermediate state
          productUpdatesMap.set(productId, updatedProduct);
        }
      }

      // 1. Delete transactions from database in batch with cross-device tombstone sync
      await dbService.deleteMultipleTransactions(txIds);

      // 2. Save all updated products in a single batch
      const updatedProductsList = Array.from(productUpdatesMap.values());
      await dbService.saveMultipleProducts(updatedProductsList);

      // 3. Log bulk transaction deletion in system logs
      await dbService.addLog(
        'Hapus Transaksi Massal',
        currentUser.name,
        `Menghapus ${txsToDelete.length} log transaksi sekaligus. Stok untuk ${updatedProductsList.length} barang terkait telah disesuaikan kembali.`
      );

      // 4. Update states
      setTransactions(prev => prev.filter(t => !txIds.includes(t.id)));
      setProducts(prev => {
        return prev.map(p => {
          const updated = productUpdatesMap.get(p.id);
          return updated ? updated : p;
        });
      });

      // 5. Check stock levels and refresh alerts
      for (const updatedProd of updatedProductsList) {
        await dbService.checkStockLevel(updatedProd);
      }
      const refreshedAlerts = await dbService.getAlerts();
      setAlerts(refreshedAlerts);

      triggerToast('success', 'Transaksi Massal Dihapus', `${txsToDelete.length} transaksi berhasil dihapus dan persediaan disesuaikan otomatis.`);
    } catch (err: any) {
      console.error(err);
      triggerToast('warn', 'Gagal Menghapus', err.message || 'Ada kesalahan saat menghapus transaksi terpilih.');
    }
  };

  // Add Product (Registering)
  const handleAddProduct = async (productDetails: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'lastUpdatedBy'>) => {
    const newId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const newProduct: Product = {
      ...productDetails,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUpdatedBy: currentUser.name
    };

    await dbService.saveProduct(newProduct);
    
    // Check stock trigger right after registration in case starting stock is already low
    const alertResult = await dbService.checkStockLevel(newProduct);
    const refreshedAlerts = await dbService.getAlerts();
    
    setProducts(prev => {
      // Filter out any existing item with the same ID or same SKU to ensure no duplicates
      const filtered = prev.filter(p => p.id !== newProduct.id && p.sku.toLowerCase() !== newProduct.sku.toLowerCase());
      return [newProduct, ...filtered];
    });
    setAlerts(refreshedAlerts);

    triggerToast(
      'success',
      'Barang Berhasil Didaftarkan',
      `Produk "${newProduct.name}" terdaftar dalam database lokasi rak: ${newProduct.location}`
    );
  };

  // Edit Product
  const handleEditProduct = async (updatedProduct: Product) => {
    await dbService.saveProduct(updatedProduct);
    
    // Check stock level if change of minQty or Qty occurred
    const alertResult = await dbService.checkStockLevel(updatedProduct);
    const refreshedAlerts = await dbService.getAlerts();

    setProducts(prev => prev.map(p => (p.id === updatedProduct.id || p.sku.toLowerCase() === updatedProduct.sku.toLowerCase()) ? updatedProduct : p));
    setAlerts(refreshedAlerts);

    triggerToast(
      'success',
      'Perubahan Ragam Disimpan',
      `Rincian logistik barang "${updatedProduct.name}" rapi dimutakhirkan.`
    );
  };

  // Delete Product Permanent
  const handleDeleteProduct = async (id: string) => {
    await dbService.deleteProduct(id);
    
    setProducts(prev => prev.filter(p => p.id !== id));
    // Filter corresponding critical stock alerts as well
    setAlerts(prev => prev.filter(a => a.productId !== id));

    triggerToast(
      'success',
      'Catatan Dihapus Permanen',
      `Data barang dilepas secara tuntas dari sistem audit.`
    );
  };

  // Bulk Delete Products Permanent
  const handleBulkDeleteProducts = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    await dbService.deleteMultipleProducts(ids);
    const idSet = new Set(ids);
    setProducts(prev => prev.filter(p => !idSet.has(p.id)));
    setAlerts(prev => prev.filter(a => !idSet.has(a.productId)));

    triggerToast(
      'success',
      'Data Barang Dihapus Massal',
      `${ids.length} data barang berhasil dihapus sekaligus dari sistem.`
    );
  };

  // Clear or read all notifications
  const handleMarkAlertsAsRead = async () => {
    await dbService.markAlertAllAsRead();
    const refreshedAlerts = await dbService.getAlerts();
    setAlerts(refreshedAlerts);
    triggerToast(
      'success',
      'Seluruh Notifikasi Dibaca',
      'Semua draf peringatan minimum stok berhasil dialihkan ke kondisi terbaca.'
    );
  };

  // Update User Role administratively
  const handleUpdateUserRole = async (userId: string, newRole: Role) => {
    let updatedUserToPersist: User | null = null;
    setSystemUsers(prev => {
      const peer = prev.find(u => u.role === newRole && u.id !== userId);
      const permissions = peer ? { ...peer.permissions } : {
        canAddProduct: newRole === 'admin',
        canEditProduct: newRole === 'admin' || newRole === 'supervisor',
        canDeleteProduct: newRole === 'admin',
        canRecordTransaction: true,
        canViewReports: newRole === 'admin' || newRole === 'supervisor',
        canManageUsers: newRole === 'admin'
      };

      return prev.map(user => {
        if (user.id === userId) {
          const updatedUser = { ...user, role: newRole, permissions };
          updatedUserToPersist = updatedUser;
          
          // If editing ourselves, update current user too
          if (user.id === currentUser.id) {
            setCurrentUser(updatedUser);
          }
          return updatedUser;
        }
        return user;
      });
    });

    if (updatedUserToPersist) {
      await dbService.saveUser(updatedUserToPersist);
    }

    triggerToast(
      'success',
      'Perubahan Peran Berhasil',
      'Izin otorisasi petugas gudang dimutakhirkan rapi.'
    );
  };

  // Update User Location administratively
  const handleUpdateUserLocation = async (userId: string, newLocation: string) => {
    let updatedUserToPersist: User | null = null;
    setSystemUsers(prev => {
      return prev.map(user => {
        if (user.id === userId) {
          const updatedUser = { ...user, location: newLocation };
          updatedUserToPersist = updatedUser;
          if (user.id === currentUser.id) {
            setCurrentUser(updatedUser);
          }
          return updatedUser;
        }
        return user;
      });
    });

    if (updatedUserToPersist) {
      await dbService.saveUser(updatedUserToPersist);
    }

    triggerToast(
      'success',
      'Lokasi Kerja Diperbarui',
      'Lokasi akses fisik petugas berhasil disesuaikan.'
    );
  };

  // Add system user profile
  const handleAddSystemUser = async (userDetails: Omit<User, 'id'> & { permissions?: User['permissions'] }) => {
    const isEmailExistent = systemUsers.some(u => u.email.trim().toLowerCase() === userDetails.email.trim().toLowerCase());
    if (isEmailExistent) {
      alert('Email ini sudah terdaftar untuk petugas lain!');
      return;
    }

    const newId = `u-${Date.now()}`;
    const peer = systemUsers.find(u => u.role === userDetails.role);
    const permissions = userDetails.permissions || (peer ? { ...peer.permissions } : {
      canAddProduct: userDetails.role === 'admin',
      canEditProduct: userDetails.role === 'admin' || userDetails.role === 'supervisor',
      canDeleteProduct: userDetails.role === 'admin',
      canRecordTransaction: true,
      canViewReports: userDetails.role === 'admin' || userDetails.role === 'supervisor',
      canManageUsers: userDetails.role === 'admin',
      canViewDashboard: true,
      canViewDataBarang: true,
      canViewTransaksi: true,
      canViewLaporan: userDetails.role === 'admin' || userDetails.role === 'supervisor',
      canViewPengaturan: userDetails.role === 'admin',
      canImportCSV: userDetails.role === 'admin' || userDetails.role === 'supervisor',
      canExportCSV: true,
      canPrintProduct: true,
      canRecordBarangMasuk: true,
      canRecordBarangKeluar: true,
      canPerformAudit: userDetails.role === 'admin' || userDetails.role === 'supervisor',
      canEditTransaction: userDetails.role === 'admin' || userDetails.role === 'supervisor',
      canDeleteTransaction: userDetails.role === 'admin'
    });

    const newUser: User = {
      ...userDetails,
      id: newId,
      permissions,
      password: userDetails.password
    };

    if (userDetails.password) {
      localStorage.setItem(`user_password_${newId}`, userDetails.password);
    }

    setSystemUsers(prev => [...prev, newUser]);
    await dbService.saveUser(newUser);

    triggerToast('success', 'Petugas Terdaftar', `Akun ${newUser.name} ditambahkan sebagai ${newUser.role.toUpperCase()}`);
    handleAddLog('Registrasi Petugas Baru', currentUser.name, `Mendaftarkan personil ${newUser.name} (${newUser.role})`);
  };

  const handleUpdateSystemUser = async (updatedUser: User) => {
    setSystemUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    
    // If updating ourselves, update current user too
    if (updatedUser.id === currentUser.id) {
       setCurrentUser(updatedUser);
    }

    await dbService.saveUser(updatedUser);

    triggerToast(
      'success',
      'Detail Petugas Diperbarui',
      `Data akun ${updatedUser.name} berhasil dimodifikasi.`
    );
    handleAddLog('Update Data Petugas', currentUser.name, `Mengubah rincian akun ${updatedUser.name}`);
  };

  // Toggle a single permission for all users under a specific role
  const handleToggleRolePermission = async (role: Role, permissionKey: keyof User['permissions']) => {
    const usersToPersist: User[] = [];
    setSystemUsers(prev => {
      const firstUserWithRole = prev.find(user => user.role === role);
      if (!firstUserWithRole) return prev;

      let currentVal = firstUserWithRole.permissions[permissionKey];
      if (currentVal === undefined) {
        if (permissionKey === 'canViewDashboard' || permissionKey === 'canViewDataBarang' || permissionKey === 'canViewTransaksi') {
          currentVal = true;
        } else if (permissionKey === 'canViewLaporan') {
          currentVal = role !== 'staff';
        } else if (permissionKey === 'canViewPengaturan') {
          currentVal = role === 'admin';
        } else {
          currentVal = false;
        }
      }

      const targetVal = !currentVal;

      const updated = prev.map(user => {
        if (user.role === role) {
          const updatedUser = {
            ...user,
            permissions: {
              ...user.permissions,
              [permissionKey]: targetVal
            }
          };
          usersToPersist.push(updatedUser);
          if (user.id === currentUser.id) {
            setCurrentUser(updatedUser);
          }
          return updatedUser;
        }
        return user;
      });
      return updated;
    });

    for (const u of usersToPersist) {
      await dbService.saveUser(u);
    }

    triggerToast(
      'success',
      'Matriks Otorisasi Diperbarui',
      `Hak akses ${permissionKey} untuk peran ${role.toUpperCase()} berhasil dimodifikasi.`
    );
    handleAddLog('Matriks Otorisasi Diperbarui', currentUser.name, `Mengubah izin ${permissionKey} untuk peran ${role.toUpperCase()}`);
  };

  const handleDeleteSystemUser = async (userId: string) => {
    setSystemUsers(prev => prev.filter(u => u.id !== userId));
    await dbService.deleteUser(userId);
    triggerToast('success', 'Akses Dicabut', 'Akun petugas resmi dilepas dari sistem otorisasi.');
  };

  const handleResetSystem = async () => {
    try {
      await storageRemove('gudang_products');
      await storageRemove('gudang_transactions');
      await storageRemove('gudang_alerts');
      
      setProducts([]);
      setTransactions([]);
      setAlerts([]);
      
      await handleAddLog('Factory Reset Sistem', currentUser.name, 'Melakukan penghapusan total seluruh data produk dan transaksi.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestoreSystem = async (data: { products: Product[]; transactions: Transaction[] }) => {
    try {
      await storageSet('gudang_products', data.products);
      await storageSet('gudang_transactions', data.transactions);
      
      setProducts(data.products);
      setTransactions(data.transactions);
      
      // Regenerate alerts for critical products
      const newAlerts: StockAlert[] = data.products
        .filter(p => p.qty <= p.minQty)
        .map(p => ({
          id: `alert-${p.id}-${Date.now()}`,
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          qty: p.qty,
          minQty: p.minQty,
          timestamp: new Date().toISOString(),
          isRead: false
        }));
      
      await storageSet('gudang_alerts', newAlerts);
      setAlerts(newAlerts);
      
      await handleAddLog('Restorasi Backup', currentUser.name, `Memulihkan database cadangan dengan total ${data.products.length} produk.`);
    } catch (e) {
      console.error(e);
    }
  };

  // Nav side links (reactive based on user role and permissions)
  const navigationMenuItems = useMemo(() => {
    const baseMenuItems = [
      { id: 'dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
      { id: 'inventaris', label: 'DATA BARANG', icon: Warehouse },
      { id: 'transaksi', label: 'TRANSAKSI', icon: History },
      { id: 'laporan', label: 'LAPORAN', icon: FileSpreadsheet, badge: 'PDF/XLS' },
      { id: 'pengaturan', label: 'PENGATURAN', icon: Settings },
    ];

    return baseMenuItems.filter(item => {
      if (!currentUser.permissions) return true;
      switch (item.id) {
        case 'dashboard':
          return currentUser.permissions.canViewDashboard !== false;
        case 'inventaris':
          return currentUser.permissions.canViewDataBarang !== false;
        case 'transaksi':
          return currentUser.permissions.canViewTransaksi !== false;
        case 'laporan':
          return currentUser.permissions.canViewLaporan !== false;
        case 'pengaturan':
          return currentUser.permissions.canViewPengaturan !== undefined 
            ? !!currentUser.permissions.canViewPengaturan 
            : currentUser.role === 'admin';
        default:
          return true;
      }
    });
  }, [currentUser]);

  // Automatic tab redirection based on permissions and allowed navigation menu items
  useEffect(() => {
    const allowedTabIds = navigationMenuItems.map(item => item.id);
    if (allowedTabIds.length > 0 && !allowedTabIds.includes(currentTab)) {
      if (['bom', 'menu-list'].includes(currentTab) && allowedTabIds.includes('inventaris')) {
        return;
      }
      if (['barcode', 'produksi'].includes(currentTab) && (allowedTabIds.includes('transaksi') || allowedTabIds.includes('inventaris'))) {
        return;
      }
      setCurrentTab(allowedTabIds[0]);
    }
  }, [currentUser, currentTab, navigationMenuItems]);

  const handleAddBOM = async (bom: BOM, productData?: { sku: string; qty: number; minQty: number; category: string }) => {
    try {
      await dbService.saveBOM(bom);
      const updated = await dbService.getBOMs();
      setBoms(updated);
      await handleAddLog('Tambah BOM', currentUser.name, `Berhasil mendaftarkan BOM baru: ${bom.name}`);

      if (productData) {
        // Create matching finished product so it appears in normal inventory and supports transaction in/out/audit
        const existingProduct = products.find(p => 
          p.name.trim().toLowerCase() === bom.name.trim().toLowerCase() && 
          p.location.trim().toLowerCase() === bom.location.trim().toLowerCase()
        );
        const prodId = existingProduct?.id || `prod-bom-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const newProduct: Product = {
          id: prodId,
          name: bom.name,
          sku: productData.sku || existingProduct?.sku || `BOM-${Date.now()}`,
          description: `Produk Jadi rakitan dari formulasi BOM: ${bom.name}`,
          category: productData.category || existingProduct?.category || 'Hasil BOM',
          qty: productData.qty,
          minQty: productData.minQty,
          location: bom.location,
          price: bom.totalCost,
          unit: bom.yieldUnit || 'Unit',
          purchaseUnit: bom.yieldUnit || 'Unit',
          recipeUnit: bom.yieldUnit || 'Unit',
          conversionFactor: 1,
          unitPrice: bom.totalCost,
          createdAt: existingProduct?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastUpdatedBy: currentUser.name
        };

        await dbService.saveProduct(newProduct);
        
        // Record starting stock transaction ledger if new product starting stock > 0
        if (!existingProduct && productData.qty > 0) {
          await dbService.addTransaction({
            id: `tx-${Date.now()}-init-${prodId}`,
            productId: prodId,
            productName: newProduct.name,
            sku: newProduct.sku,
            type: 'in',
            qty: productData.qty,
            note: `Saldo Awal Produk BOM "${bom.name}"`,
            date: new Date().toISOString(),
            operatorName: currentUser.name,
            operatorRole: currentUser.role,
            unit: newProduct.unit,
            location: newProduct.location || bom.location || 'Rak A-01'
          });
        }

        const refreshedProducts = await dbService.getProducts();
        const refreshedTransactions = await dbService.getTransactions();
        setProducts(refreshedProducts);
        setTransactions(refreshedTransactions);
      }
    } catch (e: any) {
      console.error('Error adding BOM:', e);
      alert(`Gagal menambah BOM: ${e.message || 'Error tidak diketahui'}`);
    }
  };

  const handleDeleteBOM = async (id: string) => {
    try {
      const bomToDelete = (boms || []).find(b => b && b.id === id);
      await dbService.deleteBOM(id);
      const updated = await dbService.getBOMs();
      setBoms(updated);
      if (bomToDelete) {
        await handleAddLog('Hapus BOM', currentUser.name, `Menghapus data BOM: ${bomToDelete.name}`);
      }
    } catch (e: any) {
      console.error('Error deleting BOM:', e);
      alert(`Gagal menghapus BOM: ${e.message || 'Error tidak diketahui'}`);
    }
  };

  const handleUpdateBOM = async (bom: BOM, productData?: { sku: string; qty: number; minQty: number; category: string }) => {
    try {
      await dbService.saveBOM(bom);
      const updated = await dbService.getBOMs();
      setBoms(updated);
      await handleAddLog('Update BOM', currentUser.name, `Memperbarui data BOM: ${bom.name}`);

      if (productData) {
        const existingProduct = products.find(p => 
          p.name.trim().toLowerCase() === bom.name.trim().toLowerCase() && 
          p.location.trim().toLowerCase() === bom.location.trim().toLowerCase()
        );
        const prodId = existingProduct?.id || `prod-bom-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const oldQty = existingProduct?.qty ?? 0;
        const mainQty = productData.qty;

        const newProduct: Product = {
          id: prodId,
          name: bom.name,
          sku: productData.sku || existingProduct?.sku || `BOM-${Date.now()}`,
          description: `Produk Jadi rakitan dari formulasi BOM: ${bom.name}`,
          category: productData.category || existingProduct?.category || 'Hasil BOM',
          qty: mainQty,
          minQty: productData.minQty,
          location: bom.location,
          price: bom.totalCost,
          unit: bom.yieldUnit || 'Unit',
          purchaseUnit: bom.yieldUnit || 'Unit',
          recipeUnit: bom.yieldUnit || 'Unit',
          conversionFactor: 1,
          unitPrice: bom.totalCost,
          createdAt: existingProduct?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastUpdatedBy: currentUser.name
        };

        await dbService.saveProduct(newProduct);

        // Adjust stock and log ledger if different
        if (mainQty !== oldQty) {
          const diff = mainQty - oldQty;
          await dbService.addTransaction({
            id: `tx-${Date.now()}-diff-${prodId}`,
            productId: prodId,
            productName: newProduct.name,
            sku: newProduct.sku,
            type: diff > 0 ? 'in' : 'out',
            qty: Math.abs(diff),
            note: `Penyesuaian Manual Stok BOM "${bom.name}"`,
            date: new Date().toISOString(),
            operatorName: currentUser.name,
            operatorRole: currentUser.role,
            unit: newProduct.unit,
            location: newProduct.location || bom.location || 'Rak A-01'
          });
        }

        const refreshedProducts = await dbService.getProducts();
        const refreshedTransactions = await dbService.getTransactions();
        setProducts(refreshedProducts);
        setTransactions(refreshedTransactions);
      }
    } catch (e: any) {
      console.error('Error updating BOM:', e);
      alert(`Gagal memperbarui BOM: ${e.message || 'Error tidak diketahui'}`);
    }
  };

  const handleProduceBOM = async (bom: BOM, batchCount: number, requirements: { productId: string, qty: number }[]) => {
    try {
      // 1. Decrease stocks of materials
      for (const req of requirements) {
        const product = products.find(p => p.id === req.productId);
        if (product) {
          const newQty = product.qty - req.qty;
          await dbService.saveProduct({ ...product, qty: newQty });
          
          // Record transaction log for material usage
          await dbService.addTransaction({
            id: `tx-${Date.now()}-${req.productId}`,
            productId: req.productId,
            productName: product.name,
            sku: product.sku,
            type: 'out',
            qty: req.qty,
            note: `Penggunaan Produksi BOM: ${bom.name} (Batch: ${batchCount})`,
            date: new Date().toISOString(),
            operatorName: currentUser.name,
            operatorRole: currentUser.role,
            unit: product.unit,
            location: product.location || 'Rak A-01'
          });
        }
      }

      // 2. Increase stock of finished good (BOM result)
      // Search for product with same name AND location as BOM
      const finishedGood = products.find(p => 
        p.name.trim().toLowerCase() === bom.name.trim().toLowerCase() && 
        p.location.trim().toLowerCase() === bom.location.trim().toLowerCase()
      );

      const totalYield = bom.yieldQty * batchCount;

      if (finishedGood) {
        const newQty = finishedGood.qty + totalYield;
        await dbService.saveProduct({ ...finishedGood, qty: newQty });
        
        // Record transaction log for material production
        await dbService.addTransaction({
          id: `tx-${Date.now()}-prod-${bom.id}`,
          productId: finishedGood.id,
          productName: finishedGood.name,
          sku: finishedGood.sku,
          type: 'in',
          qty: totalYield,
          note: `Hasil Produksi BOM: ${bom.name} (Batch: ${batchCount})`,
          date: new Date().toISOString(),
          operatorName: currentUser.name,
          operatorRole: currentUser.role,
          unit: finishedGood.unit,
          location: finishedGood.location || bom.location || 'Rak A-01'
        });
      } else {
        // Option: if target product doesn't exist, we might want to warn the user 
        // but for now, let's log that product was not updated in inventory but logs are kept
        console.warn(`Produk jadi "${bom.name}" tidak ditemukan di lokasi "${bom.location}". Stok produk jadi tidak diperbarui.`);
        throw new Error(`Produk "<b>${bom.name}</b>" belum terdaftar di daftar barang untuk lokasi "<b>${bom.location}</b>". Harap daftarkan produk terlebih dahulu agar stoknya bisa bertambah otomatis.`);
      }

      // 3. Refresh states
      const refreshedProducts = await dbService.getProducts();
      const refreshedTransactions = await dbService.getTransactions();
      setProducts(refreshedProducts);
      setTransactions(refreshedTransactions);
      
      await handleAddLog('Produksi BOM', currentUser.name, `Proses Produksi ${bom.name} sebanyak ${batchCount} batch (${totalYield} ${bom.yieldUnit})`);
    } catch (error) {
      console.error("Production error:", error);
      throw error;
    }
  };

  const handleSaveMenu = async (menu: MenuItem) => {
    try {
      await dbService.saveMenu(menu);
      const updated = await dbService.getMenus();
      setMenus(updated);
      await handleAddLog('Save Menu', currentUser.name, `Menyimpan data Menu: ${menu.name}`);
    } catch (e: any) {
      console.error('Error saving menu:', e);
      alert(`Gagal menyimpan menu: ${e.message || 'Error tidak diketahui'}`);
    }
  };

  const handleDeleteMenu = async (id: string) => {
    try {
      const menuToDelete = (menus || []).find(m => m && m.id === id);
      await dbService.deleteMenu(id);
      const updated = await dbService.getMenus();
      setMenus(updated);
      if (menuToDelete) {
        await handleAddLog('Hapus Menu', currentUser.name, `Menghapus data Menu: ${menuToDelete.name}`);
      }
    } catch (e: any) {
      console.error('Error deleting menu:', e);
      alert(`Gagal menghapus menu: ${e.message || 'Error tidak diketahui'}`);
    }
  };

  const isUserRestricted = useMemo(() => {
    if (currentUser.role === 'admin') return false;
    if (!currentUser.location) return false;
    const locs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return !locs.includes('semua gudang');
  }, [currentUser]);

  const accessibleProducts = useMemo(() => {
    if (!isUserRestricted || !currentUser.location) return products;
    const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return products.filter(p => p.location && userLocs.includes(p.location.trim().toLowerCase()));
  }, [products, isUserRestricted, currentUser.location]);

  const accessibleAlerts = useMemo(() => {
    let list = alerts || [];
    if (isUserRestricted && currentUser.location) {
      const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
      list = list.filter(a => {
        // If alert has location, use it. Otherwise, find product and check its location.
        if (a.location) {
          return userLocs.includes(a.location.trim().toLowerCase());
        }
        const product = products.find(p => p.id === a.productId);
        return product && product.location && userLocs.includes(product.location.trim().toLowerCase());
      });
    }
    return list;
  }, [alerts, isUserRestricted, currentUser.location, products]);

  const criticalProducts = useMemo(() => {
    return (accessibleProducts || []).filter(p => p && p.qty <= p.minQty);
  }, [accessibleProducts]);

  // Automatic Device Screen Pop-up for Critical Stock on initial session load / login
  useEffect(() => {
    if (isLoggedIn && criticalProducts.length > 0 && !hasAutoOpenedCriticalModal) {
      setShowCriticalModal(true);
      setHasAutoOpenedCriticalModal(true);
      
      // Fire background / device native pop-up notification
      sendBackgroundNotification('🚨 PERINGATAN STOK KRITIS!', {
        body: `Terdeteksi ${criticalProducts.length} barang berada pada atau di bawah batas stok minimum.`
      });
    }
  }, [isLoggedIn, criticalProducts.length, hasAutoOpenedCriticalModal]);

  if (!isLoggedIn) {
    return (
      <LoginPage
        systemUsers={systemUsers}
        onLoginSuccess={handleLoginSuccess}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        appTitle={appTitle}
        appLogo={appLogo}
        onGoogleLoginSuccess={handleGoogleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-gray-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-200">
      
      {/* Dynamic Header Navbar widget */}
      <Navbar
        currentUser={currentUser}
        onUserChange={handleUserChange}
        systemUsers={systemUsers}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        alerts={accessibleAlerts}
        onMarkAlertsAsRead={handleMarkAlertsAsRead}
        currentTab={currentTab}
        onChangeTab={setCurrentTab}
        onLogout={handleLogout}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenCriticalModal={() => setShowCriticalModal(true)}
        appTitle={appTitle}
        appLogo={appLogo}
        onOpenAccountSettings={() => setShowAccountSettingsModal(true)}
        isGoogleConnected={isGoogleConnected}
      />

      {/* Main Container Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        
        {/* Navigation Top Bar */}
        {isSidebarOpen && (
          <nav className="w-full animate-in fade-in duration-200">
            <div className="p-2 sm:p-2.5 rounded-2xl border border-zinc-200/95 dark:border-zinc-900 bg-white/95 dark:bg-zinc-900/40 backdrop-blur-md flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2 overflow-x-auto py-0.5 no-scrollbar flex-1">
                {navigationMenuItems.map((item) => {
                  // Hide tabs if admin-only and we are not admin
                  if ((item as any).roleLimit === 'admin' && currentUser.role !== 'admin') {
                    return null;
                  }

                  const Icon = item.icon;
                  const isActive = currentTab === item.id || (item.id === 'inventaris' && ['bom', 'menu-list'].includes(currentTab));

                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentTab(item.id)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold select-none transition-all cursor-pointer shrink-0 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none font-sans font-medium'
                          : 'text-gray-600 dark:text-zinc-350 hover:bg-gray-100/70 dark:hover:bg-zinc-805/45 hover:text-zinc-950 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>

                      {/* Render optional custom badge counters */}
                      {item.id === 'inventaris' && products.filter(p => p.qty <= p.minQty).length > 0 && (
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                      )}

                      {item.badge && (
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${isActive ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        )}

        {/* Workspace Space Column 2 */}
        <main className="flex-1 min-w-0 bg-transparent pb-24 md:pb-6 animate-in fade-in duration-300">
          
          {/* Dashboard Tab */}
          {currentTab === 'dashboard' && (
            <Dashboard
              products={products}
              transactions={transactions}
              alerts={alerts}
              onChangeTab={setCurrentTab}
              onIntentChange={setScannerIntent}
              currentUser={currentUser}
              transfers={transfers}
              onApproveTransfer={handleApproveTransfer}
              onRejectTransfer={handleRejectTransfer}
            />
          )}

          {/* Inventory Manager Tab */}
          {currentTab === 'inventaris' && (
            <InventoryManager
              products={products}
              currentUser={currentUser}
              onAddProduct={handleAddProduct}
              onEditProduct={handleEditProduct}
              onDeleteProduct={handleDeleteProduct}
              onBulkDeleteProducts={handleBulkDeleteProducts}
              onAddLog={handleAddLog}
              categoriesList={categoriesList}
              locationsList={locationsList}
            />
          )}

          {/* Barcode Scanner Tab */}
          {currentTab === 'barcode' && (
            <BarcodeScanner
              products={products}
              currentUser={currentUser}
              onRecordStockChange={handleRecordStockChange}
              onInitiateTransfer={handleInitiateTransfer}
              onRecordMultipleChanges={handleRecordMultipleChanges}
              onAddLog={handleAddLog}
              initialIntent={scannerIntent}
              onClose={() => setCurrentTab('transaksi')}
              locationsList={locationsList}
              boms={boms}
            />
          )}

          {/* Transactions History Logs Tab */}
          {currentTab === 'transaksi' && (
            <TransactionHistory
              transactions={transactions}
              products={products}
              currentUser={currentUser}
              onChangeTab={setCurrentTab}
              onIntentChange={setScannerIntent}
              onEditTransaction={handleEditTransaction}
              onEditMultipleTransactions={handleEditMultipleTransactions}
              onDeleteTransaction={handleDeleteTransaction}
              onDeleteMultipleTransactions={handleDeleteMultipleTransactions}
              onAdjustStockOpname={handleAdjustStockOpname}
              locationsList={locationsList}
            />
          )}

          {/* Report Exporter View */}
          {currentTab === 'laporan' && (
            <ReportExporter
              products={products}
              transactions={transactions}
              alerts={alerts}
              currentUser={currentUser}
              boms={boms}
              menus={menus}
            />
          )}

          {/* Production Manager (BOM Production) */}
          {currentTab === 'produksi' && (
            <ProductionManager
                boms={boms}
                products={products}
                currentUser={currentUser}
                onProduce={handleProduceBOM}
                onClose={() => setCurrentTab('transaksi')}
            />
          )}

          {/* Admin Settings Page Tab */}
          {currentTab === 'pengaturan' && (
            (currentUser.role === 'admin' || currentUser.permissions?.canManageUsers) ? (
              <AdminSettings
                products={products}
                transactions={transactions}
                alerts={alerts}
                onResetSystem={handleResetSystem}
                onRestoreSystem={handleRestoreSystem}
                triggerToast={triggerToast}
                systemUsers={systemUsers}
                currentUser={currentUser}
                onUpdateUserRole={handleUpdateUserRole}
                onUpdateUserLocation={handleUpdateUserLocation}
                onAddSystemUser={handleAddSystemUser}
                onDeleteSystemUser={handleDeleteSystemUser}
                onToggleRolePermission={handleToggleRolePermission}
                onUpdateSystemUser={handleUpdateSystemUser}
                categoriesList={categoriesList}
                locationsList={locationsList}
                onUpdateCategories={handleUpdateCategories}
                onUpdateLocations={handleUpdateLocations}
                onOpenAccountSettings={() => setShowAccountSettingsModal(true)}
              />
            ) : (
              <UserPasswordSettings
                currentUser={currentUser}
                triggerToast={triggerToast}
              />
            )
          )}

        </main>

      </div>

      {/* Responsive Bottom Navigation Bar (Mobile / Cellphone viewports ONLY - Touch friendly ≥ 44px) */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-45 bg-zinc-950/90 dark:bg-zinc-950/95 border-t border-zinc-200 dark:border-zinc-900 backdrop-blur-xl px-1 py-1 px-2 print:hidden">
        <nav className="flex justify-around items-center h-16">
          {navigationMenuItems.map((item) => {
            // Check if user has permission for this tab
            if ((item as any).roleLimit === 'admin' && currentUser.role !== 'admin') {
              return null;
            }

            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex flex-col items-center justify-center flex-1 h-14 text-center select-none cursor-pointer transition-all duration-300 ${
                  isActive 
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold scale-105' 
                    : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
                style={{ minWidth: '56px' }}
              >
                <div className="relative mb-1">
                  <Icon className={`w-5 h-5 mx-auto transition-transform ${isActive ? 'scale-110' : ''}`} />
                  {item.id === 'inventaris' && accessibleProducts.filter(p => p.qty <= p.minQty).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-white dark:border-zinc-950"></span>
                  )}
                </div>
                <span className="text-[8.5px] font-medium tracking-tight truncate w-full px-1">{item.label}</span>
                {isActive && (
                  <span 
                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </footer>

      {/* Floating Global Systems Notification Toast Alert Drawer (Bottom-Right, print hidden) */}
      {toast && (
        <div 
          id="system-floating-toast"
          className={`fixed bottom-20 md:bottom-6 right-4 z-50 p-4 rounded-xl border shadow-2xl flex items-start gap-3 w-80 sm:w-96 animate-in slide-in-from-bottom-5 duration-300 print:hidden ${
            toast.type === 'warn'
              ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40 text-rose-900 dark:text-rose-100'
              : 'bg-white border-gray-150 dark:bg-zinc-900 dark:border-zinc-800 text-gray-900 dark:text-white'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${
            toast.type === 'warn' 
              ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-505' 
              : 'bg-indigo-50 dark:bg-zinc-800 text-indigo-600'
          }`}>
            {toast.type === 'warn' ? (
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
            )}
          </div>
          
          <div className="flex-1 text-left">
            <p className="font-extrabold text-xs leading-none">{toast.title}</p>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1.5 leading-tight">{toast.desc}</p>
          </div>

          <button 
            onClick={() => setToast(null)}
            className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pop-up Layar Device Modal untuk Stok Kritis */}
      <CriticalStockModal
        isOpen={showCriticalModal}
        onClose={() => setShowCriticalModal(false)}
        criticalProducts={criticalProducts}
        onNavigateToStockIn={(prodId) => {
          setCurrentTab('transaksi');
          setScannerIntent('in');
        }}
        onNavigateToInventory={() => setCurrentTab('inventaris')}
      />

      {/* Pop-Up Modal Pengaturan Akun Admin & Branding */}
      <AccountSettingsModal
        isOpen={showAccountSettingsModal}
        onClose={() => setShowAccountSettingsModal(false)}
        currentUser={currentUser}
        appTitle={appTitle}
        appLogo={appLogo}
        onSaveBranding={handleSaveBranding}
        onUpdatePassword={handleUpdateAdminPassword}
        triggerToast={triggerToast}
      />

    </div>
  );
}

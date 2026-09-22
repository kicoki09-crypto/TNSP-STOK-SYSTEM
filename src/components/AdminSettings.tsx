/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Warehouse, 
  Database, 
  Download, 
  Upload, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  ShieldAlert,
  Clipboard,
  ClipboardCheck,
  Building,
  UserCheck,
  Bell,
  Users as UsersIcon,
  Tags,
  MapPin,
  Trash2,
  Plus,
  ChevronDown
} from 'lucide-react';
import { Product, Transaction, StockAlert, User, Role } from '../types';
import { isSupabaseConfigured, dbService, SQL_SCHEMA_BLUEPRINT, SQL_DECIMAL_MIGRATION, SQL_FIX_TRANSACTION_RLS } from '../lib/databaseService';
import { saveSharedSheetsConfig } from '../lib/googleSheetsService';
import UserControl from './UserControl';

interface AdminSettingsProps {
  products: Product[];
  transactions: Transaction[];
  alerts: StockAlert[];
  onResetSystem: () => void;
  onRestoreSystem: (data: { products: Product[]; transactions: Transaction[] }) => void;
  triggerToast: (type: 'success' | 'warn', title: string, desc: string) => void;
  systemUsers: User[];
  currentUser: User;
  onUpdateUserRole: (userId: string, newRole: Role) => void;
  onUpdateUserLocation: (userId: string, newLocation: string) => void;
  onAddSystemUser: (user: Omit<User, 'id' | 'permissions'>) => void;
  onDeleteSystemUser: (userId: string) => void;
  onToggleRolePermission: (role: Role, permissionKey: keyof User['permissions']) => void;
  onUpdateSystemUser: (user: User) => void;
  categoriesList?: string[];
  locationsList?: string[];
  onUpdateCategories?: (categories: string[]) => void;
  onUpdateLocations?: (locations: string[]) => void;
  onOpenAccountSettings?: () => void;
}

export default function AdminSettings({
  products,
  transactions,
  alerts,
  onResetSystem,
  onRestoreSystem,
  triggerToast,
  systemUsers,
  currentUser,
  onUpdateUserRole,
  onUpdateUserLocation,
  onAddSystemUser,
  onDeleteSystemUser,
  onToggleRolePermission,
  onUpdateSystemUser,
  categoriesList,
  locationsList,
  onUpdateCategories,
  onUpdateLocations,
  onOpenAccountSettings
}: AdminSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'akses' | 'kategori-lokasi' | 'notifikasi'>('profile');
  
  // Category & Location states
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  
  // Warehouse Profile setup
  const [warehouseName, setWarehouseName] = useState(() => {
    return localStorage.getItem('cfg_warehouse_name') || 'TNSP SYSTEM Utama';
  });
  const [warehouseCode, setWarehouseCode] = useState(() => {
    return localStorage.getItem('cfg_warehouse_code') || 'WH-TNSP-01';
  });
  const [managerName, setManagerName] = useState(() => {
    return localStorage.getItem('cfg_manager_name') || 'Administrator Utama';
  });
  const [activeRegion, setActiveRegion] = useState(() => {
    return localStorage.getItem('cfg_active_region') || 'Jakarta Pusat';
  });

  // State to handle visual action loadings
  const [isSaving, setIsSaving] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedDecimalSql, setCopiedDecimalSql] = useState(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState(false);

  // States for expandable/collapsible settings sections
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [isBackupExpanded, setIsBackupExpanded] = useState(false);
  const [isDbExpanded, setIsDbExpanded] = useState(false);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(false);
  const [isLocationsExpanded, setIsLocationsExpanded] = useState(false);
  const [isGoogleSheetExpanded, setIsGoogleSheetExpanded] = useState(false);
  const [appsScriptUrl, setAppsScriptUrl] = useState(() => {
    return localStorage.getItem('gudang_apps_script_url') || '';
  });
  const [copiedAppsScript, setCopiedAppsScript] = useState(false);
  const [isSyncingColumns, setIsSyncingColumns] = useState(false);

  // Push Notification States
  const [notifTitle, setNotifTitle] = useState('🔔 TNSP SYSTEM: Peringatan Stok!');
  const [notifBody, setNotifBody] = useState('Barang "AC AQUA 1PK" berada di bawah batas minimum (Sektor B-2).');
  const [notifDelay, setNotifDelay] = useState(10); // 10 seconds
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');

  useEffect(() => {
    if (!('Notification' in window)) {
      setPermissionStatus('unsupported');
    } else {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  const handleRequestNotifPermissionLocal = async () => {
    if (!('Notification' in window)) return;
    try {
      const status = await Notification.requestPermission();
      setPermissionStatus(status);
      if (status === 'granted') {
        triggerToast('success', 'Izin Aktif ✓', 'Perangkat Anda sekarang diizinkan menerima notifikasi latar belakang.');
      }
    } catch (err) {
      console.warn('Gagal meminta izin notifikasi', err);
    }
  };

  const handleScheduleTestNotif = () => {
    if (permissionStatus !== 'granted') {
      triggerToast('warn', 'Izin Diperlukan', 'Harap aktifkan izin notifikasi sistem terlebih dahulu.');
      return;
    }

    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      // Direct notification if no active controller (fallback)
      setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(notifTitle, {
            body: notifBody,
            icon: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
          });
        }
      }, notifDelay * 1000);
      
      setIsScheduled(true);
      setCountdown(notifDelay);
      triggerToast('success', 'Menggunakan Simpatisan Lokal', `Service Worker belum online, menggunakan timeout browser. Jangan tutup tab.`);
      return;
    }

    // Send postMessage to sw.js to deliver even when tab is fully closed!
    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_NOTIFICATION',
      title: notifTitle,
      body: notifBody,
      delay: notifDelay * 1000
    });

    setIsScheduled(true);
    setCountdown(notifDelay);
    triggerToast('success', 'Notifikasi Latar Belakang Dijadwalkan', `Berhasil! Sekarang Anda dapat MENUTUP total tab aplikasi ini. Tunggu ${notifDelay} detik.`);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setIsScheduled(false);
      setCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);


  // Auto-save settings on change helper or standard button
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    setTimeout(() => {
      try {
        localStorage.setItem('cfg_warehouse_name', warehouseName);
        localStorage.setItem('cfg_warehouse_code', warehouseCode);
        localStorage.setItem('cfg_manager_name', managerName);
        localStorage.setItem('cfg_active_region', activeRegion);
      } catch (err) {
        console.warn('Gagal menyimpan konfigurasi aplikasi ke local storage', err);
      }
      
      setIsSaving(false);
      triggerToast('success', 'Konfigurasi Diperbarui', 'Semua pengaturan profil dan kebijakan gudang berhasil disimpan.');
    }, 800);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categoriesList?.map(c => c.toLowerCase()).includes(trimmed.toLowerCase())) {
      triggerToast('warn', 'Kategori Duplikat', 'Kategori barang tersebut sudah terdaftar di sistem.');
      return;
    }
    const updated = [...(categoriesList || []), trimmed];
    if (onUpdateCategories) {
      onUpdateCategories(updated);
      triggerToast('success', 'Kategori Ditambahkan', `Kategori "${trimmed}" berhasil didaftarkan.`);
      setNewCategoryName('');
    }
  };

  const handleDeleteCategory = (categoryToRemove: string) => {
    const updated = (categoriesList || []).filter(c => c !== categoryToRemove);
    if (onUpdateCategories) {
      onUpdateCategories(updated);
      triggerToast('success', 'Kategori Dihapus', `Kategori "${categoryToRemove}" telah dihapus.`);
    }
  };

  const handleAddLocation = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLocationName.trim();
    if (!trimmed) return;
    if (locationsList?.map(l => l.toLowerCase()).includes(trimmed.toLowerCase())) {
      triggerToast('warn', 'Lokasi Duplikat', 'Sektor atau rak tersebut sudah terdaftar di sistem.');
      return;
    }
    const updated = [...(locationsList || []), trimmed];
    if (onUpdateLocations) {
      onUpdateLocations(updated);
      triggerToast('success', 'Lokasi Ditambahkan', `Sektor/rak "${trimmed}" berhasil didaftarkan.`);
      setNewLocationName('');
    }
  };

  const handleDeleteLocation = (locationToRemove: string) => {
    const updated = (locationsList || []).filter(l => l !== locationToRemove);
    if (onUpdateLocations) {
      onUpdateLocations(updated);
      triggerToast('success', 'Lokasi Dihapus', `Sektor/rak "${locationToRemove}" telah dihapus.`);
    }
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    try {
      const backupPayload = {
        metadata: {
          generatedAt: new Date().toISOString(),
          version: 'v2.8-enterprise',
          warehouseCode: warehouseCode,
          warehouseName: warehouseName,
          totalProducts: products.length,
          totalTransactions: transactions.length
        },
        products,
        transactions
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupPayload, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `backup-tnsp-${warehouseCode.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      triggerToast('success', 'Backup Berhasil', 'Unduhan file backup JSON dimulai.');
    } catch (err) {
      triggerToast('warn', 'Ekspor Gagal', 'Gagal memproses data enkripsi backup.');
    }
  };

  // Import JSON Restore
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;

    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.transactions)) {
          onRestoreSystem({
            products: parsed.products,
            transactions: parsed.transactions
          });
          triggerToast('success', 'Restorasi Berhasil', `Memuat ulang ${parsed.products.length} produk dan ${parsed.transactions.length} riwayat.`);
        } else {
          triggerToast('warn', 'Format Tidak Sesuai', 'File JSON tidak memiliki struktur produk dan transaksi TNSP SYSTEM.');
        }
      } catch (err) {
        triggerToast('warn', 'Gagal Membaca File', 'File backup cacat atau korup.');
      }
    };
    fileReader.readAsText(files[0]);
  };

  const executeSystemWipe = () => {
    onResetSystem();
    setIsResetConfirmOpen(false);
    triggerToast('success', 'Sistem Direset', 'Semua records inventaris dan logs telah dikosongkan.');
  };

  const handleCopySqlBlueprint = () => {
    navigator.clipboard.writeText(SQL_SCHEMA_BLUEPRINT);
    setCopiedSql(true);
    triggerToast('success', 'Salin Kode', 'Blueprint SQL Supabase disalin ke clipboard.');
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleCopyDecimalMigration = () => {
    navigator.clipboard.writeText(SQL_DECIMAL_MIGRATION);
    setCopiedDecimalSql(true);
    triggerToast('success', 'Salin Migrasi Desimal', 'Skrip SQL Migrasi NUMERIC disalin ke clipboard.');
    setTimeout(() => setCopiedDecimalSql(false), 2000);
  };

  const handleCopyRlsSql = () => {
    navigator.clipboard.writeText(SQL_FIX_TRANSACTION_RLS);
    setCopiedRlsSql(true);
    triggerToast('success', 'Salin Izin RLS', 'Skrip Izin Hapus & Edit Transaksi disalin ke clipboard.');
    setTimeout(() => setCopiedRlsSql(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md">
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
          <Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <span>Menu Pengaturan Akun & Sistem (Role Admin)</span>
        </h2>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
          Kelola konfigurasi sistem logistik, hak akses personil, serta identitas aplikasi (Logo, Judul, Password Admin).
        </p>
      </div>

      {/* Subtab Navigation */}
      <div className="flex border-b border-gray-150 dark:border-zinc-850 gap-1 mt-2 overflow-x-auto no-scrollbar items-center">
        <button
          type="button"
          onClick={() => setActiveSubTab('profile')}
          className={`px-4 py-3 border-b-2 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'profile'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-sans'
              : 'border-transparent text-gray-550 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-zinc-850/30'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Profil & Sistem</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('akses')}
          className={`px-4 py-3 border-b-2 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'akses'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-sans'
              : 'border-transparent text-gray-550 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-zinc-850/30'
          }`}
        >
          <UsersIcon className="w-4 h-4" />
          <span>Izin Akses & Personil</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('kategori-lokasi')}
          className={`px-4 py-3 border-b-2 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'kategori-lokasi'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-sans'
              : 'border-transparent text-gray-550 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-zinc-850/30'
          }`}
        >
          <Tags className="w-4 h-4" />
          <span>Kategori & Penempatan</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('notifikasi')}
          className={`px-4 py-3 border-b-2 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'notifikasi'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-sans'
              : 'border-transparent text-gray-550 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-zinc-850/30'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Push Notifikasi & PWA</span>
        </button>

        {onOpenAccountSettings && (
          <button
            type="button"
            id="btn-pengaturan-akun-admin"
            onClick={onOpenAccountSettings}
            className="ml-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer my-1"
            title="Pengaturan Akun & Branding Aplikasi (Ganti Logo, Judul, Password)"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Pengaturan Akun Admin</span>
          </button>
        )}
      </div>

      {activeSubTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
          
          {/* Left Column: Config Profile form */}
          <div className="lg:col-span-7 space-y-6">

            {/* Quick Action Card: Pengaturan Akun Admin */}
            {onOpenAccountSettings && (
              <div className="bg-gradient-to-r from-indigo-900 via-zinc-900 to-indigo-950 p-5 rounded-3xl border border-indigo-500/20 shadow-lg text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                      Akun Admin Full
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">
                    Pengaturan Akun & Identity Branding
                  </h3>
                  <p className="text-xs text-indigo-200/80">
                    Ubah Logo Aplikasi, Judul Header Aplikasi, dan Kata Sandi (Password) Admin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAccountSettings}
                  className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-2 cursor-pointer"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>Buka Pengaturan Akun</span>
                </button>
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md overflow-hidden">
              <button
                type="button"
                onClick={() => setIsProfileExpanded(!isProfileExpanded)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4.5 h-4.5 text-indigo-500" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-gray-900 dark:text-white">Profil & Identitas Operasional</h3>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">Konfigurasi nama, kode registrasi, dan wilayah kerja gudang utama</p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isProfileExpanded ? 'rotate-180' : ''}`} />
              </button>
              
              {isProfileExpanded && (
                <div className="border-t border-gray-100 dark:border-zinc-850 animate-in fade-in duration-200">
                  <div className="p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-gray-400" /> Nama Gudang Utama
                        </label>
                        <input
                          type="text"
                          required
                          value={warehouseName}
                          onChange={(e) => setWarehouseName(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400 flex items-center gap-1">
                          <Warehouse className="w-3.5 h-3.5 text-gray-400" /> Kode Unik Gudang / Registrasi
                        </label>
                        <input
                          type="text"
                          required
                          value={warehouseCode}
                          onChange={(e) => setWarehouseCode(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono text-indigo-600 dark:text-indigo-400 tracking-wider font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-gray-400" /> Penanggung Jawab Logistik (PJ)
                        </label>
                        <input
                          type="text"
                          required
                          value={managerName}
                          onChange={(e) => setManagerName(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400 flex items-center gap-1">
                          <Warehouse className="w-3.5 h-3.5 text-gray-400" /> Daerah / Wilayah Kerja
                        </label>
                        <input
                          type="text"
                          required
                          value={activeRegion}
                          onChange={(e) => setActiveRegion(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-gray-50/50 dark:bg-zinc-950 border-t border-gray-100 dark:border-zinc-850 flex gap-2 justify-end">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Simpan Pengaturan</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>

            {/* Backup & Restore Panel */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md overflow-hidden">
              <button
                type="button"
                onClick={() => setIsBackupExpanded(!isBackupExpanded)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4.5 h-4.5 text-indigo-500" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-gray-900 dark:text-white">Ekspor & Impor Data Inventaris</h3>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-0.5">Ekspor/impor seluruh basis data produk & transaksi</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 tracking-wider hidden sm:inline">Lokal / JSON Backup</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isBackupExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isBackupExpanded && (
                <div className="border-t border-gray-100 dark:border-zinc-850 p-6 space-y-5 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Export button */}
                    <button
                      type="button"
                      onClick={handleExportBackup}
                      className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-150/50 dark:border-indigo-900/45 text-left hover:border-indigo-500 dark:hover:border-indigo-500 group transition-all cursor-pointer"
                    >
                      <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-bold text-gray-900 dark:text-white">Unduh Backup JSON</p>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-1 leading-normal font-sans">
                        Arsipkan {products.length} barang & {transactions.length} riwayat mutasi sebagai berkas `.json`.
                      </p>
                    </button>

                    {/* Import/Restore Dropzone */}
                    <div className="relative p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/40 border border-dashed border-gray-200 dark:border-zinc-800 text-left hover:border-indigo-500 dark:hover:border-zinc-700 transition-all cursor-pointer">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportBackup}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="w-5 h-5 text-gray-400 dark:text-zinc-550 mb-2" />
                      <p className="text-xs font-bold text-gray-900 dark:text-white">Unggah Berkas Restorasi</p>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-1 leading-normal font-sans">
                        Pilih file backup `.json` sebelumnya untuk memulihkan seluruh data pergudangan.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Database state & SQL, factory reset */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Google Sheets Web App Connection Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md overflow-hidden">
              <button
                type="button"
                onClick={() => setIsGoogleSheetExpanded(!isGoogleSheetExpanded)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4.5 h-4.5 text-emerald-500" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-gray-900 dark:text-white">Koneksi Google Sheets (Apps Script)</h3>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-0.5">Sinkronisasi otomatis untuk semua petugas (termasuk login manual)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shrink-0 ${
                    appsScriptUrl 
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100' 
                      : 'bg-zinc-50 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800'
                  }`}>
                    {appsScriptUrl ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isGoogleSheetExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isGoogleSheetExpanded && (
                <div className="border-t border-gray-100 dark:border-zinc-850 p-6 space-y-5 animate-in fade-in duration-200">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 dark:text-zinc-300">Link Web App URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={appsScriptUrl}
                        onChange={(e) => setAppsScriptUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        onClick={async () => {
                          const cleanUrl = appsScriptUrl.trim();
                          localStorage.setItem('gudang_apps_script_url', cleanUrl);
                          
                          // Save shared Google Sheets config globally to Firestore so it applies to all users
                          const currentSpreadsheetId = localStorage.getItem('gudang_google_sheets_db_id') || '';
                          await saveSharedSheetsConfig(cleanUrl, currentSpreadsheetId);

                          if (cleanUrl) {
                            triggerToast('success', 'Tersimpan ✓', 'Koneksi Google Sheets Web App berhasil diperbarui & dibagikan ke semua user!');
                          } else {
                            localStorage.removeItem('gudang_apps_script_url');
                            triggerToast('warn', 'Terhapus', 'Koneksi Google Sheets Web App dinonaktifkan.');
                          }
                          // Refresh page to apply changes
                          setTimeout(() => window.location.reload(), 1500);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                      >
                        Simpan
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-550 leading-relaxed">
                      Masukkan URL Web App hasil deployment Google Apps Script dari Google Sheet Anda agar semua operator (baik login Google maupun manual) dapat menyimpan data secara real-time.
                    </p>

                    {/* Sync Sheet Column Structure Button */}
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled={isSyncingColumns}
                        onClick={async () => {
                          try {
                            setIsSyncingColumns(true);
                            await dbService.syncProductsToSheet(products);
                            triggerToast('success', 'Kolom Diperbarui ✓', 'Kolom "imageUrl" (Foto Barang) berhasil ditambahkan & disinkronkan ke Google Sheet!');
                          } catch (e: any) {
                            triggerToast('warn', 'Perhatian', e?.message || 'Gagal menyinkronkan kolom. Pastikan Web App URL aktif.');
                          } finally {
                            setIsSyncingColumns(false);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-850/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all cursor-pointer shadow-sm active:scale-98 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingColumns ? 'animate-spin' : ''}`} />
                        <span>{isSyncingColumns ? 'Memperbarui Kolom Sheet...' : 'Sinkronkan Struktur Kolom (Tambah Kolom Foto / imageUrl)'}</span>
                      </button>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-1.5 text-center">
                        Klik tombol di atas untuk memastikan baris 1 Google Sheet Anda memiliki kolom <b>imageUrl</b> sehingga foto barang tersimpan permanen.
                      </p>
                    </div>
                  </div>

                  {/* Apps Script Code Copy Card */}
                  <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-zinc-850">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 tracking-wider">KODE GOOGLE APPS SCRIPT</span>
                      <button
                        onClick={() => {
                          const code = `function doGet(e) {
  var params = e.parameter;
  var action = params.action;
  var sheetName = params.sheetName;
  var response = { success: false, values: [] };
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    var headers = getHeaders(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      if (headers) sheet.appendRow(headers);
    } else if (headers) {
      // Auto-heal missing header columns
      var lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        var firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        for (var h = 0; h < headers.length; h++) {
          if (firstRow.indexOf(headers[h]) === -1) {
            sheet.getRange(1, lastCol + 1).setValue(headers[h]);
            lastCol++;
          }
        }
      }
    }
    
    if (action === "read") {
      var lastRow = sheet.getLastRow();
      var lastColumn = sheet.getLastColumn();
      if (lastRow > 0 && lastColumn > 0) {
        var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
        response.values = values.map(function(row) {
          return row.map(function(cell) {
            if (cell instanceof Date) return cell.toISOString();
            return cell;
          });
        });
      }
      response.success = true;
    }
  } catch (err) {
    response.error = err.toString();
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var response = { success: false };
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var sheetName = postData.sheetName;
    var values = postData.values;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    var headers = getHeaders(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      if (headers) sheet.appendRow(headers);
    }
    
    if (action === "clear") {
      sheet.clear();
      if (headers) sheet.appendRow(headers);
      response.success = true;
    } else if (action === "append") {
      if (values && values.length > 0) {
        if (Array.isArray(values[0])) {
          for (var r = 0; r < values.length; r++) {
            sheet.appendRow(values[r]);
          }
        } else {
          sheet.appendRow(values);
        }
      }
      response.success = true;
    } else if (action === "overwrite") {
      sheet.clear();
      if (values && values.length > 0) {
        sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
      }
      response.success = true;
    }
  } catch (err) {
    response.error = err.toString();
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function getHeaders(sheetName) {
  var config = {
    Products: ['id', 'name', 'sku', 'description', 'category', 'qty', 'minQty', 'location', 'price', 'unit', 'purchaseUnit', 'recipeUnit', 'conversionFactor', 'unitPrice', 'expiryDate', 'batchNumber', 'imageUrl', 'createdAt', 'updatedAt', 'lastUpdatedBy'],
    Transactions: ['id', 'productId', 'productName', 'sku', 'type', 'qty', 'note', 'date', 'operatorName', 'operatorRole', 'isAudit', 'systemQty', 'physicalQty', 'difference', 'location', 'expiryDate', 'batchNumber'],
    Categories: ['id', 'name'],
    Locations: ['id', 'name'],
    Users: ['id', 'name', 'email', 'role', 'password', 'avatarUrl', 'location', 'permissions'],
    Transfers: ['id', 'productId', 'productName', 'productSku', 'qty', 'originWarehouse', 'targetWarehouse', 'status', 'date', 'requestedBy', 'approvedBy', 'approvedDate'],
    BOMs: ['id', 'name', 'location', 'yieldQty', 'yieldUnit', 'items', 'totalCost', 'createdAt'],
    Menus: ['id', 'name', 'unit', 'location', 'category', 'ingredients', 'totalHpp', 'createdAt']
  };
  return config[sheetName] || null;
}`;
                          navigator.clipboard.writeText(code);
                          setCopiedAppsScript(true);
                          triggerToast('success', 'Tersalin ✓', 'Kode Google Apps Script berhasil disalin!');
                          setTimeout(() => setCopiedAppsScript(false), 3000);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer animate-pulse"
                      >
                        {copiedAppsScript ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Clipboard className="w-3.5 h-3.5" />}
                        <span>{copiedAppsScript ? 'Tersalin!' : 'Salin Kode Script'}</span>
                      </button>
                    </div>

                    <div className="rounded-2xl bg-zinc-950 p-4 border border-zinc-900">
                      <pre className="text-[10px] font-mono text-zinc-350 max-h-48 overflow-y-auto leading-relaxed scrollbar-thin">
{`function doGet(e) {
  var params = e.parameter;
  var action = params.action;
  var sheetName = params.sheetName;
  var response = { success: false, values: [] };
  // ... (salin kode lengkap melalui tombol di atas)
}`}
                      </pre>
                    </div>

                    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-gray-150 dark:border-zinc-800 text-[11px] text-gray-600 dark:text-zinc-400 space-y-1.5 leading-relaxed">
                      <p className="font-bold text-gray-800 dark:text-zinc-200">Cara Memasang di Google Sheets:</p>
                      <ol className="list-decimal list-inside space-y-1 text-[10.5px]">
                        <li>Buka Google Sheet Anda yang ingin dijadikan database.</li>
                        <li>Klik menu <b>Extensions</b> &gt; <b>Apps Script</b>.</li>
                        <li>Hapus semua kode bawaan lalu tempelkan kode yang Anda salin dari tombol di atas.</li>
                        <li>Klik ikon <b>Save</b> (Disket).</li>
                        <li>Klik tombol <b>Deploy</b> &gt; <b>New Deployment</b>.</li>
                        <li>Klik ikon gerigi di sebelah "Select type" lalu pilih <b>Web App</b>.</li>
                        <li>Ubah "Execute as" menjadi <b>Me (email Anda)</b>.</li>
                        <li>Ubah "Who has access" menjadi <b>Anyone</b> (Sangat penting!).</li>
                        <li>Klik <b>Deploy</b> dan setujui izin Google jika diminta.</li>
                        <li>Salin link <b>Web App URL</b> yang dihasilkan dan tempelkan di input kolom di atas!</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cloud Database Integration Info */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md overflow-hidden">
              <button
                type="button"
                onClick={() => setIsDbExpanded(!isDbExpanded)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4.5 h-4.5 text-indigo-500" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-gray-900 dark:text-white">Integrasi Cloud Database</h3>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-0.5">Setup & monitoring status sinkronisasi server awan</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shrink-0 ${
                    isSupabaseConfigured 
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100' 
                      : 'bg-zinc-50 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800'
                  }`}>
                    {isSupabaseConfigured ? 'CONNECTED' : 'LOCAL'}
                  </span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isDbExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isDbExpanded && (
                <div className="border-t border-gray-100 dark:border-zinc-850 p-6 space-y-5 animate-in fade-in duration-200">
                  {/* Quick Decimal Migration Card */}
                  <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-150 dark:border-indigo-900/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-[9px] uppercase tracking-wider">
                          Fitur Kuantitas Desimal
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          Migrasi Kolom NUMERIC Supabase
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyDecimalMigration}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        {copiedDecimalSql ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-300" /> : <Clipboard className="w-3.5 h-3.5" />}
                        <span>{copiedDecimalSql ? 'Tersalin ke Clipboard!' : 'Salin Skrip Desimal'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 leading-relaxed">
                      Jalankan skrip 9 baris berikut di <b>SQL Editor</b> Supabase untuk mengonversi kolom kuantitas stok & transaksi menjadi tipe <code className="px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-mono text-[10px]">NUMERIC</code> agar mendukung angka koma/pecahan (0.5, 1.25, dll).
                    </p>
                    <div className="rounded-xl bg-zinc-950 p-3 border border-zinc-900">
                      <pre className="text-[10px] font-mono text-emerald-400 max-h-28 overflow-y-auto leading-relaxed scrollbar-thin">
                        {SQL_DECIMAL_MIGRATION}
                      </pre>
                    </div>
                  </div>

                  {/* Fix Transaction RLS Policy Card */}
                  <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-bold text-[9px] uppercase tracking-wider">
                          Sinkronisasi & Izin RLS
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          Izin Hapus & Edit Transaksi Supabase
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyRlsSql}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        {copiedRlsSql ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-300" /> : <Clipboard className="w-3.5 h-3.5" />}
                        <span>{copiedRlsSql ? 'Tersalin ke Clipboard!' : 'Salin Skrip Izin RLS'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 leading-relaxed">
                      Jalankan skrip 4 baris ini di <b>SQL Editor</b> Supabase untuk mengaktifkan izin <code>DELETE</code> dan <code>UPDATE</code> pada tabel transaksi. Aplikasi juga telah dilengkapi mekanisme <i>Dual-Layer Tombstone Sync</i> otomatis agar penghapusan & pengeditan dari satu perangkat langsung lenyap/terupdate di seluruh perangkat lain secara <i>real-time</i>.
                    </p>
                    <div className="rounded-xl bg-zinc-950 p-3 border border-zinc-900">
                      <pre className="text-[10px] font-mono text-amber-400 max-h-28 overflow-y-auto leading-relaxed scrollbar-thin">
                        {SQL_FIX_TRANSACTION_RLS}
                      </pre>
                    </div>
                  </div>

                  {/* Step instructions code copy */}
                  <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 tracking-wider">SKRIP LENGKAP BOOTSTRAP (OPSIONAL)</span>
                      <button
                        onClick={handleCopySqlBlueprint}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {copiedSql ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Clipboard className="w-3.5 h-3.5" />}
                        <span>{copiedSql ? 'Tersalin' : 'Salin Skrip Lengkap'}</span>
                      </button>
                    </div>
                    <div className="relative rounded-2xl bg-zinc-950 p-4 border border-zinc-900 overflow-hidden">
                      <pre className="text-[10px] font-mono text-zinc-350 max-h-40 overflow-y-auto leading-relaxed scrollbar-thin">
                        {SQL_SCHEMA_BLUEPRINT}
                      </pre>
                      <p className="text-[9px] font-sans text-right text-zinc-500 mt-2">
                        Jalankan kode skrip di atas pada menu *SQL Editor* panel Supabase Anda jika ingin setup ulang seluruh tabel.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {activeSubTab === 'akses' && (
        <div className="animate-in fade-in duration-200">
          <UserControl
            systemUsers={systemUsers}
            currentUser={currentUser}
            onUpdateUserRole={onUpdateUserRole}
            onUpdateUserLocation={onUpdateUserLocation}
            onAddSystemUser={onAddSystemUser}
            onDeleteSystemUser={onDeleteSystemUser}
            onToggleRolePermission={onToggleRolePermission}
            onUpdateSystemUser={onUpdateSystemUser}
            locations={locationsList}
          />
        </div>
      )}

      {activeSubTab === 'kategori-lokasi' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200 mt-6 pb-6">
          {/* CATEGORIES MANAGEMENT CARD */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md overflow-hidden h-fit">
            <button
              type="button"
              onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Tags className="w-4.5 h-4.5 text-indigo-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-gray-901 dark:text-white">Daftar Kategori Barang</h3>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-0.5">Atur & tambah kategori pengelompokan produk logistik</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isCategoriesExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isCategoriesExpanded && (
              <div className="p-6 space-y-6 border-t border-gray-100 dark:border-zinc-850 animate-in fade-in duration-200">
                {/* Form Tambah Kategori */}
                <form onSubmit={handleAddCategory} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nama kategori baru... (e.g. Aksesoris)"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md active:translate-y-0 cursor-pointer select-none shrink-0"
                  >
                    <Plus className="w-4.5 h-4.5" />
                    <span>Tambah</span>
                  </button>
                </form>

                {/* List */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {categoriesList && categoriesList.length > 0 ? (
                    categoriesList.map(cat => {
                      const matchedProductsCount = products.filter(p => p.category.toLowerCase() === cat.toLowerCase()).length;
                      const canDelete = matchedProductsCount === 0;

                      return (
                        <div
                          key={cat}
                          className="p-3 bg-gray-50/50 dark:bg-zinc-950/40 rounded-2xl border border-gray-100 dark:border-zinc-850 flex items-center justify-between gap-4 text-xs group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                              <Tags className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="font-bold text-gray-901 dark:text-zinc-100">{cat}</span>
                              <span className="block text-[10px] text-gray-400 dark:text-zinc-550 font-mono mt-0.5 font-sans">
                                {matchedProductsCount} Barang terdaftar
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!canDelete}
                            onClick={() => handleDeleteCategory(cat)}
                            title={canDelete ? "Hapus kategori" : "Kategori masih digunakan oleh barang"}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              canDelete
                                ? 'border-gray-200 hover:border-red-500/50 hover:bg-red-50 hover:text-red-600 dark:border-zinc-805 dark:hover:bg-red-950/20 dark:hover:text-red-400 text-gray-400 dark:text-zinc-500 bg-white dark:bg-zinc-950'
                                : 'border-transparent text-gray-305 dark:text-zinc-700 cursor-not-allowed opacity-40'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-gray-400 text-xs font-sans">Belum ada kategori yang terdaftar</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* LOCATIONS MANAGEMENT CARD */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md overflow-hidden h-fit">
            <button
              type="button"
              onClick={() => setIsLocationsExpanded(!isLocationsExpanded)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4.5 h-4.5 text-indigo-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-gray-901 dark:text-white">Daftar Penempatan / Sektor</h3>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-0.5">Atur & tambah plot lokasi rak penempatan barang</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isLocationsExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isLocationsExpanded && (
              <div className="p-6 space-y-6 border-t border-gray-100 dark:border-zinc-850 animate-in fade-in duration-200">
                {/* Form Tambah Lokasi */}
                <form onSubmit={handleAddLocation} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nama rak/sektor baru... (e.g. Sektor F-12)"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md active:translate-y-0 cursor-pointer select-none shrink-0"
                  >
                    <Plus className="w-4.5 h-4.5" />
                    <span>Tambah</span>
                  </button>
                </form>

                {/* List */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {locationsList && locationsList.length > 0 ? (
                    locationsList.map(loc => {
                      const matchedProductsCount = products.filter(p => p.location.toLowerCase() === loc.toLowerCase()).length;
                      const matchedUsersCount = systemUsers.filter(u => u.location && u.location.toLowerCase() === loc.toLowerCase()).length;
                      const isReservedDefault = loc === 'Semua Gudang';
                      const canDelete = matchedProductsCount === 0 && matchedUsersCount === 0 && !isReservedDefault;

                      return (
                        <div
                          key={loc}
                          className="p-3 bg-gray-50/50 dark:bg-zinc-950/40 rounded-2xl border border-gray-100 dark:border-zinc-850 flex items-center justify-between gap-4 text-xs group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                              <MapPin className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="font-bold text-gray-901 dark:text-zinc-100">{loc}</span>
                              <span className="block text-[10px] text-gray-400 dark:text-zinc-550 font-mono mt-0.5 font-sans">
                                {matchedProductsCount} Barang • {matchedUsersCount} Personil
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!canDelete}
                            onClick={() => handleDeleteLocation(loc)}
                            title={isReservedDefault ? "Wajib sistem" : canDelete ? "Hapus lokasi" : "Lokasi masih digunakan oleh barang/staff"}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              canDelete
                                ? 'border-gray-200 hover:border-red-500/50 hover:bg-red-50 hover:text-red-600 dark:border-zinc-805 dark:hover:bg-red-950/20 dark:hover:text-red-400 text-gray-400 dark:text-zinc-500 bg-white dark:bg-zinc-950'
                                : 'border-transparent text-gray-305 dark:text-zinc-700 cursor-not-allowed opacity-40'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-gray-400 text-xs font-sans">Belum ada lokasi penempatan terdaftar</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'notifikasi' && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md p-6 sm:p-8 space-y-6 animate-in fade-in duration-200 mt-2">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-zinc-850 pb-5">
            <div className="space-y-1">
              <h3 className="font-sans font-bold text-lg text-gray-901 dark:text-white flex items-center gap-2">
                <Bell className="w-5.5 h-5.5 text-indigo-500" />
                <span>Teknologi Web Push & PWA (WhatsApp-style)</span>
              </h3>
              <p className="text-xs text-gray-550 dark:text-zinc-400">
                Memungkinkan pengiriman notifikasi instan langsung ke perangkat Anda, bahkan jika tab dan browser sudah ditutup.
              </p>
            </div>
            
            {/* Status Permission Badges */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-mono tracking-wider">IZIN NOTIFIKASI:</span>
              {permissionStatus === 'granted' ? (
                <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-750 dark:text-emerald-400 rounded-lg text-xs font-bold">
                  AKTIF ✓
                </span>
              ) : permissionStatus === 'denied' ? (
                <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/40 text-rose-750 dark:text-rose-450 rounded-lg text-xs font-bold">
                  DIBLOKIR ⚠️
                </span>
              ) : permissionStatus === 'unsupported' ? (
                <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-lg text-xs font-bold">
                  TIDAK DIDUKUNG
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestNotifPermissionLocal}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  Izinkan Notifikasi
                </button>
              )}
            </div>
          </div>

          {/* Explanation Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-indigo-50/30 dark:bg-zinc-950/35 rounded-2xl border border-indigo-100/40 dark:border-zinc-850/70 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-150/40 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                1
              </div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Service Worker Aktif</h4>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">
                Service Worker (`sw.js`) terdaftar di peramban dan berjalan secara independen di latar belakang sistem operasi perangkat Anda.
              </p>
            </div>

            <div className="p-4 bg-indigo-50/30 dark:bg-zinc-950/35 rounded-2xl border border-indigo-100/40 dark:border-zinc-850/70 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-150/40 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                2
              </div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Web Push API Protocol</h4>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">
                Menggunakan standar Web Push yang menghubungkan browser dengan layanan push perangkat (FCM/WNS/APNs) untuk menyalurkan notifikasi.
              </p>
            </div>

            <div className="p-4 bg-indigo-50/30 dark:bg-zinc-950/35 rounded-2xl border border-indigo-100/40 dark:border-zinc-850/70 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-150/40 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                3
              </div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Push saat Tab Tertutup</h4>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">
                Saat push server mengirim data, OS akan membangunkan Service Worker secara otomatis untuk memicu pop-up notifikasi suara dan getar.
              </p>
            </div>
          </div>

          {/* Interactive Simulator Card */}
          <div className="bg-zinc-50 dark:bg-zinc-950/30 rounded-2xl border border-gray-150 dark:border-zinc-850 p-6 space-y-5">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                Simulator Push Notifikasi Latar Belakang
              </h4>
              <p className="text-[11px] text-gray-500 dark:text-zinc-450">
                Uji kemampuan Service Worker dengan menjadwalkan notifikasi tunda, lalu tutup tab aplikasi ini secara total untuk membuktikannya!
              </p>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-gray-550 dark:text-zinc-400">Judul Notifikasi</label>
                <input
                  type="text"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-1 md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-gray-550 dark:text-zinc-400">Isi Pesan Notifikasi</label>
                <input
                  type="text"
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-gray-200/50 dark:border-zinc-850/50">
              {/* Delay selection */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-gray-600 dark:text-zinc-400 shrink-0">Waktu Tunda (Sesi Tes):</span>
                <div className="flex gap-1.5">
                  {[5, 10, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      disabled={isScheduled}
                      onClick={() => setNotifDelay(sec)}
                      className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-all border cursor-pointer ${
                        notifDelay === sec
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-zinc-950 text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-zinc-850 hover:border-indigo-400'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={isScheduled || permissionStatus !== 'granted'}
                onClick={handleScheduleTestNotif}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10 cursor-pointer select-none transition-all active:scale-[0.98]"
              >
                {isScheduled ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mundur: {countdown} Detik...</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    <span>Jadwalkan & Tes Tutup Browser</span>
                  </>
                )}
              </button>
            </div>

            {/* Simulated Live Countdown Banner */}
            {isScheduled && (
              <div className="p-4 bg-indigo-500 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
                <div className="space-y-1 text-center sm:text-left">
                  <p className="text-xs font-extrabold uppercase tracking-widest font-sans">Pemberitahuan Terjadwal Diaktifkan!</p>
                  <p className="text-[10px] opacity-90 leading-relaxed font-sans">
                    Langkah Pembuktian: <strong>Tutup tab browser ini sekarang juga!</strong> Dalam {countdown} detik, notifikasi sistem akan muncul di pojok desktop/HP Anda secara mandiri.
                  </p>
                </div>
                <div className="text-3xl font-mono font-black shrink-0 px-4 py-2 bg-indigo-700/50 rounded-xl">
                  {countdown}s
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Warehouse, 
  Bell, 
  Sun, 
  Moon, 
  Database, 
  ShieldAlert, 
  ChevronDown, 
  User as UserIcon, 
  LogOut,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Menu,
  Settings
} from 'lucide-react';
import { User, StockAlert } from '../types';
import { isSupabaseConfigured } from '../lib/databaseService';
import { requestNotificationPermission, getNotificationPermissionStatus } from '../lib/pushNotification';

interface NavbarProps {
  currentUser: User;
  onUserChange: (user: User) => void;
  systemUsers: User[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  alerts: StockAlert[];
  onMarkAlertsAsRead: () => void;
  currentTab: string;
  onChangeTab: (tab: string) => void;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
  onOpenCriticalModal?: () => void;
  appTitle?: string;
  appLogo?: string;
  onOpenAccountSettings?: () => void;
  isGoogleConnected?: boolean;
}

export default function Navbar({
  currentUser,
  onUserChange,
  systemUsers,
  darkMode,
  onToggleDarkMode,
  alerts,
  onMarkAlertsAsRead,
  currentTab,
  onChangeTab,
  onLogout,
  onToggleSidebar,
  onOpenCriticalModal,
  appTitle = 'TNSP SYSTEM',
  appLogo = 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
  onOpenAccountSettings,
  isGoogleConnected = false
}: NavbarProps) {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [notifPermission, setNotifPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>(() => {
    return getNotificationPermissionStatus();
  });

  const handleRequestNotifPermission = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(getNotificationPermissionStatus());
    if (granted && 'Notification' in window) {
      try {
        new Notification('Notifikasi Diaktifkan ✓', {
          body: 'Anda akan menerima notifikasi pop-up di sini jika aplikasi berjalan di latar belakang.',
          icon: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200'
        });
      } catch (e) {
        console.warn('Native notification failed, fallback SW', e);
      }
    }
  };

  const unreadAlerts = (alerts || []).filter(a => a && !a.isRead);

  const userDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setShowNotificationPopup(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadgeColor = (role: string) => {
    const r = role.toLowerCase();
    switch (r) {
      case 'admin':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/30';
      case 'supervisor':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/30';
      case 'kasir':
      case 'cashier':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-900/30';
      default:
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/30';
    }
  };

  const getRoleName = (role: string) => {
    const r = role.toLowerCase();
    switch (r) {
      case 'admin': return 'Administrator (Full)';
      case 'supervisor': return 'Supervisor / Auditor';
      case 'kasir':
      case 'cashier': return 'Kasir Point of Sale';
      default: return 'Staff Gudang';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/85 dark:border-zinc-900 bg-white/90 dark:bg-zinc-950/80 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo Brand with Toggle Button */}
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                id="sidebar-toggle-btn"
                className="hidden md:flex p-2 -ml-2 rounded-xl text-gray-500 dark:text-zinc-400 hover:bg-gray-150 dark:hover:bg-zinc-850 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer border border-transparent mr-1"
                title="Toggle Menu Navigasi"
              >
                <Menu className="w-5.5 h-5.5" />
              </button>
            )}
            <div 
              className="flex items-center gap-3 cursor-pointer" 
              onClick={() => {
                const perms = (currentUser.permissions || {}) as any;
                let targetTab = 'dashboard';
                if (perms.canViewDashboard === false) {
                  if (perms.canViewDataBarang !== false) targetTab = 'inventaris';
                  else if (perms.canViewTransaksi !== false) targetTab = 'transaksi';
                  else if (perms.canViewLaporan !== false) targetTab = 'laporan';
                  else if (perms.canViewPengaturan !== false) targetTab = 'pengaturan';
                }
                onChangeTab(targetTab);
              }}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden shadow-md border border-gray-150 dark:border-zinc-800">
                <img 
                  referrerPolicy="no-referrer"
                  src={appLogo} 
                  alt={`${appTitle} Logo`} 
                  className="w-full h-full object-cover"
                  id="logo-image"
                />
              </div>
              <div>
                <h1 className="font-sans font-bold text-lg tracking-tight text-gray-900 dark:text-white flex items-center gap-1.5">
                  {appTitle}
                  <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/30">
                    v2.8
                  </span>
                </h1>
              </div>
            </div>
          </div>

          {/* Database Connection Node Indicator */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-zinc-805 border border-gray-150 dark:border-zinc-800 text-xs font-mono">
            {(isSupabaseConfigured || isGoogleConnected) ? (
              <>
                <Database className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span className="font-bold text-emerald-600 dark:text-emerald-400">ONLINE</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </>
            ) : (
              <>
                <Database className="w-3.5 h-3.5 text-rose-500" />
                <span className="font-bold text-rose-500 dark:text-rose-400">OFFLINE</span>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              </>
            )}
          </div>

          {/* Center Space & Quick Buttons */}
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* Theme Toggle */}
            <button
              id="theme-toggle-btn"
              onClick={onToggleDarkMode}
              className="p-2 rounded-xl text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-805 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-800"
              title={darkMode ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                id="notif-dropdown-btn"
                onClick={() => {
                  setShowNotificationPopup(!showNotificationPopup);
                  if (!showNotificationPopup && unreadAlerts.length > 0) {
                    // Give option to mark as read when opened
                  }
                }}
                className="relative p-2 rounded-xl text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-805 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-800"
              >
                <Bell className="w-5 h-5" />
                {unreadAlerts.length > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-zinc-900 animate-bounce">
                    {unreadAlerts.length}
                  </span>
                )}
              </button>

              {/* Notification Popup Content */}
              {showNotificationPopup && (
                <div 
                  id="notif-panel"
                  className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-zinc-900 shadow-xl shadow-gray-200/50 dark:shadow-none p-4 divide-y divide-gray-100 dark:divide-gray-800 animate-in fade-in slide-in-from-top-3 duration-200"
                >
                  {/* Push Notification Controls */}
                  <div className="pb-3 text-left">
                    <div className="bg-indigo-50/50 dark:bg-zinc-950/40 p-3 rounded-xl border border-indigo-100/50 dark:border-zinc-800/85 flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-bold text-indigo-950 dark:text-indigo-400">Notifikasi Pop-up (PWA)</p>
                        <p className="text-[9.5px] text-gray-500 dark:text-zinc-400">Menerima notifikasi sistem jika aplikasi ditutup/latar belakang</p>
                      </div>
                      
                      {notifPermission === 'granted' ? (
                        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-md font-bold text-[9px] flex items-center gap-1 shrink-0 select-none">
                          Aktif ✓
                        </span>
                      ) : notifPermission === 'denied' ? (
                        <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 rounded-md font-bold text-[9px] flex items-center gap-1 shrink-0 select-none">
                          Sistem Diblokir ⚠️
                        </span>
                      ) : (
                        <button
                          onClick={handleRequestNotifPermission}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer shadow-xs shrink-0"
                        >
                          Aktifkan
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <h3 className="font-sans font-semibold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Peringatan Stok Minimum ({unreadAlerts.length})
                    </h3>
                    {unreadAlerts.length > 0 && (
                      <button
                        onClick={() => {
                          onMarkAlertsAsRead();
                          setShowNotificationPopup(false);
                        }}
                        className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Tandai semua dibaca
                      </button>
                    )}
                  </div>

                  <div className="py-2 max-h-72 overflow-y-auto space-y-2 mt-2">
                    {alerts.length === 0 ? (
                      <div className="py-6 text-center text-xs text-gray-400 dark:text-zinc-500">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mx-auto mb-2" />
                        Semua stok aman! Tidak ada peringatan.
                      </div>
                    ) : (
                      alerts.map((alert) => (
                        <div 
                          key={alert.id} 
                          className={`p-3 rounded-xl border text-xs transition-colors ${
                            alert.isRead 
                              ? 'bg-gray-50/50 dark:bg-zinc-805/30 border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400' 
                              : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-100/70 dark:border-rose-900/40 text-gray-800 dark:text-zinc-200'
                          }`}
                        >
                          <div className="flex justify-between items-start font-medium mb-1">
                            <span className="truncate pr-1 max-w-[170px] sm:max-w-[240px]">
                              {alert.productName}
                            </span>
                            <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-500 shrink-0">
                              {alert.sku}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div>
                              Stok saat ini: <b className="text-rose-600 dark:text-rose-400">{alert.qty}</b> unit
                              <span className="text-gray-400 dark:text-zinc-500"> (Min: {alert.minQty})</span>
                            </div>
                            <span className="text-[9px] font-mono text-gray-400 dark:text-zinc-500">
                              {new Date(alert.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 text-center space-y-1.5">
                    {onOpenCriticalModal && unreadAlerts.length > 0 && (
                      <button
                        onClick={() => {
                          onOpenCriticalModal();
                          setShowNotificationPopup(false);
                        }}
                        className="w-full py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Buka Pop-up Layar Device (Stok Kritis)</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onChangeTab('inventaris');
                        setShowNotificationPopup(false);
                      }}
                      className="text-[11px] font-medium text-gray-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline w-full cursor-pointer"
                    >
                      Lihat Semua & Atur Inventaris →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile - Display Only */}
            <div className="flex items-center gap-2">
              <div 
                id="user-profile-widget"
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-gray-50/50 dark:bg-zinc-900/50 select-none transition-colors border border-gray-100 dark:border-zinc-800"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-bold uppercase text-xs">
                  {currentUser.name.substring(0, 2)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{currentUser.name}</p>
                  <span className={`inline-block text-[9px] font-bold px-1.5 py-0 rounded-full mt-0.5 ${getRoleBadgeColor(currentUser.role)}`}>
                    {currentUser.role.toUpperCase()}
                  </span>
                </div>
              </div>

              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Keluar Aplikasi"
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl border border-transparent hover:border-red-100 dark:hover:border-red-900/40 cursor-pointer transition-all"
                >
                  <LogOut className="w-4.5 h-4.5" />
                </button>
              )}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
}

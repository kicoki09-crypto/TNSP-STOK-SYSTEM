/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Image as ImageIcon, 
  Type, 
  KeyRound, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  Lock, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { User } from '../types';

const DEFAULT_LOGO = 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200';
const DEFAULT_TITLE = 'TNSP SYSTEM';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  appTitle: string;
  appLogo: string;
  onSaveBranding: (newTitle: string, newLogo: string) => void;
  onUpdatePassword: (newPassword: string) => void;
  triggerToast: (type: 'success' | 'warn', title: string, desc: string) => void;
}

export default function AccountSettingsModal({
  isOpen,
  onClose,
  currentUser,
  appTitle,
  appLogo,
  onSaveBranding,
  onUpdatePassword,
  triggerToast
}: AccountSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'logo' | 'title' | 'password'>('logo');

  // Logo state
  const [tempLogo, setTempLogo] = useState(appLogo);
  const [logoInputType, setLogoInputType] = useState<'file' | 'url'>('file');
  const [logoUrlInput, setLogoUrlInput] = useState('');

  // Title state
  const [tempTitle, setTempTitle] = useState(appTitle);

  // Password state
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTempLogo(appLogo);
      setTempTitle(appTitle);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
    }
  }, [isOpen, appLogo, appTitle]);

  if (!isOpen) return null;

  // Handle image file upload
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      triggerToast('warn', 'Ukuran File Terlalu Besar', 'Maksimal ukuran file logo adalah 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setTempLogo(result);
        triggerToast('success', 'Pratinjau Logo Diperbarui', 'Pilih "Simpan Logo Baru" untuk mengonfirmasi.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyLogoUrl = () => {
    if (!logoUrlInput.trim()) {
      triggerToast('warn', 'URL Kosong', 'Masukkan URL gambar logo yang valid.');
      return;
    }
    setTempLogo(logoUrlInput.trim());
    triggerToast('success', 'URL Logo Diterapkan', 'Pratinjau logo berhasil dimuat dari URL.');
  };

  const handleSaveLogo = () => {
    onSaveBranding(appTitle, tempLogo);
  };

  const handleResetLogo = () => {
    setTempLogo(DEFAULT_LOGO);
    onSaveBranding(appTitle, DEFAULT_LOGO);
    triggerToast('success', 'Logo Di-reset', 'Logo aplikasi dikembalikan ke logo default.');
  };

  const handleSaveTitle = () => {
    const trimmed = tempTitle.trim();
    if (!trimmed) {
      triggerToast('warn', 'Judul Kosong', 'Judul aplikasi tidak boleh kosong.');
      return;
    }
    onSaveBranding(trimmed, tempLogo);
  };

  const handleResetTitle = () => {
    setTempTitle(DEFAULT_TITLE);
    onSaveBranding(DEFAULT_TITLE, tempLogo);
    triggerToast('success', 'Judul Di-reset', 'Judul aplikasi dikembalikan ke "TNSP SYSTEM".');
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();

    // Verify current password if user has password set
    if (currentUser.password && currentPasswordInput !== currentUser.password) {
      triggerToast('warn', 'Password Lama Salah', 'Kata sandi saat ini yang Anda masukkan tidak sesuai.');
      return;
    }

    if (newPasswordInput.length < 4) {
      triggerToast('warn', 'Password Kurang Panjang', 'Kata sandi baru minimal 4 karakter.');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      triggerToast('warn', 'Password Tidak Cocok', 'Konfirmasi kata sandi baru tidak sama dengan kata sandi baru.');
      return;
    }

    onUpdatePassword(newPasswordInput);
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-500/20 shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <span>Pengaturan Akun Admin</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-full border border-rose-200 dark:border-rose-900/40">
                  Full Admin
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Kelola identitas visual aplikasi dan kata sandi akun
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tab Navigation */}
        <div className="px-4 pt-3 bg-gray-50/50 dark:bg-zinc-950/40 border-b border-gray-150 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('logo')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 border ${
              activeTab === 'logo'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Ganti Logo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('title')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 border ${
              activeTab === 'title'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Ganti Judul</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 border ${
              activeTab === 'password'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Ganti Password</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-5 overflow-y-auto space-y-5">
          
          {/* TAB 1: GANTI LOGO APLIKASI */}
          {activeTab === 'logo' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-gray-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400">
                  Pratinjau Logo Aplikasi Saat Ini
                </span>
                <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-900 p-2 shadow-md border border-gray-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden">
                  <img 
                    src={tempLogo} 
                    alt="Logo Preview" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_LOGO;
                    }}
                  />
                </div>
              </div>

              {/* Input Mode Switcher */}
              <div className="flex items-center gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setLogoInputType('file')}
                  className={`flex-1 py-1.5 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                    logoInputType === 'file'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  Unggah File Gambar
                </button>
                <button
                  type="button"
                  onClick={() => setLogoInputType('url')}
                  className={`flex-1 py-1.5 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                    logoInputType === 'url'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  Gunakan Image URL
                </button>
              </div>

              {logoInputType === 'file' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5">
                    Pilih File Logo (PNG, JPG, WEBP, SVG)
                  </label>
                  <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl bg-white dark:bg-zinc-900 cursor-pointer transition-all group">
                    <Upload className="w-6 h-6 text-indigo-500 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Klik untuk Pilih File dari Perangkat</span>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">Maksimal 2MB (Format persegi direkomendasikan)</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleLogoFileUpload} 
                      className="hidden" 
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300">
                    Masukkan URL Gambar Logo
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://domain.com/logo.png"
                      value={logoUrlInput}
                      onChange={(e) => setLogoUrlInput(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyLogoUrl}
                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Terapkan
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-150 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleResetLogo}
                  className="px-3 py-2 text-xs font-bold text-gray-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Logo Default</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveLogo}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Logo Aplikasi</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GANTI JUDUL APLIKASI */}
          {activeTab === 'title' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Judul Utama Aplikasi (App Header Title)
                </label>
                <input
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  placeholder="Contoh: TNSP SYSTEM"
                  className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Live Header Title Preview */}
              <div className="bg-gray-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 space-y-2">
                <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 block">
                  Pratinjau Tampilan Header
                </span>
                <div className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-xs">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-950 overflow-hidden shadow-xs border border-gray-150 dark:border-zinc-800 flex items-center justify-center">
                    <img src={tempLogo} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  <h1 className="font-sans font-bold text-base text-gray-900 dark:text-white flex items-center gap-1.5">
                    {tempTitle || 'TNSP SYSTEM'}
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/30">
                      v2.8
                    </span>
                  </h1>
                </div>
              </div>

              {/* Quick Title Presets */}
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 block mb-1.5">
                  Pilihan Judul Cepat:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {['TNSP SYSTEM', 'Gudang Logistik Utama', 'Sistem Stok Barang', 'Hub Inventaris RBAC'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTempTitle(preset)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-150 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleResetTitle}
                  className="px-3 py-2 text-xs font-bold text-gray-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Judul Default</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Judul Aplikasi</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: GANTI PASSWORD */}
          {activeTab === 'password' && (
            <form onSubmit={handleSavePassword} className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-300 flex items-start gap-2.5">
                <ShieldCheck className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  Mengubah kata sandi untuk akun <b>{currentUser.name}</b> (Peran: <b>{currentUser.role.toUpperCase()}</b>).
                </span>
              </div>

              {currentUser.password && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1">
                    Kata Sandi Saat Ini <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      required
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      placeholder="Masukkan password saat ini"
                      className="w-full pl-3.5 pr-10 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1">
                  Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Minimal 4 karakter"
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1">
                  Konfirmasi Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-gray-150 dark:border-zinc-800 gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>Update Password Admin</span>
                </button>
              </div>
            </form>
          )}

        </div>

      </div>
    </div>
  );
}

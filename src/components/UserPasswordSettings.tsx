/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  KeyRound, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertTriangle,
  Settings
} from 'lucide-react';
import { User } from '../types';
import { dbService } from '../lib/databaseService';

interface UserPasswordSettingsProps {
  currentUser: User;
  triggerToast: (type: 'success' | 'warn', title: string, desc: string) => void;
}

export default function UserPasswordSettings({
  currentUser,
  triggerToast
}: UserPasswordSettingsProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMess, setErrorMess] = useState<string | null>(null);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMess(null);

    // Get true current password
    let correctCurrent = 'staff123';
    if (currentUser.role === 'admin') correctCurrent = 'admin123';
    else if (currentUser.role === 'supervisor') correctCurrent = 'supervisor123';
    else if (currentUser.role === 'kasir' || currentUser.role === 'cashier') correctCurrent = 'kasir123';

    const savedPwd = localStorage.getItem(`user_password_${currentUser.id}`);
    if (savedPwd) {
      correctCurrent = savedPwd;
    }

    // Validations
    if (currentPassword !== correctCurrent) {
      setErrorMess('Kata sandi saat ini yang Anda masukkan salah.');
      triggerToast('warn', 'Verifikasi Gagal', 'Kata sandi saat ini tidak cocok.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMess('Kata sandi baru minimal harus terdiri dari 4 karakter.');
      triggerToast('warn', 'Validasi Gagal', 'Kata sandi baru terlalu pendek.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMess('Konfirmasi kata sandi baru tidak sesuai dengan kata sandi baru.');
      triggerToast('warn', 'Validasi Gagal', 'Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (newPassword === correctCurrent) {
      setErrorMess('Kata sandi baru tidak boleh sama dengan kata sandi saat ini.');
      triggerToast('warn', 'Validasi Gagal', 'Kata sandi baru harus berbeda.');
      return;
    }

    setIsSaving(true);

    setTimeout(async () => {
      try {
        await dbService.saveUser({
          ...currentUser,
          password: newPassword
        });
        localStorage.setItem(`user_password_${currentUser.id}`, newPassword);
        triggerToast('success', 'Kata Sandi Diperbarui', 'Kata sandi akses Anda berhasil diubah.');
        
        // Clear form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (err) {
        setErrorMess('Gagal menyimpan perubahan kata sandi.');
      } finally {
        setIsSaving(false);
      }
    }, 500);
  };

  const getRoleNameInIndonesian = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrator (Full)';
      case 'supervisor': return 'Supervisor / Auditor';
      case 'kasir':
      case 'cashier': return 'Kasir Point of Sale';
      default: return 'Staff Lapangan / Checker';
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in duration-200" id="user-password-settings-workspace">
      
      {/* Main Password Update Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-md overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-zinc-850 flex items-center gap-2">
          <KeyRound className="w-4.5 h-4.5 text-indigo-550 dark:text-indigo-400" />
          <h3 className="font-sans font-bold text-sm text-gray-905 dark:text-white">Formulir Ganti Kata Sandi</h3>
        </div>

        <form onSubmit={handlePasswordChange} className="p-6 space-y-5">
          {errorMess && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMess}</span>
            </div>
          )}

          <div className="space-y-4">
            
            {/* Current Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400">
                Kata Sandi Saat Ini
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  placeholder="Masukkan kata sandi saat ini"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-gray-250 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 min-h-full cursor-pointer"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400">
                Kata Sandi Baru
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  placeholder="Min. 4 karakter unik"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-gray-250 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 min-h-full cursor-pointer"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400">
                Konfirmasi Kata Sandi Baru
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  placeholder="Ulangi kata sandi baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-gray-250 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 min-h-full cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-zinc-850 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white shadow-md cursor-pointer transition-all disabled:opacity-50 select-none"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Menyimpan sandi...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Kata Sandi Baru</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      
      {/* Information Footer block info */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-gray-150 dark:border-zinc-800 rounded-2xl text-xs text-gray-550 dark:text-zinc-400 leading-normal">
        <p className="font-bold text-gray-700 dark:text-zinc-200 mb-1">Catatan Keamanan Akun:</p>
        Pastikan kata sandi baru yang Anda buat aman, rahasia, dan mudah Anda ingat sendiri. Hubungi **Administrator Utama** jika Anda lupa kata sandi login untuk melakukan pemulihan manual.
      </div>

    </div>
  );
}

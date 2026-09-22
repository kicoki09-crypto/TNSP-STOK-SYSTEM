/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Warehouse, 
  KeyRound, 
  Mail, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Sun, 
  Moon,
  ChevronRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { User } from '../types';
import { dbService } from '../lib/databaseService';
import { googleSignIn } from '../lib/googleAuth';

interface LoginPageProps {
  systemUsers: User[];
  onLoginSuccess: (user: User) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  appTitle?: string;
  appLogo?: string;
  onGoogleLoginSuccess: (googleUser: any, token: string) => Promise<void>;
}

export default function LoginPage({
  systemUsers: initialSystemUsers,
  onLoginSuccess,
  darkMode,
  onToggleDarkMode,
  appTitle = 'TNSP SYSTEM',
  appLogo = 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w300',
  onGoogleLoginSuccess
}: LoginPageProps) {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMess, setErrorMess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [activeUsers, setActiveUsers] = useState<User[]>(initialSystemUsers);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Sync with initialSystemUsers if prop updates
  useEffect(() => {
    if (initialSystemUsers && initialSystemUsers.length > 0) {
      setActiveUsers(initialSystemUsers);
    }
  }, [initialSystemUsers]);

  // Ensure fresh user accounts are pulled directly from Supabase Cloud on mount
  useEffect(() => {
    let isMounted = true;
    async function loadCloudUsers() {
      setIsLoadingUsers(true);
      try {
        const cloudUsers = await dbService.getUsers();
        if (isMounted && cloudUsers && cloudUsers.length > 0) {
          setActiveUsers(cloudUsers);
        }
      } catch (err) {
        console.warn('Gagal memuat pengguna dari cloud pada halaman login:', err);
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    }
    loadCloudUsers();
    return () => { isMounted = false; };
  }, []);

  // Trigger login process
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMess(null);
    setIsSubmitting(true);

    const findUser = (list: User[], input: string): User | undefined => {
      const clean = input.trim().toLowerCase();
      if (!clean) return undefined;
      // 1. Exact email match
      let match = list.find(u => u && u.email && u.email.trim().toLowerCase() === clean);
      if (match) return match;
      // 2. Exact name match
      match = list.find(u => u && u.name && u.name.trim().toLowerCase() === clean);
      if (match) return match;
      // 3. Match username prefix before @ (e.g. "admin" matches "admin@tnsp.co.id")
      match = list.find(u => u && u.email && u.email.trim().toLowerCase().split('@')[0] === clean);
      if (match) return match;
      // 4. Match user ID (e.g. "u-1", "u-kicoki")
      match = list.find(u => u && u.id && u.id.trim().toLowerCase() === clean);
      if (match) return match;
      // 5. Partial name match
      match = list.find(u => u && u.name && u.name.trim().toLowerCase().includes(clean));
      if (match) return match;
      // 6. Loose prefix match (e.g. "admin@tnsp.com" matches "admin@tnsp.co.id")
      if (clean.includes('@')) {
        const inputPrefix = clean.split('@')[0];
        match = list.find(u => u && u.email && u.email.trim().toLowerCase().split('@')[0] === inputPrefix);
      }
      return match;
    };

    let currentList = activeUsers && activeUsers.length > 0 ? activeUsers : initialSystemUsers;
    let targetUser = findUser(currentList, emailInput);

    // If not found in current state, attempt immediate real-time fetch from database
    if (!targetUser) {
      try {
        const freshUsers = await dbService.getUsers();
        if (freshUsers && freshUsers.length > 0) {
          setActiveUsers(freshUsers);
          currentList = freshUsers;
          targetUser = findUser(freshUsers, emailInput);
        }
      } catch (err) {
        console.warn('Gagal memvalidasi user langsung dari database:', err);
      }
    }

    if (!targetUser) {
      setIsSubmitting(false);
      setErrorMess('Petugas dengan email / nama pengguna tersebut tidak ditemukan di database.');
      return;
    }

    // Determine passwords allowed
    const enteredPassword = passwordInput.trim();
    const storedPwd = targetUser.password ? String(targetUser.password).trim() : '';
    const savedCustomPwd = localStorage.getItem(`user_password_${targetUser.id}`)?.trim() || '';
    const defaultRolePwd = (targetUser.role === 'cashier' || targetUser.role === 'kasir')
      ? 'kasir123'
      : `${targetUser.role}123`;

    // Check password match (supports custom password, cached password, or default role password)
    const isPasswordMatch = 
      (storedPwd && enteredPassword === storedPwd) ||
      (savedCustomPwd && enteredPassword === savedCustomPwd) ||
      (enteredPassword === defaultRolePwd) ||
      (passwordInput === targetUser.password) ||
      (passwordInput === savedCustomPwd) ||
      (passwordInput === defaultRolePwd);

    if (!isPasswordMatch) {
      setIsSubmitting(false);
      setErrorMess(`Kata sandi salah. Silakan coba kata sandi akun Anda atau gunakan format default (${defaultRolePwd}).`);
      return;
    }

    // Cache password in localStorage for offline availability
    if (passwordInput) {
      localStorage.setItem(`user_password_${targetUser.id}`, passwordInput);
    }

    // Success transition effect
    setTimeout(() => {
      setIsSubmitting(false);
      onLoginSuccess(targetUser);
    }, 500);
  };

  const handleGoogleSignIn = async () => {
    setErrorMess(null);
    setIsGoogleSubmitting(true);
    try {
      const result = await googleSignIn();
      if (result) {
        await onGoogleLoginSuccess(result.user, result.accessToken);
      } else {
        setErrorMess('Gagal masuk menggunakan Google.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMess(err.message || 'Gagal masuk menggunakan Google.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between bg-gray-50 dark:bg-zinc-950 text-gray-800 dark:text-zinc-100 transition-colors duration-300">
      
      {/* Absolute Header Accessories */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={onToggleDarkMode}
          className="p-2.5 rounded-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:shadow-md cursor-pointer transition-all duration-200"
          title={darkMode ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
        >
          {darkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-white dark:bg-zinc-900 rounded-3xl border border-gray-150 dark:border-zinc-800/80 shadow-2xl overflow-hidden mt-6">
          
          {/* Welcome Branding Panel (Left column on large screens) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-8 lg:p-10 text-white flex flex-col justify-between relative overflow-hidden">
            
            {/* Background decoration */}
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-slate-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="space-y-6 relative">
              <div className="inline-flex items-center justify-center p-1 bg-white rounded-2xl overflow-hidden shadow-lg w-16 h-16">
                <img 
                  referrerPolicy="no-referrer"
                  src={appLogo} 
                  alt={`${appTitle} Logo`} 
                  className="w-full h-full object-contain rounded-xl"
                  id="login-logo-image"
                />
              </div>
              <div>
                <h1 className="font-sans font-extrabold text-2xl tracking-tight leading-8 text-neutral-50 mb-2">
                  {appTitle}
                </h1>
              </div>
            </div>

            {/* Live Indicator footer inside branding panel removed */}
          </div>

          {/* Login Form Panel (Right column) */}
          <div className="lg:col-span-7 p-8 lg:p-10 flex flex-col justify-center">
            
            <div className="mb-6">
            </div>

            {/* Error Message banner */}
            {errorMess && (
              <div className="mb-5 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs flex items-start gap-2.5 animate-bounce-subtle">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span className="font-sans leading-normal">{errorMess}</span>
              </div>
            )}

            {/* Standard Credentials Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500">
                  Email atau Nama Pengguna / Petugas
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    list="registered-users-list"
                    placeholder="nama@tnsp.co.id atau nama/username..."
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                    }}
                    className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                  />
                  <datalist id="registered-users-list">
                    {(activeUsers && activeUsers.length > 0 ? activeUsers : initialSystemUsers).map(u => (
                      <React.Fragment key={u.id}>
                        <option value={u.email}>{u.name} ({u.role})</option>
                        <option value={u.name}>{u.email} ({u.role})</option>
                      </React.Fragment>
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 dark:text-zinc-500">
                  Kata Sandi Akses
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                    <KeyRound className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                    }}
                    className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 min-h-full cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/15 transition-all mt-6"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Membuka Kunci Akses Gudang...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4.5 h-4.5" />
                    <span>Masuk Akun Logistik</span>
                    <ChevronRight className="w-4 h-4 ml-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
              <span className="flex-shrink mx-3 text-gray-400 text-[9px] font-bold uppercase tracking-wider">Atau</span>
              <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSubmitting}
              className="w-full py-2.5 bg-white dark:bg-zinc-950 hover:bg-gray-50 dark:hover:bg-zinc-900 border border-gray-200 dark:border-zinc-850 text-gray-700 dark:text-zinc-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2.5 cursor-pointer shadow-sm transition-all"
            >
              {isGoogleSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Menghubungkan ke Google...</span>
                </>
              ) : (
                <>
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                  <span>Masuk dengan Google Workspace</span>
                </>
              )}
            </button>



          </div>
        </div>
      </div>
      
      {/* Small system metadata footer at very bottom */}
      <footer className="text-center py-4 text-[9px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest font-mono">
        TNSP SYSTEM v2.4.0 • Enterprise Logistik RBAC
      </footer>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Key, 
  UserPlus, 
  Settings, 
  User as UserIcon, 
  BadgeCheck, 
  UserX,
  FileLock,
  Lock,
  ChevronDown,
  Plus,
  Trash2,
  Shield,
  UserCheck,
  Search
} from 'lucide-react';
import { User, Role } from '../types';

interface UserControlProps {
  systemUsers: User[];
  currentUser: User;
  onUpdateUserRole: (userId: string, newRole: Role) => void;
  onUpdateUserLocation: (userId: string, newLocation: string) => void;
  onAddSystemUser: (user: Omit<User, 'id' | 'permissions'> & { permissions?: User['permissions'] }) => void;
  onDeleteSystemUser: (userId: string) => void;
  onToggleRolePermission: (role: Role, permissionKey: keyof User['permissions']) => void;
  onUpdateSystemUser: (user: User) => void;
  locations?: string[];
}

export default function UserControl({
  systemUsers,
  currentUser,
  onUpdateUserRole,
  onUpdateUserLocation,
  onAddSystemUser,
  onDeleteSystemUser,
  onToggleRolePermission,
  onUpdateSystemUser,
  locations
}: UserControlProps) {
  
  const [rolesList, setRolesList] = useState<{ id: string; name: string; isCustom: boolean; defaultPermissions: User['permissions'] }[]>(() => {
    const saved = localStorage.getItem('gudang_custom_roles_v2');
    const defaultRoles = [
      {
        id: 'admin',
        name: 'Administrator (Full)',
        isCustom: false,
        defaultPermissions: {
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
        id: 'supervisor',
        name: 'Supervisor / Auditor',
        isCustom: false,
        defaultPermissions: {
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
        id: 'staff',
        name: 'Staff Lapangan / Checker',
        isCustom: false,
        defaultPermissions: {
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
        id: 'kasir',
        name: 'Kasir / Petugas Administrasi',
        isCustom: false,
        defaultPermissions: {
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

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const merged = [...defaultRoles];
          parsed.forEach((custom: any) => {
            if (custom && custom.id && !merged.some(r => r.id === custom.id)) {
              merged.push({
                id: custom.id,
                name: custom.name || custom.id,
                isCustom: true,
                defaultPermissions: {
                  ...defaultRoles[2].defaultPermissions,
                  ...(custom.defaultPermissions || {})
                }
              });
            }
          });
          return merged;
        }
      } catch (err) {
        console.error('Gagal memuat peran kustom:', err);
      }
    }
    return defaultRoles;
  });

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Custom Roles Form States
  const [newRoleId, setNewRoleId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [isRoleSectionExpanded, setIsRoleSectionExpanded] = useState(true);

  // Form states for Add/Edit User
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<Role>('staff');
  const [userLocation, setUserLocation] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [useRecipeUnits, setUseRecipeUnits] = useState(false);
  const [userPermissions, setUserPermissions] = useState<User['permissions']>({
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
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedMatrixRole, setSelectedMatrixRole] = useState<Role>('staff');

  // Expansion states for User Control sections
  const [isUsersListExpanded, setIsUsersListExpanded] = useState(true);
  const [isMatrixExpanded, setIsMatrixExpanded] = useState(true);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const getRolePermissions = (role: Role): User['permissions'] => {
    const userWithRole = systemUsers.find(u => u.role === role);
    const basePermissions = userWithRole ? userWithRole.permissions : null;
    const matchedRole = rolesList.find(r => r.id === role);
    const rolePermissions = matchedRole ? matchedRole.defaultPermissions : null;

    const merged = {
      ...(rolePermissions || {
        canAddProduct: role === 'admin',
        canEditProduct: role === 'admin' || role === 'supervisor',
        canDeleteProduct: role === 'admin',
        canRecordTransaction: true,
        canViewReports: role === 'admin' || role === 'supervisor' || role === 'kasir',
        canManageUsers: role === 'admin',
        canViewDashboard: true,
        canViewDataBarang: true,
        canViewTransaksi: true,
        canViewLaporan: role !== 'staff',
        canViewPengaturan: role === 'admin',
        canImportCSV: role === 'admin' || role === 'supervisor',
        canExportCSV: role === 'admin' || role === 'supervisor' || role === 'kasir',
        canPrintProduct: true,
        canRecordBarangMasuk: true,
        canRecordBarangKeluar: true,
        canPerformAudit: role === 'admin' || role === 'supervisor',
        canEditTransaction: role === 'admin' || role === 'supervisor',
        canDeleteTransaction: role === 'admin',
      }),
      ...(basePermissions || {})
    };

    return {
      canAddProduct: merged.canAddProduct ?? (role === 'admin'),
      canEditProduct: merged.canEditProduct ?? (role === 'admin' || role === 'supervisor'),
      canDeleteProduct: merged.canDeleteProduct ?? (role === 'admin'),
      canRecordTransaction: merged.canRecordTransaction ?? true,
      canViewReports: merged.canViewReports ?? (role === 'admin' || role === 'supervisor' || role === 'kasir'),
      canManageUsers: merged.canManageUsers ?? (role === 'admin'),
      canViewDashboard: merged.canViewDashboard !== false,
      canViewDataBarang: merged.canViewDataBarang !== false,
      canViewTransaksi: merged.canViewTransaksi !== false,
      canViewLaporan: merged.canViewLaporan !== false,
      canViewPengaturan: merged.canViewPengaturan !== undefined ? !!merged.canViewPengaturan : (role === 'admin'),
      canImportCSV: merged.canImportCSV ?? (role === 'admin' || role === 'supervisor'),
      canExportCSV: merged.canExportCSV ?? (role === 'admin' || role === 'supervisor' || role === 'kasir'),
      canPrintProduct: merged.canPrintProduct ?? true,
      canRecordBarangMasuk: merged.canRecordBarangMasuk ?? true,
      canRecordBarangKeluar: merged.canRecordBarangKeluar ?? true,
      canPerformAudit: merged.canPerformAudit ?? (role === 'admin' || role === 'supervisor'),
      canEditTransaction: merged.canEditTransaction ?? (role === 'admin' || role === 'supervisor'),
      canDeleteTransaction: merged.canDeleteTransaction ?? (role === 'admin'),
    };
  };

  const openAddModal = () => {
    setUserName('');
    setUserEmail('');
    setUserRole('staff');
    setUserLocation(locations && locations.length > 0 ? locations[0] : 'Semua Gudang');
    setUserPassword('');
    setUseRecipeUnits(false);
    setUserPermissions(getRolePermissions('staff'));
    setShowAddUserModal(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserRole(user.role);
    setUserLocation(user.location || '');
    setUserPassword(''); // Keep empty if not changing
    setUseRecipeUnits(user.useRecipeUnits || false);
    setUserPermissions({ ...user.permissions });
    setShowEditUserModal(true);
  };

  const handleToggleRolePermissionInternal = (role: Role, key: keyof User['permissions']) => {
    setRolesList(prev => {
      const updated = prev.map(r => {
        if (r.id === role) {
          return {
            ...r,
            defaultPermissions: {
              ...r.defaultPermissions,
              [key]: !r.defaultPermissions[key]
            }
          };
        }
        return r;
      });
      localStorage.setItem('gudang_custom_roles_v2', JSON.stringify(updated.filter(r => r.isCustom)));
      return updated;
    });

    onToggleRolePermission(role, key);
  };

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    const idTrimmed = newRoleId.trim().toLowerCase().replace(/\s+/g, '-');
    const nameTrimmed = newRoleName.trim();
    if (!idTrimmed || !nameTrimmed) return;

    if (rolesList.some(r => r.id === idTrimmed)) {
      alert(`ID Peran "${idTrimmed}" sudah terdaftar di sistem!`);
      return;
    }

    const newRole = {
      id: idTrimmed,
      name: nameTrimmed,
      isCustom: true,
      defaultPermissions: {
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
    };

    const updated = [...rolesList, newRole];
    setRolesList(updated);
    localStorage.setItem('gudang_custom_roles_v2', JSON.stringify(updated.filter(r => r.isCustom)));
    setNewRoleId('');
    setNewRoleName('');
    alert(`Peran kustom "${nameTrimmed}" (${idTrimmed}) berhasil ditambahkan!`);
  };

  const handleDeleteRole = (roleId: string) => {
    // Prevent deleting built-in roles
    const matched = rolesList.find(r => r.id === roleId);
    if (!matched || !matched.isCustom) return;

    // Check if there are users with this role
    const usersWithRole = systemUsers.filter(u => u.role === roleId);
    if (usersWithRole.length > 0) {
      alert(`Tidak dapat menghapus peran ini karena sedang digunakan oleh ${usersWithRole.length} petugas: ${usersWithRole.map(u => u.name).join(', ')}. Harap ubah peran mereka terlebih dahulu.`);
      return;
    }

    if (window.confirm(`Apakah Anda yakin ingin menghapus peran kustom "${matched.name}"?`)) {
      const updated = rolesList.filter(r => r.id !== roleId);
      setRolesList(updated);
      localStorage.setItem('gudang_custom_roles_v2', JSON.stringify(updated.filter(r => r.isCustom)));
      if (selectedMatrixRole === roleId) {
        setSelectedMatrixRole('staff');
      }
    }
  };

  const dataBarangPerms: { key: keyof User['permissions']; label: string; desc: string }[] = [
    { key: 'canImportCSV', label: 'Import CSV', desc: 'Izin mengimpor data barang secara massal lewat file CSV.' },
    { key: 'canExportCSV', label: 'Ekspor CSV', desc: 'Izin mengekspor daftar barang ke file format CSV.' },
    { key: 'canAddProduct', label: 'Tambah Barang', desc: 'Izin mendaftarkan barang baru ke sistem.' },
    { key: 'canPrintProduct', label: 'Print Barcode', desc: 'Izin mencetak label barcode (33x15mm).' },
    { key: 'canEditProduct', label: 'Edit Barang', desc: 'Izin menyunting rincian data barang.' },
    { key: 'canDeleteProduct', label: 'Hapus Barang', desc: 'Izin menghapus data barang dari sistem.' },
  ];

  const transaksiPerms: { key: keyof User['permissions']; label: string; desc: string }[] = [
    { key: 'canRecordBarangMasuk', label: 'Barang Masuk', desc: 'Izin mencatat mutasi barang masuk (IN).' },
    { key: 'canRecordBarangKeluar', label: 'Barang Keluar', desc: 'Izin mencatat mutasi barang keluar (OUT).' },
    { key: 'canPerformAudit', label: 'Audit Stok Opname', desc: 'Izin mencatatkan hasil opname hitung fisik.' },
    { key: 'canEditTransaction', label: 'Edit Transaksi', desc: 'Izin memperbaiki catatan riwayat transaksi.' },
    { key: 'canDeleteTransaction', label: 'Hapus Transaksi', desc: 'Izin menghapus catatan transaksi dari riwayat.' },
  ];

  const navigasiPerms: { key: keyof User['permissions']; label: string; desc: string }[] = [
    { key: 'canViewDashboard', label: 'Akses Dashboard', desc: 'Akses melihat menu utama Dashboard & statistik.' },
    { key: 'canViewDataBarang', label: 'Akses Data Barang', desc: 'Akses melihat menu inventaris & daftar barang.' },
    { key: 'canViewTransaksi', label: 'Akses Transaksi', desc: 'Akses melihat menu penyesuaian stok & mutasi.' },
    { key: 'canViewLaporan', label: 'Akses Laporan', desc: 'Akses melihat menu laporan & performa logistik.' },
    { key: 'canViewPengaturan', label: 'Akses Pengaturan', desc: 'Akses melihat menu pengaturan & kelola petugas.' },
  ];

  const renderPermGroup = (
    title: string,
    perms: { key: keyof User['permissions']; label: string; desc: string }[],
    currentValues: User['permissions'],
    onToggle: (key: keyof User['permissions']) => void
  ) => {
    return (
      <div className="space-y-2 mt-4 animate-in fade-in duration-200">
        <h4 className="text-[10px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-widest leading-none border-b border-gray-100 dark:border-zinc-800 pb-1.5">{title}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {perms.map(cap => {
            const isEnabled = !!currentValues[cap.key];
            return (
              <button
                key={cap.key}
                type="button"
                onClick={() => onToggle(cap.key)}
                className={`flex items-start justify-between p-2.5 rounded-xl border transition-all text-left select-none cursor-pointer group ${
                  isEnabled 
                    ? 'border-emerald-100 bg-emerald-50/10 dark:border-emerald-950/20 dark:bg-emerald-950/10' 
                    : 'border-gray-100 bg-gray-50/30 dark:border-zinc-850 dark:bg-zinc-900/40 hover:border-indigo-150 dark:hover:border-indigo-950/30'
                }`}
              >
                <div className="max-w-[78%] space-y-0.5">
                  <p className={`text-[11px] font-black leading-tight ${isEnabled ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-gray-500 font-medium'}`}>
                    {cap.label}
                  </p>
                  <p className="text-[9px] text-gray-400 dark:text-zinc-500 leading-tight">
                    {cap.desc}
                  </p>
                </div>
                <div className={`w-8 h-4.5 rounded-full p-0.5 mt-0.5 transition-colors flex items-center shrink-0 ${
                  isEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-750'
                }`}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    isEnabled ? 'translate-x-3.5' : 'translate-x-0'
                  }`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName || !userEmail) {
      alert('Tolong lengkapi nama dan email pengguna!');
      return;
    }

    const newUserPayload: any = {
      name: userName,
      email: userEmail,
      role: userRole,
      location: userLocation,
      useRecipeUnits: useRecipeUnits,
      permissions: userPermissions
    };

    if (userPassword.trim()) {
      newUserPayload.password = userPassword.trim();
    }

    onAddSystemUser(newUserPayload);

    setShowAddUserModal(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const updatedUser: User = {
      ...editingUser,
      name: userName,
      email: userEmail,
      role: userRole,
      location: userLocation,
      useRecipeUnits: useRecipeUnits,
      permissions: userPermissions
    };

    if (userPassword.trim()) {
      updatedUser.password = userPassword.trim();
      localStorage.setItem(`user_password_${updatedUser.id}`, userPassword.trim());
    }

    onUpdateSystemUser(updatedUser);

    setShowEditUserModal(false);
    setEditingUser(null);
  };

  const getRoleNameInIndonesian = (role: string) => {
    const matched = rolesList.find(r => r.id === role);
    if (matched) return matched.name;
    switch (role) {
      case 'admin': return 'Administrator (Full)';
      case 'supervisor': return 'Supervisor / Auditor';
      case 'kasir':
      case 'cashier': return 'Kasir / Petugas Administrasi';
      default: return 'Staff Lapangan / Checker';
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/30';
      case 'supervisor':
        return 'bg-amber-100 text-amber-805 dark:bg-amber-950/45 dark:text-amber-300 border border-amber-200 dark:border-amber-900/30';
      case 'kasir':
      case 'cashier':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-305 border border-purple-200 dark:border-purple-900/30';
      case 'staff':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/30';
      default:
        return 'bg-indigo-100 text-indigo-850 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/30';
    }
  };

  return (
    <div className="space-y-6" id="usercontrol-tab-workspace">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-sans tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Akses Multi-Pengguna & Peran (RBAC)
          </h2>
        </div>

        {currentUser.permissions.canManageUsers && (
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md select-none transition-all hover:-translate-y-0.5"
          >
            <UserPlus className="w-4 h-4" />
            Tambah Akun Petugas
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Side: Users Directory Table - 7 Columns */}
        <div className="lg:col-span-7 space-y-4">
          <div className="border border-gray-150/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsUsersListExpanded(!isUsersListExpanded)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-indigo-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-gray-900 dark:text-white">Daftar Petugas Terdaftar</h3>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                    Jumlah: {systemUsers.length} petugas terdaftar di sistem & database
                  </p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isUsersListExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isUsersListExpanded && (
              <div className="p-5 border-t border-gray-100 dark:border-zinc-850 animate-in fade-in duration-200">
                {/* Search Filter for users */}
                {systemUsers.length > 3 && (
                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari nama, email, peran, atau wilayah..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-950/50 text-gray-800 dark:text-zinc-200 focus:outline-indigo-500 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                    />
                  </div>
                )}

                <div className="divide-y divide-gray-150 dark:divide-zinc-805 space-y-3">
              {(() => {
                if (systemUsers.length === 0) {
                  return (
                    <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-gray-300 dark:text-zinc-700" />
                      <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Belum ada petugas terdaftar</p>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500">Silakan tambahkan akun petugas baru menggunakan tombol di atas.</p>
                    </div>
                  );
                }

                const filteredUsers = systemUsers.filter((u) => {
                  if (!userSearchQuery.trim()) return true;
                  const q = userSearchQuery.toLowerCase();
                  return (
                    u.name.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q) ||
                    u.role.toLowerCase().includes(q) ||
                    (u.location && u.location.toLowerCase().includes(q))
                  );
                });

                if (filteredUsers.length === 0) {
                  return (
                    <div className="py-6 text-center text-gray-400 dark:text-zinc-500 text-xs">
                      Tidak ada petugas yang cocok dengan pencarian "{userSearchQuery}".
                    </div>
                  );
                }

                return filteredUsers.map((user) => {
                  const isSelf = user.id === currentUser.id;
                  const isRootAdmin = user.id === 'u-kicoki';

                  return (
                    <div key={user.id} className="pt-4 first:pt-0 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 font-extrabold flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/30">
                          {user.name.substring(0,2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-x-1.5 flex-wrap">
                            <span className="font-extrabold text-gray-905 dark:text-zinc-100 uppercase tracking-tight">
                              {user.name} 
                            </span>
                            {isSelf && (
                              <span className="text-[8px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded border border-indigo-200/20">AKUN AKTIF</span>
                            )}
                            {isRootAdmin && !isSelf && (
                              <span className="text-[8px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.5 rounded border border-amber-200/20">ADMIN UTAMA</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-550 font-mono truncate">{user.email}</p>
                          
                          <div className="flex flex-col gap-1 mt-1.5 text-[10px]">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 dark:text-zinc-500 font-bold uppercase text-[8px]">Penugasan Wilayah:</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const activeLocs = (user.location || 'Semua Gudang')
                                  .split(',')
                                  .map(s => s.trim())
                                  .filter(Boolean)
                                  .filter(loc => {
                                    if (loc === 'Semua Gudang') return true;
                                    if (!locations || locations.length === 0) return true;
                                    return locations.includes(loc);
                                  });
                                if (activeLocs.length === 0) {
                                  return (
                                    <span className="text-rose-600 dark:text-rose-400 font-extrabold bg-rose-50/60 dark:bg-rose-950/30 px-1.5 py-0.5 rounded text-[9px] border border-rose-100/10 whitespace-nowrap">
                                      Belum Ditugaskan
                                    </span>
                                  );
                                }
                                return activeLocs.map((loc) => (
                                  <span key={loc} className="text-indigo-600 dark:text-indigo-400 font-extrabold bg-indigo-50/60 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded text-[9px] border border-indigo-100/10 whitespace-nowrap">
                                    {loc}
                                  </span>
                                ));
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Change Role Selection & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-gray-150 dark:border-zinc-805/50">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${getRoleBadgeStyle(user.role)} uppercase font-mono shadow-sm`}>
                            {user.role}
                          </span>
                        </div>

                        {currentUser.permissions.canManageUsers && (
                          <div className="flex items-center gap-1">
                            {/* Edit Action */}
                            <button
                              onClick={() => openEditModal(user)}
                              className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-zinc-805/50 rounded transition-colors cursor-pointer"
                              title="Sunting detail petugas"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Action (only if not self and not primary system admin) */}
                            {!isSelf && !isRootAdmin && (
                              confirmDeleteId === user.id ? (
                                <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 p-1 rounded-lg border border-rose-100 dark:border-rose-900/30 animate-in fade-in duration-100">
                                  <span className="text-[9px] text-rose-600 dark:text-rose-455 font-bold px-0.5 select-none">Hapus?</span>
                                  <button
                                    onClick={() => {
                                      onDeleteSystemUser(user.id);
                                      setConfirmDeleteId(null);
                                    }}
                                    className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold text-[9px] cursor-pointer"
                                    title="Ya, Hapus"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-1.5 py-0.5 bg-gray-250 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded font-semibold text-[9px] cursor-pointer"
                                    title="Batal"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(user.id)}
                                  className="p-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50/50 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                  title="Cabut hak akses petugas"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

          {/* Kelola Peran Kustom Card */}
          <div className="border border-gray-150/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl shadow-xs overflow-hidden mt-4">
            <button
              type="button"
              onClick={() => setIsRoleSectionExpanded(!isRoleSectionExpanded)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4.5 h-4.5 text-indigo-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-gray-900 dark:text-white">Tambah & Kelola Peran (Role)</h3>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-0.5">Buat peran kustom baru dan atur otorisasi bawaan sistem</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isRoleSectionExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isRoleSectionExpanded && (
              <div className="p-5 border-t border-gray-100 dark:border-zinc-850 animate-in fade-in duration-200 space-y-6">
                
                {/* Form to Create Role */}
                <form onSubmit={handleCreateRole} className="p-4 bg-gray-50/50 dark:bg-zinc-950/40 border border-gray-150 dark:border-zinc-850 rounded-xl space-y-3.5">
                  <h4 className="font-bold text-xs text-indigo-650 dark:text-indigo-400 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Buat Peran Baru
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 dark:text-zinc-400 mb-1">ID Peran (Unik, Alfanumerik)</label>
                      <input
                        type="text"
                        required
                        placeholder="contoh: checker, auditor, ops"
                        value={newRoleId}
                        onChange={(e) => setNewRoleId(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 dark:text-zinc-400 mb-1">Nama Peran (Tampilan)</label>
                      <input
                        type="text"
                        required
                        placeholder="contoh: Pemeriksa Barang, Auditor"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-sans"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/15"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Daftarkan Peran Baru</span>
                    </button>
                  </div>
                </form>

                {/* List of current roles */}
                <div className="space-y-3">
                  <h4 className="font-bold text-xs text-gray-805 dark:text-zinc-300">Daftar Peran Aktif di Sistem</h4>
                  <div className="divide-y divide-gray-100 dark:divide-zinc-805/60 border border-gray-105 dark:border-zinc-850 rounded-xl bg-white dark:bg-zinc-950/20 overflow-hidden">
                    {rolesList.map((r) => (
                      <div key={r.id} className="p-3 flex items-center justify-between text-xs hover:bg-gray-50/50 dark:hover:bg-zinc-904 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg ${getRoleBadgeStyle(r.id)} font-bold text-[10px] uppercase flex items-center justify-center shrink-0`}>
                            {r.id.substring(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-gray-901 dark:text-white block truncate">{r.name}</span>
                            <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-550">ID: {r.id}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            r.isCustom
                              ? 'bg-blue-50 text-blue-650 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100/35'
                              : 'bg-gray-100 text-gray-430 dark:bg-zinc-800 dark:text-zinc-500'
                          }`}>
                            {r.isCustom ? 'Kustom' : 'Sistem'}
                          </span>

                          {r.isCustom ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(r.id)}
                              className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded transition-colors cursor-pointer"
                              title={`Hapus peran kustom "${r.name}"`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <div className="p-1 text-gray-300 dark:text-zinc-700" title="Peran sistem tidak dapat dihapus">
                              <Lock className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Right Side: Permissions Capability Matrix - 5 Columns */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-gray-150/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsMatrixExpanded(!isMatrixExpanded)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-zinc-850/30 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-4.5 h-4.5 text-indigo-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-gray-900 dark:text-white">Matriks Kapabilitas Peran (RBAC)</h3>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-550 mt-0.5">Konfigurasi hak akses modul sistem pergudangan</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${isMatrixExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isMatrixExpanded && (
              <div className="p-5 border-t border-gray-100 dark:border-zinc-850 animate-in fade-in duration-200 space-y-4">
                {/* Segmented Control - Dynamic list */}
                <div className="flex p-1 bg-gray-100 dark:bg-zinc-950 rounded-xl mb-4 gap-1 overflow-x-auto scrollbar-none">
                  {rolesList.map((r) => {
                    const isActive = selectedMatrixRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedMatrixRole(r.id as Role)}
                        className={`flex-1 py-1.5 px-3 text-[10px] font-bold rounded-lg transition-all capitalize cursor-pointer whitespace-nowrap ${
                          isActive
                            ? r.id === 'admin'
                              ? 'bg-rose-600 text-white shadow-sm'
                              : r.id === 'supervisor'
                                ? 'bg-amber-600 text-white shadow-sm'
                                : r.id === 'staff'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                        }`}
                      >
                        {r.id === 'admin' ? 'Admin' : r.id === 'supervisor' ? 'Supervisor' : r.id === 'staff' ? 'Staff' : r.name}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-3.5 text-xs text-left">
                  
                  {/* Dynamic Matrix Container depending on selection */}
                  <div className={`p-4 rounded-xl border transition-colors ${
                    selectedMatrixRole === 'admin'
                      ? 'border-rose-100 bg-rose-50/10 dark:border-rose-950/20 dark:bg-rose-950/5'
                      : selectedMatrixRole === 'supervisor'
                        ? 'border-amber-100 bg-amber-50/10 dark:border-amber-950/20 dark:bg-amber-950/5'
                        : selectedMatrixRole === 'staff'
                          ? 'border-emerald-100 bg-emerald-50/10 dark:border-emerald-950/20 dark:bg-emerald-950/5'
                          : 'border-indigo-100 bg-indigo-50/10 dark:border-indigo-950/20 dark:bg-indigo-950/5'
                  }`}>
                    <div className="flex items-center justify-between mb-3 border-b pb-2 border-gray-100 dark:border-zinc-800">
                      <span className={`font-bold uppercase text-[10px] tracking-wider font-sans ${
                        selectedMatrixRole === 'admin'
                          ? 'text-rose-800 dark:text-rose-400'
                          : selectedMatrixRole === 'supervisor'
                            ? 'text-amber-800 dark:text-amber-400'
                            : selectedMatrixRole === 'staff'
                              ? 'text-emerald-800 dark:text-emerald-400'
                              : 'text-indigo-800 dark:text-indigo-400'
                      }`}>
                        HAK AKSES: {getRoleNameInIndonesian(selectedMatrixRole)}
                      </span>
                      <span className="text-[9px] font-sans font-bold text-indigo-650 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded cursor-default select-none">
                        Dapat Diubah
                      </span>
                    </div>

                    <div className="space-y-4">
                      {renderPermGroup(
                        "Menu DATA BARANG",
                        dataBarangPerms,
                        getRolePermissions(selectedMatrixRole),
                        (key) => handleToggleRolePermissionInternal(selectedMatrixRole, key)
                      )}
                      {renderPermGroup(
                        "Menu TRANSAKSI",
                        transaksiPerms,
                        getRolePermissions(selectedMatrixRole),
                        (key) => handleToggleRolePermissionInternal(selectedMatrixRole, key)
                      )}
                      {renderPermGroup(
                        "Akses & Navigasi Menu Utama",
                        navigasiPerms,
                        getRolePermissions(selectedMatrixRole),
                        (key) => handleToggleRolePermissionInternal(selectedMatrixRole, key)
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>

    </div>
  </div>

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 p-6 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="font-sans font-bold text-base text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-650" />
              Sunting Detail Petugas: {editingUser.name}
            </h3>

            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Email Resmi</label>
                  <input
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Atur Kata Sandi Baru</label>
                  <input
                    type="password"
                    placeholder="Kosongkan jika tidak diubah"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                  />
                  <p className="text-[9px] text-gray-400 mt-1">Gunakan password yang kuat untuk keamanan akun ganda.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Peran (Role)</label>
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as Role)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-955 dark:text-white focus:outline-indigo-500 cursor-pointer"
                  >
                    {rolesList.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 p-3 bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={useRecipeUnits} 
                        onChange={(e) => setUseRecipeUnits(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-850 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-901 dark:text-white">Aktifkan Konversi Satuan Resep (Gram/Ml)</span>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-sans leading-tight">Jika aktif, petugas ini akan menerima barang dalam hitungan satuan resep dan stok akan otomatis dikalikan konversi.</p>
                    </div>
                  </label>
                </div>

                 <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-2">
                    Wilayah Sektor Penugasan (Dapat Pilih Lebih Dari 1)
                  </label>
                  {userRole === 'admin' ? (
                    <div className="p-3 rounded-xl bg-gray-50/70 dark:bg-zinc-950 border border-gray-150 dark:border-zinc-850 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                      Administrator otomatis memiliki akses penuh ke "Semua Gudang".
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 p-3 border border-gray-200 dark:border-zinc-850 rounded-xl bg-gray-50/50 dark:bg-zinc-950">
                      {(locations && locations.length > 0 ? locations : [
                        'Semua Gudang',
                        'Sektor B-4',
                        'Sektor C-1',
                        'Gudang Utama',
                        'Gudang Samping'
                      ]).map((loc) => {
                        const currentLocs = (userLocation || '').split(',').map(s => s.trim()).filter(Boolean);
                        const isChecked = currentLocs.includes(loc);
                        return (
                          <label
                            key={loc}
                            className={`flex items-center gap-2.5 p-2 px-3 rounded-lg border text-xs font-bold cursor-pointer transition-all select-none ${
                              isChecked
                                ? 'border-indigo-200 bg-indigo-50/40 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-400'
                                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                let updatedLocs: string[] = [];
                                if (loc === 'Semua Gudang') {
                                  if (e.target.checked) {
                                    updatedLocs = ['Semua Gudang'];
                                  } else {
                                    updatedLocs = [];
                                  }
                                } else {
                                  const filtered = currentLocs.filter(l => l !== 'Semua Gudang');
                                  if (e.target.checked) {
                                    updatedLocs = [...filtered, loc];
                                  } else {
                                    updatedLocs = filtered.filter(l => l !== loc);
                                  }
                                }
                                setUserLocation(updatedLocs.join(', ') || 'Semua Gudang');
                              }}
                              className="accent-indigo-600 rounded text-indigo-600 h-4 w-4"
                            />
                            <span className="truncate">{loc}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Specific Features Matrix */}
              <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 space-y-4 max-h-[350px] overflow-y-auto pr-1">
                <label className="block text-xs font-bold text-indigo-650 dark:text-indigo-400 mb-1">Otoritas Fitur Aplikasi (Sistem RBAC Manual)</label>
                
                {renderPermGroup(
                  "Menu DATA BARANG",
                  dataBarangPerms,
                  userPermissions,
                  (key) => setUserPermissions(prev => ({ ...prev, [key]: !prev[key] }))
                )}

                {renderPermGroup(
                  "Menu TRANSAKSI",
                  transaksiPerms,
                  userPermissions,
                  (key) => setUserPermissions(prev => ({ ...prev, [key]: !prev[key] }))
                )}

                {renderPermGroup(
                  "Akses & Navigasi Menu Utama",
                  navigasiPerms,
                  userPermissions,
                  (key) => setUserPermissions(prev => ({ ...prev, [key]: !prev[key] }))
                )}
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditUserModal(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-xl text-xs font-semibold cursor-pointer dark:text-zinc-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md"
                >
                  Simpan Perubahan ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-850 p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="font-sans font-bold text-base text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-650" />
              Daftarkan Petugas Baru
            </h3>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Rian Pratama"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Email Resmi</label>
                  <input
                    type="email"
                    required
                    placeholder="Contoh: rian@tnsp.co.id"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Kata Sandi Akun</label>
                  <input
                    type="password"
                    required
                    placeholder="Masukkan kata sandi untuk login"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 font-mono"
                  />
                  <p className="text-[9px] text-gray-400 mt-1">Gunakan kata sandi yang aman untuk login petugas.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1">Peran Akses Utama</label>
                  <select
                    value={userRole}
                    onChange={(e) => {
                      const role = e.target.value as Role;
                      setUserRole(role);
                      setUserPermissions(getRolePermissions(role));
                      if (role === 'admin') {
                        setUserLocation('Semua Gudang');
                      } else if (userLocation === 'Semua Gudang') {
                        setUserLocation('Sektor A-1');
                      }
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-indigo-500 cursor-pointer"
                  >
                    {rolesList.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={useRecipeUnits} 
                        onChange={(e) => setUseRecipeUnits(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-850 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-901 dark:text-white">Gunakan Satuan Resep</span>
                      <p className="text-[9px] text-gray-400 dark:text-zinc-500 font-sans leading-tight">Konversi otomatis saat terima mutasi.</p>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-2">
                    Lokasi Gudang / Sektor (Dapat Pilih Lebih Dari 1)
                  </label>
                  {userRole === 'admin' ? (
                    <div className="p-3 rounded-xl bg-gray-50/70 dark:bg-zinc-950 border border-gray-150 dark:border-zinc-850 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                      Administrator otomatis memiliki akses penuh ke "Semua Gudang".
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 p-3 border border-gray-200 dark:border-zinc-850 rounded-xl bg-gray-50/50 dark:bg-zinc-950 max-h-[140px] overflow-y-auto">
                      {(locations && locations.length > 0 ? locations : [
                        'Semua Gudang',
                        'Sektor B-4',
                        'Sektor C-1',
                        'Gudang Utama',
                        'Gudang Samping'
                      ]).map((loc) => {
                        const currentLocs = (userLocation || '').split(',').map(s => s.trim()).filter(Boolean);
                        const isChecked = currentLocs.includes(loc);
                        return (
                          <label
                            key={loc}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all select-none ${
                              isChecked
                                ? 'border-indigo-200 bg-indigo-50/40 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-400'
                                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                let updatedLocs: string[] = [];
                                if (loc === 'Semua Gudang') {
                                  if (e.target.checked) {
                                    updatedLocs = ['Semua Gudang'];
                                  } else {
                                    updatedLocs = [];
                                  }
                                } else {
                                  const filtered = currentLocs.filter(l => l !== 'Semua Gudang');
                                  if (e.target.checked) {
                                    updatedLocs = [...filtered, loc];
                                  } else {
                                    updatedLocs = filtered.filter(l => l !== loc);
                                  }
                                }
                                setUserLocation(updatedLocs.join(', ') || 'Semua Gudang');
                              }}
                              className="accent-indigo-600 rounded text-indigo-600 h-3.5 w-3.5"
                            />
                            <span className="truncate">{loc}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Specific Features Matrix for New User */}
                <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 space-y-4">
                  <label className="block text-xs font-bold text-indigo-650 dark:text-indigo-400 mb-1">Otoritas Fitur Aplikasi (Sistem RBAC Manual)</label>
                  
                  {renderPermGroup(
                    "Menu DATA BARANG",
                    dataBarangPerms,
                    userPermissions,
                    (key) => setUserPermissions(prev => ({ ...prev, [key]: !prev[key] }))
                  )}

                  {renderPermGroup(
                    "Menu TRANSAKSI",
                    transaksiPerms,
                    userPermissions,
                    (key) => setUserPermissions(prev => ({ ...prev, [key]: !prev[key] }))
                  )}

                  {renderPermGroup(
                    "Akses & Navigasi Menu Utama",
                    navigasiPerms,
                    userPermissions,
                    (key) => setUserPermissions(prev => ({ ...prev, [key]: !prev[key] }))
                  )}
                </div>

              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-805 rounded-xl text-xs font-semibold cursor-pointer dark:text-zinc-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Daftarkan Petugas ✓
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

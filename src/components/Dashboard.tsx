/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { 
  BarChart as RechartsBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Boxes, 
  AlertCircle, 
  ClipboardCheck, 
  ChevronRight,
  Database,
  Terminal,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  ClipboardList,
  Plus,
  Minus,
  Check,
  X,
  ChevronDown,
  History,
  RefreshCw,
  Image as ImageIcon,
  MapPin
} from 'lucide-react';
import { Product, User, Transaction, StockAlert, TransferRequest } from '../types';
import { SQL_SCHEMA_BLUEPRINT, isSupabaseConfigured } from '../lib/databaseService';

interface DashboardProps {
  products: Product[];
  transactions: Transaction[];
  alerts: StockAlert[];
  onChangeTab: (tab: string) => void;
  onIntentChange?: (intent: 'in' | 'out' | 'transfer' | 'audit') => void;
  currentUser: User;
  transfers: TransferRequest[];
  onApproveTransfer: (id: string) => Promise<void>;
  onRejectTransfer: (id: string) => Promise<void>;
}

export default function Dashboard({
  products,
  transactions,
  alerts,
  onChangeTab,
  onIntentChange,
  currentUser,
  transfers,
  onApproveTransfer,
  onRejectTransfer
}: DashboardProps) {

  const isUserRestricted = useMemo(() => {
    if (currentUser.role === 'admin') return false;
    if (!currentUser.location) return false;
    const locs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return !locs.includes('semua gudang');
  }, [currentUser]);

  const [confirmApproveId, setConfirmApproveId] = React.useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = React.useState<string | null>(null);
  const [selectedSector, setSelectedSector] = React.useState<string>('Semua Sektor');
  const [chartType, setChartType] = React.useState<'monthly' | 'product'>('monthly');

  const allSectors = useMemo(() => {
    const sectorsSet = new Set<string>();
    products.forEach(p => {
      if (p.location) {
        p.location.split(',').forEach(loc => {
          const trimmed = loc.trim();
          if (trimmed) sectorsSet.add(trimmed);
        });
      }
    });
    return Array.from(sectorsSet).sort();
  }, [products]);

  const outTransactionsWithSector = useMemo(() => {
    const productLocationMap = new Map<string, string>();
    products.forEach(p => {
      if (p.location) {
        productLocationMap.set(p.id, p.location.trim());
      }
    });

    return (transactions || [])
      .filter(t => t.type === 'out')
      .map(t => ({
        ...t,
        sector: productLocationMap.get(t.productId) || 'Lainnya'
      }));
  }, [transactions, products]);

  const filteredUsageTransactions = useMemo(() => {
    if (currentUser.role === 'admin') {
      if (selectedSector === 'Semua Sektor') {
        return outTransactionsWithSector;
      }
      return outTransactionsWithSector.filter(t => {
        const tSectors = t.sector.split(',').map(s => s.trim().toLowerCase());
        return tSectors.includes(selectedSector.toLowerCase());
      });
    } else {
      if (!currentUser.location) return [];
      const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
      if (userLocs.includes('semua gudang')) {
        return outTransactionsWithSector;
      }
      return outTransactionsWithSector.filter(t => {
        const tSectors = t.sector.split(',').map(s => s.trim().toLowerCase());
        return tSectors.some(s => userLocs.includes(s));
      });
    }
  }, [outTransactionsWithSector, currentUser.role, currentUser.location, selectedSector]);

  const monthlyUsageData = useMemo(() => {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli'];
    const usageByMonth: { [key: string]: number } = {};
    months.forEach(m => {
      usageByMonth[m] = 0;
    });

    filteredUsageTransactions.forEach(t => {
      if (!t.date) return;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return;
      const monthIdx = d.getMonth();
      if (monthIdx >= 0 && monthIdx < months.length) {
        const mName = months[monthIdx];
        usageByMonth[mName] += (t.qty || 0);
      }
    });

    return months.map(name => ({
      name,
      'Jumlah Pemakaian': usageByMonth[name]
    }));
  }, [filteredUsageTransactions]);

  const productUsageData = useMemo(() => {
    const usageByProduct: { [key: string]: number } = {};
    filteredUsageTransactions.forEach(t => {
      usageByProduct[t.productName] = (usageByProduct[t.productName] || 0) + t.qty;
    });

    return Object.entries(usageByProduct)
      .map(([name, qty]) => ({ name, 'Jumlah Pemakaian': qty }))
      .sort((a, b) => b['Jumlah Pemakaian'] - a['Jumlah Pemakaian'])
      .slice(0, 5);
  }, [filteredUsageTransactions]);

  const pendingTransfers = useMemo(() => {
    return (transfers || []).filter(t => {
      if (t.status !== 'pending') return false;
      if (isUserRestricted && currentUser.location) {
        const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
        return userLocs.includes(t.targetWarehouse.trim().toLowerCase());
      }
      return true;
    });
  }, [transfers, isUserRestricted, currentUser.location]);

  const accessibleProducts = useMemo(() => {
    if (!isUserRestricted || !currentUser.location) return products;
    const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
    return products.filter(p => {
      if (!p.location) return false;
      const prodLocs = p.location.split(',').map(l => l.trim().toLowerCase());
      return prodLocs.some(l => userLocs.includes(l));
    });
  }, [products, isUserRestricted, currentUser.location]);

  const accessibleTransactions = useMemo(() => {
    if (!isUserRestricted || !currentUser.location) return transactions;
    const allowedProductIds = new Set(accessibleProducts.map(p => p.id));
    return transactions.filter(t => {
      if (!t || !t.productId) return false;
      const isProductMatch = allowedProductIds.has(t.productId);
      if (isProductMatch) return true;
      
      return t.operatorName === currentUser.name;
    });
  }, [transactions, isUserRestricted, accessibleProducts, currentUser.name]);

  // 1. Calculations for Bento Cards
  const totalSKUs = (accessibleProducts || []).length;
  
  const totalVolume = useMemo(() => {
    return (accessibleProducts || []).reduce((sum, p) => sum + (p?.qty || 0), 0);
  }, [accessibleProducts]);

  const totalAssetValue = useMemo(() => {
    return (accessibleProducts || []).reduce((sum, p) => sum + ((p?.qty || 0) * (p?.price || 0)), 0);
  }, [accessibleProducts]);

  const assetValueBySector = useMemo(() => {
    const sectors: { [key: string]: number } = {};
    (accessibleProducts || []).forEach(p => {
      if (p.location && p.location.trim()) {
        const prodLocs = p.location.split(',').map(l => l.trim()).filter(Boolean);
        const splitValue = ((p?.qty || 0) * (p?.price || 0)) / (prodLocs.length || 1);
        prodLocs.forEach(loc => {
          sectors[loc] = (sectors[loc] || 0) + splitValue;
        });
      } else {
        sectors['Tanpa Sektor'] = (sectors['Tanpa Sektor'] || 0) + ((p?.qty || 0) * (p?.price || 0));
      }
    });
    return Object.entries(sectors)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.name.trim().toLowerCase() !== 'semua gudang')
      .sort((a, b) => b.value - a.value);
  }, [accessibleProducts]);

  const criticalItemsCount = useMemo(() => {
    return (accessibleProducts || []).filter(p => p && p.qty <= p.minQty).length;
  }, [accessibleProducts]);

  // Convert number to IDR currency format
  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // 2. monthly data aggregate for the Recharts graph
  const monthlyMovementData = useMemo(() => {
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    const monthlyData: { [key: string]: { masuk: number; keluar: number } } = {};
    monthNames.forEach(m => {
      monthlyData[m] = { masuk: 0, keluar: 0 };
    });

    (accessibleTransactions || []).forEach(t => {
      if (!t || !t.date) return;
      const date = new Date(t.date);
      if (isNaN(date.getTime())) return;
      
      const monthIdx = date.getMonth();
      if (monthIdx >= 0 && monthIdx < monthNames.length) {
        const monthName = monthNames[monthIdx];
        if (t.type === 'in') {
          monthlyData[monthName].masuk += (t.qty || 0);
        } else {
          monthlyData[monthName].keluar += (t.qty || 0);
        }
      }
    });

    return monthNames
      .filter(m => (monthlyData[m].masuk > 0 || monthlyData[m].keluar > 0))
      .map(name => ({
        name,
        'Barang Masuk': monthlyData[name].masuk,
        'Barang Keluar': monthlyData[name].keluar
      }));
  }, [accessibleTransactions]);

  // 3. Category Distribution memo
  const categoryAllocationData = useMemo(() => {
    const allocations: { [key: string]: number } = {};
    accessibleProducts.forEach(p => {
      allocations[p.category] = (allocations[p.category] || 0) + 1;
    });

    return Object.entries(allocations).map(([name, value]) => ({
      name,
      value
    })).sort((a, b) => b.value - a.value);
  }, [accessibleProducts]);

  // Category Colors
  const COLORS = ['#4f46e5', '#06b6d4', '#eab308', '#ec4899', '#10b981', '#f97316'];

  // Latest Movements feed
  const recentMovementsList = useMemo(() => {
    return accessibleTransactions.slice(0, 4);
  }, [accessibleTransactions]);

  return (
    <div className="space-y-6" id="dashboard-tab-content">
      
      {/* Top Welcome Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
        </div>
        <div className="flex items-center gap-2">
        </div>
      </div>

      {isUserRestricted && (
        <div className="flex">
          <button
            type="button"
            className="inline-flex items-center gap-2.5 px-3 py-1.5 bg-indigo-50/70 hover:bg-indigo-100/75 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 border border-indigo-100/50 dark:border-zinc-800 rounded-full text-xs font-semibold text-indigo-700 dark:text-indigo-400 shadow-xs transition-all cursor-pointer select-none"
            title={`Statistik dan ringkasan grafik dipersonalisasi eksklusif hanya untuk penugasan lokasi gudang "${currentUser.location}"`}
          >
            <MapPin className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] leading-none tracking-tight">
              Sektor Kerja: <strong className="text-indigo-800 dark:text-indigo-300 font-bold">{currentUser.location}</strong>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          </button>
        </div>
      )}

      {/* Bento Grid Stats */}
      <div className="grid grid-cols-1 gap-4">
        
        {/* Stat 3: Total Asset Valuation */}
        <div className="bento-cell p-5 group flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 dark:text-zinc-500">Nilai Aset Gudang</span>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-905 dark:text-white font-mono mt-1">{formatIDR(totalAssetValue)}</p>
            </div>
            <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/20 text-emerald-655 dark:text-emerald-400 rounded-xl group-hover:scale-110 transition-transform duration-300 flex items-center justify-center">
              <span className="w-5 h-5 flex items-center justify-center font-sans font-black text-xs leading-none select-none tracking-tight">Rp</span>
            </div>
          </div>

          {/* Rincian Aset Per Sektor */}
          {assetValueBySector.length > 0 && (
            <div className="mt-2 pt-4 border-t border-gray-100 dark:border-zinc-800">
              <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 block mb-2.5">
                Rincian Nilai Aset per Sektor / Lokasi
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {assetValueBySector.map(item => (
                  <div 
                    key={item.name} 
                    className="p-2.5 bg-gray-55/40 dark:bg-zinc-950/30 rounded-lg border border-gray-100/60 dark:border-zinc-800/40 flex flex-col justify-between transition-all hover:border-gray-200 dark:hover:border-zinc-700/60"
                  >
                    <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 truncate" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-xs font-black text-gray-800 dark:text-zinc-250 font-mono mt-1">
                      {formatIDR(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Grafik Pemakaian Barang Section */}
      <div className="bento-cell p-6 bg-white dark:bg-zinc-900 shadow-sm rounded-xl border border-gray-100 dark:border-zinc-800 text-left">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 dark:border-zinc-850 pb-4 mb-6 gap-4">
          <div>
            <h3 className="font-sans font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Grafik Pemakaian Barang (Barang Keluar)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Sector Filter for Admin */}
            {currentUser.role === 'admin' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Filter Sektor:</span>
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="Semua Sektor">Semua Sektor</option>
                  {allSectors.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-indigo-50/50 dark:bg-zinc-950/50 px-3 py-1.5 rounded-lg border border-indigo-100/50 dark:border-zinc-800/80">
                <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 font-sans">Sektor Terkunci:</span>
                <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">{currentUser.location || 'Tidak Ada'}</span>
              </div>
            )}

            {/* Toggle View Type */}
            <div className="flex items-center bg-gray-100 dark:bg-zinc-950 p-1 rounded-lg border border-gray-200/50 dark:border-zinc-800">
              <button
                onClick={() => setChartType('monthly')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  chartType === 'monthly'
                    ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:text-zinc-400'
                }`}
              >
                Tren Bulanan
              </button>
              <button
                onClick={() => setChartType('product')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  chartType === 'product'
                    ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:text-zinc-400'
                }`}
              >
                Top 5 Produk
              </button>
            </div>
          </div>
        </div>

        {filteredUsageTransactions.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-gray-400 dark:text-zinc-500 bg-gray-50/30 dark:bg-zinc-950/20 rounded-xl border border-dashed border-gray-200 dark:border-zinc-850">
            <Boxes className="w-10 h-10 text-gray-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm font-bold text-gray-700 dark:text-zinc-300">Tidak Ada Data Pemakaian Barang</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm px-4">
              Belum ada pencatatan transaksi keluar (pemakaian) yang terdaftar untuk sektor/filter yang dipilih.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="h-64 sm:h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'monthly' ? (
                  <AreaChart data={monthlyUsageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e1e2e" className="hidden dark:block" />
                    <XAxis 
                      dataKey="name" 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e1b4b',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '11px'
                      }}
                      formatter={(value: number) => [`${value} unit`, 'Jumlah Pemakaian']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="Jumlah Pemakaian" 
                      stroke="#4f46e5" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#usageGradient)" 
                    />
                  </AreaChart>
                ) : (
                  <RechartsBarChart data={productUsageData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e1e2e" className="hidden dark:block" />
                    <XAxis 
                      dataKey="name" 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e1b4b',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '11px'
                      }}
                      formatter={(value: number) => [`${value} unit`, 'Jumlah Pemakaian']}
                    />
                    <Bar 
                      dataKey="Jumlah Pemakaian" 
                      fill="#06b6d4" 
                      radius={[4, 4, 0, 0]} 
                      maxBarSize={45}
                    />
                  </RechartsBarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Custom Mini Summary Cards below the chart */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-3.5 rounded-xl border border-gray-100 dark:border-zinc-850 bg-slate-50/50 dark:bg-zinc-950/40 text-left">
                <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500">Total Transaksi Keluar</span>
                <p className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                  {filteredUsageTransactions.length} <span className="text-xs font-normal text-gray-400">kali</span>
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-gray-100 dark:border-zinc-850 bg-slate-50/50 dark:bg-zinc-950/40 text-left">
                <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500">Total Volume Pemakaian</span>
                <p className="text-lg font-extrabold text-cyan-600 dark:text-cyan-400 mt-1">
                  {filteredUsageTransactions.reduce((acc, curr) => acc + curr.qty, 0)} <span className="text-xs font-normal text-gray-400">unit</span>
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-gray-100 dark:border-zinc-850 bg-slate-50/50 dark:bg-zinc-950/40 text-left">
                <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500">Rata-Rata per Transaksi</span>
                <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                  {Math.round(filteredUsageTransactions.reduce((acc, curr) => acc + curr.qty, 0) / (filteredUsageTransactions.length || 1))} <span className="text-xs font-normal text-gray-400">unit</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

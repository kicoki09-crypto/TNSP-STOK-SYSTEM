/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  Search, 
  ArrowRight, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Box, 
  Play,
  RotateCcw,
  Plus,
  ArrowDownCircle,
  Package
} from 'lucide-react';
import { BOM, Product, User } from '../types';

interface ProductionManagerProps {
  boms: BOM[];
  products: Product[];
  currentUser: User;
  onProduce: (bom: BOM, batchCount: number, requirements: { productId: string, qty: number }[]) => Promise<void>;
  onClose: () => void;
}

export default function ProductionManager({ boms, products, currentUser, onProduce, onClose }: ProductionManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const filteredBoms = useMemo(() => {
    let list = boms || [];
    if (currentUser?.role !== 'admin' && currentUser?.location) {
      const userLocs = currentUser.location.split(',').map(l => l.trim().toLowerCase());
      if (!userLocs.includes('semua gudang')) {
        list = list.filter(b => b && b.location && userLocs.includes(b.location.trim().toLowerCase()));
      }
    }
    if (searchTerm) {
      list = list.filter(b => b && b.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list;
  }, [boms, currentUser, searchTerm]);

  const selectedBom = useMemo(() => (boms || []).find(b => b && b.id === selectedBomId), [boms, selectedBomId]);

  const productionAnalysis = useMemo(() => {
    if (!selectedBom || !selectedBom.items) return null;

    const requirements = (selectedBom.items || []).map(item => {
      const product = (products || []).find(p => p && p.id === item.productId);
      const totalRequired = item.qty * batchCount;
      const currentStock = product?.qty || 0;
      const isAvailable = currentStock >= totalRequired;

      return {
        ...item,
        totalRequired,
        currentStock,
        isAvailable,
        productSku: product?.sku || 'N/A',
        purchaseUnit: product?.purchaseUnit || product?.unit
      };
    });

    const isTotalAvailable = requirements.every(r => r.isAvailable);
    const totalYield = selectedBom.yieldQty * batchCount;

    return {
      requirements,
      isTotalAvailable,
      totalYield
    };
  }, [selectedBom, batchCount, products]);

  const handleProduce = async () => {
    if (!selectedBom || !productionAnalysis?.isTotalAvailable) return;

    setIsProcessing(true);
    setError(null);

    try {
      const requirements = productionAnalysis.requirements.map(r => ({
        productId: r.productId,
        qty: r.totalRequired
      }));

      await onProduce(selectedBom, batchCount, requirements);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSelectedBomId(null);
        setBatchCount(1);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat proses produksi.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">MODUL PRODUKSI BOM</h2>
            <p className="text-xs text-gray-500 dark:text-zinc-500 font-medium">Lakukan perakitan atau produksi paket berdasarkan resep Bill of Materials.</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
        >
          <RotateCcw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: BOM Selector */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Cari daftar BOM..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
            />
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-850 overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
            {filteredBoms.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-xs italic">
                Tidak ada data BOM ditemukan.
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-zinc-850">
                {filteredBoms.map(bom => (
                  <button
                    key={bom.id}
                    onClick={() => {
                        setSelectedBomId(bom.id);
                        setSuccess(false);
                        setError(null);
                    }}
                    className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-zinc-805/50 transition-colors flex items-center justify-between group ${selectedBomId === bom.id ? 'bg-violet-50/50 dark:bg-violet-900/10' : ''}`}
                  >
                    <div>
                      <h4 className={`text-sm font-bold ${selectedBomId === bom.id ? 'text-violet-700 dark:text-violet-400' : 'text-gray-900 dark:text-white'}`}>
                        {bom.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] p-1 px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 rounded-md font-bold uppercase tracking-tighter">
                          {bom.location}
                        </span>
                        <span className="text-[10px] text-gray-400">• {bom.items.length} Komponen</span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all ${selectedBomId === bom.id ? 'text-violet-500 translate-x-1' : ''}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Details and Action */}
        <div className="lg:col-span-2">
          {selectedBom ? (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              
              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-200 dark:border-zinc-850 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 dark:border-zinc-850 bg-gray-50/30 dark:bg-zinc-950/20">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                        {selectedBom.name}
                        <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 text-[10px] font-bold rounded-full uppercase tracking-widest">
                          Aktif
                        </span>
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">Lokasi: {selectedBom.location} | Yield Dasar: {selectedBom.yieldQty} {selectedBom.yieldUnit}</p>
                    </div>

                    <div className="flex items-center gap-3 bg-white dark:bg-zinc-950 p-2 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-inner">
                        <label className="text-[10px] font-bold text-gray-400 uppercase px-2">Jumlah Batch</label>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setBatchCount(Math.max(0.1, Math.round((batchCount - 1) * 100) / 100))}
                                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                            >-</button>
                            <input 
                                type="number" 
                                step="any"
                                min="0.01"
                                value={batchCount}
                                onChange={e => {
                                  const val = parseFloat(String(e.target.value).replace(/,/g, '.'));
                                  setBatchCount(isNaN(val) ? 0 : Math.max(0.01, val));
                                }}
                                className="w-16 text-center font-bold text-gray-900 dark:text-white bg-transparent outline-none font-mono"
                            />
                            <button 
                                onClick={() => setBatchCount(Math.round((batchCount + 1) * 100) / 100)}
                                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                            >+</button>
                        </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Box className="w-4 h-4 text-violet-500" />
                    Kalkulasi Kebutuhan Bahan
                  </h4>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-50 dark:border-zinc-850">
                          <th className="py-3 text-[10px] font-bold text-gray-400 uppercase">Input Barang</th>
                          <th className="py-3 text-[10px] font-bold text-gray-400 uppercase text-center">Stok Saat Ini</th>
                          <th className="py-3 text-[10px] font-bold text-gray-400 uppercase text-center">Dibutuhkan</th>
                          <th className="py-3 text-[10px] font-bold text-gray-400 uppercase text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-zinc-850">
                        {productionAnalysis?.requirements.map(req => (
                          <tr key={req.productId} className="group">
                            <td className="py-4">
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{req.productName}</p>
                              <p className="text-[10px] text-gray-400 font-mono">SKU: {req.productSku}</p>
                            </td>
                            <td className="py-4 text-center">
                              <span className="text-xs font-bold text-gray-700 dark:text-zinc-300 font-mono">{req.currentStock} {req.purchaseUnit || req.unit}</span>
                            </td>
                            <td className="py-4 text-center">
                              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">{req.totalRequired} {req.purchaseUnit || req.unit}</span>
                            </td>
                            <td className="py-4 text-right">
                              {req.isAvailable ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase">
                                  <CheckCircle2 className="w-3 h-3" /> Cukup
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-500 dark:text-rose-400 uppercase">
                                  <AlertCircle className="w-3 h-3" /> Kurang
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-8 p-4 bg-gray-50 dark:bg-zinc-950/40 rounded-2xl border border-gray-100 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">
                            <ArrowDownCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">Hasil Produksi (Yield)</p>
                            <p className="text-lg font-black text-gray-900 dark:text-white">
                                {productionAnalysis?.totalYield} {selectedBom.yieldUnit}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        {success ? (
                            <div className="bg-emerald-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 text-sm font-bold animate-in zoom-in-95">
                                <CheckCircle2 className="w-5 h-5" />
                                Produksi Berhasil!
                            </div>
                        ) : error ? (
                            <div className="bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        ) : (
                            <button
                                onClick={handleProduce}
                                disabled={!productionAnalysis?.isTotalAvailable || isProcessing}
                                className={`flex items-center gap-2 px-10 py-3 rounded-xl font-black text-sm tracking-wide transition-all shadow-lg active:scale-95 ${
                                    productionAnalysis?.isTotalAvailable 
                                        ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200 dark:shadow-none' 
                                        : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed shadow-none'
                                }`}
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        PROSES PRODUKSI...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-5 h-5 fill-current" />
                                        EKSEKUSI PRODUKSI
                                    </>
                                )}
                            </button>
                        )}
                        {!productionAnalysis?.isTotalAvailable && !success && (
                            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-tight">Stok bahan tidak mencukupi untuk batch ini.</p>
                        )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed font-sans font-medium">
                  <strong>Penting:</strong> Tombol eksekusi produksi akan mengurangi stok masing-masing komponen dan menambah stok barang jadi ({selectedBom.name}) secara otomatis. Pastikan data barang jadi sudah terdaftar pada menu Inventaris dengan nama yang persis sama.
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-gray-200 dark:border-zinc-800 p-12 text-center text-gray-400">
               <Package className="w-16 h-16 mb-4 opacity-20" />
               <h3 className="text-lg font-bold text-gray-900 dark:text-gray-200 mb-2">Pilih BOM untuk Diproduksi</h3>
               <p className="text-sm max-w-xs mx-auto">Silakan pilih salah satu data Bill of Materials dari daftar di samping untuk memulai kalkulasi produksi.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

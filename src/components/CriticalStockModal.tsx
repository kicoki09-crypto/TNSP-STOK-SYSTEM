/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Product } from '../types';
import { 
  AlertTriangle, 
  X, 
  ArrowRight, 
  Package, 
  PlusCircle, 
  Bell, 
  CheckCircle2, 
  MapPin,
  ShieldAlert,
  Printer
} from 'lucide-react';
import { requestNotificationPermission, getNotificationPermissionStatus } from '../lib/pushNotification';

interface CriticalStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  criticalProducts: Product[];
  onNavigateToStockIn?: (productId: string) => void;
  onNavigateToInventory?: () => void;
}

export default function CriticalStockModal({
  isOpen,
  onClose,
  criticalProducts,
  onNavigateToStockIn,
  onNavigateToInventory
}: CriticalStockModalProps) {
  const [notifPermission, setNotifPermission] = useState(getNotificationPermissionStatus());

  if (!isOpen || criticalProducts.length === 0) return null;

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(getNotificationPermissionStatus());
    if (granted && 'Notification' in window) {
      try {
        new Notification('🔔 Notifikasi Device Aktif', {
          body: `Sistem akan memberikan peringatan pop-up di layar device jika stok berada di level kritis.`,
          icon: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200'
        });
      } catch (e) {
        console.warn('Gagal memicu native notification test', e);
      }
    }
  };

  return (
    <div 
      id="critical-stock-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div 
        id="critical-stock-modal-card"
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-rose-200 dark:border-rose-900/50 overflow-hidden my-auto animate-in zoom-in-95 duration-200"
      >
        {/* Top Glowing Banner */}
        <div className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md ring-2 ring-white/20 animate-pulse">
              <AlertTriangle className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <h2 className="font-sans font-black text-lg sm:text-xl tracking-tight leading-tight flex items-center gap-2">
                PERINGATAN STOK KRITIS
                <span className="bg-white/20 text-white font-mono text-xs px-2 py-0.5 rounded-full font-bold">
                  {criticalProducts.length} Barang
                </span>
              </h2>
              <p className="text-xs text-rose-100 mt-0.5">
                Stok barang berikut telah menyentuh atau berada di bawah batas minimum gudang.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="close-critical-modal-btn"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Device Push Notification Banner */}
        <div className="bg-rose-50/80 dark:bg-rose-950/30 px-5 py-2.5 border-b border-rose-100 dark:border-rose-900/40 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200">
            <Bell className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="font-medium text-[11px] sm:text-xs">
              Notifikasi Layar Device (PWA):
            </span>
          </div>

          {notifPermission === 'granted' ? (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-[11px] bg-emerald-100/80 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> Aktif di Device
            </span>
          ) : (
            <button
              onClick={handleRequestPermission}
              className="inline-flex items-center gap-1 font-bold text-white text-[11px] bg-rose-600 hover:bg-rose-700 px-3 py-1 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Aktifkan Pop-up Device
            </button>
          )}
        </div>

        {/* List of Critical Items */}
        <div className="p-4 sm:p-5 max-h-[50vh] sm:max-h-[55vh] overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800 space-y-3">
          {criticalProducts.map((product) => {
            const isOutOfStock = product.qty === 0;
            const deficit = Math.max(0, product.minQty - product.qty);

            return (
              <div 
                key={product.id}
                className="pt-3 first:pt-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-2xl bg-gray-50/70 dark:bg-zinc-800/40 border border-gray-150 dark:border-zinc-800 hover:border-rose-300 dark:hover:border-rose-800 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-zinc-700 overflow-hidden shrink-0 border border-gray-200 dark:border-zinc-600 flex items-center justify-center">
                    {product.imageUrl ? (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {product.name}
                      </h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300">
                        {product.sku}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-zinc-400 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {product.location}
                      </span>
                      <span>Kategori: <b>{product.category}</b></span>
                    </div>
                  </div>
                </div>

                {/* Stock details badge */}
                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-200 dark:border-zinc-700">
                  <div className="text-left sm:text-right">
                    <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                      <span className="text-xs text-gray-400">Stok:</span>
                      <span className="font-mono text-base font-black text-rose-600 dark:text-rose-400">
                        {product.qty} {product.purchaseUnit || product.unit}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      Batas Min: <span className="font-medium text-gray-600 dark:text-zinc-300">{product.minQty}</span> | Defisit: <span className="text-rose-600 font-bold">-{deficit}</span>
                    </p>
                  </div>

                  {onNavigateToStockIn && (
                    <button
                      onClick={() => onNavigateToStockIn(product.id)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
                      title="Tambah Stok (Barang Masuk)"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Re-stock</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-gray-50 dark:bg-zinc-950 border-t border-gray-150 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 text-center sm:text-left">
            Segera lakukan pengadaan atau barang masuk untuk mencegah kehabisan stok operasional.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onNavigateToInventory && (
              <button
                onClick={() => {
                  onNavigateToInventory();
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs w-full sm:w-auto"
              >
                <span>Lihat Inventaris</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              id="close-critical-modal-footer-btn"
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 font-bold text-xs transition-all cursor-pointer w-full sm:w-auto"
            >
              Tutup Pop-up
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

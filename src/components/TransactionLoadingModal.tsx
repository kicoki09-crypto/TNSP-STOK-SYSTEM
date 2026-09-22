/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2, CheckCircle2, PackageCheck } from 'lucide-react';

export interface TransactionLoadingModalProps {
  isOpen: boolean;
  percentage: number;
  title?: string;
  detail?: string;
  currentItem?: number;
  totalItems?: number;
}

export default function TransactionLoadingModal({
  isOpen,
  percentage,
  title = 'Memproses Transaksi...',
  detail = 'Mohon tunggu sejenak, sistem sedang memperbarui data inventaris.',
  currentItem,
  totalItems
}: TransactionLoadingModalProps) {
  if (!isOpen) return null;

  const validPercentage = Math.min(100, Math.max(0, Math.round(percentage)));
  const isComplete = validPercentage >= 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-5 text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
        
        {/* Subtle Background Glow Accent */}
        <div 
          className={`absolute -top-12 -left-12 w-32 h-32 rounded-full blur-2xl opacity-20 pointer-events-none transition-colors duration-500 ${
            isComplete ? 'bg-emerald-500' : 'bg-indigo-500'
          }`} 
        />
        <div 
          className={`absolute -bottom-12 -right-12 w-32 h-32 rounded-full blur-2xl opacity-20 pointer-events-none transition-colors duration-500 ${
            isComplete ? 'bg-emerald-500' : 'bg-indigo-500'
          }`} 
        />

        {/* Icon Header */}
        <div className="relative flex justify-center pt-1">
          <div className={`p-4 rounded-2xl border transition-all duration-300 ${
            isComplete
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 scale-105'
              : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
          }`}>
            {isComplete ? (
              <CheckCircle2 className="w-8 h-8 animate-bounce" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin" />
            )}
          </div>
        </div>

        {/* Title & Detail */}
        <div className="space-y-1 relative">
          <h3 className="font-black text-base text-gray-900 dark:text-white leading-tight">
            {title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium line-clamp-2 px-2">
            {detail}
          </p>
        </div>

        {/* Percentage Display & Progress Bar */}
        <div className="space-y-2 pt-1 relative">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-gray-400 dark:text-zinc-500 text-[11px] font-sans font-semibold">
              {currentItem !== undefined && totalItems !== undefined && totalItems > 0
                ? `Item ${currentItem} dari ${totalItems}`
                : 'Progres Pemrosesan'}
            </span>
            <span className={`font-black text-base font-mono ${
              isComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'
            }`}>
              {validPercentage}%
            </span>
          </div>

          {/* Progress Bar Container */}
          <div className="w-full h-3 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-gray-200/60 dark:border-zinc-700/50 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isComplete
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500'
              }`}
              style={{ width: `${validPercentage}%` }}
            />
          </div>
        </div>

        {/* Processing Indicator Footnote */}
        <div className="pt-1 text-[11px] text-gray-400 dark:text-zinc-500 font-medium flex items-center justify-center gap-1.5">
          <PackageCheck className="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span>Sinkronisasi database logistik realtime</span>
        </div>

      </div>
    </div>
  );
}

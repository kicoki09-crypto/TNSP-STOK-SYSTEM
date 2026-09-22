/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StorageEngine
 * Provides high-capacity IndexedDB storage for large datasets (products, images, transactions, logs, BOMs, menus)
 * with transparent localStorage caching, quota-safe fallback, and automatic migration.
 */

const DB_NAME = 'TNSP_GUDANG_APP_DB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval_store';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memoryCache = new Map<string, any>();

// Open or get IndexedDB instance
export function getIDBDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = (event: Event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          resolve(db);
        };

        request.onerror = (err) => {
          console.warn('[IndexedDB] Gagal membuka database:', err);
          resolve(null);
        };
      } catch (err) {
        console.warn('[IndexedDB] Exception saat membuka database:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/**
 * Safely writes to localStorage without crashing when quota is exceeded.
 * Automatically cleans or trims payload if needed.
 */
export function safeLocalStorageSet(key: string, value: any): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const stringified = typeof value === 'string' ? value : JSON.stringify(value);
    window.localStorage.setItem(key, stringified);
  } catch (err: any) {
    console.warn(`[StorageEngine] LocalStorage quota exceeded on key "${key}". Menangani dengan aman...`);

    // Strategy 1: If it's products list or transactions list, create a compact version (omit or downsize heavy images)
    try {
      if (Array.isArray(value)) {
        if (key === 'gudang_products') {
          // Strip heavy image URLs for localStorage mirror (IndexedDB still has the full original)
          const compactProducts = value.map((p: any) => {
            if (p && p.imageUrl && p.imageUrl.startsWith('data:')) {
              return { ...p, imageUrl: undefined };
            }
            return p;
          });
          window.localStorage.setItem(key, JSON.stringify(compactProducts));
          return;
        } else if (key === 'gudang_transactions' || key === 'gudang_logs') {
          // Keep only the latest 100 entries for localStorage mirror
          const trimmed = value.slice(0, 100);
          window.localStorage.setItem(key, JSON.stringify(trimmed));
          return;
        }
      }
    } catch {
      // Ignore secondary error
    }

    // Strategy 2: Remove non-critical storage keys to free space
    try {
      window.localStorage.removeItem('gudang_logs');
      window.localStorage.removeItem('gudang_alerts');
    } catch {
      // Ignore
    }
  }
}

/**
 * Safely reads from localStorage
 */
export function safeLocalStorageGet<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Safely removes item from localStorage
 */
export function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * IndexedDB Async Get
 */
export async function storageGet<T>(key: string, defaultValue: T): Promise<T> {
  // Check memory cache first
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }

  const db = await getIDBDatabase();
  if (db) {
    try {
      const val = await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (val !== undefined && val !== null) {
        memoryCache.set(key, val);
        return val;
      }
    } catch (err) {
      console.warn(`[StorageEngine] Gagal membaca dari IndexedDB untuk key "${key}":`, err);
    }
  }

  // Fallback to localStorage
  const fallbackVal = safeLocalStorageGet<T>(key, defaultValue);
  memoryCache.set(key, fallbackVal);
  return fallbackVal;
}

/**
 * IndexedDB Async Set
 */
export async function storageSet<T>(key: string, value: T): Promise<void> {
  // Update memory cache
  memoryCache.set(key, value);

  // Update localStorage mirror safely
  safeLocalStorageSet(key, value);

  // Write to IndexedDB
  const db = await getIDBDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`[StorageEngine] Gagal menyimpan ke IndexedDB untuk key "${key}":`, err);
    }
  }
}

/**
 * IndexedDB Async Remove
 */
export async function storageRemove(key: string): Promise<void> {
  memoryCache.delete(key);
  safeLocalStorageRemove(key);

  const db = await getIDBDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`[StorageEngine] Gagal menghapus dari IndexedDB untuk key "${key}":`, err);
    }
  }
}

/**
 * IndexedDB Async Clear
 */
export async function storageClear(): Promise<void> {
  memoryCache.clear();

  const keysToRemove = [
    'gudang_products',
    'gudang_transactions',
    'gudang_alerts',
    'gudang_logs',
    'gudang_transfers',
    'gudang_boms',
    'gudang_menus',
    'gudang_custom_categories',
    'gudang_custom_locations'
  ];

  keysToRemove.forEach(k => safeLocalStorageRemove(k));

  const db = await getIDBDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[StorageEngine] Gagal membersihkan IndexedDB:', err);
    }
  }
}

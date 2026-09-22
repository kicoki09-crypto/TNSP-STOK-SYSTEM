/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAccessToken, app } from './googleAuth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { Product, Transaction, StockAlert, SystemLog, Role, TransferRequest, User, BOM, MenuItem } from '../types';

const SPREADSHEET_NAME = 'Kicoki_Inventory_Gudang_DB';

// Definitions of sheet names and their columns
export const SHEETS_CONFIG: { [key: string]: string[] } = {
  Products: [
    'id', 'name', 'sku', 'description', 'category', 'qty', 'minQty', 'location', 
    'price', 'unit', 'purchaseUnit', 'recipeUnit', 'conversionFactor', 'unitPrice', 
    'expiryDate', 'batchNumber', 'imageUrl', 'createdAt', 'updatedAt', 'lastUpdatedBy'
  ],
  Transactions: [
    'id', 'productId', 'productName', 'sku', 'type', 'qty', 'note', 'date', 
    'operatorName', 'operatorRole', 'isAudit', 'systemQty', 'physicalQty', 'difference', 
    'location', 'expiryDate', 'batchNumber'
  ],
  Alerts: [
    'id', 'productId', 'productName', 'sku', 'qty', 'minQty', 'timestamp', 'isRead'
  ],
  Categories: [
    'id', 'name'
  ],
  Locations: [
    'id', 'name'
  ],
  Users: [
    'id', 'name', 'email', 'role', 'password', 'avatarUrl', 'location', 'permissions'
  ],
  Logs: [
    'id', 'timestamp', 'action', 'userName', 'details'
  ],
  Transfers: [
    'id', 'productId', 'productName', 'productSku', 'qty', 'originWarehouse', 
    'targetWarehouse', 'status', 'date', 'requestedBy', 'approvedBy', 'approvedDate'
  ],
  BOMs: [
    'id', 'name', 'location', 'yieldQty', 'yieldUnit', 'items', 'totalCost', 'createdAt'
  ],
  Menus: [
    'id', 'name', 'unit', 'location', 'category', 'ingredients', 'totalHpp', 'createdAt'
  ]
};

/**
 * Finds column index matching exact, normalized, or common aliases (e.g. imageUrl / gambar / foto)
 */
export function findHeaderIndex(headers: any[], colName: string): number {
  if (!Array.isArray(headers) || headers.length === 0) return -1;
  
  // 1. Direct exact match
  const directIdx = headers.indexOf(colName);
  if (directIdx !== -1) return directIdx;

  // 2. Case-insensitive exact match
  const colLower = colName.toLowerCase();
  const caseIdx = headers.findIndex(h => typeof h === 'string' && h.trim().toLowerCase() === colLower);
  if (caseIdx !== -1) return caseIdx;

  // 3. Normalized alias matching for images and photos
  if (colName === 'imageUrl') {
    const aliases = ['imageurl', 'image', 'gambar', 'foto', 'fotobarang', 'gambarbarang', 'image_url', 'productimage', 'photo', 'picture', 'urlfoto'];
    const aliasIdx = headers.findIndex(h => {
      if (typeof h !== 'string') return false;
      const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return aliases.includes(clean);
    });
    if (aliasIdx !== -1) return aliasIdx;
  }

  if (colName === 'avatarUrl') {
    const aliases = ['avatarurl', 'avatar', 'foto', 'photo', 'image', 'profileimage', 'fotoprofil', 'avatar_url'];
    const aliasIdx = headers.findIndex(h => {
      if (typeof h !== 'string') return false;
      const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return aliases.includes(clean);
    });
    if (aliasIdx !== -1) return aliasIdx;
  }

  return -1;
}

let cachedSpreadsheetId: string | null = null;

// Proxy HTTP requests to Google Apps Script Web App
async function fetchViaAppsScript(appsScriptUrl: string, endpoint: string, options: RequestInit = {}) {
  let sheetName = '';
  if (endpoint.includes('/values/')) {
    const parts = endpoint.split('/values/');
    const sheetPart = parts[1].split('!')[0];
    sheetName = decodeURIComponent(sheetPart);
  }

  const isPost = options.method === 'POST';
  const isPut = options.method === 'PUT';

  if (isPost || isPut) {
    let action = 'append';
    let values: any[] = [];

    if (endpoint.endsWith(':clear')) {
      action = 'clear';
    } else if (isPut) {
      action = 'overwrite';
    }

    if (options.body) {
      try {
        const bodyObj = JSON.parse(options.body as string);
        if (bodyObj.values) {
          values = bodyObj.values;
        }
      } catch (e) {
        console.warn('Gagal membaca body kiriman untuk Apps Script:', e);
      }
    }

    const payload = {
      action,
      sheetName,
      values
    };

    if (action === 'append' && Array.isArray(values) && values.length > 1 && Array.isArray(values[0])) {
      // Loop sequentially to guarantee every single row is appended in order,
      // fully compatible with deployed Apps Script Web Apps that only call appendRow on the first element.
      for (const singleRow of values) {
        const singlePayload = {
          action: 'append',
          sheetName,
          values: [singleRow]
        };
        const singleResp = await fetch(appsScriptUrl, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(singlePayload)
        });
        if (!singleResp.ok) {
          throw new Error(`Apps Script POST append row gagal dengan status ${singleResp.status}`);
        }
      }
      return { success: true, count: values.length };
    }

    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Apps Script POST gagal dengan status ${response.status}`);
    }

    const resText = await response.text();
    try {
      return JSON.parse(resText);
    } catch {
      return { success: true };
    }
  } else {
    // GET - Membaca data
    const response = await fetch(`${appsScriptUrl}?action=read&sheetName=${encodeURIComponent(sheetName)}`, {
      method: 'GET',
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(`Apps Script GET gagal dengan status ${response.status}`);
    }

    const resText = await response.text();
    try {
      const data = JSON.parse(resText);
      return { values: data.values || [] };
    } catch (e) {
      console.error('Gagal membaca JSON dari Google Apps Script:', resText, e);
      throw new Error('Format respon Google Apps Script tidak valid');
    }
  }
}

// Initialize Drive and Sheets APIs helper with retry on rate limit (429) or transient 503
async function fetchGoogleAPI(endpoint: string, options: RequestInit = {}, retries = 3, delayMs = 1500): Promise<any> {
  const token = await getAccessToken();
  const appsScriptUrl = localStorage.getItem('gudang_apps_script_url');

  if (!token || token === 'apps-script-bypass') {
    if (appsScriptUrl) {
      return fetchViaAppsScript(appsScriptUrl, endpoint, options);
    }
    throw new Error('Token Google OAuth atau Link Apps Script tidak tersedia. Silakan hubungkan terlebih dahulu.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  // Determine correct base URL based on the endpoint
  let url = '';
  if (endpoint.startsWith('sheets/')) {
    url = `https://sheets.googleapis.com/${endpoint.slice(7)}`;
  } else if (endpoint.startsWith('drive/')) {
    url = `https://www.googleapis.com/${endpoint}`;
  } else {
    url = endpoint.startsWith('http') ? endpoint : `https://www.googleapis.com/${endpoint}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    // If rate-limited (429) or service unavailable (503), wait and retry
    if ((response.status === 429 || response.status === 503) && retries > 0) {
      console.warn(`Google API Rate limit (429/503) on ${endpoint}. Retrying in ${delayMs}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return fetchGoogleAPI(endpoint, options, retries - 1, delayMs * 2);
    }

    const errText = await response.text();
    console.warn(`Google API Error on ${endpoint}:`, errText);
    throw new Error(`Google API request failed: ${response.status} - ${errText || response.statusText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

/**
 * Finds or creates the Google Spreadsheet used as database
 */
export async function getOrCreateSpreadsheetId(forceRefresh = false): Promise<string> {
  const appsScriptUrl = localStorage.getItem('gudang_apps_script_url');
  const token = await getAccessToken();

  if (appsScriptUrl && (!token || token === 'apps-script-bypass')) {
    return 'apps-script-bypass-id';
  }

  if (cachedSpreadsheetId && !forceRefresh) {
    return cachedSpreadsheetId;
  }

  const saved = localStorage.getItem('gudang_google_sheets_db_id');
  if (saved && !forceRefresh) {
    cachedSpreadsheetId = saved;
    return saved;
  }

  try {
    // 1. Search Google Drive for spreadsheet
    const query = encodeURIComponent(`name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const searchResult = await fetchGoogleAPI(`drive/v3/files?q=${query}&fields=files(id,name)`);
    
    if (searchResult.files && searchResult.files.length > 0) {
      const spreadsheetId = searchResult.files[0].id;
      cachedSpreadsheetId = spreadsheetId;
      localStorage.setItem('gudang_google_sheets_db_id', spreadsheetId);
      saveSharedSheetsConfig(appsScriptUrl || '', spreadsheetId);
      return spreadsheetId;
    }

    // 2. Create a new Spreadsheet with all required sheets
    const sheetsToCreate = Object.keys(SHEETS_CONFIG).map(sheetName => ({
      properties: { title: sheetName }
    }));

    const createBody = {
      properties: { title: SPREADSHEET_NAME },
      sheets: sheetsToCreate
    };

    const newSpreadsheet = await fetchGoogleAPI('sheets/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify(createBody)
    });

    const spreadsheetId = newSpreadsheet.spreadsheetId;
    cachedSpreadsheetId = spreadsheetId;
    localStorage.setItem('gudang_google_sheets_db_id', spreadsheetId);
    saveSharedSheetsConfig(appsScriptUrl || '', spreadsheetId);

    // 3. Write Headers for each sheet
    for (const sheetName of Object.keys(SHEETS_CONFIG)) {
      const headers = SHEETS_CONFIG[sheetName];
      await fetchGoogleAPI(`sheets/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({
          values: [headers]
        })
      });
    }

    return spreadsheetId;
  } catch (error) {
    console.warn('Failed to get or create spreadsheet:', error);
    throw error;
  }
}

/**
 * Reads all rows from a specific sheet and maps them to clean objects
 */
export async function readSheet<T>(sheetName: string): Promise<T[]> {
  try {
    const spreadsheetId = await getOrCreateSpreadsheetId();
    const columns = SHEETS_CONFIG[sheetName];
    const data = await fetchGoogleAPI(`sheets/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:Z5000`);
    
    if (!data.values || data.values.length <= 1) {
      return [];
    }

    const headers = data.values[0];
    const rows = data.values.slice(1);

    return rows.map((row: any[]) => {
      const obj: any = {};
      columns.forEach((colName) => {
        const headerIdx = findHeaderIndex(headers, colName);
        if (headerIdx !== -1) {
          const val = row[headerIdx];
          
          // Parse numeric, boolean, and JSON fields correctly
          if (val === undefined || val === null || val === '') {
            obj[colName] = colName === 'isRead' || colName === 'isAudit' ? false : (colName === 'qty' || colName === 'minQty' || colName === 'price' || colName === 'unitPrice' || colName === 'conversionFactor' || colName === 'totalCost' || colName === 'totalHpp' ? 0 : null);
          } else if (colName === 'qty' || colName === 'minQty' || colName === 'price' || colName === 'unitPrice' || colName === 'conversionFactor' || colName === 'totalCost' || colName === 'totalHpp' || colName === 'yieldQty' || colName === 'systemQty' || colName === 'physicalQty' || colName === 'difference') {
            obj[colName] = parseFloat(val) || 0;
          } else if (colName === 'isRead' || colName === 'isAudit') {
            obj[colName] = String(val).toLowerCase() === 'true';
          } else if (colName === 'permissions' || colName === 'items' || colName === 'ingredients') {
            try {
              obj[colName] = JSON.parse(val);
            } catch {
              obj[colName] = [];
            }
          } else {
            obj[colName] = typeof val === 'string' ? val.trim() : val;
          }
        }
      });
      return obj as T;
    });
  } catch (error) {
    console.warn(`Failed to read sheet ${sheetName}, using empty array.`, error);
    return [];
  }
}

/**
 * Appends a new object row to a sheet
 */
export async function writeRow<T extends { id: string }>(sheetName: string, item: T): Promise<void> {
  return writeMultipleRows<T>(sheetName, [item]);
}

/**
 * Appends multiple rows to a sheet in a single fast API call
 */
export async function writeMultipleRows<T extends { id: string }>(sheetName: string, items: T[]): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    const spreadsheetId = await getOrCreateSpreadsheetId();
    const columns = SHEETS_CONFIG[sheetName];
    
    const rowsValues = items.map(item => {
      return columns.map(col => {
        const val = (item as any)[col];
        if (val === undefined || val === null) {
          return '';
        }
        if (typeof val === 'object') {
          return JSON.stringify(val);
        }
        return String(val);
      });
    });

    await fetchGoogleAPI(`sheets/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      body: JSON.stringify({
        values: rowsValues
      })
    });
  } catch (error) {
    console.warn(`Failed to write multiple rows to ${sheetName}:`, error);
    throw error;
  }
}


/**
 * Overwrites the entire sheet with a new set of rows (ideal for bulk updates/deletes)
 */
export async function writeAllRows<T extends { id: string }>(sheetName: string, items: T[]): Promise<void> {
  try {
    const spreadsheetId = await getOrCreateSpreadsheetId();
    const columns = SHEETS_CONFIG[sheetName];

    // 1. Clear sheet first to avoid trailing old data
    await fetchGoogleAPI(`sheets/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:Z5000:clear`, {
      method: 'POST'
    });

    // 2. Prepare headers + rows
    const headerRow = columns;
    const itemRows = items.map(item => {
      return columns.map(col => {
        const val = (item as any)[col];
        if (val === undefined || val === null) {
          return '';
        }
        if (typeof val === 'object') {
          return JSON.stringify(val);
        }
        return String(val);
      });
    });

    // 3. Write new data
    await fetchGoogleAPI(`sheets/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({
        values: [headerRow, ...itemRows]
      })
    });
  } catch (error) {
    console.warn(`Failed to overwrite sheet ${sheetName}:`, error);
    throw error;
  }
}

/**
 * Updates an existing row by match ID
 */
export async function updateRowById<T extends { id: string }>(sheetName: string, id: string, updatedItem: T): Promise<void> {
  const items = await readSheet<T>(sheetName);
  const index = items.findIndex(item => item.id === id);
  if (index !== -1) {
    items[index] = updatedItem;
    await writeAllRows(sheetName, items);
  } else {
    // If it doesn't exist, append it and writeAllRows so header and all columns (including imageUrl) are always aligned
    await writeAllRows(sheetName, [...items, updatedItem]);
  }
}

/**
 * Deletes a row by match ID
 */
export async function deleteRowById<T extends { id: string }>(sheetName: string, id: string): Promise<void> {
  const items = await readSheet<T>(sheetName);
  const filtered = items.filter(item => item.id !== id);
  await writeAllRows(sheetName, filtered);
}

/**
 * Deletes multiple rows by match IDs in a single atomic batch
 */
export async function deleteRowsByIds<T extends { id: string }>(sheetName: string, ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const items = await readSheet<T>(sheetName);
  const idSet = new Set(ids);
  const filtered = items.filter(item => !idSet.has(item.id));
  await writeAllRows(sheetName, filtered);
}

/**
 * Updates multiple existing rows by match ID in a single write operation to conserve quota
 */
export async function updateMultipleRowsById<T extends { id: string }>(sheetName: string, updatedItems: T[]): Promise<void> {
  if (!updatedItems || updatedItems.length === 0) return;
  const items = await readSheet<T>(sheetName);
  const updatedMap = new Map<string, T>(updatedItems.map(item => [item.id, item]));
  
  const result: T[] = items.map(existing => {
    const updated = updatedMap.get(existing.id);
    return updated ? updated : existing;
  });

  // Append any updatedItems that didn't previously exist in the sheet
  const existingIdSet = new Set(items.map(i => i.id));
  for (const item of updatedItems) {
    if (!existingIdSet.has(item.id)) {
      result.push(item);
    }
  }

  await writeAllRows(sheetName, result);
}

/**
 * Loads shared Google Sheets connection settings from Firestore and caches them in localStorage.
 * This ensures all users on all devices stay connected automatically.
 */
export async function loadSharedSheetsConfig(): Promise<void> {
  try {
    const db = getFirestore(app);
    const docRef = doc(db, 'system_config', 'google_sheets');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.appsScriptUrl) {
        localStorage.setItem('gudang_apps_script_url', data.appsScriptUrl);
      }
      if (data.spreadsheetId) {
        localStorage.setItem('gudang_google_sheets_db_id', data.spreadsheetId);
      }
    }
  } catch (error) {
    console.warn('Failed to load shared Google Sheets config from Firestore:', error);
  }
}

/**
 * Saves Google Sheets connection settings to Firestore so it propagates to all users.
 */
export async function saveSharedSheetsConfig(appsScriptUrl: string, spreadsheetId: string): Promise<void> {
  try {
    const db = getFirestore(app);
    const docRef = doc(db, 'system_config', 'google_sheets');
    await setDoc(docRef, {
      appsScriptUrl: appsScriptUrl || '',
      spreadsheetId: spreadsheetId || '',
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.warn('Failed to save shared Google Sheets config to Firestore:', error);
  }
}


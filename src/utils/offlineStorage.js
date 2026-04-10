/**
 * Offline storage layer using IndexedDB.
 *
 * Stores:
 *  - barangays list
 *  - residents (per barangay)
 *  - zone settings, document options, pricing (per barangay)
 *  - pending request queue (submitted while offline)
 */

const DB_NAME = 'sbk-offline';
const DB_VERSION = 1;

// Store names
const STORES = {
  barangays: 'barangays',
  residents: 'residents',
  settings: 'settings',
  pendingRequests: 'pendingRequests',
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.barangays)) {
        db.createObjectStore(STORES.barangays, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.residents)) {
        const store = db.createObjectStore(STORES.residents, { keyPath: 'id' });
        store.createIndex('barangay_id', 'barangay_id', { unique: false });
        store.createIndex('name_lower', 'name_lower', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.pendingRequests)) {
        db.createObjectStore(STORES.pendingRequests, { keyPath: 'offlineId', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, storeName, mode = 'readonly') {
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ═══════════════════════════════════════════════
// Barangays
// ═══════════════════════════════════════════════

export async function cacheBarangays(list) {
  const db = await openDb();
  const store = tx(db, STORES.barangays, 'readwrite');
  await promisify(store.clear());
  for (const item of list) {
    store.put(item);
  }
}

export async function getCachedBarangays() {
  const db = await openDb();
  return promisify(tx(db, STORES.barangays).getAll());
}

// ═══════════════════════════════════════════════
// Residents  (synced per barangay)
// ═══════════════════════════════════════════════

export async function cacheResidents(barangayId, list) {
  const db = await openDb();
  const store = tx(db, STORES.residents, 'readwrite');

  // Remove previous entries for this barangay
  const index = store.index('barangay_id');
  const oldKeys = await promisify(index.getAllKeys(barangayId));
  for (const key of oldKeys) {
    store.delete(key);
  }

  for (const r of list) {
    store.put({
      ...r,
      barangay_id: barangayId,
      name_lower: `${(r.last_name || '').toLowerCase()} ${(r.first_name || '').toLowerCase()}`,
    });
  }
}

export async function searchCachedResidents(barangayId, queryStr) {
  const db = await openDb();
  const store = tx(db, STORES.residents);
  const all = await promisify(store.index('barangay_id').getAll(barangayId));
  if (!queryStr) return [];

  const lower = queryStr.toLowerCase().trim();
  const parts = lower.split(/[\s,]+/).filter(Boolean);

  return all
    .filter((r) => {
      const full = `${r.first_name || ''} ${r.middle_name || ''} ${r.last_name || ''}`.toLowerCase();
      return parts.every((p) => full.includes(p));
    })
    .slice(0, 10);
}

// ═══════════════════════════════════════════════
// Settings (zone, document options, pricing, etc.)
// ═══════════════════════════════════════════════

export async function cacheSetting(key, value) {
  const db = await openDb();
  const store = tx(db, STORES.settings, 'readwrite');
  await promisify(store.put({ key, value }));
}

export async function getCachedSetting(key) {
  const db = await openDb();
  const result = await promisify(tx(db, STORES.settings).get(key));
  return result?.value ?? null;
}

// ═══════════════════════════════════════════════
// Pending request queue (offline submissions)
// ═══════════════════════════════════════════════

export async function queuePendingRequest(payload) {
  const db = await openDb();
  const store = tx(db, STORES.pendingRequests, 'readwrite');
  return promisify(store.add({ ...payload, queued_at: new Date().toISOString() }));
}

export async function getPendingRequests() {
  const db = await openDb();
  return promisify(tx(db, STORES.pendingRequests).getAll());
}

export async function removePendingRequest(offlineId) {
  const db = await openDb();
  const store = tx(db, STORES.pendingRequests, 'readwrite');
  return promisify(store.delete(offlineId));
}

export async function getPendingCount() {
  const db = await openDb();
  return promisify(tx(db, STORES.pendingRequests).count());
}

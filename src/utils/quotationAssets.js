const DB_NAME = 'QuotationAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const STAMP_KEY = 'stamp';
const STAMP_POSITION_KEY = 'stamp-position';

export const DEFAULT_STAMP_POSITION = { x: 78, y: 60, scale: 1 };

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function putRecord(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

async function getRecord(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = (event) => resolve(event.target.result || null);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function deleteRecord(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

export async function saveStampAsset(file) {
  const buffer = await file.arrayBuffer();
  await putRecord({ key: STAMP_KEY, data: buffer, type: file.type, name: file.name });
}

export async function loadStampAsset() {
  try {
    const record = await getRecord(STAMP_KEY);
    if (!record || !record.data) return null;
    const blob = new Blob([record.data], { type: record.type });
    return { url: URL.createObjectURL(blob), name: record.name };
  } catch {
    return null;
  }
}

export function clearStampAsset() {
  return deleteRecord(STAMP_KEY);
}

export async function saveStampPosition(position) {
  try {
    await putRecord({ key: STAMP_POSITION_KEY, value: position });
  } catch {
    /* IndexedDB unavailable, ignore */
  }
}

export async function loadStampPosition() {
  try {
    const record = await getRecord(STAMP_POSITION_KEY);
    return record?.value || null;
  } catch {
    return null;
  }
}

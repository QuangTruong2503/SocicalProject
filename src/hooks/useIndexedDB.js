const DB_NAME = 'WatermarkDB';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveAsset(key, file) {
  const db = await openDB();
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      key,
      data: buffer,
      type: file.type,
      name: file.name,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function loadAsset(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = (e) => {
      if (e.target.result) {
        const { data, type, name } = e.target.result;
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        resolve({ url, name, blob });
      } else {
        resolve(null);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveValue(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      key,
      data: value,
      type: 'application/json',
      name: key,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function loadValue(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = (e) => {
      if (e.target.result) {
        resolve(e.target.result.data ?? null);
      } else {
        resolve(null);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function clearAsset(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export function saveLogo(file) {
  return saveAsset('logo', file);
}

export function loadLogo() {
  return loadAsset('logo');
}

export function clearLogo() {
  return clearAsset('logo');
}

export function saveWatermarkOptions(options) {
  return saveValue('watermark-options', options);
}

export function loadWatermarkOptions() {
  return loadValue('watermark-options');
}

export function clearWatermarkOptions() {
  return clearAsset('watermark-options');
}

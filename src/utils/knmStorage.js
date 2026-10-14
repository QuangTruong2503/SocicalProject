const DB_NAME = 'KnmQuotationDB';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

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

async function putValue(key, value) {
  await putRecord({ key, value });
}

async function getValue(key) {
  const record = await getRecord(key);
  return record ? record.value : null;
}

async function getFile(key) {
  const record = await getRecord(key);
  if (!record || !record.data) return null;
  const blob = new Blob([record.data], { type: record.type });
  return { url: URL.createObjectURL(blob), name: record.name, blob };
}

const COMPANY_KEY = 'company';
const TERMS_KEY = 'terms';
// Before v2 the logo, stamp and bank QR lived only on the device that uploaded them.
// They are now shared company assets on Supabase; these keys are read once to offer
// moving an image that is still only on this device.
const LOCAL_ASSET_KEYS = { logo: 'logo', stamp: 'stamp', bank_qr: 'bankQr' };

export const KNM_COMPANY_INFO_FIELDS = [
  'name', 'taxCode', 'address', 'hotline', 'email', 'website',
  'bankName', 'bankAccountNumber', 'bankAccountHolder',
  'preparerName', 'preparerTitle', 'showStamp', 'showLogo',
];

export function pickCompanyInfo(company) {
  return KNM_COMPANY_INFO_FIELDS.reduce((result, field) => {
    result[field] = company[field];
    return result;
  }, {});
}

export async function loadCompanyInfo() {
  try {
    return await getValue(COMPANY_KEY);
  } catch {
    return null;
  }
}

export async function saveCompanyInfo(company) {
  try {
    await putValue(COMPANY_KEY, pickCompanyInfo(company));
  } catch {
    /* IndexedDB unavailable, ignore */
  }
}

export async function loadTerms() {
  try {
    return await getValue(TERMS_KEY);
  } catch {
    return null;
  }
}

export async function saveTerms(terms) {
  try {
    await putValue(TERMS_KEY, terms);
  } catch {
    /* IndexedDB unavailable, ignore */
  }
}

/** @param {'logo' | 'stamp' | 'bank_qr'} kind */
export function loadLocalKnmAsset(kind) {
  return getFile(LOCAL_ASSET_KEYS[kind]).catch(() => null);
}

export function clearLocalKnmAsset(kind) {
  return deleteRecord(LOCAL_ASSET_KEYS[kind]).catch(() => {});
}

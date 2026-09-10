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

async function putFile(key, file) {
  const buffer = await file.arrayBuffer();
  await putRecord({ key, data: buffer, type: file.type, name: file.name });
}

async function getFile(key) {
  const record = await getRecord(key);
  if (!record || !record.data) return null;
  const blob = new Blob([record.data], { type: record.type });
  return { url: URL.createObjectURL(blob), name: record.name, blob };
}

const COMPANY_KEY = 'company';
const TERMS_KEY = 'terms';
const LOGO_KEY = 'logo';
const STAMP_KEY = 'stamp';
const BANK_QR_KEY = 'bankQr';

export const KNM_COMPANY_INFO_FIELDS = [
  'name', 'taxCode', 'address', 'hotline', 'email', 'website',
  'bankName', 'bankAccountNumber', 'bankAccountHolder',
  'preparerName', 'preparerTitle', 'showStamp',
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

export function loadCompanyLogoAsset() {
  return getFile(LOGO_KEY).catch(() => null);
}

export function saveCompanyLogoAsset(file) {
  return putFile(LOGO_KEY, file);
}

export function clearCompanyLogoAsset() {
  return deleteRecord(LOGO_KEY);
}

export function loadCompanyStampAsset() {
  return getFile(STAMP_KEY).catch(() => null);
}

export function saveCompanyStampAsset(file) {
  return putFile(STAMP_KEY, file);
}

export function clearCompanyStampAsset() {
  return deleteRecord(STAMP_KEY);
}

export function loadCompanyBankQrAsset() {
  return getFile(BANK_QR_KEY).catch(() => null);
}

export function saveCompanyBankQrAsset(file) {
  return putFile(BANK_QR_KEY, file);
}

export function clearCompanyBankQrAsset() {
  return deleteRecord(BANK_QR_KEY);
}

export async function nextQuotationNumberAsync(date) {
  const key = `seq:${date}`;
  let seq = 1;
  try {
    seq = (Number(await getValue(key)) || 0) + 1;
    await putValue(key, seq);
  } catch {
    /* IndexedDB unavailable, fall back to seq = 1 */
  }
  return `BG-${date}-${String(seq).padStart(3, '0')}`;
}

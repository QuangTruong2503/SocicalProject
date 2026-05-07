const DB_NAME = 'seoExcelDB';
const DB_VERSION = 1;
const PRODUCTS_STORE = 'products';
const SESSION_STORE = 'session';
const SESSION_KEY = 'active';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
        db.createObjectStore(PRODUCTS_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function runTransaction(storeName, mode, handler) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = handler(store, tx);

      tx.oncomplete = () => resolve(result);
      tx.onerror = (event) => reject(event.target.error);
      tx.onabort = (event) => reject(event.target.error);
    });
  });
}

export async function saveProducts(products) {
  if (!Array.isArray(products) || !products.length) {
    return;
  }

  await runTransaction(PRODUCTS_STORE, 'readwrite', (store) => {
    products.forEach((product) => {
      store.put(product);
    });
  });
}

export async function saveProduct(product) {
  if (!product?.id) {
    return;
  }

  await runTransaction(PRODUCTS_STORE, 'readwrite', (store) => {
    store.put(product);
  });
}

export async function getAllProducts() {
  return runTransaction(PRODUCTS_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = (event) => resolve(event.target.result || []);
      request.onerror = (event) => reject(event.target.error);
    });
  });
}

export async function clearProducts() {
  await runTransaction(PRODUCTS_STORE, 'readwrite', (store) => {
    store.clear();
  });
}

export async function saveSessionSnapshot(payload) {
  await runTransaction(SESSION_STORE, 'readwrite', (store) => {
    store.put({
      key: SESSION_KEY,
      ...payload,
      updatedAt: payload?.updatedAt || new Date().toISOString(),
    });
  });
}

export async function getSessionSnapshot() {
  return runTransaction(SESSION_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(SESSION_KEY);
      request.onsuccess = (event) => resolve(event.target.result || null);
      request.onerror = (event) => reject(event.target.error);
    });
  });
}

export async function clearSeoExcelDB() {
  const db = await openDB();

  await new Promise((resolve, reject) => {
    const tx = db.transaction([PRODUCTS_STORE, SESSION_STORE], 'readwrite');
    tx.objectStore(PRODUCTS_STORE).clear();
    tx.objectStore(SESSION_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error);
  });
}

export async function hasPendingSession() {
  const [session, products] = await Promise.all([getSessionSnapshot(), getAllProducts()]);
  const pendingCount = products.filter((product) => ['pending', 'processing'].includes(product.status)).length;

  return {
    hasSession: Boolean(session && session.workbookBase64 && session.sheetName),
    pendingCount,
    totalCount: products.length,
    session,
    products,
  };
}


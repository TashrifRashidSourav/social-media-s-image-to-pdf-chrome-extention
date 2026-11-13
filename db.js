// Shared IndexedDB helper (used by service worker and extension pages).
// Stores: items (basket images), history (exported PDFs).
(function (root) {
  const DB_NAME = 'img2pdf';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then((r) => { result = r; }).catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  root.DB = {
    putItem: (item) => tx('items', 'readwrite', (s) => wrap(s.put(item))),
    getItems: async () => {
      const all = await tx('items', 'readonly', (s) => wrap(s.getAll()));
      return all.sort((a, b) => a.order - b.order);
    },
    deleteItem: (id) => tx('items', 'readwrite', (s) => wrap(s.delete(id))),
    clearItems: () => tx('items', 'readwrite', (s) => wrap(s.clear())),
    countItems: () => tx('items', 'readonly', (s) => wrap(s.count())),
    putHistory: (h) => tx('history', 'readwrite', (s) => wrap(s.put(h))),
    getHistory: async () => {
      const all = await tx('history', 'readonly', (s) => wrap(s.getAll()));
      return all.sort((a, b) => b.ts - a.ts);
    },
    deleteHistory: (id) => tx('history', 'readwrite', (s) => wrap(s.delete(id))),
  };
})(typeof self !== 'undefined' ? self : window);

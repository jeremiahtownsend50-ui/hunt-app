/* SWSF Hunt Journal - local storage (IndexedDB). No accounts, nothing leaves the phone. */
const DB = (() => {
  const NAME = 'swsf-hunt', VER = 1;
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('items')) {
          const s = db.createObjectStore('items', { keyPath: 'id' });
          s.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(store, mode); const s = t.objectStore(store);
      let out; const p = fn(s);
      if (p && 'onsuccess' in p) p.onsuccess = () => { out = p.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return {
    uid,
    put(item) { item.updatedAt = Date.now(); if (!item.createdAt) item.createdAt = item.updatedAt; return tx('items', 'readwrite', s => s.put(item)).then(() => item); },
    putMany(items) { return tx('items', 'readwrite', s => { items.forEach(i => { i.updatedAt = i.updatedAt || Date.now(); s.put(i); }); }); },
    get(id) { return tx('items', 'readonly', s => s.get(id)); },
    del(id) { return tx('items', 'readwrite', s => s.delete(id)); },
    all(type) { return tx('items', 'readonly', s => type ? s.index('type').getAll(type) : s.getAll()).then(a => a || []); },
    putPhoto(id, blob) { return tx('photos', 'readwrite', s => s.put({ id, blob, at: Date.now() })); },
    getPhoto(id) { return tx('photos', 'readonly', s => s.get(id)); },
    delPhoto(id) { return tx('photos', 'readwrite', s => s.delete(id)); },
    allPhotos() { return tx('photos', 'readonly', s => s.getAll()).then(a => a || []); },
    clear() { return Promise.all([tx('items', 'readwrite', s => s.clear()), tx('photos', 'readwrite', s => s.clear())]); },
    async setting(key, val) {
      const id = 'setting:' + key;
      if (val === undefined) { const r = await this.get(id); return r ? r.value : undefined; }
      return this.put({ id, type: 'setting', value: val });
    }
  };
})();

/* Backup = one JSON file with every item and every photo (base64). */
const Backup = {
  blobToDataURL: b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }),
  async exportAll() {
    const items = await DB.all();
    const photos = [];
    for (const p of await DB.allPhotos()) photos.push({ id: p.id, at: p.at, data: await this.blobToDataURL(p.blob) });
    return { app: 'swsf-hunt-journal', version: 1, exportedAt: new Date().toISOString(), items, photos };
  },
  async importAll(json, mode = 'merge') {
    if (!json || json.app !== 'swsf-hunt-journal' || !Array.isArray(json.items)) throw new Error('Not a SWSF Hunt Journal backup file');
    if (mode === 'replace') await DB.clear();
    const existing = new Map((await DB.all()).map(i => [i.id, i]));
    let added = 0, updated = 0, kept = 0;
    const toPut = [];
    for (const it of json.items) {
      const cur = existing.get(it.id);
      if (!cur) { toPut.push(it); added++; }
      else if ((it.updatedAt || 0) > (cur.updatedAt || 0)) { toPut.push(it); updated++; }
      else kept++;
    }
    await DB.putMany(toPut);
    let ph = 0;
    for (const p of json.photos || []) {
      if (await DB.getPhoto(p.id)) continue;
      const blob = await (await fetch(p.data)).blob();
      await DB.putPhoto(p.id, blob); ph++;
    }
    return { added, updated, kept, photos: ph };
  }
};

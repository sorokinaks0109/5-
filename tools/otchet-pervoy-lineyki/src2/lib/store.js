// Работа с общей папкой: доступ, чтение и запись JSON и файлов, резервные копии.
// Всё работает в браузере (Chromium) без интернета через File System Access API.
(function (root) {
  'use strict';

  const DATA = 'Данные';
  const REG = 'реестр.json';
  const PEOPLE = 'руководители';
  const ATT = 'вложения';
  const ARCH = 'архив';

  // ---------- папка в памяти (демо и тесты) ----------
  class MemFile {
    constructor(name, bytes, lastModified) { this.kind = 'file'; this.name = name; this.bytes = bytes || new Uint8Array(0); this.lastModified = lastModified || Date.now(); }
    async getFile() { return new File([this.bytes], this.name, { lastModified: this.lastModified }); }
    async createWritable() {
      const self = this; const parts = [];
      return {
        async write(b) { parts.push(typeof b === 'string' ? new TextEncoder().encode(b) : b instanceof ArrayBuffer ? new Uint8Array(b) : b); },
        async close() { self.bytes = new Uint8Array(await new Blob(parts).arrayBuffer()); self.lastModified = Date.now(); },
      };
    }
  }
  class MemDir {
    constructor(name, readOnly) { this.kind = 'directory'; this.name = name; this.items = new Map(); this.readOnly = !!readOnly; }
    async getDirectoryHandle(name, opt) {
      let d = this.items.get(name);
      if (!d) {
        if (!(opt && opt.create) || this.readOnly) throw new DOMException('Нет папки ' + name, 'NotFoundError');
        d = new MemDir(name); this.items.set(name, d);
      }
      return d;
    }
    async getFileHandle(name, opt) {
      let f = this.items.get(name);
      if (!f) {
        if (!(opt && opt.create) || this.readOnly) throw new DOMException('Нет файла ' + name, 'NotFoundError');
        f = new MemFile(name); this.items.set(name, f);
      }
      return f;
    }
    async removeEntry(name) { if (this.readOnly) throw new DOMException('Только чтение', 'NotAllowedError'); this.items.delete(name); }
    async *values() { yield* this.items.values(); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  function isNotFound(e) { return e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError'); }

  async function dirAt(root, path, create) {
    let d = root;
    for (const p of path) d = await d.getDirectoryHandle(p, create ? { create: true } : undefined);
    return d;
  }
  async function readBytes(root, path) {
    const d = await dirAt(root, path.slice(0, -1));
    const f = await (await d.getFileHandle(path[path.length - 1])).getFile();
    return { bytes: new Uint8Array(await f.arrayBuffer()), modified: new Date(f.lastModified) };
  }
  async function writeBytes(root, path, bytes) {
    const d = await dirAt(root, path.slice(0, -1), true);
    const fh = await d.getFileHandle(path[path.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(bytes);
    await w.close();
  }
  async function readJSON(root, path) {
    const { bytes, modified } = await readBytes(root, path);
    const text = new TextDecoder().decode(bytes);
    return { data: JSON.parse(text), modified };
  }
  async function writeJSON(root, path, data) {
    await writeBytes(root, path, new TextEncoder().encode(JSON.stringify(data, null, 1)));
  }
  async function list(root, path) {
    try {
      const d = await dirAt(root, path);
      const out = [];
      for await (const h of d.values()) out.push({ name: h.name, kind: h.kind });
      return out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    } catch (e) { if (isNotFound(e)) return []; throw e; }
  }
  async function remove(root, path) {
    const d = await dirAt(root, path.slice(0, -1));
    await d.removeEntry(path[path.length - 1], { recursive: true });
  }

  // Ежедневная копия файла в архив; храним последние keep копий этого файла.
  async function dailyBackup(root, srcPath, prefix, keep) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const name = prefix + '_' + today + '.json';
      const have = await list(root, [DATA, ARCH]);
      if (have.some((x) => x.name === name)) return;
      const { bytes } = await readBytes(root, srcPath);
      await writeBytes(root, [DATA, ARCH, name], bytes);
      const mine = have.filter((x) => x.name.startsWith(prefix + '_')).map((x) => x.name).sort();
      for (const n of mine.slice(0, Math.max(0, mine.length + 1 - keep))) await remove(root, [DATA, ARCH, n]);
    } catch (e) { /* нет прав на архив или нечего копировать — не страшно */ }
  }

  // ---------- запоминание папки между открытиями ----------
  function idb() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('otchet-pervoy-lineyki', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbPut(k, v) {
    try { const db = await idb(); await new Promise((r, j) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = r; t.onerror = () => j(t.error); }); } catch (e) { /* без памяти тоже работаем */ }
  }
  async function idbGet(k) {
    try { const db = await idb(); return await new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; }
  }

  async function pickFolder(mode) {
    if (!window.showDirectoryPicker) throw new Error('Этот браузер не умеет открывать папки. Откройте страницу в Chromium, Яндекс Браузере или Edge.');
    const dir = await window.showDirectoryPicker({ id: 'otchet', mode });
    await idbPut('dir', dir);
    return dir;
  }
  async function savedFolder() {
    const dir = await idbGet('dir');
    return dir && dir.queryPermission ? dir : null;
  }
  async function hasPermission(dir, mode) {
    try { return (await dir.queryPermission({ mode })) === 'granted'; } catch (e) { return false; }
  }
  async function askPermission(dir, mode) {
    return (await dir.requestPermission({ mode })) === 'granted';
  }
  // Проверяем, что это та самая папка: в ней есть Данные/реестр.json
  async function checkFolder(dir) {
    try { await readBytes(dir, [DATA, REG]); return true; } catch (e) { return false; }
  }

  root.Store = {
    DATA, REG, PEOPLE, ATT, ARCH, MemDir, MemFile, isNotFound, readBytes, writeBytes, readJSON, writeJSON, list, remove,
    dailyBackup, pickFolder, savedFolder, hasPermission, askPermission, checkFolder, idbPut, idbGet,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* global ExcelJS, Core */
(function () {
  'use strict';

  const PERSONAL_DIR = 'Руководители';
  const REGISTRY = 'Реестр.xlsx';
  const CTL_ORDER = ['overdue', 'check', 'work', 'nodate', 'done', 'closed'];
  const CTL_NAMES = {
    overdue: 'Просрочено, нет статуса', check: 'Срок прошёл — проверить', work: 'В работе',
    nodate: 'Без даты', done: 'Выполнено', closed: 'Закрыто',
  };

  const state = {
    dir: null, readOnly: false, demo: false, reg: null, files: {}, model: null,
    tab: 'who', person: 0, memoFilter: 'all', memoPerson: '', upcPerson: '', preview: null, log: [],
    error: '',
  };

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------- хранилище настроек (только удобства, без него всё работает) ----------
  function lsGet(k, d) { try { const v = localStorage.getItem('otchet.' + k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('otchet.' + k, v); } catch (e) { /* нет хранилища */ } }

  function idb() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('otchet-pervoy-lineyki', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbPut(k, v) {
    try { const db = await idb(); await new Promise((r, j) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = r; t.onerror = () => j(t.error); }); } catch (e) { /* не страшно */ }
  }
  async function idbGet(k) {
    try { const db = await idb(); return await new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; }
  }

  // ---------- папка в памяти (демо, режим «только чтение», тесты) ----------
  class MemFile {
    constructor(name, bytes, lastModified) { this.kind = 'file'; this.name = name; this.bytes = bytes; this.lastModified = lastModified || Date.now(); }
    async getFile() { return new File([this.bytes], this.name, { lastModified: this.lastModified }); }
    async createWritable() {
      const self = this; const parts = [];
      return {
        async write(b) { parts.push(b instanceof ArrayBuffer ? new Uint8Array(b) : b); },
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
        f = new MemFile(name, new Uint8Array(0)); this.items.set(name, f);
      }
      return f;
    }
    async *values() { yield* this.items.values(); }
  }
  window.OtchetMemDir = MemDir; // для тестов

  // ---------- работа с файлами ----------
  async function readXlsx(dir, path) {
    let d = dir;
    for (const p of path.slice(0, -1)) d = await d.getDirectoryHandle(p);
    const fh = await d.getFileHandle(path[path.length - 1]);
    const file = await fh.getFile();
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    return { wb, buf, modified: new Date(file.lastModified) };
  }
  async function writeBytes(dir, path, bytes) {
    let d = dir;
    for (const p of path.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const fh = await d.getFileHandle(path[path.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(bytes);
    await w.close();
  }
  function isNotFound(e) { return e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError'); }

  async function loadAll() {
    state.error = '';
    try {
      const r = await readXlsx(state.dir, [REGISTRY]);
      state.reg = Core.parseRegistry(r.wb);
    } catch (e) {
      state.reg = null; state.model = null;
      state.error = isNotFound(e)
        ? 'В выбранной папке нет файла «' + REGISTRY + '». Выберите папку «Отчёт первой линейки», где лежат Реестр.xlsx и папка «Руководители».'
        : 'Не удалось прочитать ' + REGISTRY + ': ' + e.message + '. Если файл открыт в Р7 — сохраните его и нажмите «Обновить».';
      render();
      return;
    }
    state.files = {};
    for (const p of state.reg.people) {
      try {
        const r = await readXlsx(state.dir, [PERSONAL_DIR, p.file]);
        state.files[p.file] = { parsed: Core.parsePersonal(r.wb), modified: r.modified };
      } catch (e) {
        state.files[p.file] = isNotFound(e) ? { missing: true } : { error: 'Не читается: ' + e.message };
      }
    }
    rebuildModel();
    render();
  }
  function rebuildModel() {
    if (!state.reg) return;
    state.model = Core.collect(state.reg, state.files, todayFromInput());
    if (state.person >= state.model.people.length) state.person = 0;
  }

  function todayFromInput() {
    const v = $('#asof') && $('#asof').value;
    if (v) { const [y, m, d] = v.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
    return Core.todayUTC();
  }
  function isoLocal(d) { const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  // ---------- выбор папки ----------
  async function pickFolder() {
    if (window.showDirectoryPicker) {
      try {
        const dir = await window.showDirectoryPicker({ id: 'otchet', mode: 'readwrite' });
        await useDir(dir, false, false);
        idbPut('dir', dir);
      } catch (e) { if (e.name !== 'AbortError') alert('Не удалось открыть папку: ' + e.message); }
    } else {
      $('#dirInput').click();
    }
  }
  async function useDir(dir, readOnly, demo) {
    state.dir = dir; state.readOnly = readOnly; state.demo = demo; state.preview = null;
    await loadAll();
  }
  async function fromFileList(list) {
    const root = new MemDir('папка', false);
    let rootName = '';
    for (const f of list) {
      const parts = f.webkitRelativePath.split('/');
      rootName = parts[0];
      let d = root;
      for (const p of parts.slice(1, -1)) d = await d.getDirectoryHandle(p, { create: true });
      d.items.set(parts[parts.length - 1], new MemFile(f.name, new Uint8Array(await f.arrayBuffer()), f.lastModified));
    }
    root.name = rootName; root.readOnly = true;
    const markRO = (d) => { d.readOnly = true; d.items.forEach((x) => x.kind === 'directory' && markRO(x)); };
    markRO(root);
    await useDir(root, true, false);
  }
  async function resumeFolder() {
    const dir = await idbGet('dir');
    if (!dir || !dir.queryPermission) return false;
    state.savedDir = dir;
    render();
    return true;
  }
  async function grantSaved() {
    const dir = state.savedDir;
    try {
      const ok = (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
      if (ok) await useDir(dir, false, false);
    } catch (e) { alert('Нет доступа к папке: ' + e.message); }
  }

  // ---------- форматирование ----------
  function fmt(v) {
    v = Core.cellVal(v);
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return Core.fmtDate(v);
    if (typeof v === 'number') return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    return String(v).trim();
  }
  function badge(ctl) { return '<span class="badge b-' + ctl.code + '">' + esc(ctl.label) + '</span>'; }
  function ago(d) {
    if (!d) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 864e5);
    if (days <= 0) return 'сегодня';
    if (days === 1) return 'вчера';
    return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
  }
  function plural(n, a, b, c) { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return b; return c; }
  function sinceDate() {
    const v = lsGet('since', '');
    if (v) return v;
    const d = new Date(); d.setDate(d.getDate() - 7); return isoLocal(d);
  }
  function sinceAsDate() { const [y, m, d] = sinceDate().split('-').map(Number); return new Date(y, m - 1, d); }

  // ---------- отрисовка ----------
  const TABS = [
    ['who', 'Кто обновил'], ['report', 'Доклады'], ['memo', 'Свод поручений'], ['upc', 'План УПЦ'],
    ['send', 'Рассылка и свод'], ['help', 'Как пользоваться'],
  ];

  function render() {
    $('#folderName').textContent = state.dir
      ? (state.demo ? 'Демо-данные (вымышленные)' : 'Папка: ' + state.dir.name + (state.readOnly ? ' — только чтение' : ''))
      : 'Папка не выбрана';
    $('#reloadBtn').disabled = !state.dir || state.demo;
    $('#tabs').innerHTML = TABS.map(([k, t]) => '<button data-tab="' + k + '" class="' + (state.tab === k ? 'active' : '') + '">' + t + '</button>').join('');
    const main = $('#main');
    if (state.tab === 'help') { main.innerHTML = helpHtml(); return; }
    if (!state.dir || !state.model) { main.innerHTML = startHtml(); return; }
    const errs = state.reg.errors.map((e) => '<div class="msg bad">' + esc(e) + '</div>').join('');
    const views = { who: whoHtml, report: reportHtml, memo: memoHtml, upc: upcHtml, send: sendHtml };
    main.innerHTML = errs + views[state.tab]();
  }

  function startHtml() {
    const api = !!window.showDirectoryPicker;
    return '<div class="panel empty-state">' +
      (state.error ? '<div class="msg bad">' + esc(state.error) + '</div>' : '') +
      '<h2>Откройте папку отчёта</h2>' +
      '<p>Нужна папка «Отчёт первой линейки», в которой лежат <b>Реестр.xlsx</b> и папка <b>Руководители</b> с личными файлами.</p>' +
      (api ? '' : '<p class="msg warn">Этот браузер не умеет записывать в папку. Читать и показывать отчёт можно, а для рассылки поручений откройте Сборщик в Chromium, Яндекс Браузере или Edge.</p>') +
      '<div class="row" style="justify-content:center;margin-top:16px">' +
      (state.savedDir ? '<button class="primary" data-act="grant">Продолжить с папкой «' + esc(state.savedDir.name) + '»</button>' : '') +
      '<button class="' + (state.savedDir ? '' : 'primary') + '" data-act="pick">Выбрать папку…</button>' +
      '<button data-act="demo">Посмотреть на демо-данных</button></div></div>';
  }

  function nums(c) {
    return '<div class="nums">' +
      (c.overdue ? '<span class="badge b-overdue">просрочено ' + c.overdue + '</span>' : '') +
      (c.check ? '<span class="badge b-check">срок прошёл ' + c.check + '</span>' : '') +
      '<span class="badge b-work">в работе ' + c.work + '</span>' +
      '<span class="badge b-done">выполнено ' + c.done + '</span>' +
      (c.empty ? '<span class="badge b-nodate">без статуса ' + c.empty + '</span>' : '') + '</div>';
  }

  function whoHtml() {
    const since = sinceAsDate();
    const m = state.model;
    const stale = m.people.filter((p) => !p.modified || p.modified < since).length;
    const cards = m.people.map((p, i) => {
      let cls = '', when;
      if (p.missing) { cls = 'nofile'; when = '<div class="when bad">Файла нет — будет создан при рассылке</div>'; }
      else if (p.error) { cls = 'stale'; when = '<div class="when bad">' + esc(p.error) + '</div>'; }
      else {
        const isStale = p.modified < since;
        cls = isStale ? 'stale' : '';
        when = '<div class="when ' + (isStale ? 'bad' : '') + '">' + (isStale ? 'Не обновлял с ' : 'Обновил ') +
          esc(Core.fmtDateTime(p.modified)) + ' · ' + ago(p.modified) + '</div>';
      }
      return '<div class="card ' + cls + '" data-person="' + i + '"><div class="name">' + esc(p.fio) + '</div>' + when + nums(p.counts) + '</div>';
    }).join('');
    return '<div class="panel"><div class="row" style="justify-content:space-between">' +
      '<div><h2 style="margin:0">Кто обновил отчёт</h2><div class="muted small">Дата берётся из времени изменения личного файла. Счётчики — по поручениям, где человек ответственный.</div></div>' +
      '<label class="row small">Ждём обновления после <input type="date" id="since" value="' + sinceDate() + '"></label></div>' +
      '<div style="margin-top:10px" class="' + (stale ? 'msg bad' : 'msg ok') + '">' +
      (stale ? 'Не обновили: ' + stale + ' из ' + m.people.length : 'Все обновили отчёт') + '</div></div>' +
      '<div class="who">' + cards + '</div>';
  }

  function tile(v, l, cls) { return '<div class="tile ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }

  function memoItem(m) {
    const st = m.status ? '<div class="status">' + esc(m.status) + '</div>' : '<div class="status none">статус не заполнен</div>';
    return '<div class="item c-' + m.ctl.code + '"><div class="id">' + esc(m.id) + '</div>' +
      '<div class="what">' + esc(m.text) + '</div>' + st +
      '<div class="meta">' + badge(m.ctl) + '<span>Срок: ' + esc(fmt(m.due) || '—') + '</span>' +
      (m.date ? '<span>Поручено: ' + esc(fmt(m.date)) + '</span>' : '') +
      (m.co && m.role === 'ответственный' ? '<span>Соисп.: ' + esc(m.co) + '</span>' : '') +
      (m.role === 'соисполнитель' ? '<span>Отв.: ' + esc(m.resp) + '</span>' : '') +
      (m.mark ? '<span>Отметка: ' + esc(m.mark) + '</span>' : '') + '</div></div>';
  }

  function freeTable(rows) {
    if (!rows.length) return '<div class="muted small">Не заполнено</div>';
    const width = Math.max(6, ...rows.map((r) => r.length));
    const head = ['№', 'Задача', 'Статус', 'Ответственные', 'Срок', '%'];
    let h = '<div class="scroll"><table class="grid"><thead><tr>';
    for (let i = 0; i < width; i++) h += '<th>' + (head[i] || '') + '</th>';
    h += '</tr></thead><tbody>';
    for (const r of rows) {
      const isSub = !Core.isEmpty(r[0]) && r.slice(1).every(Core.isEmpty) && !/^\d+\.?$/.test(Core.txt(r[0]));
      if (isSub) { h += '<tr class="sub"><td colspan="' + width + '">' + esc(fmt(r[0])) + '</td></tr>'; continue; }
      h += '<tr>';
      for (let i = 0; i < width; i++) {
        const v = Core.cellVal(r[i]);
        if (i === 5 && typeof v === 'number' && v >= 0 && v <= 100) {
          h += '<td class="num"><div class="pct"><div class="bar"><i style="width:' + v + '%"></i></div>' + v + '%</div></td>';
        } else {
          h += '<td class="' + (typeof v === 'number' ? 'num' : '') + '">' + esc(fmt(v)) + '</td>';
        }
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }

  function upcBlock(list) {
    if (!list.length) return '<div class="muted small">Мероприятий, где руководитель докладчик, нет</div>';
    const groups = {};
    list.forEach((u) => (groups[u.kpi || 'Без показателя'] = groups[u.kpi || 'Без показателя'] || []).push(u));
    let h = '<div class="scroll"><table class="grid"><thead><tr><th style="width:70px">ID</th><th>Мероприятие</th><th>Статус</th><th style="width:120px">Срок</th></tr></thead><tbody>';
    for (const [k, items] of Object.entries(groups)) {
      h += '<tr class="sub"><td colspan="4">' + esc(k) + '</td></tr>';
      for (const u of items) {
        h += '<tr><td>' + esc(u.id) + '</td><td>' + esc(u.text) + '</td>' +
          (u.status ? '<td>' + esc(u.status) + '</td>' : '<td class="none">статус не заполнен</td>') +
          '<td>' + esc(fmt(u.due)) + '</td></tr>';
      }
    }
    return h + '</tbody></table></div>';
  }

  function kpiBlock(list) {
    if (!list.length) return '';
    let h = '<div class="sec-title">Показатели УПЦ на год <span class="muted">из карты УПЦ, где руководитель в команде</span></div>' +
      '<div class="scroll"><table class="grid"><thead><tr><th>Показатель</th><th>Цель</th><th>Напряжённая цель</th><th>Ед.</th><th>Роль</th></tr></thead><tbody>';
    for (const k of list) {
      h += '<tr><td>' + esc(k.kpi.replace(/^(ГПН-ГПН_Снаб-)+/, '')) + '</td><td class="num">' + esc(numFmt(k.goal)) + '</td><td' + (k.stretch.length > 70 ? ' title="' + esc(k.stretch) + '">' + esc(k.stretch.slice(0, 70)) + '…' : '>' + esc(numFmt(k.stretch))) +
        '</td><td>' + esc(k.unit) + '</td><td>' + (k.isLeader ? '<b>лидер команды</b>' : 'в команде') + '</td></tr>';
    }
    return h + '</tbody></table></div>';
  }
  function numFmt(s) { const n = Number(String(s).replace(',', '.')); return s !== '' && isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : s; }

  function appendixBlock(p) {
    if (!p.appendix.length) return '';
    return '<div class="sec-title">Приложения</div>' + p.appendix.map((a) => {
      const width = Math.max(...a.rows.map((r) => r.length), 1);
      let h = '<details class="appx"><summary>' + esc(a.name) + '</summary><div class="scroll"><table class="grid"><tbody>';
      for (const r of a.rows) {
        if (!r.length) continue;
        h += '<tr>';
        for (let i = 0; i < width; i++) { const v = Core.cellVal(r[i]); h += '<td class="' + (typeof v === 'number' ? 'num' : '') + '">' + esc(fmt(v)) + '</td>'; }
        h += '</tr>';
      }
      return h + '</tbody></table></div></details>';
    }).join('');
  }

  function personReport(p) {
    const c = p.counts;
    const resp = p.memo.filter((m) => m.role === 'ответственный' && m.ctl.code !== 'closed')
      .sort((a, b) => CTL_ORDER.indexOf(a.ctl.code) - CTL_ORDER.indexOf(b.ctl.code));
    const co = p.memo.filter((m) => m.role === 'соисполнитель' && m.ctl.code !== 'closed');
    const updated = p.missing ? 'файла нет' : p.modified ? 'обновлено ' + Core.fmtDateTime(p.modified) + ' (' + ago(p.modified) + ')' : '';
    return '<div class="report-head"><h1>' + esc(p.fio) + '</h1><div class="muted">' + esc(updated) + '</div></div>' +
      (p.error ? '<div class="msg bad">' + esc(p.error) + '</div>' : '') +
      '<div class="tiles">' + tile(c.total, 'поручений в работе и выполнено', '') + tile(c.done, 'выполнено', 'ok') +
      tile(c.work, 'в работе', 'info') + tile(c.check, 'срок прошёл — проверить', 'warn') + tile(c.overdue, 'просрочено без статуса', 'bad') + '</div>' +
      '<div class="sec-title">1. Поручения по Мемо <span class="muted">ответственный</span></div>' +
      (resp.length ? '<div class="items">' + resp.map(memoItem).join('') + '</div>' : '<div class="muted small">Открытых поручений нет</div>') +
      (co.length ? '<div class="sec-title">Соисполнитель <span class="muted">статус ведёт ответственный</span></div><div class="items">' + co.map(memoItem).join('') + '</div>' : '') +
      '<div class="sec-title">2. РОС</div>' + freeTable(p.ros) +
      '<div class="sec-title">3. Текущие проекты</div>' + freeTable(p.proj) +
      '<div class="sec-title">4. Мероприятия УПЦ <span class="muted">руководитель — докладчик</span></div>' + upcBlock(p.upc) +
      kpiBlock(p.kpi) + appendixBlock(p);
  }

  function reportHtml() {
    const m = state.model;
    const p = m.people[state.person];
    if (!p) return '<div class="panel">В реестре нет руководителей</div>';
    const chips = m.people.map((x, i) => '<button class="chip ' + (i === state.person ? 'active' : '') + '" data-person="' + i + '">' + esc(x.fio) + '</button>').join('');
    return '<div class="people-bar">' + chips + '<span class="tools row" style="margin-left:auto">' +
      '<button data-act="prev" title="Стрелка влево">←</button><button data-act="next" title="Стрелка вправо">→</button>' +
      '<button class="primary" data-act="present">На весь экран</button><button data-act="print">Печать</button>' +
      '<button data-act="printAll">Печать всех</button></span></div>' +
      '<div id="report">' + personReport(p) + '</div>';
  }

  function memoHtml() {
    const m = state.model;
    const all = m.memo.filter((x) => !state.memoPerson || Core.normName(x.resp) === state.memoPerson);
    const cnt = {};
    all.forEach((x) => (cnt[x.ctl.code] = (cnt[x.ctl.code] || 0) + 1));
    const list = all.filter((x) => state.memoFilter === 'all' ? x.ctl.code !== 'closed' : x.ctl.code === state.memoFilter);
    const chip = (k, t, n) => '<button class="chip ' + (state.memoFilter === k ? 'active' : '') + '" data-mf="' + k + '">' + t + (n !== undefined ? ' · ' + n : '') + '</button>';
    const resps = [...new Set(m.memo.map((x) => x.resp).filter(Boolean))];
    let h = '<div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Свод поручений по Мемо</h2>' +
      '<span class="row no-print"><button data-act="print">Печать</button></span></div>' +
      '<div class="muted small">Статус — из личного файла ответственного. Закрытые (с отметкой секретаря) скрыты, их можно открыть фильтром.</div></div>' +
      '<div class="filters">' + chip('all', 'Все открытые', all.filter((x) => x.ctl.code !== 'closed').length) +
      CTL_ORDER.map((k) => chip(k, CTL_NAMES[k], cnt[k] || 0)).join('') +
      '<select id="memoPerson"><option value="">Все ответственные</option>' +
      resps.map((r) => '<option value="' + esc(Core.normName(r)) + '"' + (state.memoPerson === Core.normName(r) ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></div>';
    h += '<div class="scroll"><table class="grid"><thead><tr><th>ID</th><th>Дата</th><th>Поручение</th><th>Ответственный</th><th>Срок</th><th>Статус</th><th>Отметка секретаря</th><th>Контроль</th></tr></thead><tbody>';
    for (const x of list) {
      h += '<tr><td>' + esc(x.id) + '</td><td>' + esc(fmt(x.date)) + '</td><td>' + esc(x.text) + (x.co ? '<div class="muted small">Соисп.: ' + esc(x.co) + '</div>' : '') +
        '</td><td>' + esc(x.resp) + (x.inList ? '' : '<div class="muted small">нет в списке руководителей</div>') + '</td><td>' + esc(fmt(x.due)) + '</td>' +
        (x.status ? '<td>' + esc(x.status) + '</td>' : '<td class="none">' + (x.inList ? 'нет статуса' : '') + '</td>') +
        '<td>' + esc(x.mark) + '</td><td>' + badge(x.ctl) + '</td></tr>';
    }
    if (!list.length) h += '<tr><td colspan="8" class="muted">Ничего не найдено</td></tr>';
    return h + '</tbody></table></div>';
  }

  function upcHtml() {
    const m = state.model;
    const speakers = [...new Set(m.upc.map((u) => u.speaker).filter(Boolean))];
    const list = m.upc.filter((u) => !state.upcPerson || (state.upcPerson === '—' ? !u.speaker : Core.normName(u.speaker) === state.upcPerson));
    const empty = list.filter((u) => !u.status).length;
    let h = '<div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">План мероприятий УПЦ</h2>' +
      '<span class="row no-print"><select id="upcPerson"><option value="">Все докладчики</option>' +
      speakers.map((s) => '<option value="' + esc(Core.normName(s)) + '"' + (state.upcPerson === Core.normName(s) ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '<option value="—"' + (state.upcPerson === '—' ? ' selected' : '') + '>Без докладчика</option></select><button data-act="print">Печать</button></span></div>' +
      '<div class="muted small">Мероприятий: ' + list.length + ', без статуса: ' + empty + '. Если докладчика нет, статус берётся из реестра (лист «План УПЦ»).</div></div>';
    const groups = {};
    list.forEach((u) => (groups[u.kpi || '—'] = groups[u.kpi || '—'] || []).push(u));
    h += '<div class="scroll"><table class="grid"><thead><tr><th>ID</th><th>Мероприятие</th><th>Ответственный исполнитель</th><th>Срок</th><th>Докладчик</th><th>Статус</th></tr></thead><tbody>';
    for (const [k, items] of Object.entries(groups)) {
      h += '<tr class="sub"><td colspan="6">' + esc(k) + '</td></tr>';
      for (const u of items) {
        h += '<tr><td>' + esc(u.id) + '</td><td>' + esc(u.text) + '</td><td>' + esc(u.resp) + '</td><td>' + esc(fmt(u.due)) + '</td><td>' + esc(u.speaker || '—') + '</td>' +
          (u.status ? '<td>' + esc(u.status) + '</td>' : '<td class="none">нет статуса</td>') + '</tr>';
      }
    }
    return h + '</tbody></table></div>';
  }

  function sendHtml() {
    const ro = state.readOnly || state.demo;
    let h = '<div class="panel"><h2>1. Разослать поручения в личные файлы</h2>' +
      '<p class="muted small">Делайте после каждого совещания, когда внесли новые поручения в Реестр. Сборщик допишет каждому новые поручения и мероприятия УПЦ, ' +
      'уберёт закрытые (с отметкой секретаря), а всё, что человек уже написал, оставит. Перед записью копия каждого файла кладётся в папку «Архив».</p>' +
      (state.readOnly ? '<div class="msg warn">Папка открыта только для чтения — рассылка недоступна. Откройте Сборщик в Chromium.</div>' : '') +
      (state.demo ? '<div class="msg warn">Демо-режим: изменения пишутся в память и пропадут после закрытия страницы.</div>' : '') +
      '<div class="row"><button data-act="check"' + (state.readOnly ? ' disabled' : '') + '>Проверить, что изменится</button>' +
      (state.preview ? '<button class="primary" data-act="send">Разослать</button>' : '') + '</div>';
    if (state.preview) {
      h += '<div class="scroll" style="margin-top:12px"><table class="grid"><thead><tr><th>Руководитель</th><th>Файл</th><th>Добавится</th><th>Уйдёт (закрыто)</th><th>Будет поручений</th><th>Внимание</th></tr></thead><tbody>';
      for (const r of state.preview) {
        h += '<tr><td>' + esc(r.fio) + '</td><td>' + esc(r.file) + (r.isNew ? ' <span class="badge b-work">новый</span>' : '') + '</td><td>' + esc(r.added.join(', ') || '—') +
          '</td><td>' + esc(r.removed.join(', ') || '—') + '</td><td class="num">' + r.total + '</td><td>' +
          (r.error ? '<span class="badge b-overdue">пропущен</span> ' + esc(r.error) : esc(r.warn || '')) + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div><div class="panel"><h2>2. Сохранить свод в Excel</h2><p class="muted small">Один файл для директора и архива: кто обновил, все поручения со статусами и контролем срока, план УПЦ и по листу на каждого руководителя. ' +
      (ro ? 'Файл скачается через браузер.' : 'Файл появится в папке «Своды».') + '</p>' +
      '<button class="primary" data-act="summary">Сохранить свод</button></div>';
    if (state.log.length) h += '<div class="panel"><h2>Журнал</h2><div class="log">' + esc(state.log.join('\n')) + '</div></div>';
    return h;
  }

  function helpHtml() {
    return '<div class="panel help"><h2>Как устроено</h2>' +
      '<p>В общей папке «Отчёт первой линейки» лежат: <b>Реестр.xlsx</b> (его ведёт помощник), папка <b>Руководители</b> с личным файлом каждого руководителя и этот <b>Сборщик.html</b>. ' +
      'Каждый заполняет только свой файл, поэтому «файл занят» больше не бывает. Сборщик работает в браузере без интернета и ничего не отправляет наружу.</p>' +
      '<h3>Помощник: каждую неделю</h3><ol>' +
      '<li>После совещания внесите новые поручения в Реестр (лист «Мемо»), закройте выполненные: в «Отметке секретаря» напишите «выполнено 30.09». Сохраните и закройте Реестр.</li>' +
      '<li>Откройте Сборщик → «Рассылка и свод» → «Проверить» → «Разослать». У всех в файлах появятся новые поручения.</li>' +
      '<li>Накануне совещания откройте «Кто обновил»: красные карточки — кому напомнить.</li>' +
      '<li>На совещании: «Доклады» → «На весь экран», стрелками ← → листайте докладчиков. Esc — выход.</li>' +
      '<li>Для директора: «Печать всех» или «Сохранить свод» (Excel).</li></ol>' +
      '<h3>Руководитель: до срока сдачи</h3><ol>' +
      '<li>Откройте свой файл в папке «Руководители».</li>' +
      '<li>Блок 1 «Поручения по Мемо» и блок 4 «Мероприятия УПЦ»: пишите только в жёлтую колонку «Статус». Сделали — начните статус со слова «выполнено».</li>' +
      '<li>Блоки 2 «РОС» и 3 «Текущие проекты» — ваши: правьте, добавляйте строки. Подзаголовок — текст только в колонке A.</li>' +
      '<li>Не переименовывайте заголовки блоков и не меняйте ID. Большие таблицы держите на отдельном листе (например, «Приложения») — Сборщик их покажет и не тронет.</li>' +
      '<li>Сохраните и закройте файл.</li></ol>' +
      '<h3>Правила контроля срока</h3><ul>' +
      '<li><span class="badge b-done">выполнено</span> — в статусе есть «выполнено», «проведено», «исполнено», «завершено», «снято» или «закрыто» (и нет «не» перед ним).</li>' +
      '<li><span class="badge b-closed">закрыто</span> — то же слово в «Отметке секретаря». Закрытое уходит из личного файла при следующей рассылке.</li>' +
      '<li><span class="badge b-check">срок прошёл — проверить</span> — срок истёк, статус есть, но не «выполнено».</li>' +
      '<li><span class="badge b-overdue">просрочено, нет статуса</span> — срок истёк, статуса нет.</li>' +
      '<li><span class="badge b-nodate">без даты</span> — срок текстом («постоянно», «уточнить»).</li></ul>' +
      '<h3>Если что-то пошло не так</h3><ul>' +
      '<li>Перед каждой рассылкой копии всех личных файлов лежат в папке «Архив» с датой и временем.</li>' +
      '<li>Если файл был открыт у руководителя во время рассылки и он потом сохранил его — новые поручения пропадут из его файла. Просто разошлите ещё раз: статусы не теряются.</li>' +
      '<li>Новый руководитель: добавьте строку на лист «Руководители» в Реестре — файл создастся при рассылке.</li></ul></div>';
  }

  // ---------- действия ----------
  function stamp() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()); }
  function log(s) { state.log.push(new Date().toLocaleTimeString('ru-RU') + '  ' + s); }

  async function freshRegistry() {
    const r = await readXlsx(state.dir, [REGISTRY]);
    const reg = Core.parseRegistry(r.wb);
    if (reg.errors.length) throw new Error(reg.errors.join(' '));
    return reg;
  }

  async function prepare(reg) {
    const out = [];
    for (const p of reg.people) {
      const row = { fio: p.fio, file: p.file, person: p, added: [], removed: [], total: 0 };
      try {
        let wb, parsed, buf = null, modified = null;
        try {
          const r = await readXlsx(state.dir, [PERSONAL_DIR, p.file]);
          wb = r.wb; buf = r.buf; modified = r.modified;
          parsed = Core.parsePersonal(wb);
          if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
        } catch (e) {
          if (!isNotFound(e)) throw e;
          wb = new ExcelJS.Workbook(); parsed = Core.emptyParsed(); row.isNew = true;
        }
        Object.assign(row, Core.refreshPersonal(ExcelJS, wb, p, reg, parsed));
        row.wb = wb; row.orig = buf;
        if (modified && Date.now() - modified.getTime() < 15 * 60 * 1000) row.warn = 'файл менялся ' + Math.max(1, Math.round((Date.now() - modified.getTime()) / 60000)) + ' мин назад — возможно, он сейчас открыт';
      } catch (e) {
        row.error = e.message;
      }
      out.push(row);
    }
    return out;
  }

  async function doCheck() {
    try {
      state.preview = await prepare(await freshRegistry());
    } catch (e) {
      state.preview = null; log('Ошибка: ' + e.message);
    }
    render();
  }

  async function doSend() {
    if (!confirm('Записать изменения в личные файлы? Копии старых файлов лягут в папку «Архив».')) return;
    const st = stamp();
    let ok = 0, fail = 0;
    let rows;
    try { rows = await prepare(await freshRegistry()); } catch (e) { log('Ошибка: ' + e.message); render(); return; }
    for (const r of rows) {
      if (r.error) { fail++; log(r.fio + ': пропущен — ' + r.error); continue; }
      try {
        if (r.orig) await writeBytes(state.dir, ['Архив', st, r.file], new Uint8Array(r.orig));
        const out = await r.wb.xlsx.writeBuffer();
        await writeBytes(state.dir, [PERSONAL_DIR, r.file], new Uint8Array(out));
        ok++;
        log(r.fio + ': записано (+' + r.added.length + ', −' + r.removed.length + ', всего ' + r.total + ')');
      } catch (e) {
        fail++;
        log(r.fio + ': НЕ записано — ' + e.message + ' (файл открыт? закройте и повторите)');
      }
    }
    log('Готово: записано ' + ok + ', с ошибками ' + fail + (ok ? '. Копии — в «Архив/' + st + '»' : ''));
    if (ok) { lsSet('since', isoLocal(new Date())); }
    state.preview = null;
    await loadAll();
  }

  async function doSummary() {
    try {
      const wb = Core.buildSummary(ExcelJS, state.model);
      const buf = new Uint8Array(await wb.xlsx.writeBuffer());
      const name = 'Свод_' + isoLocal(new Date()) + '.xlsx';
      if (state.readOnly || state.demo) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
        log('Свод скачан: ' + name);
      } else {
        await writeBytes(state.dir, ['Своды', name], buf);
        log('Свод сохранён: Своды/' + name);
      }
    } catch (e) { log('Свод не сохранён: ' + e.message); }
    render();
  }

  function printAll() {
    const html = state.model.people.map((p, i) => '<div class="' + (i ? 'page-break' : '') + '">' + personReport(p) + '</div>').join('');
    const r = $('#report');
    const keep = r.innerHTML;
    r.innerHTML = html;
    window.print();
    r.innerHTML = keep;
  }

  function present(on) {
    document.body.classList.toggle('present', on);
    if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // ---------- демо ----------
  async function demo() {
    const d = (s) => new Date(s + 'T00:00:00Z');
    const t = Core.todayUTC();
    const shift = (n) => new Date(t.getTime() + n * 864e5);
    const wb = new ExcelJS.Workbook();
    const sheet = (name, head, rows) => { const ws = wb.addWorksheet(name); ws.addRow([name]); ws.addRow([]); ws.addRow(head); rows.forEach((r) => ws.addRow(r)); };
    sheet('Мемо', ['ID', 'Дата совещания', 'Поручение', 'Ответственный', 'Соисполнители', 'Срок', 'Отметка секретаря'], [
      ['М-001', shift(-14), 'Подготовить график отпусков на 4 квартал', 'Иванов И.И.', '', shift(-5), ''],
      ['М-002', shift(-14), 'Провести инвентаризацию склада №2', 'Петрова А.С.', 'Иванов И.И.', shift(-3), ''],
      ['М-003', shift(-7), 'Согласовать договор аренды площадки', 'Сидоров К.Л.', '', shift(10), ''],
      ['М-004', shift(-7), 'Организовать обучение по охране труда', 'Иванов И.И.', '', shift(20), ''],
      ['М-005', shift(-7), 'Подготовить справку по дебиторской задолженности', 'Петрова А.С.', '', 'еженедельно', ''],
      ['М-006', shift(-21), 'Обновить должностные инструкции', 'Сидоров К.Л.', 'Петрова А.С.', shift(-10), 'выполнено ' + Core.fmtDate(shift(-8))],
      ['М-007', shift(-7), 'Вынести вопрос о технике на совещание с ГД', 'Сидоров К.Л.', '', shift(-1), ''],
    ]);
    sheet('План УПЦ', ['Блок', 'Показатель', '№', 'ID', 'Мероприятие', 'Ответственный исполнитель', 'Срок', 'Примечания', 'Докладчик', 'Статус (только если нет докладчика)'], [
      ['Блок ФОП', 'Выручка', 1, 'У-001', 'Мониторинг выполнения плановой выручки', 'Иванов И.И., Петрова А.С.', 'ежемесячно', '', 'Иванов И.И.', ''],
      ['Блок ФОП', 'Выручка', 2, 'У-002', 'Своевременное заключение доп. соглашений', 'Сидоров К.Л.', 'постоянно', '', 'Сидоров К.Л.', ''],
      ['Блок ФОП', 'Работа с ДЗ', 1, 'У-003', 'Мониторинг просроченной дебиторской задолженности', 'Петрова А.С.', 'постоянно', '', 'Петрова А.С.', ''],
      ['Блок БИ', 'Метрология', 1, 'У-004', 'Внесение средств измерений в учётную систему', 'Кузнецов Р.Р.', d('2026-12-15'), '', '', 'В работе, внесено 80%'],
    ]);
    sheet('Руководители', ['ФИО', 'Файл'], [['Иванов И.И.', 'Иванов.xlsx'], ['Петрова А.С.', 'Петрова.xlsx'], ['Сидоров К.Л.', 'Сидоров.xlsx']]);
    sheet('Показатели УПЦ', ['Показатель', 'Цель', 'Напряженная цель', 'Команда ответственных', 'Лидер команды', 'Ед. Изм'], [
      ['Выручка_ВС', '10 700', '16 780', 'Иванов Иван Иванович (ЛК), Петрова Анна Сергеевна', 'Иванов Иван Иванович', 'млн руб.'],
      ['Работа с ДЗ_ВС', '100', '150', 'Петрова Анна Сергеевна (ЛК), Сидоров Кирилл Львович', 'Петрова Анна Сергеевна', '%'],
    ]);
    const root = new MemDir('Демо');
    root.items.set(REGISTRY, new MemFile(REGISTRY, new Uint8Array(await wb.xlsx.writeBuffer())));
    const reg = Core.parseRegistry(wb);
    const own = {
      'Иванов.xlsx': { memo: { 'М-001': 'Проект графика на согласовании у ГД', 'М-004': 'Выполнено, обучение проведено ' + Core.fmtDate(shift(-2)) }, upc: { 'У-001': 'Факт 8 мес. 9 857 млн руб. при плане 7 987' },
        ros: [[1, 'Выручка по ДО', 'В работе. Закрыто 8 мес. на 8 356 млн руб.', 'Иванов И.И.', d('2026-12-31'), 70], [2, 'Выручка по внешним клиентам', 'Выполнено', 'Иванов И.И.', d('2026-09-30'), 100]],
        proj: [['Инвестиционные проекты'], [1, 'Склад в п. Витим', 'Закупка ПИР до 15.10', 'Иванов И.И.', d('2026-10-15'), 40]], age: 1 },
      'Петрова.xlsx': { memo: { 'М-005': 'ДЗ на 30.09 — 100,5 млн руб., просрочка 12 млн' }, upc: {},
        ros: [[1, 'ПДЗ', 'Снижение на 8% к прошлому месяцу', 'Петрова А.С.', d('2026-12-31'), 50]], proj: [], age: 2 },
      'Сидоров.xlsx': { memo: { 'М-007': 'Ждём даты совещания' }, upc: { 'У-002': 'Подписано 3 ДС из 5' }, ros: [], proj: [[1, 'Ремонт офиса', 'Ожидаем согласование', 'Сидоров К.Л.', d('2026-11-15'), 10]], age: 12 },
    };
    const pd = new MemDir(PERSONAL_DIR);
    root.items.set(PERSONAL_DIR, pd);
    for (const p of reg.people) {
      const o = own[p.file];
      const pwb = new ExcelJS.Workbook();
      Core.refreshPersonal(ExcelJS, pwb, p, reg, { ...Core.emptyParsed(), ...o });
      pd.items.set(p.file, new MemFile(p.file, new Uint8Array(await pwb.xlsx.writeBuffer()), Date.now() - o.age * 864e5));
    }
    await useDir(root, false, true);
  }

  // ---------- события ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab],[data-act],[data-person],[data-mf]');
    if (!b) return;
    if (b.dataset.tab) { state.tab = b.dataset.tab; render(); return; }
    if (b.dataset.person !== undefined) { state.person = +b.dataset.person; state.tab = 'report'; render(); window.scrollTo(0, 0); return; }
    if (b.dataset.mf) { state.memoFilter = b.dataset.mf; render(); return; }
    const a = b.dataset.act;
    const n = state.model ? state.model.people.length : 0;
    if (a === 'pick') pickFolder();
    else if (a === 'grant') grantSaved();
    else if (a === 'demo') demo();
    else if (a === 'reload') loadAll();
    else if (a === 'prev') { state.person = (state.person - 1 + n) % n; render(); }
    else if (a === 'next') { state.person = (state.person + 1) % n; render(); }
    else if (a === 'present') present(true);
    else if (a === 'print') window.print();
    else if (a === 'printAll') printAll();
    else if (a === 'check') doCheck();
    else if (a === 'send') doSend();
    else if (a === 'summary') doSummary();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'since') { lsSet('since', e.target.value); render(); }
    if (e.target.id === 'asof') { rebuildModel(); render(); }
    if (e.target.id === 'memoPerson') { state.memoPerson = e.target.value; render(); }
    if (e.target.id === 'upcPerson') { state.upcPerson = e.target.value; render(); }
    if (e.target.id === 'dirInput' && e.target.files.length) fromFileList(e.target.files);
  });
  document.addEventListener('keydown', (e) => {
    if (state.tab !== 'report' || !state.model || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const n = state.model.people.length;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { state.person = (state.person + 1) % n; render(); window.scrollTo(0, 0); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { state.person = (state.person - 1 + n) % n; render(); window.scrollTo(0, 0); }
    if (e.key === 'Escape') present(false);
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('present'); });

  window.Otchet = { state, useDir, loadAll, render, MemDir, MemFile };
  $('#asof').value = isoLocal(new Date());
  render();
  resumeFolder();
})();

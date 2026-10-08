/* global Store, Model, View */
// Общее для всех трёх страниц: подключение папки и чтение всех данных.
(function (root) {
  'use strict';

  // Шаг загрузки показываем на экране «Открываю папку…», чтобы было видно, где застряло.
  function step(msg) { const el = typeof document !== 'undefined' && document.getElementById('busyStep'); if (el) el.textContent = msg; }
  async function loadAll(dir) {
    step('Читаю реестр…');
    const { data: reg, modified } = await Store.readJSON(dir, [Store.DATA, Store.REG]);
    reg.settings = reg.settings || {};
    reg.people = reg.people || []; reg.memo = reg.memo || []; reg.kpis = reg.kpis || []; reg.events = reg.events || [];
    const data = {};
    let i = 0;
    for (const p of reg.people) {
      step('Читаю отчёт: ' + p.fio + ' (' + (++i) + ' из ' + reg.people.length + ')');
      try {
        const r = await Store.readJSON(dir, [Store.DATA, Store.PEOPLE, p.slug + '.json']);
        data[p.id] = { data: r.data, modified: r.modified };
      } catch (e) {
        data[p.id] = Store.isNotFound(e) ? { data: null } : { data: null, error: 'Файл не читается: ' + e.message };
      }
    }
    return { reg, data, regModified: modified };
  }

  // Поток подключения папки: сохранённая → разрешение одним кликом → выбор папки.
  // opts: { mode: 'read'|'readwrite', onDir(dir) }
  const NO_ACCESS = 'Папка не открылась. Если вы нажали «Отмена» — просто выберите папку ещё раз. Если выбрали папку, а ничего не произошло, — браузер не даёт доступ к ней: откройте «Проверка доступа.html» и пришлите фото экрана.';
  function connector(opts) {
    const c = { saved: null, error: '', busy: false, readOnly: false };
    const fail = (e) => { c.busy = false; c.error = (e && e.message) || String(e); opts.render(); };
    c.init = async () => {
      try {
        const dir = await Store.savedFolder();
        if (!dir) return false;
        c.saved = dir;
        if (await Store.hasPermission(dir, opts.mode)) { await c.use(dir); return true; }
      } catch (e) { /* начнём с выбора папки */ }
      return false;
    };
    c.pick = async () => {
      let dir;
      try { dir = await Store.pickFolder(opts.mode); } catch (e) {
        // Отмену и отказ браузера в доступе браузер сообщает одинаково — говорим об этом прямо, а не молчим.
        fail(e.name === 'AbortError' ? new Error(NO_ACCESS) : e);
        return;
      }
      await c.use(dir);
    };
    c.grant = async () => {
      try { if (await Store.askPermission(c.saved, opts.mode)) await c.use(c.saved); } catch (e) { fail(e); }
    };
    c.browse = async (files) => {
      if (!files || !files.length) { fail(new Error('Браузер не передал ни одного файла из этой папки.')); return; }
      const tok = start();
      try { const dir = await Store.fromFileList(files, step); if (tok !== c.tok) return; c.readOnly = true; await c.use(dir, tok); } catch (e) { if (tok === c.tok) fail(e); }
    };
    // Каждое открытие получает свой номер: если нажали «Отмена», результат старого просто игнорируется.
    function start() { c.tok = (c.tok || 0) + 1; c.busy = true; c.error = ''; c.t0 = Date.now(); opts.render(); tick(c.tok); return c.tok; }
    function tick(tok) {
      const el = document.getElementById('busySec');
      if (!c.busy || tok !== c.tok) return;
      if (el) el.textContent = Math.round((Date.now() - c.t0) / 1000) + ' сек';
      setTimeout(() => tick(tok), 1000);
    }
    c.cancel = () => { c.tok++; c.busy = false; c.error = 'Открытие отменено. Попробуйте ещё раз или «Открыть другим способом».'; opts.render(); };
    c.use = async (dir, tok) => {
      if (!tok) tok = start();
      try {
        step('Проверяю папку «' + dir.name + '»…');
        const ok = await Store.checkFolder(dir);
        if (tok !== c.tok) return;
        if (!ok) {
          fail(new Error('В папке «' + dir.name + '» нет «Данные/реестр.json». Выберите папку «Отчёт первой линейки» — ту, в которой лежит папка «Данные».'));
          return;
        }
        await opts.onDir(dir);
        if (tok !== c.tok) return;
        c.busy = false;
        opts.render();
      } catch (e) { if (tok === c.tok) fail(new Error('Папку открыть не получилось: ' + e.message)); }
    };
    c.screen = (title, text, demo) => (c.busy
      ? '<div class="panel empty-state"><h2>Открываю папку… <span id="busySec" class="muted small"></span></h2><p id="busyStep">Жду ответа от браузера…</p><button data-act="cancelOpen">Отмена</button></div>'
      : View.folderScreen({ title, text, error: c.error, saved: c.saved && c.saved.name, demo, fallback: opts.mode === 'read' ? 'Не открывается? Открыть другим способом' : 'Не открывается? Открыть только для просмотра' }));
    active = c;
    return c;
  }
  let active = null;
  // Запасная кнопка и скрытое поле выбора папки — общие для всех страниц.
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="cancelOpen"]') && active) { active.cancel(); return; }
      const b = e.target.closest('[data-act="browse"]');
      if (!b) return;
      let inp = document.getElementById('dirFallback');
      if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.id = 'dirFallback'; inp.webkitdirectory = true; inp.multiple = true; inp.hidden = true; document.body.appendChild(inp); }
      inp.value = '';
      inp.click();
    });
    document.addEventListener('change', (e) => { if (e.target.id === 'dirFallback' && active) active.browse(e.target.files); });
  }

  // Демо-папка с вымышленными людьми — чтобы посмотреть, ничего не открывая.
  async function demoFolder() {
    const t = Model.todayISO();
    const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return Model.todayISO(d); };
    const people = [
      { id: 'p1', fio: 'Иванов И.И.', full: 'Иванов Иван Иванович', slug: 'Иванов', email: 'ivanov@example.ru', onMeeting: true },
      { id: 'p2', fio: 'Петрова А.С.', full: 'Петрова Анна Сергеевна', slug: 'Петрова', email: 'petrova@example.ru', onMeeting: true },
      { id: 'p3', fio: 'Сидоров К.Л.', full: 'Сидоров Кирилл Львович', slug: 'Сидоров', email: '', onMeeting: true },
    ];
    const reg = {
      version: 2, settings: { lastMeeting: shift(-7), directorEmail: 'director@example.ru', cardDate: shift(-2) }, people,
      memo: [
        { id: 'm1', num: 1, date: shift(-14), text: 'Подготовить график отпусков на 4 квартал', resp: 'p1', co: [], due: shift(-5) },
        { id: 'm2', num: 2, date: shift(-14), text: 'Провести инвентаризацию склада №2', resp: 'p2', co: ['p1'], due: shift(-3) },
        { id: 'm3', num: 3, date: shift(-7), text: 'Согласовать договор аренды площадки', resp: 'p3', co: [], due: shift(10) },
        { id: 'm4', num: 4, date: shift(-7), text: 'Организовать обучение по охране труда', resp: 'p1', co: [], due: shift(20) },
        { id: 'm5', num: 5, date: shift(-7), text: 'Подготовить справку по дебиторской задолженности', resp: 'p2', co: [], due: 'еженедельно' },
        { id: 'm6', num: 6, date: shift(-21), text: 'Обновить должностные инструкции', resp: 'p3', co: [], due: shift(-10), closed: { date: shift(-7) } },
      ],
      kpis: [
        { id: 'K1', name: 'ГПН-ГПН_Снаб-Выручка_ВС', top3: true, goal: '10 700', stretch: '16 780', fact: '7 502', forecast: '16 780', grade: 'A', leader: 'Директор Д.Д.', team: 'Иванов Иван Иванович, Петрова Анна Сергеевна', unit: 'млн руб.', type: 'ФОП', reporter: null },
        { id: 'K2', name: 'ГПН-ГПН_Снаб-Работа с ДЗ_ВС', top3: false, goal: '100', stretch: '150', fact: '87', forecast: '120', grade: 'B', leader: 'Петрова Анна Сергеевна', team: 'Петрова Анна Сергеевна (ЛК), Сидоров Кирилл Львович', unit: '%', type: 'ФОП', reporter: 'p2' },
      ],
      events: [
        { id: 'e1', kpi: 'K1', text: 'Мониторинг выполнения плановой выручки', executors: 'Иванов И.И., Петрова А.С.', due: 'ежемесячно', speaker: 'p1' },
        { id: 'e2', kpi: 'K1', text: 'Своевременное заключение доп. соглашений', executors: 'Сидоров К.Л.', due: 'постоянно', speaker: 'p3' },
        { id: 'e3', kpi: 'K2', text: 'Мониторинг просроченной дебиторской задолженности', executors: 'Петрова А.С.', due: 'постоянно', speaker: 'p2' },
        { id: 'e4', kpi: 'K2', text: 'Претензионная работа с должниками', executors: 'Сидоров К.Л.', due: shift(30), speaker: 'p3' },
      ],
    };
    const own = {
      p1: { reportDate: t, memo: { m1: { flag: 'work', text: 'Проект графика на согласовании у ГД' }, m4: { flag: 'done', text: 'Обучение проведено' } }, events: { e1: { flag: 'work', text: 'Факт 8 мес. 9 857 млн руб.' } },
        ros: [{ kind: 'row', task: 'Выручка по ДО', text: 'Закрыто 8 мес. на 8 356 млн руб.', resp: 'Иванов И.И.', due: '2026-12-31', flag: 'work', pct: 70 }],
        proj: [{ kind: 'head', task: 'Инвестиционные проекты' }, { kind: 'row', task: 'Склад в п. Витим', text: 'Закупка ПИР до 15.10', resp: 'Иванов И.И.', due: shift(14), flag: 'work', pct: 40 }] },
      p2: { reportDate: t, memo: { m5: { flag: 'work', text: 'ДЗ на 30.09 — 100,5 млн руб.' } }, kpi: { K2: 'Прогноз 120% за счёт погашения ИНСК' }, events: { e3: { flag: 'work', text: 'Еженедельно' } } },
      p3: { reportDate: shift(-10), memo: { m3: { flag: 'fail', text: 'Арендодатель отказал, ищем другую площадку' } }, events: {} },
    };
    const root = new Store.MemDir('Демо');
    await Store.writeJSON(root, [Store.DATA, Store.REG], reg);
    for (const p of people) await Store.writeJSON(root, [Store.DATA, Store.PEOPLE, p.slug + '.json'], { personId: p.id, ...own[p.id] });
    return root;
  }

  async function sha(text) {
    try {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('otchet:' + text));
      return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381; for (const ch of 'otchet:' + text) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return 'h' + h.toString(16);
    }
  }

  // «Для директора.html»: снимок всех данных в одном файле. Открывается двойным щелчком в любом браузере,
  // ничего не спрашивает. Обновляется, когда помощник или руководитель открывает и сохраняет свою страницу.
  // Вложения в виде готового HTML — для страниц со вшитыми данными.
  async function collectAtt(dir, reg, data, onlyPid) {
    const att = {};
    for (const p of reg.people) {
      if (onlyPid && p.id !== onlyPid) continue;
      for (const a of ((data[p.id] && data[p.id].data && data[p.id].data.attachments) || [])) {
        try {
          const { bytes } = await Store.readBytes(dir, [Store.DATA, Store.ATT, p.slug, a.file]);
          (att[p.id] = att[p.id] || {})[a.file] = await View.attHtml(bytes, a.file, true);
        } catch (e) { /* вложение не прочиталось — в снимке будет без него */ }
      }
    }
    return att;
  }

  // Версия для телефона директора: файл без скриптов. Возвращает байты страницы.
  async function mobileFile(dir, reg, data) {
    const att = await collectAtt(dir, reg, data);
    return new TextEncoder().encode(root.Mobile.build(reg, data, Model.todayISO(), att, Date.now()));
  }

  async function writeSnapshot(dir, reg, data) {
    const libs = document.getElementById('libs');
    const app = document.getElementById('snap-app');
    const css = document.getElementById('css');
    if (!libs || !app || !css || !dir) return false;
    const att = await collectAtt(dir, reg, data);
    const plain = {};
    for (const [k, v] of Object.entries(data)) plain[k] = { data: v.data };
    const at = Date.now();
    const page = (title, header, snapObj, appText) => {
      const snap = JSON.stringify(snapObj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      return new TextEncoder().encode('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>' + title + '</title><style>' + css.textContent + '</style></head><body>' +
        '<header class="top"><h1>' + header + '</h1><span class="sub" id="who"></span><span class="sub" id="folder"></span></header>' +
        '<nav class="tabs" id="tabs"></nav><main id="main"></main>' +
        '<script>window.SNAPSHOT=' + snap + ';<\/script><script>' + libs.textContent + '<\/script><script>' + appText + '<\/script></body></html>');
    };
    let ok = false;
    const dirBytes = page('Для директора — отчёт первой линейки', 'Отчёт первой линейки', { at, reg, data: plain, att }, app.textContent);
    try { await Store.writeBytes(dir, ['Для директора.html'], dirBytes); ok = true; } catch (e) {
      try { await Store.writeBytes(dir, [Store.DATA, 'Для директора.html'], dirBytes); ok = true; } catch (e2) { /* нет прав */ }
    }
    // Руководителям, которые сохраняют файлом (Windows), — страница с уже вшитыми данными: папку выбирать не нужно.
    const mgr = document.getElementById('mgr-app');
    if (mgr) {
      for (const p of reg.people.filter((x) => x.fileMode)) {
        try {
          await Store.writeBytes(dir, ['Страницы руководителей', 'Отчёт — ' + p.slug + '.html'],
            page('Отчёт — ' + p.fio, 'Мой отчёт к совещанию', { at, reg, data: plain, att: att[p.id] ? { [p.id]: att[p.id] } : {}, me: p.id }, mgr.textContent));
        } catch (e) { ok = false; }
      }
    }
    return ok;
  }

  // Отчёт руководителя, сохранённый файлом: принимаем в общую папку. Файл старее уже принятого не принимаем.
  // Один отчёт могут заполнять несколько человек: файл несёт версию, с которой человек начал (base),
  // и из него переносятся только его правки — чужие, принятые раньше, не затираются.
  async function acceptReport(dir, reg, data, obj, fileName) {
    if (!obj || obj.kind !== 'otchet-report' || !obj.personId) return { ok: false, msg: fileName + ': это не файл отчёта' };
    const p = reg.people.find((x) => x.id === obj.personId);
    if (!p) return { ok: false, msg: fileName + ': руководителя нет в списке' };
    const cur = data[p.id] && data[p.id].data;
    if (cur && obj.saveId && (cur.saveIds || []).includes(obj.saveId)) return { ok: false, old: true, msg: p.fio + ': этот файл уже принят — пропущен' };
    const hasBase = Object.prototype.hasOwnProperty.call(obj, 'base');
    if (cur && cur.savedAt && !hasBase && obj.savedAt <= cur.savedAt) return { ok: false, old: true, msg: p.fio + ': файл не новее уже принятого — пропущен' };
    for (const [name, b64] of Object.entries(obj.attFiles || {})) {
      await Store.writeBytes(dir, [Store.DATA, Store.ATT, p.slug, name], Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
    }
    const mine = { ...obj };
    delete mine.attFiles; delete mine.kind; delete mine.base;
    if (mine.saveId) mine.saveIds = [mine.saveId];
    const merged = hasBase && cur && !Model.sameVersion(obj.base, cur);
    let clean = merged ? Model.mergeReport(obj.base, mine, cur) : mine;
    if (!merged && cur && cur.saveIds) clean.saveIds = Array.from(new Set([...cur.saveIds, ...(mine.saveIds || [])])).slice(-100);
    if (merged) clean.savedAt = Math.max(cur.savedAt || 0, mine.savedAt || 0);
    await Store.dailyBackup(dir, [Store.DATA, Store.PEOPLE, p.slug + '.json'], p.slug, 10);
    await Store.writeJSON(dir, [Store.DATA, Store.PEOPLE, p.slug + '.json'], clean);
    data[p.id] = { data: clean };
    return { ok: true, merged, msg: p.fio + ': принят отчёт от ' + Model.fmtDateTime(obj.savedAt) + (merged ? ' (объединён с правками, принятыми раньше)' : '') };
  }

  // Забираем отчёты из папки «Входящие»; обработанные файлы переносим в «Данные/архив/входящие».
  async function processInbox(dir, reg, data) {
    // любое имя: браузер мог сохранить файл как «download» — проверяем содержимое
    const files = (await Store.list(dir, ['Входящие'])).filter((f) => f.kind === 'file' && !/\.(txt|html?|xlsx?|docx?|pdf)$/i.test(f.name));
    const items = [];
    for (const f of files) {
      try {
        const { bytes } = await Store.readBytes(dir, ['Входящие', f.name]);
        items.push({ name: f.name, bytes, obj: JSON.parse(new TextDecoder().decode(bytes)) });
      } catch (e) { items.push({ name: f.name, err: e.message }); }
    }
    // если от одного человека несколько файлов — сначала старые, потом новые
    items.sort((a, b) => ((a.obj && a.obj.savedAt) || 0) - ((b.obj && b.obj.savedAt) || 0));
    const log = [];
    let accepted = 0;
    for (const it of items) {
      if (it.err) { log.push(it.name + ': не читается — ' + it.err); continue; }
      const r = await acceptReport(dir, reg, data, it.obj, it.name);
      log.push(r.msg);
      if (r.ok) accepted++;
      try {
        await Store.writeBytes(dir, [Store.DATA, Store.ARCH, 'входящие', Model.todayISO() + ' ' + it.name], it.bytes);
        await Store.remove(dir, ['Входящие', it.name]);
      } catch (e) { log.push(it.name + ': не удалось убрать из «Входящих» — ' + e.message); }
    }
    return { accepted, total: items.length, log };
  }

  root.Base = { loadAll, connector, demoFolder, sha, step, writeSnapshot, acceptReport, processInbox, collectAtt, mobileFile };
})(typeof window !== 'undefined' ? window : globalThis);

// Любая неожиданная ошибка — сообщением внизу экрана, чтобы кнопка не «молчала».
(function () {
  if (typeof window === 'undefined') return;
  const show = (m) => { try { window.View.toast('Ошибка: ' + m + '. Сообщите помощнику или разработчику.', 'bad'); } catch (e) { /* */ } };
  window.addEventListener('error', (e) => show(e.message));
  window.addEventListener('unhandledrejection', (e) => show((e.reason && e.reason.message) || String(e.reason)));
})();

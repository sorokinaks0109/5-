/* global Store, Model, View */
// Общее для всех трёх страниц: подключение папки и чтение всех данных.
(function (root) {
  'use strict';

  async function loadAll(dir) {
    const { data: reg, modified } = await Store.readJSON(dir, [Store.DATA, Store.REG]);
    reg.settings = reg.settings || {};
    reg.people = reg.people || []; reg.memo = reg.memo || []; reg.kpis = reg.kpis || []; reg.events = reg.events || [];
    const data = {};
    for (const p of reg.people) {
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
  function connector(opts) {
    const c = { saved: null, error: '' };
    c.init = async () => {
      const dir = await Store.savedFolder();
      if (!dir) return false;
      c.saved = dir;
      if (await Store.hasPermission(dir, opts.mode)) { await c.use(dir); return true; }
      return false;
    };
    c.pick = async () => {
      try { const dir = await Store.pickFolder(opts.mode); await c.use(dir); } catch (e) { if (e.name !== 'AbortError') { c.error = e.message; opts.render(); } }
    };
    c.grant = async () => {
      try { if (await Store.askPermission(c.saved, opts.mode)) await c.use(c.saved); } catch (e) { c.error = e.message; opts.render(); }
    };
    c.use = async (dir) => {
      if (!(await Store.checkFolder(dir))) {
        c.error = 'В папке «' + dir.name + '» нет «Данные/реестр.json». Выберите папку «Отчёт первой линейки».';
        opts.render(); return;
      }
      c.error = '';
      await opts.onDir(dir);
    };
    c.screen = (title, text, demo) => View.folderScreen({ title, text, error: c.error, saved: c.saved && c.saved.name, demo });
    return c;
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

  root.Base = { loadAll, connector, demoFolder, sha };
})(typeof window !== 'undefined' ? window : globalThis);

// Любая неожиданная ошибка — сообщением внизу экрана, чтобы кнопка не «молчала».
(function () {
  if (typeof window === 'undefined') return;
  const show = (m) => { try { window.View.toast('Ошибка: ' + m + '. Сообщите помощнику или разработчику.', 'bad'); } catch (e) { /* */ } };
  window.addEventListener('error', (e) => show(e.message));
  window.addEventListener('unhandledrejection', (e) => show((e.reason && e.reason.message) || String(e.reason)));
})();

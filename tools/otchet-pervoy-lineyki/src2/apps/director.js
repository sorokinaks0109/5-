/* global ExcelJS, Model, View, Base */
// Страница директора: только просмотр. Папку открывает на чтение и ничего не записывает.
(function () {
  'use strict';
  const { esc, $ } = View;
  const S = { dir: null, reg: null, data: {}, tab: 'sum', person: 0, memoFilter: '', memoPerson: '', demo: false, meetFilter: '' };
  const today = () => Model.todayISO();
  const TABS = [['sum', 'Сводка'], ['meeting', 'Доклады'], ['memo', 'Поручения'], ['upc', 'Показатели УПЦ']];
  const conn = Base.connector({ mode: 'read', render: () => render(), onDir: async (dir) => { S.dir = dir; await load(); } });

  async function load() { const all = await Base.loadAll(S.dir); S.reg = all.reg; S.data = all.data; render(); }
  const people = () => S.reg.people.filter((p) => p.onMeeting !== false).concat(S.reg.people.filter((p) => p.onMeeting === false));

  function render() {
    $('#tabs').innerHTML = S.reg ? TABS.map(([k, t]) => '<button data-tab="' + k + '" class="' + (S.tab === k ? 'active' : '') + '">' + t + '</button>').join('') : '';
    $('#folder').textContent = S.dir ? (S.demo ? 'Демо-данные (вымышленные)' : 'Данные на ' + Model.fmtDateTime(S.snap ? window.SNAPSHOT.at : Date.now())) : '';
    const main = $('#main');
    if (!S.dir || !S.reg) { main.innerHTML = conn.screen('Отчёт первой линейки', 'Выберите общую папку «Отчёт первой линейки». Страница только читает данные и ничего не меняет.', true); return; }
    main.innerHTML = ({ sum: sumTab, meeting: meetingTab, memo: memoTab, upc: upcTab })[S.tab]();
    if (S.tab === 'meeting') View.hydrateAttachments(main, S.dir, S.reg);
  }

  function sumTab() {
    const open = S.reg.memo.filter((m) => !m.closed).map((m) => Model.memoStatus(S.reg, S.data, m).flag);
    const late = S.reg.memo.filter((m) => !m.closed && Model.isOverdue(m.due, Model.memoStatus(S.reg, S.data, m).flag, today())).length;
    const kpiRows = S.reg.kpis.map((k) => {
      const rep = Model.personById(S.reg, k.reporter);
      const evs = S.reg.events.filter((e) => e.kpi === k.id).map((e) => Model.eventStatus(S.reg, S.data, e).flag);
      const c = Model.countFlags(evs);
      return '<tr><td>' + esc(Model.shortKpi(k.name)) + (k.top3 ? ' <span class="badge s-work">ТОП-3</span>' : '') + '</td><td class="num">' + esc(cut(k.goal)) + '</td><td class="num">' + esc(cut(k.fact)) + '</td><td class="num">' + esc(cut(k.forecast)) + '</td><td>' + esc(k.grade) + '</td><td>' + esc(rep ? rep.fio : '—') +
        '</td><td>' + (c.total ? c.done + ' из ' + c.total + (c.fail ? ' · <span class="late">не вып. ' + c.fail + '</span>' : '') : '—') + '</td></tr>';
    }).join('');
    return '<div class="row between no-print"><h2>Поручения на контроле</h2><span class="row"><button data-act="reload">Обновить</button><button data-act="print">Печать</button>' + (S.snap ? '' : '<button data-act="xlsx">Скачать свод в Excel</button>') + '</span></div>' +
      (S.snap ? '<div class="muted small no-print">Это снимок данных на ' + esc(Model.fmtDateTime(window.SNAPSHOT.at)) + '. Он обновляется сам, когда помощник или руководители открывают и сохраняют свои страницы. «Обновить» — перечитать файл.</div>' : '') +
      View.countTiles(Model.countFlags(open)) + (late ? '<div class="msg bad">Срок прошёл: ' + late + '</div>' : '') +
      '<h3 class="sec">По руководителям</h3>' + View.whoCards(S.reg, S.data, today()) +
      '<h3 class="sec">Показатели УПЦ <span class="muted">карта от ' + esc(Model.fmtISO(S.reg.settings.cardDate) || '—') + '</span></h3>' +
      '<table class="grid"><thead><tr><th>Показатель</th><th>Цель</th><th>Факт</th><th>Прогноз</th><th>Оценка</th><th class="c-resp">Отчитывается</th><th class="c-resp">Мероприятия выполнено</th></tr></thead><tbody>' + kpiRows + '</tbody></table>';
  }
  function cut(s) { s = String(s || ''); return s.length > 40 ? s.slice(0, 40) + '…' : s; }

  function meetingTab() {
    const ps = people(); if (S.person >= ps.length) S.person = 0;
    return '<div class="people-bar">' + ps.map((x, i) => '<button class="chip ' + (i === S.person ? 'active' : '') + '" data-person-idx="' + i + '">' + esc(x.fio) + '</button>').join('') +
      '<span class="tools row"><button data-act="prev">←</button><button data-act="next">→</button><button data-act="print">Печать</button></span></div>' +
      View.filterChips(S.meetFilter, 'data-meetf') +
      View.personReport(S.reg, S.data, ps[S.person].id, today(), { filter: S.meetFilter });
  }
  function memoTab() {
    const chip = (k, t) => '<button class="chip ' + (S.memoFilter === k ? 'active' : '') + '" data-mf="' + k + '">' + t + '</button>';
    return '<div class="filters">' + chip('', 'Все') + chip('done', 'Выполнено') + chip('work', 'В работе') + chip('fail', 'Не выполнено') + chip('na', 'Неактуально') + chip('none', 'Без статуса') + chip('late', 'Срок прошёл') +
      '<select id="memoPerson"><option value="">Все ответственные</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (S.memoPerson === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('') + '</select><button data-act="print">Печать</button></div>' +
      View.memoTable(S.reg, S.data, today(), { flag: S.memoFilter, person: S.memoPerson });
  }
  function upcTab() { return '<div class="row between no-print"><span></span><button data-act="print">Печать</button></div>' + View.upcOverview(S.reg, S.data, today()); }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tab],[data-act],[data-person-idx],[data-mf],[data-meetf],.who .card');
    if (!b) return;
    if (b.dataset.meetf !== undefined) { S.meetFilter = b.dataset.meetf; render(); return; }
    if (b.dataset.tab) { S.tab = b.dataset.tab; render(); return; }
    if (b.classList.contains('card') && b.dataset.person) { S.person = people().findIndex((p) => p.id === b.dataset.person); S.tab = 'meeting'; render(); return; }
    if (b.dataset.personIdx) { S.person = +b.dataset.personIdx; render(); return; }
    if (b.dataset.mf !== undefined) { S.memoFilter = b.dataset.mf; render(); return; }
    const a = b.dataset.act; const n = S.reg ? people().length : 0;
    if (a === 'pick') conn.pick();
    else if (a === 'grant') conn.grant();
    else if (a === 'demo') { S.demo = true; S.dir = await Base.demoFolder(); await load(); }
    else if (a === 'reload') { if (S.snap) location.reload(); else load(); }
    else if (a === 'print') window.print();
    else if (a === 'prev') { S.person = (S.person - 1 + n) % n; render(); }
    else if (a === 'next') { S.person = (S.person + 1) % n; render(); }
    else if (a === 'xlsx') { const wb = Model.buildSummary(ExcelJS, S.reg, S.data, today()); await View.saveFile(new Uint8Array(await wb.xlsx.writeBuffer()), 'Свод_' + today() + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', 'Excel'); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'memoPerson') { S.memoPerson = e.target.value; render(); } });
  document.addEventListener('keydown', (e) => {
    if (S.tab !== 'meeting' || !S.reg || /INPUT|SELECT/.test(e.target.tagName)) return;
    const n = S.reg ? people().length : 0;
    if (e.key === 'ArrowRight') { S.person = (S.person + 1) % n; render(); }
    if (e.key === 'ArrowLeft') { S.person = (S.person - 1 + n) % n; render(); }
  });

  window.Otchet = { S, load, render, Base };
  if (window.SNAPSHOT) {
    // Снимок «Для директора.html»: данные уже внутри файла, папку открывать не нужно.
    S.snap = true; S.dir = { name: 'снимок' }; S.reg = window.SNAPSHOT.reg; S.data = window.SNAPSHOT.data;
    render();
  } else {
    render();
    conn.init().then((ok) => { if (!ok) render(); });
  }
})();

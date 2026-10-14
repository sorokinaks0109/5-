/* global Store, Model, View, Base */
// Страница руководителя: заполняет свой отчёт. Пишет только в свой файл Данные/руководители/<Фамилия>.json
(function () {
  'use strict';
  const { esc, $, $$ } = View;
  const S = { dir: null, reg: null, data: {}, me: null, draft: null, base: null, dirty: false, preview: false, demo: false, saving: false, embedded: false, pendingAtt: {}, sent: null, filter: '' };
  const MAX_ATT = 20 * 1024 * 1024;
  const LS = (k) => 'otchet.saved.' + k;
  const today = () => Model.todayISO();

  // Кто я: из имени файла страницы («Отчёт — Мещеряков.html»), иначе — выбор из списка.
  function whoFromFile(reg) {
    let name = '';
    try { name = decodeURIComponent(location.pathname.split('/').pop() || ''); } catch (e) { /* пусто */ }
    const p = reg.people.find((x) => name.toLowerCase().includes(x.slug.toLowerCase()));
    if (p) return p.id;
    let saved = null; try { saved = localStorage.getItem('otchet.me'); } catch (e) { /* нет хранилища */ }
    return reg.people.some((x) => x.id === saved) ? saved : null;
  }

  const conn = Base.connector({ mode: 'readwrite', render: () => render(), onDir: async (dir) => { S.dir = dir; await load(); } });

  async function load() {
    // страница со вшитыми данными переключается на папку: несохранённые правки не теряем
    const keep = S.embedded && S.draft && S.dirty ? { base: S.base, draft: S.draft } : null;
    const all = await Base.loadAll(S.dir);
    S.reg = all.reg; S.data = all.data;
    if (!S.me) S.me = whoFromFile(S.reg);
    if (S.me) startDraft();
    if (keep && S.me) {
      const own = (S.data[S.me] && S.data[S.me].data) || null;
      S.draft = { memo: {}, events: {}, kpi: {}, coNotes: {}, ros: [], proj: [], attachments: [], ...JSON.parse(JSON.stringify(Model.mergeReport(keep.base, keep.draft, own))) };
      S.dirty = true;
    }
    if (S.embedded && S.dir) View.toast('Папка открыта: «Сохранить» теперь пишет сразу в папку', 'ok');
    render();
  }
  function startDraft() {
    const own = (S.data[S.me] && S.data[S.me].data) || {};
    // база — версия, с которой начали: при сохранении переносятся только свои правки (отчёт могут вести несколько человек)
    S.base = JSON.parse(JSON.stringify(own));
    S.draft = JSON.parse(JSON.stringify({ memo: {}, events: {}, kpi: {}, coNotes: {}, ros: [], proj: [], attachments: [], ...own }));
    // Дату ставит сам руководитель. Если с прошлого совещания отчёт не обновлялся — поле пустое и подсвечено.
    S.prevDate = own.reportDate || '';
    if (Model.freshness(S.reg, own) !== 'fresh') S.draft.reportDate = '';
    // мероприятие передали мне от другого человека — начинаю с его статуса и пояснения
    for (const ev of S.reg.events) {
      // статус, который помощник перенёс из квартального плана после моего последнего сохранения
      if (ev.speaker === S.me && ev.override && !(own.savedAt > ev.override.at)) { S.draft.events[ev.id] = { flag: ev.override.flag || '', text: ev.override.text || '' }; continue; }
      const cur = S.draft.events[ev.id];
      if (ev.speaker === S.me && ev.prev && (!cur || (!cur.flag && !String(cur.text || '').trim()))) S.draft.events[ev.id] = { flag: ev.prev.flag || '', text: ev.prev.text || '' };
    }
    S.dirty = false;
  }

  // ---------- отрисовка ----------
  function render() {
    const main = $('#main');
    $('#who').textContent = S.me && S.reg ? Model.personById(S.reg, S.me).fio : '';
    if (!S.reg || (!S.dir && !S.embedded) || (S.embedded && !S.dir && conn.busy)) {
      main.innerHTML = conn.screen('Мой отчёт к совещанию первой линейки',
        'Выберите общую папку «Отчёт первой линейки». Это нужно один раз — дальше страница её запомнит и попросит только подтвердить доступ.', true);
      return;
    }
    if (!S.me) {
      main.innerHTML = '<div class="panel"><h2>Кто вы?</h2><p class="muted">Выберите себя. Страница запомнит выбор на этом компьютере.</p><div class="row">' +
        S.reg.people.map((p) => '<button data-me="' + esc(p.id) + '">' + esc(p.fio) + '</button>').join('') + '</div></div>';
      return;
    }
    const pv = viewData();
    main.innerHTML = sentPanel() + headBar() + avrBanner() + planBanner() + filterBar() + (S.preview
      ? '<div class="panel preview">' + View.personReport(S.reg, pv, S.me, today(), { filter: S.filter }) + '</div>'
      : memoSec() + (T().ros ? freeSec('ros', T().ros) : '') + (T().proj ? freeSec('proj', T().proj) : '') + upcSec() + attSec() + planSec());
    if (S.preview) View.hydrateAttachments(main, S.dir, S.reg, { [S.me]: S.pendingAtt });
    View.autoGrow(main);
    updateSaveState();
  }
  const T = () => Model.sections(S.reg);
  // Запрос помощника: итоги за квартал для АВР — плашка сверху и поле у каждого своего мероприятия УПЦ
  function avrBanner() {
    const r = Model.avrReq(S.reg); if (!r) return '';
    const p = Model.avrqProgress(S.reg, viewData(), S.me);
    if (!p || !p.total) return '';
    const left = p.total - p.done;
    return '<div class="panel msg ' + (left ? 'warn' : 'ok') + ' avr-banner"><b>Нужно заполнить итоги за ' + esc(r.period) + ' для отчёта анализа высшего руководства' + (r.due ? ' до ' + esc(Model.fmtISO(r.due)) : '') + '.</b> ' +
      esc(r.text || '') + '<br>Заполнено: <b>' + p.done + ' из ' + p.total + '</b>. Поле «Итог за ' + esc(r.period) + '» — у каждого вашего мероприятия в разделе «' + esc(T().upcPlain) + '». ' +
      (left ? '<button class="mini" data-act="toUpc">Перейти к мероприятиям</button>' : 'Спасибо!') + '</div>';
  }
  // ---------- проект плана мероприятий на следующий год ----------
  function planBanner() {
    const p = Model.planOn(S.reg); if (!p) return '';
    const g = Model.planProgress(S.reg, viewData(), S.me);
    if (!g || !g.total) return '';
    return '<div class="panel msg ' + (g.done < g.total ? 'warn' : 'ok') + ' plan-banner"><b>Сбор мероприятий на ' + esc(p.year) + ' год' + (p.due ? ' — до ' + esc(Model.fmtISO(p.due)) : '') + '.</b> ' +
      'Ваших показателей: ' + g.total + ', проверено: ' + g.done + '. Мероприятия уже вписаны — подтвердите или поправьте. ' +
      '<button class="mini" data-act="toPlan">Перейти</button></div>';
  }
  const PST = { '': '<span class="badge s-none">предложено помощником — проверьте</span>', ok: '<span class="badge s-done">подтверждено</span>', edit: '<span class="badge s-work">изменено</span>' };
  // kind: 'k' — показатель (key = код), 'b' — предложенная инициатива (key = номер)
  function planEvTable(list, kind, key, addAttr) {
    const at = (i, f) => 'data-pv="' + kind + '|' + esc(key) + '|' + i + '|' + f + '"';
    return '<table class="grid edit plan-ev"><thead><tr><th class="c-no">№</th><th>Мероприятие</th><th class="c-resp">Ответственные</th><th class="c-due">Срок</th><th class="c-act"></th></tr></thead><tbody>' +
      (list.length ? list.map((e, i) => '<tr><td class="c-no">' + (i + 1) + '</td><td>' + View.ta(at(i, 'text'), e.text || '', 'Что сделаем') + '</td>' +
        '<td>' + View.ta(at(i, 'executors'), e.executors || '', 'Фамилии') + '</td><td><input ' + at(i, 'due') + ' value="' + esc(Model.fmtISO(e.due || '')) + '" placeholder="дд.мм.гггг или «постоянно»"></td>' +
        '<td class="c-act"><button class="mini danger" data-pvdel="' + kind + '|' + esc(key) + '|' + i + '" title="Удалить">✕</button></td></tr>').join('') : '<tr><td colspan="5" class="muted">Мероприятий нет</td></tr>') +
      '</tbody></table><button class="mini" ' + addAttr + '>+ мероприятие</button>';
  }
  function planSec() {
    const p = Model.planOn(S.reg); if (!p) return '';
    const ks = p.kpis.filter((k) => k.leader === S.me);
    let h = '<div class="panel plan" id="planSec"><h2>Проект на ' + esc(p.year) + ' год</h2>' +
      '<div class="msg warn small">Это не текущий отчёт: здесь мероприятия на ' + esc(p.year) + ' год для приказа № 1. ' + esc(p.text || '') + (p.due ? ' Срок — до ' + esc(Model.fmtISO(p.due)) + '.' : '') +
      ' Мероприятия по вашим показателям уже вписаны: если всё верно — «Подтвердить», если нет — поправьте прямо в таблице. Сохраняется общей кнопкой «Сохранить».</div>';
    if (!ks.length) h += '<div class="muted small">Показателей, где вы лидер, в проекте нет.</div>';
    for (const k of ks) {
      const f = Model.planFinal(S.reg, viewData(), k);
      h += '<div class="kpi"><div class="kpi-head"><div class="kpi-name">' + esc(Model.shortKpi(k.name)) + ' <span class="muted small">' + esc(k.type || '') + '</span> ' + PST[f.st || ''] + '</div>' +
        (k.goal ? '<div class="kpi-vals"><span><b>Цель ' + esc(p.year) + ':</b> ' + esc(k.goal) + '</span></div>' : '') + '</div>' +
        planEvTable(f.events, 'k', k.id, 'data-pkadd="' + esc(k.id) + '"') +
        (f.st !== 'ok' ? ' <button class="mini primary" data-pkok="' + esc(k.id) + '">Подтвердить</button>' : '') + '</div>';
    }
    h += '<h3 class="sec">Бизнес-инициативы на ' + esc(p.year) + ' год <span class="muted">предложите свои, если есть</span></h3>';
    (S.draft.planBI || []).forEach((b, bi) => {
      h += '<div class="kpi"><div class="form-grid"><label class="wide">Название инициативы<input data-pb="' + bi + '|name" value="' + esc(b.name || '') + '"></label>' +
        '<label class="wide">Что получим (цель)' + View.ta('data-pb="' + bi + '|goal"', b.goal || '') + '</label>' +
        '<label class="wide">Как будем оценивать' + View.ta('data-pb="' + bi + '|measure"', b.measure || '') + '</label>' +
        '<label>Срок<input data-pb="' + bi + '|due" value="' + esc(Model.fmtISO(b.due || '')) + '"></label></div>' +
        planEvTable(b.events || [], 'b', bi, 'data-pbadd="' + bi + '"') + ' <button class="mini danger" data-pbdel="' + bi + '">Удалить инициативу</button></div>';
    });
    return h + '<button data-pbnew="1">+ Предложить бизнес-инициативу</button></div>';
  }
  // Первая правка показателя: берём за основу то, что предложено, и дальше правим свою копию
  function planK(kid) {
    S.draft.planK = S.draft.planK || {};
    if (!S.draft.planK[kid]) {
      const k = Model.planOn(S.reg).kpis.find((x) => x.id === kid);
      S.draft.planK[kid] = { st: 'edit', events: Model.planFinal(S.reg, viewData(), k).events.map((e) => ({ text: e.text || '', executors: e.executors || '', due: e.due || '' })) };
    }
    return S.draft.planK[kid];
  }
  const planList = (kind, key) => (kind === 'k' ? planK(key).events : S.draft.planBI[+key].events);
  const planTouch = (kind, key) => { if (kind === 'k') { const pk = planK(key); pk.st = 'edit'; pk.at = Date.now(); } };
  function planInput(t) {
    if (t.dataset.pv) { const [kind, key, i, f] = t.dataset.pv.split('|'); planList(kind, key)[+i][f] = f === 'due' ? Model.parseDue(t.value) : t.value; planTouch(kind, key); return true; }
    if (t.dataset.pb) { const [bi, f] = t.dataset.pb.split('|'); S.draft.planBI[+bi][f] = f === 'due' ? Model.parseDue(t.value) : t.value; return true; }
    return false;
  }
  function planClick(b) {
    if (b.dataset.pvdel) { const [kind, key, i] = b.dataset.pvdel.split('|'); planList(kind, key).splice(+i, 1); planTouch(kind, key); return true; }
    if (b.dataset.pkadd) { const pk = planK(b.dataset.pkadd); pk.events.push({ text: '', executors: '', due: '' }); pk.st = 'edit'; pk.at = Date.now(); return true; }
    if (b.dataset.pkok) { const pk = planK(b.dataset.pkok); pk.st = 'ok'; pk.at = Date.now(); View.toast('Подтверждено. Не забудьте «Сохранить».', 'ok'); return true; }
    if (b.dataset.pbnew) { S.draft.planBI = S.draft.planBI || []; S.draft.planBI.push({ name: '', goal: '', measure: '', due: '', events: [{ text: '', executors: '', due: '' }] }); return true; }
    if (b.dataset.pbadd !== undefined) { S.draft.planBI[+b.dataset.pbadd].events.push({ text: '', executors: '', due: '' }); return true; }
    if (b.dataset.pbdel !== undefined) { if (!confirm('Удалить предложенную инициативу?')) return false; S.draft.planBI.splice(+b.dataset.pbdel, 1); return true; }
    return false;
  }
  // Фильтр по статусу: поручения, РОС, проекты, мероприятия
  const pass = (flag, d) => View.flagPass(S.filter, flag, d, today());
  function filterBar() {
    const v = Model.personView(S.reg, viewData(), S.me, today());
    const items = [...v.memo.map((m) => ({ flag: m.st.flag, due: m.due })), ...v.co.map((m) => ({ flag: m.st.flag, due: m.due })),
      ...(T().ros ? S.draft.ros : []).concat(T().proj ? S.draft.proj : []).filter((r) => r.kind !== 'head').map((r) => ({ flag: r.flag, due: r.due })),
      ...[].concat(...v.kpiOwn.map((k) => k.events.filter((e) => e.mine)), ...v.kpiOther.map((k) => k.events)).map((e) => ({ flag: e.st.flag, due: e.due }))];
    return '<div class="panel filter-bar"><span class="muted small">Показать:</span>' + View.filterChips(S.filter, 'data-flt', View.filterCounts(items, today())) + '</div>';
  }
  // Данные «как будто уже сохранено» — для предпросмотра.
  function viewData() { const d = { ...S.data }; d[S.me] = { data: S.draft }; return d; }

  // После сохранения файлом — что сделать с файлом (Windows, без доступа к папке).
  function sentPanel() {
    if (!S.sent) return '';
    return '<div class="panel msg ok sent"><h2>Отчёт сохранён в файл «' + esc(S.sent) + '»</h2>' +
      '<ol><li>Откройте папку, куда сохранили файл (обычно <b>«Загрузки»</b>; в браузере — значок загрузок справа вверху → «Показать в папке»).</li>' +
      '<li><b>Перетащите файл</b> в общую папку отчёта, в папку <b>«Входящие»</b>: <span class="muted">…\\Отчёт первой линейки\\Входящие</span>.</li>' +
      '<li>Всё. Помощник увидит отчёт, когда откроет свою страницу. Если перетащить не получается — отправьте файл помощнику по почте.</li></ol>' +
      '<button data-act="sentOk">Понятно</button></div>';
  }
  function headBar() {
    const last = S.reg.settings.lastMeeting;
    const need = !S.draft.reportDate;
    return '<div class="panel sticky head-bar">' +
      '<label class="req ' + (need ? 'empty' : '') + '">Отчёт актуален на <input type="date" id="reportDate" value="' + esc(S.draft.reportDate || '') + '" max="' + today() + '"></label>' +
      '<span class="muted small">' + (last ? 'Последнее совещание: ' + Model.fmtISO(last) + '. ' : '') + (S.prevDate ? 'Прошлый раз указано: ' + Model.fmtISO(S.prevDate) : 'Отчёт ещё не заполнялся') +
      (S.embedded && !S.dir ? '<br>Поручения на ' + Model.fmtDateTime(window.SNAPSHOT.at) + '. «Сохранить» сохранит файл — его нужно положить в папку «Входящие».' : '') +
      (S.embedded && S.dir ? '<br>Сохраняется сразу в папку «' + esc(S.dir.name) + '».' : '') + '</span>' +
      (S.embedded && !S.dir && conn.error ? '<span class="msg bad small">Папка не открылась — сохраняйте файлом, как раньше.</span>' : '') +
      '<span class="spacer"></span><span id="saveState" class="small"></span>' +
      (S.embedded && !S.dir ? '<button data-act="linkFolder" title="Для Astra Linux: отчёт будет сохраняться прямо в общую папку, без «Входящих»">' + (conn.saved ? 'Сохранять в папку «' + esc(conn.saved.name) + '»' : 'Сохранять сразу в папку') + '</button>' : '') +
      '<button data-act="print">Печать</button>' +
      '<button data-act="preview">' + (S.preview ? 'Вернуться к заполнению' : 'Как увидят на совещании') + '</button>' +
      '<button class="primary" data-act="save">Сохранить</button></div>';
  }

  function stRow(kind, id, st) {
    return '<div class="fill">' + View.statusSelect(kind + '|' + id + '|flag', st.flag, 'data-k="' + kind + '|' + id + '|flag"') +
      View.ta('data-k="' + kind + '|' + id + '|text"', st.text, 'Пояснение: что сделано, на каком этапе') + '</div>';
  }
  function getSt(kind, id) { const s = (S.draft[kind] || {})[id] || {}; return { flag: s.flag || '', text: s.text || '' }; }

  function memoSec() {
    const v = Model.personView(S.reg, viewData(), S.me, today());
    let h = '<div class="panel"><h2>' + esc(T().memo) + '</h2>';
    if (!v.memo.length) h += '<div class="muted">Открытых поручений нет</div>';
    const memo = v.memo.filter((m) => pass(getSt('memo', m.id).flag, m.due));
    if (v.memo.length && !memo.length) h += '<div class="muted small">Под фильтр ничего не попало</div>';
    for (const m of memo) {
      h += '<div class="edit-item"><div class="ei-text"><b>' + esc(m.text) + '</b><div class="muted small">Поручено ' + esc(Model.fmtISO(m.date)) + ' · срок: ' + View.due(m.due, getSt('memo', m.id).flag, today()) +
        ((m.co || []).length ? ' · соисп.: ' + esc(m.co.map((id) => (Model.personById(S.reg, id) || {}).fio).join(', ')) : '') + '</div>' +
        (m.all && m.all.progress ? '<div class="muted small">Поручено ' + m.all.progress.total + ' руководителям, у каждого свой статус · выполнили ' + m.all.progress.done + ' из ' + m.all.progress.total + '</div>' : '') +
        View.notesHtml(m.notes) + '</div>' + stRow('memo', m.id, getSt('memo', m.id)) + '</div>';
    }
    const co = v.co.filter((m) => pass(m.st.flag, m.due));
    if (co.length) {
      h += '<h3 class="sec">Где я соисполнитель <span class="muted">статус ведёт ответственный, ваш комментарий он увидит у себя</span></h3>';
      for (const m of co) {
        h += '<div class="edit-item"><div class="ei-text"><b>' + esc(m.text) + '</b><div class="muted small">Отв.: ' + esc(Model.respName(S.reg, m)) + ' · срок: ' + View.due(m.due, m.st.flag, today()) + '</div>' +
          '<div class="small">' + View.badge(m.st.flag) + ' ' + esc(m.st.text) + '</div></div>' +
          '<div class="fill">' + View.ta('data-k="coNotes|' + esc(m.id) + '"', (S.draft.coNotes || {})[m.id] || '', 'Мой комментарий соисполнителя: что сделано с моей стороны') + '</div></div>';
      }
    }
    return h + '</div>';
  }

  function freeSec(kind, title) {
    const rows = S.draft[kind];
    let h = '<div class="panel" data-sec="' + kind + '"><h2>' + title + '</h2><table class="grid edit"><thead><tr><th class="c-no">№</th><th class="c-task">Задача</th><th class="c-text">Пояснение</th><th class="c-resp">Ответственные</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th class="c-pct">%</th><th class="c-act"></th></tr></thead><tbody>';
    let n = 0;
    rows.forEach((r, i) => {
      const k = kind + '|' + i + '|';
      const tools = '<td class="c-act"><button class="mini" data-row="up|' + kind + '|' + i + '" title="Выше">↑</button><button class="mini" data-row="down|' + kind + '|' + i + '" title="Ниже">↓</button><button class="mini danger" data-row="del|' + kind + '|' + i + '" title="Удалить">✕</button></td>';
      if (r.kind === 'head') {
        h += '<tr class="sub"><td></td><td colspan="6"><input class="head-input" value="' + esc(r.task) + '" data-k="' + k + 'task" placeholder="Подзаголовок"></td>' + tools + '</tr>';
        return;
      }
      n++;
      if (!pass(r.flag, r.due)) return;
      h += '<tr><td class="c-no">' + n + '</td><td>' + View.ta('data-k="' + k + 'task"', r.task) + '</td><td>' + View.ta('data-k="' + k + 'text"', r.text) + '</td>' +
        '<td>' + View.ta('data-k="' + k + 'resp"', r.resp) + '</td><td><input data-k="' + k + 'due" value="' + esc(Model.fmtISO(r.due)) + '" placeholder="дд.мм.гггг"></td>' +
        '<td>' + View.statusSelect('', r.flag, 'data-k="' + k + 'flag"') + '</td><td><input type="number" min="0" max="100" data-k="' + k + 'pct" value="' + esc(r.pct === undefined ? '' : r.pct) + '"></td>' + tools + '</tr>';
    });
    if (!rows.length) h += '<tr><td colspan="8" class="muted">Пока пусто</td></tr>';
    return h + '</tbody></table><div class="row" style="margin-top:8px"><button data-row="add|' + kind + '">+ Строка</button><button data-row="addhead|' + kind + '">+ Подзаголовок</button></div></div>';
  }

  function upcSec() {
    const v = Model.personView(S.reg, viewData(), S.me, today());
    let h = '<div class="panel" id="upcSec"><h2>' + esc(T().upc) + '</h2>';
    if (!v.kpiOwn.length && !v.kpiOther.length) h += '<div class="muted">Показателей, по которым вы отчитываетесь, нет.</div>';
    for (const k of v.kpiOwn) {
      h += '<div class="kpi">' + View.kpiHead(k) + '<div class="muted small">Вы отчитываетесь по показателю целиком.</div>' +
        View.ta('data-k="kpi|' + esc(k.id) + '"', (S.draft.kpi || {})[k.id] || '', 'Комментарий к показателю: факт, прогноз, риски') +
        k.events.filter((e) => pass(e.st.flag, e.due)).map((e) => evRow(e)).join('') + '</div>';
    }
    if (v.kpiOther.length) {
      h += '<h3 class="sec">Мероприятия по показателям других лидеров <span class="muted">заполняете вы</span></h3>';
      for (const k of v.kpiOther) h += '<div class="kpi">' + View.kpiHead(k) + k.events.filter((e) => pass(e.st.flag, e.due)).map((e) => evRow(e)).join('') + '</div>';
    }
    if (v.kpiTeam.length) {
      h += '<details class="team"><summary>Где я в составе команды (справочно): ' + v.kpiTeam.length + '</summary><table class="grid"><thead><tr><th>Показатель</th><th>Цель</th><th>Факт</th><th>Лидер</th></tr></thead><tbody>' +
        v.kpiTeam.map((k) => '<tr><td>' + esc(Model.shortKpi(k.name)) + '</td><td>' + esc(k.goal) + '</td><td>' + esc(String(k.fact).slice(0, 60)) + '</td><td>' + esc(k.leader) + '</td></tr>').join('') + '</tbody></table></details>';
    }
    return h + '</div>';
  }
  function evRow(e) {
    if (!e.mine) {
      const sp = Model.personById(S.reg, e.speaker);
      return '<div class="edit-item ro"><div class="ei-text">' + esc(e.text) + '<div class="muted small">Заполняет: ' + esc(sp ? sp.fio : 'помощник') + ' · срок: ' + View.due(e.due, e.st.flag, today()) + '</div></div>' +
        '<div class="fill">' + View.badge(e.st.flag) + ' <span class="small">' + esc(e.st.text) + '</span></div></div>';
    }
    const r = Model.avrReq(S.reg);
    const q = r ? '<div class="avrq"><div class="small"><b>Итог за ' + esc(r.period) + '</b> <span class="muted">для отчёта анализа высшего руководства — что сделано за квартал, с цифрами</span></div>' +
      View.ta('data-k="avrq|' + esc(e.id) + '"', (S.draft.avrq || {})[Model.avrqKey(r.period, e.id)] || '', 'Итог за ' + r.period) + '</div>' : '';
    return '<div class="edit-item"><div class="ei-text">' + esc(e.text) + '<div class="muted small">' + (e.executors ? 'Исп.: ' + esc(e.executors) + ' · ' : '') + 'срок: ' + View.due(e.due, getSt('events', e.id).flag, today()) + '</div></div>' +
      '<div>' + stRow('events', e.id, getSt('events', e.id)) + q + '</div></div>';
  }

  function attSec() {
    const list = S.draft.attachments || [];
    return '<div class="panel"><h2>' + (T().att ? (Object.values(T()).filter((x) => x && /^\d+\./.test(x)).length + 1) + '. ' : '') + esc(T().att) + '</h2><p class="muted small">Excel (таблица покажется под докладом), картинки (покажутся в докладе), PDF, Word, PowerPoint — любой файл до 20 МБ. ' +
      'Каждую неделю загружайте обновлённый файл с тем же именем — он заменит старый.</p>' +
      (list.length ? '<table class="grid"><tbody>' + list.map((a, i) => '<tr><td>' + View.fileIcon(a.file) + ' ' + esc(a.name) + '</td><td class="muted small">загружено ' + esc(Model.fmtISO(a.added)) + '</td><td class="c-act"><button class="mini danger" data-att="del|' + i + '">Удалить</button></td></tr>').join('') + '</tbody></table>' : '<div class="muted small">Вложений нет</div>') +
      '<div class="row" style="margin-top:8px"><label class="button">+ Загрузить файл<input type="file" id="attFile" hidden></label></div></div>';
  }

  function updateBanner() { const el = $('.avr-banner'); if (el) el.outerHTML = avrBanner(); }
  function updateSaveState() {
    const el = $('#saveState');
    if (!el) return;
    const own = S.data[S.me] && S.data[S.me].data;
    el.textContent = S.dirty ? 'Есть несохранённые изменения' : own && own.savedAt ? (S.embedded && !S.dir ? 'Сохранено в файл ' : 'Сохранено ') + Model.fmtDateTime(own.savedAt) : '';
    el.className = 'small ' + (S.dirty ? 'warn-text' : 'muted');
    const req = $('label.req');
    if (req) req.classList.toggle('empty', !S.draft.reportDate);
  }

  // ---------- изменения ----------
  function setByKey(key, value) {
    const [kind, id, field] = key.split('|');
    if (kind === 'kpi') { S.draft.kpi = S.draft.kpi || {}; S.draft.kpi[id] = value; }
    else if (kind === 'coNotes') { S.draft.coNotes = S.draft.coNotes || {}; S.draft.coNotes[id] = value; }
    else if (kind === 'avrq') { const r = Model.avrReq(S.reg); S.draft.avrq = S.draft.avrq || {}; S.draft.avrq[Model.avrqKey(r.period, id)] = value; updateBanner(); }
    else if (kind === 'memo' || kind === 'events') {
      S.draft[kind] = S.draft[kind] || {};
      S.draft[kind][id] = { ...getSt(kind, id), [field]: value };
    } else {
      const row = S.draft[kind][+id];
      row[field] = field === 'due' ? Model.parseDue(value) : field === 'pct' ? (value === '' ? '' : Number(value)) : value;
    }
    S.dirty = true;
    updateSaveState();
  }

  async function save() {
    if (!S.draft.reportDate) {
      View.toast('Укажите дату «Отчёт актуален на» — без неё помощник не поймёт, что отчёт обновлён.', 'bad');
      $('#reportDate').focus();
      return;
    }
    if (S.saving) return;
    S.saving = true;
    const p = Model.personById(S.reg, S.me);
    const saveId = Model.uid('s');
    let out = { ...S.draft, personId: S.me, fio: p.fio, savedAt: Date.now(), saveId, saveIds: [...(S.draft.saveIds || []), saveId].slice(-100) };
    out.ros = out.ros.filter((r) => r.kind === 'head' ? (r.task || '').trim() : (r.task || r.text || '').trim());
    out.proj = out.proj.filter((r) => r.kind === 'head' ? (r.task || '').trim() : (r.task || r.text || '').trim());
    if (!S.dir) { await saveToFile(p, out); S.saving = false; return; }
    try {
      // Если с момента открытия отчёт сохранил кто-то ещё — переносим только свои правки поверх его версии.
      let theirs = null;
      try { theirs = (await Store.readJSON(S.dir, [Store.DATA, Store.PEOPLE, p.slug + '.json'])).data; } catch (e) { if (!Store.isNotFound(e)) throw e; }
      const merged = theirs && !Model.sameVersion(S.base && S.base.savedAt ? S.base : null, theirs);
      if (merged) out = Model.mergeReport(S.base, out, theirs);
      await Store.dailyBackup(S.dir, [Store.DATA, Store.PEOPLE, p.slug + '.json'], p.slug, 10);
      await Store.writeJSON(S.dir, [Store.DATA, Store.PEOPLE, p.slug + '.json'], out);
      S.data[S.me] = { data: out };
      S.base = JSON.parse(JSON.stringify(out));
      S.draft = JSON.parse(JSON.stringify({ memo: {}, events: {}, kpi: {}, coNotes: {}, ros: [], proj: [], attachments: [], ...out }));
      S.prevDate = out.reportDate;
      S.dirty = false;
      View.toast(merged ? 'Сохранено. Пока отчёт был открыт, его сохранил кто-то ещё — правки объединены.' : 'Сохранено. Помощник увидит отчёт сразу.', 'ok');
      render();
    } catch (e) {
      View.toast('Не сохранилось: ' + e.message, 'bad');
    }
    S.saving = false;
  }

  // Сохранение файлом (нет доступа к папке): браузер кладёт «Отчёт — Фамилия.json» в «Загрузки».
  async function saveToFile(p, out) {
    // base — с какой версии начали: помощник перенесёт только эти правки, не затирая чужие
    const pkg = { ...out, kind: 'otchet-report', base: S.base && S.base.savedAt ? S.base : null, attFiles: {} };
    for (const [name, bytes] of Object.entries(S.pendingAtt)) {
      if (!(out.attachments || []).some((a) => a.file === name)) continue;
      pkg.attFiles[name] = View.b64(bytes);
    }
    const r = await View.saveFile(new TextEncoder().encode(JSON.stringify(pkg)), 'Отчёт — ' + p.slug + '.json', 'application/json', '.json', 'Отчёт');
    if (!r.ok) {
      View.toast('Файл не сохранён. Если выбирали сетевую папку — сохраните в «Загрузки» и потом перетащите во «Входящие».', 'bad');
      return;
    }
    const name = r.name;
    // Копия на этом компьютере — чтобы при следующем открытии видеть свой последний отчёт, даже если помощник его ещё не забрал.
    try { localStorage.setItem(LS(S.me), JSON.stringify(out)); } catch (e) { /* без копии тоже работает */ }
    S.data[S.me] = { data: out };
    S.base = JSON.parse(JSON.stringify(out));
    S.draft = JSON.parse(JSON.stringify(out));
    S.prevDate = out.reportDate;
    S.dirty = false;
    S.sent = name;
    render();
    window.scrollTo(0, 0);
  }

  const attTitle = (name) => name.replace(/\.[a-z0-9]{1,5}$/i, '');
  async function addAttachment(file) {
    const p = Model.personById(S.reg, S.me);
    if (file.size > MAX_ATT) { View.toast('Файл больше 20 МБ — уменьшите его или разбейте на части', 'bad'); return; }
    if (!S.dir) {
      // без папки: файл уйдёт помощнику вместе с отчётом
      S.pendingAtt[file.name] = new Uint8Array(await file.arrayBuffer());
      S.draft.attachments = (S.draft.attachments || []).filter((a) => a.file !== file.name);
      S.draft.attachments.push({ name: attTitle(file.name), file: file.name, added: today() });
      S.dirty = true; render();
      View.toast('Файл добавлен. Нажмите «Сохранить» — он уйдёт вместе с отчётом.', 'ok');
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (typeof ExcelJS !== 'undefined' && View.fileKind(file.name) === 'xlsx') await View.xlsxToHtml(bytes); // проверяем, что таблица читается
      await Store.writeBytes(S.dir, [Store.DATA, Store.ATT, p.slug, file.name], bytes);
      S.draft.attachments = (S.draft.attachments || []).filter((a) => a.file !== file.name);
      S.draft.attachments.push({ name: attTitle(file.name), file: file.name, added: today() });
      S.dirty = true;
      render();
      View.toast('Файл загружен. Нажмите «Сохранить».', 'ok');
    } catch (e) { View.toast('Не получилось загрузить: ' + e.message, 'bad'); }
  }

  // ---------- события ----------
  document.addEventListener('input', (e) => {
    if (e.target.dataset.k) setByKey(e.target.dataset.k, e.target.value);
    if (S.draft && planInput(e.target)) { S.dirty = true; updateSaveState(); }
    if (e.target.id === 'reportDate') { S.draft.reportDate = e.target.value; S.dirty = true; updateSaveState(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('st-select')) e.target.className = 'st-select s-' + (e.target.value || 'none');
    if (e.target.id === 'attFile' && e.target.files[0]) addAttachment(e.target.files[0]);
  });
  async function printMine() {
    await View.printHtml(View.personReport(S.reg, viewData(), S.me, today(), { filter: S.filter }), (el) => View.hydrateAttachments(el, S.dir, S.reg, { [S.me]: S.pendingAtt }));
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-me],[data-row],[data-att],[data-flt],[data-pkadd],[data-pkok],[data-pbnew],[data-pbadd],[data-pbdel],[data-pvdel]');
    if (!b) return;
    if (S.draft && planClick(b)) { S.dirty = true; render(); return; }
    if (b.dataset.flt !== undefined) { S.filter = b.dataset.flt; render(); return; }
    if (b.dataset.me) { S.me = b.dataset.me; try { localStorage.setItem('otchet.me', S.me); } catch (x) { /* нет хранилища */ } startDraft(); render(); return; }
    if (b.dataset.row) {
      const [op, kind, i] = b.dataset.row.split('|');
      const rows = S.draft[kind]; const n = +i;
      if (op === 'add') rows.push({ kind: 'row', task: '', text: '', resp: '', due: '', flag: '', pct: '' });
      if (op === 'addhead') rows.push({ kind: 'head', task: '' });
      if (op === 'del' && confirm('Удалить строку?')) rows.splice(n, 1);
      if (op === 'up' && n > 0) [rows[n - 1], rows[n]] = [rows[n], rows[n - 1]];
      if (op === 'down' && n < rows.length - 1) [rows[n + 1], rows[n]] = [rows[n], rows[n + 1]];
      S.dirty = true; render(); return;
    }
    if (b.dataset.att) {
      const i = +b.dataset.att.split('|')[1];
      if (confirm('Удалить вложение «' + S.draft.attachments[i].name + '»?')) { S.draft.attachments.splice(i, 1); S.dirty = true; render(); }
      return;
    }
    const a = b.dataset.act;
    if (a === 'pick') conn.pick();
    else if (a === 'grant') conn.grant();
    else if (a === 'demo') { S.demo = true; S.me = 'p1'; S.dir = await Base.demoFolder(); await load(); }
    else if (a === 'save') save();
    else if (a === 'print') printMine();
    else if (a === 'toPlan') { if (S.preview) { S.preview = false; render(); } const el = document.getElementById('planSec'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
    else if (a === 'toUpc') { const el = document.getElementById('upcSec'); if (S.preview) { S.preview = false; render(); } if (document.getElementById('upcSec')) document.getElementById('upcSec').scrollIntoView({ behavior: 'smooth' }); else if (el) el.scrollIntoView(); }
    else if (a === 'linkFolder') { if (conn.saved) { await conn.grant(); if (!S.dir) conn.pick(); } else conn.pick(); }
    else if (a === 'sentOk') { S.sent = null; render(); }
    else if (a === 'preview') { S.preview = !S.preview; render(); window.scrollTo(0, 0); }
  });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  window.Otchet = { S, load, render, Base };
  if (window.SNAPSHOT && window.SNAPSHOT.me) {
    // Страница с вшитыми данными (для Windows): папку выбирать не нужно.
    S.embedded = true;
    S.reg = window.SNAPSHOT.reg; S.data = window.SNAPSHOT.data; S.me = window.SNAPSHOT.me;
    let local = null; try { local = JSON.parse(localStorage.getItem(LS(S.me)) || 'null'); } catch (e) { /* нет копии */ }
    const own = S.data[S.me] && S.data[S.me].data;
    if (local && local.savedAt && (!own || !own.savedAt || local.savedAt > own.savedAt)) S.data[S.me] = { data: local };
    startDraft();
    render();
    // На Astra страница может сама подхватить папку, если её уже выбирали кнопкой «Сохранять сразу в папку»
    conn.init().then((ok) => { if (!ok) render(); }).catch(() => {});
  } else {
    render();
    conn.init().then((ok) => { if (!ok) render(); });
  }
})();

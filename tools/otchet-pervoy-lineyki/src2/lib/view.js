/* global ExcelJS, Model, Store */
// Общие куски интерфейса: доклад руководителя, своды, вложения, печать.
(function (root) {
  'use strict';
  const M = () => root.Model;

  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  function badge(flag) { return '<span class="badge s-' + (flag || 'none') + '">' + esc(M().statusLabel(flag)) + '</span>'; }
  function due(d, flag, today) {
    if (!d) return '<span class="muted">—</span>';
    const late = M().isOverdue(d, flag, today);
    return '<span class="' + (late ? 'late' : '') + '">' + esc(M().fmtISO(d)) + (late ? ' · срок прошёл' : '') + '</span>';
  }
  function ago(ms) {
    if (!ms) return '';
    const days = Math.floor((Date.now() - ms) / 864e5);
    if (days <= 0) return 'сегодня';
    if (days === 1) return 'вчера';
    const m = days % 10, h = days % 100;
    return days + ' ' + (m === 1 && h !== 11 ? 'день' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'дня' : 'дней') + ' назад';
  }
  function statusSelect(name, flag, attrs) {
    return '<select class="st-select s-' + (flag || 'none') + '" name="' + esc(name) + '" ' + (attrs || '') + '>' +
      '<option value="">— выбрать —</option>' +
      M().STATUSES.map((s) => '<option value="' + s.key + '"' + (s.key === flag ? ' selected' : '') + '>' + s.label + '</option>').join('') + '</select>';
  }
  function tile(v, l, cls) { return '<div class="tile ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
  function countTiles(c, label) {
    return '<div class="tiles">' + tile(c.total, label || 'на контроле') + tile(c.done, 'выполнено', 's-done') + tile(c.work, 'в работе', 's-work') +
      tile(c.fail, 'не выполнено', 's-fail') + tile(c.na, 'неактуально', 's-na') + tile(c.none, 'без статуса', 's-none') + '</div>';
  }
  function freshBadge(v) {
    if (v.fresh === 'fresh') return '<span class="badge s-done">отчёт актуален на ' + esc(M().fmtISO(v.reportDate)) + '</span>';
    if (v.fresh === 'stale') return '<span class="badge s-fail">не обновлён с ' + esc(M().fmtISO(v.reportDate)) + '</span>';
    return '<span class="badge s-fail">отчёт не заполнялся</span>';
  }

  // ---------- одно поручение / мероприятие ----------
  function itemCard(it, today, extra) {
    const st = it.st || { flag: '', text: '' };
    const all = it.all && it.all.progress ? '<div class="muted small">Поручено ' + it.all.progress.total + ' руководителям · выполнили ' + it.all.progress.done + ' из ' + it.all.progress.total + '</div>' : '';
    return '<div class="item f-' + (st.flag || 'none') + '">' +
      '<div class="what">' + esc(it.text) + (extra || '') + all + '</div>' +
      '<div class="status">' + (st.text ? esc(st.text) : '<span class="muted">пояснения нет</span>') + notesHtml(it.notes) + '</div>' +
      '<div class="meta">' + badge(st.flag) + '<span>Срок: ' + due(it.due, st.flag, today) + '</span></div></div>';
  }

  function notesHtml(notes) {
    if (!notes || !notes.length) return '';
    return '<div class="co-notes">' + notes.map((x) => '<div><b>Соисп. ' + esc(x.fio) + ':</b> ' + esc(x.text) + '</div>').join('') + '</div>';
  }

  // ---------- фильтр по статусам (руководитель, совещание, директор) ----------
  const FILTERS = [['', 'Все'], ['late', 'Срок прошёл'], ['done', 'Выполнено'], ['work', 'В работе'], ['fail', 'Не выполнено'], ['na', 'Неактуально'], ['none', 'Без статуса']];
  function flagPass(filter, flag, d, today) {
    if (!filter) return true;
    if (filter === 'late') return M().isOverdue(d, flag, today);
    return (flag || 'none') === filter;
  }
  function filterChips(cur, attr, counts) {
    return '<div class="filters no-print">' + FILTERS.map(([k, t]) => '<button class="chip ' + ((cur || '') === k ? 'active' : '') + '" ' + attr + '="' + k + '">' + t +
      (counts && counts[k || 'all'] !== undefined ? ' · ' + counts[k || 'all'] : '') + '</button>').join('') + '</div>';
  }
  // Сколько пунктов под каждым фильтром: items — [{flag, due}]
  function filterCounts(items, today) {
    const c = { all: items.length };
    for (const [k] of FILTERS) if (k) c[k] = items.filter((x) => flagPass(k, x.flag, x.due, today)).length;
    return c;
  }

  // ---------- таблица РОС / проектов ----------
  function freeTable(rows, today, filter) {
    rows = rows.filter((r) => r.kind === 'head' || flagPass(filter, r.flag, r.due, today));
    if (!rows.some((r) => r.kind !== 'head')) return '<div class="muted small">' + (filter ? 'Под фильтр ничего не попало' : 'Не заполнено') + '</div>';
    let h = '<table class="grid"><thead><tr><th class="c-no">№</th><th class="c-task">Задача</th><th>Пояснение</th><th class="c-resp">Ответственные</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th class="c-pct">%</th></tr></thead><tbody>';
    let n = 0;
    for (const r of rows) {
      if (r.kind === 'head') { h += '<tr class="sub"><td colspan="7">' + esc(r.task) + '</td></tr>'; continue; }
      n++;
      const pct = r.pct === '' || r.pct === undefined || r.pct === null ? '' : Number(r.pct);
      h += '<tr><td class="c-no">' + n + '</td><td>' + esc(r.task) + '</td><td>' + esc(r.text) + '</td><td>' + esc(r.resp) + '</td><td>' + due(r.due, r.flag, today) +
        '</td><td>' + (r.flag ? badge(r.flag) : '') + '</td><td class="num">' +
        (pct === '' || isNaN(pct) ? '' : '<div class="pct"><div class="bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>' + pct + '%</div>') + '</td></tr>';
    }
    return h + '</tbody></table>';
  }

  // ---------- показатели и мероприятия УПЦ ----------
  function kpiHead(k) {
    const val = (l, v) => (v ? '<span><b>' + l + ':</b> ' + esc(v.length > 90 ? v.slice(0, 90) + '…' : v) + '</span>' : '');
    return '<div class="kpi-head"><div class="kpi-name">' + esc(M().shortKpi(k.name)) + (k.top3 ? ' <span class="badge s-work">ТОП-3</span>' : '') + (k.type ? ' <span class="muted small">' + esc(k.type) + '</span>' : '') + '</div>' +
      '<div class="kpi-vals">' + val('Цель', k.goal) + val('Напряжённая', k.stretch) + val('Факт', k.fact) + val('Прогноз', k.forecast) +
      (k.grade ? '<span><b>Оценка прогноза:</b> ' + esc(k.grade) + '</span>' : '') + (k.unit ? '<span class="muted">' + esc(k.unit) + '</span>' : '') +
      '<span class="muted">Лидер: ' + esc(k.leader) + '</span></div></div>';
  }
  function eventsTable(events, reg, today, showSpeaker, filter, ctx) {
    events = events.filter((e) => flagPass(filter, e.st.flag, e.due, today));
    if (ctx) events = meetFirst(reg, 'e', events, ctx.pid);
    if (!events.length) return '<div class="muted small">' + (filter ? 'Под фильтр ничего не попало' : 'Мероприятий нет') + '</div>';
    let h = '<table class="grid"><thead><tr><th>Мероприятие</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th>Пояснение</th>' + (showSpeaker ? '<th class="c-resp">Заполняет</th>' : '') + '</tr></thead><tbody>';
    for (const e of events) {
      const sp = M().personById(reg, e.speaker);
      h += '<tr><td>' + esc(e.text) + (e.executors ? '<div class="muted small">Исп.: ' + esc(e.executors) + '</div>' : '') + (ctx ? itemExtras(reg, ctx, 'e', e.id, e.speaker || ctx.pid) : '') + '</td><td>' + due(e.due, e.st.flag, today) + '</td><td>' + badge(e.st.flag) + '</td><td>' + esc(e.st.text) + '</td>' +
        (showSpeaker ? '<td>' + esc(sp ? sp.fio : 'помощник') + '</td>' : '') + '</tr>';
    }
    return h + '</tbody></table>';
  }

  // ---------- доклад руководителя (экран совещания, директор, предпросмотр) ----------
  // opts.filter — фильтр по статусу ('late', 'done', …): показываем только такие пункты.
  function personReport(reg, data, pid, today, opts) {
    opts = opts || {};
    const f = opts.filter || '';
    const v = M().personView(reg, data, pid, today);
    if (!v.person) return '<div class="panel">Нет такого руководителя</div>';
    const pass = (x) => flagPass(f, x.st.flag, x.due, today);
    const ctx = { data, pid, opts, att: attMap(reg, data, today, pid) };
    const X = (kind, ref, who) => itemExtras(reg, ctx, kind, ref, who || pid);
    let h = '<div class="report-head"><h1>' + esc(v.person.fio) + '</h1>' + freshBadge(v) + noteButtons(ctx, 'g', '', pid, 'к отчёту') + (f ? '<span class="badge s-none">фильтр: ' + esc(FILTERS.find((x) => x[0] === f)[1]) + '</span>' : '') + '</div>';
    h += countTiles(v.counts, 'поручений') + notesBlock(reg, data, pid, 'g', '', opts);
    const memo = meetFirst(reg, 'm', v.memo.filter(pass), pid), co = v.co.filter(pass);
    const T = M().sections(reg);
    h += '<h3 class="sec">' + esc(T.memo) + '</h3>' + (memo.length ? '<div class="items">' + memo.map((m) => itemCard(m, today, X('m', m.id))).join('') + '</div>' : '<div class="muted small">' + (f && v.memo.length ? 'Под фильтр ничего не попало' : 'Открытых поручений нет') + '</div>');
    if (co.length) h += '<h3 class="sec">Соисполнитель <span class="muted">статус ведёт ответственный</span></h3><div class="items">' + co.map((m) => itemCard(m, today, '<div class="muted small">Отв.: ' + esc(M().respName(reg, m)) + '</div>')).join('') + '</div>';
    if (T.ros) h += '<h3 class="sec">' + esc(T.ros) + noteButtons(ctx, 'g', 'ros', pid, 'к разделу') + '</h3>' + notesBlock(reg, data, pid, 'g', 'ros', opts) + freeTable(v.ros, today, f);
    if (T.proj) h += '<h3 class="sec">' + esc(T.proj) + noteButtons(ctx, 'g', 'proj', pid, 'к разделу') + '</h3>' + notesBlock(reg, data, pid, 'g', 'proj', opts) + freeTable(v.proj, today, f);
    h += '<h3 class="sec">' + esc(T.upc) + '</h3>';
    if (!v.kpiOwn.length && !v.kpiOther.length) h += '<div class="muted small">Показателей, по которым руководитель отчитывается, нет</div>';
    for (const k of v.kpiOwn) {
      h += '<div class="kpi">' + kpiHead(k) + (k.comment ? '<div class="kpi-comment"><b>Комментарий:</b> ' + esc(k.comment) + '</div>' : '') + X('k', k.id) + eventsTable(k.events, reg, today, k.events.some((e) => !e.mine), f, ctx) + '</div>';
    }
    if (v.kpiOther.length) {
      h += '<h3 class="sec">Мероприятия по показателям других лидеров</h3>';
      for (const k of v.kpiOther) h += '<div class="kpi">' + kpiHead(k) + eventsTable(k.events, reg, today, false, f, ctx) + '</div>';
    }
    if (v.kpiTeam.length) {
      h += '<details class="team"><summary>В составе команды (справочно): ' + v.kpiTeam.length + '</summary><table class="grid"><thead><tr><th>Показатель</th><th>Цель</th><th>Факт</th><th>Прогноз</th><th>Лидер</th></tr></thead><tbody>' +
        v.kpiTeam.map((k) => '<tr><td>' + esc(M().shortKpi(k.name)) + '</td><td>' + esc(k.goal) + '</td><td>' + esc(short(k.fact)) + '</td><td>' + esc(short(k.forecast)) + '</td><td>' + esc(k.leader) + '</td></tr>').join('') + '</tbody></table></details>';
    }
    if (v.attachments.length) {
      h += '<h3 class="sec">' + esc(T.att) + '</h3>' + v.attachments.map((a) => '<div class="att" data-pid="' + esc(pid) + '" data-file="' + esc(a.file) + '"><div class="att-title">' + fileIcon(a.file) + ' ' + esc(a.name) + '</div><div class="att-body muted small">Загрузка…</div></div>').join('');
    }
    return h;
  }
  function short(s) { s = String(s || ''); return s.length > 60 ? s.slice(0, 60) + '…' : s; }
  // ---------- комментарии директора ----------
  // opts.dir — страница директора: кнопки открывают письмо помощнику; opts.admin — экран совещания: «+ комментарий директора»
  function noteButtons(ctx, kind, ref, pid, label) {
    const o = ctx.opts || {};
    const a = (type, t) => '<button class="mini dn-btn" data-dn="' + type + '|' + kind + '|' + esc(ref) + '|' + esc(pid) + '">' + t + '</button>';
    if (o.dir) return '<span class="dn-tools no-print">' + a('c', '💬 Комментарий' + (label ? ' ' + label : '')) + (kind === 'm' || kind === 'e' ? a('meet', 'На совещание') : '') + (kind === 'm' ? a('rm', 'Снять с контроля') : '') + '</span>';
    if (o.admin) return '<span class="dn-tools no-print"><button class="mini dn-btn" data-dadd="' + kind + '|' + esc(ref) + '|' + esc(pid) + '">+ комментарий директора' + (label ? ' ' + label : '') + '</button></span>';
    return '';
  }
  function noteHtml(reg, data, n, opts) {
    const st = M().noteState(data, n); const ans = M().dirAnswer(data, n);
    if (n.type !== 'c') return '<div class="dnote dn-' + n.type + '"><b>' + esc(M().NOTE_TYPES[n.type]) + '</b>' + (n.text ? ': ' + esc(n.text) : '') + ' <span class="muted small">' + esc(M().fmtISO(n.date)) + '</span></div>';
    return '<div class="dnote dn-' + st + '"><b>Комментарий директора</b> <span class="muted small">' + esc(M().fmtISO(n.date)) + '</span>: ' + esc(n.text) +
      (ans ? '<div class="dn-ans"><b>Ответ:</b> ' + esc(ans) + '</div>' : (opts && opts.noWait ? '' : '<div class="dn-wait">ждёт ответа руководителя</div>')) + '</div>';
  }
  function notesBlock(reg, data, pid, kind, ref, opts) {
    const ns = M().dirNotes(reg, pid, kind, ref);
    return ns.length ? '<div class="dnotes">' + ns.map((n) => noteHtml(reg, data, n, opts)).join('') + '</div>' : '';
  }
  // всё, что добавляется к пункту отчёта: комментарии директора, пометка «требует внимания», кнопки
  function itemExtras(reg, ctx, kind, ref, pid) {
    const a = kind === 'm' ? ctx.att['m|' + ref + '|' + pid] : kind === 'e' ? ctx.att['e|' + ref] : null;
    return (a ? '<div class="attn">⚠ ' + esc(a.reasons.join('; ')) + '</div>' : '') + notesBlock(reg, ctx.data, pid, kind, ref, ctx.opts) + noteButtons(ctx, kind, ref, pid);
  }
  function attMap(reg, data, today, pid) { const m = {}; for (const x of M().attention(reg, data, today, pid)) m[x.key] = x; return m; }
  // пункты, которые директор хочет услышать, — первыми
  function meetFirst(reg, kind, list, pid) {
    const ids = new Set(M().dirNotes(reg, pid, kind).filter((n) => n.type === 'meet').map((n) => n.ref));
    return ids.size ? list.filter((x) => ids.has(x.id)).concat(list.filter((x) => !ids.has(x.id))) : list;
  }

  // ---------- сводка для директора: что изменилось, что требует внимания ----------
  const itemLine = (reg, x, extra) => '<li><b>' + esc((M().personById(reg, x.pid) || {}).fio || '') + '</b> — ' + (x.kind === 'm' ? 'поручение' : 'мероприятие') + ' «' + esc(short(x.text)) + '»' + (extra ? ' <span class="muted small">' + extra + '</span>' : '') + '</li>';
  function changesHtml(reg, data, today) {
    const c = M().changes(reg, data, today); if (!c) return '';
    const blk = (t, list, cls, f) => list.length ? '<details class="chg ' + cls + '"><summary>' + t + ': <b>' + list.length + '</b></summary><ul>' + list.map(f).join('') + '</ul></details>' : '';
    const memoLine = (m) => '<li>«' + esc(short(m.text)) + '» — ' + esc(M().respName(reg, m)) + '</li>';
    const body = blk('Выполнено', c.done, 'c-done', (x) => itemLine(reg, x)) + blk('Стало «не выполнено»', c.fail, 'c-fail', (x) => itemLine(reg, x)) +
      blk('Новые просрочки', c.late, 'c-fail', (x) => itemLine(reg, x, 'срок ' + esc(M().fmtISO(x.due)))) + blk('Новые поручения', c.added, 'c-work', memoLine) + blk('Снято с контроля', c.closed, 'c-na', memoLine);
    return '<div class="panel changes"><h3>Что изменилось с ' + esc(M().fmtISO(c.since)) + '</h3>' + (body || '<div class="muted small">Изменений пока нет</div>') + '</div>';
  }
  function attentionHtml(reg, data, today, pid) {
    const list = M().attention(reg, data, today, pid);
    if (!list.length) return pid ? '' : '<div class="panel attention"><h3>Требуют внимания</h3><div class="muted small">Нет пунктов, где пояснение давно не меняется или срок прошёл без движения.</div></div>';
    const by = new Map(); for (const x of list) { if (!by.has(x.pid)) by.set(x.pid, []); by.get(x.pid).push(x); }
    return '<div class="panel attention"><h3>Требуют внимания: ' + list.length + '</h3><div class="muted small">Пояснение давно не меняется, срок прошёл без движения, срок переносили несколько раз или пояснения нет.</div>' +
      Array.from(by).map(([p, xs]) => '<details' + (pid ? ' open' : '') + '><summary><b>' + esc((M().personById(reg, p) || {}).fio || p) + '</b>: ' + xs.length + '</summary><ul>' +
        xs.map((x) => '<li>' + (x.kind === 'm' ? 'Поручение' : 'Мероприятие') + ' «' + esc(short(x.text)) + '» — ' + badge(x.flag) + ' <span class="attn-r">' + esc(x.reasons.join('; ')) + '</span>' +
          (x.note ? '<div class="muted small">Пояснение: ' + esc(short(x.note)) + '</div>' : '') + '</li>').join('') + '</ul></details>').join('') + '</div>';
  }
  // Карточка руководителя: всё по одному человеку на одной странице
  function personCard(reg, data, pid, today) {
    const v = M().personView(reg, data, pid, today); if (!v.person) return '';
    const late = [...v.memo.filter((m) => M().isOverdue(m.due, m.st.flag, today)).map((m) => ({ kind: 'поручение', text: m.text, due: m.due, flag: m.st.flag })),
      ...[].concat(...v.kpiOwn.map((k) => k.events.filter((e) => e.mine)), ...v.kpiOther.map((k) => k.events)).filter((e) => M().isOverdue(e.due, e.st.flag, today)).map((e) => ({ kind: 'мероприятие', text: e.text, due: e.due, flag: e.st.flag }))];
    const disc = M().discipline(reg, pid, 13);
    const notes = M().dirNotes(reg, pid, '', undefined, true).filter((n) => !n.closed || n.closed.date >= addDays(today, -90));
    let h = '<div class="pcard"><div class="report-head"><h1>' + esc(v.person.fio) + '</h1>' + freshBadge(v) + '<span class="muted small">карточка на ' + esc(M().fmtISO(today)) + '</span></div>';
    h += '<h3 class="sec">Поручения</h3>' + countTiles(v.counts, 'поручений');
    if (v.evCounts.total) h += '<h3 class="sec">Мероприятия УПЦ</h3>' + countTiles(v.evCounts, 'мероприятий');
    h += '<h3 class="sec">Срок прошёл: ' + late.length + '</h3>' + (late.length ? '<ul>' + late.map((x) => '<li>' + x.kind + ' «' + esc(short(x.text)) + '» — срок ' + esc(M().fmtISO(x.due)) + ' ' + badge(x.flag) + '</li>').join('') + '</ul>' : '<div class="muted small">Нет</div>');
    const att = M().attention(reg, data, today, pid);
    h += '<h3 class="sec">Требуют внимания: ' + att.length + '</h3>' + (att.length ? '<ul>' + att.map((x) => '<li>' + (x.kind === 'm' ? 'поручение' : 'мероприятие') + ' «' + esc(short(x.text)) + '» — <span class="attn-r">' + esc(x.reasons.join('; ')) + '</span></li>').join('') + '</ul>' : '<div class="muted small">Нет</div>');
    h += '<h3 class="sec">Комментарии директора за 3 месяца: ' + notes.length + '</h3>' + (notes.length ? notes.map((n) => {
      const it = M().noteItem(reg, n);
      return '<div class="dn-card"><div class="muted small">' + esc(it.what) + ' «' + esc(short(it.text)) + '»' + (n.closed ? ' · закрыт ' + esc(M().fmtISO(n.closed.date)) : '') + '</div>' + noteHtml(reg, data, n, { noWait: !!n.closed }) + '</div>';
    }).join('') : '<div class="muted small">Нет</div>');
    h += '<h3 class="sec">Обновлял отчёт к совещанию</h3>' + (disc.length ? '<div class="disc">' + disc.map((d) => '<span class="dw ' + (d.fresh ? 'dw-ok' : 'dw-no') + '" title="неделя с ' + esc(M().fmtISO(d.week)) + '"></span>').join('') +
      ' <span class="small">' + disc.filter((d) => d.fresh).length + ' из ' + disc.length + ' нед.</span></div><div class="muted small">Квадрат — неделя: зелёный — отчёт обновлён к совещанию, красный — нет.</div>' : '<div class="muted small">Статистика копится с момента обновления — появится через несколько недель.</div>');
    return h + '</div>';
  }
  function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return M().todayISO(d); }


  // ---------- вложения: Excel — таблицей, картинки — картинкой, PDF и остальное — кнопкой «Открыть» ----------
  const EXT = (name) => (String(name).match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
  const MIME = {
    ...IMG, pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
  };
  const fileKind = (name) => { const e = EXT(name); return e === 'xlsx' ? 'xlsx' : IMG[e] ? 'img' : e === 'pdf' ? 'pdf' : e === 'docx' ? 'docx' : 'other'; };
  function fileIcon(name) {
    const e = EXT(name);
    const t = { xlsx: 'XLS', xls: 'XLS', pdf: 'PDF', docx: 'DOC', doc: 'DOC', pptx: 'PPT', ppt: 'PPT' }[e] || (IMG[e] ? 'IMG' : (e || 'файл').toUpperCase().slice(0, 4));
    return '<span class="ficon f-' + esc(t.toLowerCase()) + '">' + esc(t) + '</span>';
  }
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  const MAX_EMBED = 5 * 1024 * 1024;
  // HTML одного вложения. embed — для файлов-снимков (данные вписываются в страницу).
  // Word (.docx) → HTML: текст, заголовки, списки, таблицы, картинки. Сложное оформление упрощается.
  async function docxToHtml(bytes) {
    if (typeof mammoth === 'undefined') throw new Error('документ покажется, когда помощник обновит страницы');
    const r = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    return String(r.value || '').replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '');
  }
  // HTML одного вложения. embed — для файлов-снимков (данные вписываются в страницу).
  async function attHtml(bytes, file, embed) {
    const k = fileKind(file);
    const type = MIME[EXT(file)] || 'application/octet-stream';
    const size = (bytes.length / 1048576).toFixed(1).replace('.', ',') + ' МБ';
    const big = embed && bytes.length > MAX_EMBED;
    const openBtn = (what) => (big ? '<span class="muted small">' + esc(file) + ' (' + size + ') — файл большой, лежит в папке «Данные/вложения»</span>'
      : embed ? '<button class="att-open" data-b64="' + b64(bytes) + '" data-name="' + esc(file) + '">' + what + '</button> <span class="muted small">' + size + '</span>'
        : '<button class="att-open" data-blob="' + URL.createObjectURL(new Blob([bytes], { type })) + '" data-name="' + esc(file) + '">' + what + '</button> <span class="muted small">' + size + '</span>');
    if (k === 'xlsx') return '<div class="xl-wrap">' + await xlsxToHtml(bytes) + '</div>';
    if (k === 'img') {
      const src = embed ? (big ? '' : 'data:' + type + ';base64,' + b64(bytes)) : URL.createObjectURL(new Blob([bytes], { type }));
      return src ? '<img class="att-img" src="' + src + '" alt="' + esc(file) + '">' : '<div class="muted small">Картинка больше 5 МБ — лежит в папке «Данные/вложения»</div>';
    }
    if (k === 'pdf') {
      // PDF показываем прямо в докладе встроенным просмотрщиком браузера
      const frame = big ? '' : embed ? '<div class="att-pdf-b64" data-b64="' + b64(bytes) + '"></div>'
        : '<iframe class="att-pdf" src="' + URL.createObjectURL(new Blob([bytes], { type })) + '#view=FitH"></iframe>';
      return frame + '<div class="att-tools">' + openBtn('Открыть PDF в отдельной вкладке') + '</div>';
    }
    if (k === 'docx') {
      let doc;
      try { doc = await docxToHtml(bytes); } catch (e) { doc = '<div class="muted small">' + esc(e.message) + '</div>'; }
      return '<div class="att-doc">' + (doc || '<div class="muted small">Документ пустой</div>') + '</div><div class="att-tools">' + openBtn('Открыть в Word') +
        ' <span class="muted small">Показан текст документа; точное оформление — в Word</span></div>';
    }
    return openBtn('Открыть файл') + '<div class="muted small">' + (/^pptx?$/.test(EXT(file)) ? 'Презентацию браузер показать не может — откроется в PowerPoint. Чтобы слайды были видны в докладе, сохраните презентацию в PDF и загрузите PDF.'
      : EXT(file) === 'doc' ? 'Старый формат Word (.doc) браузер показать не может. Чтобы текст был виден в докладе, сохраните документ как .docx или PDF.'
        : 'Этот файл браузер показать не может — откроется в программе на компьютере.') + '</div>';
  }
  // PDF из страницы-снимка: превращаем вписанные данные во встроенный просмотрщик
  function activatePdf(container) {
    for (const d of $$('.att-pdf-b64', container)) {
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(d.dataset.b64), (c) => c.charCodeAt(0))], { type: 'application/pdf' }));
      const f = document.createElement('iframe'); f.className = 'att-pdf'; f.src = url + '#view=FitH';
      d.replaceWith(f);
    }
  }
  // «Открыть»: PDF и картинки — во вкладке браузера, остальное — сохранить и открыть программой.
  if (typeof document !== 'undefined') {
    document.addEventListener('click', async (e) => {
      const b = e.target.closest('.att-open');
      if (!b) return;
      const name = b.dataset.name;
      const type = MIME[EXT(name)] || 'application/octet-stream';
      let blob;
      if (b.dataset.b64) blob = new Blob([Uint8Array.from(atob(b.dataset.b64), (c) => c.charCodeAt(0))], { type });
      else blob = await (await fetch(b.dataset.blob)).blob();
      if (fileKind(name) === 'pdf' || fileKind(name) === 'img') { window.open(URL.createObjectURL(new Blob([blob], { type })), '_blank'); return; }
      await saveFile(new Uint8Array(await blob.arrayBuffer()), name, type, '.' + EXT(name), 'Файл');
    });
  }
  // pending — файлы, добавленные, но ещё не отправленные помощнику: { pid: { имя: байты } }
  async function hydrateAttachments(container, dir, reg, pending) {
    for (const el of $$('.att', container)) {
      const body = $('.att-body', el);
      const own = pending && pending[el.dataset.pid] && pending[el.dataset.pid][el.dataset.file];
      try {
        if (own) body.innerHTML = await attHtml(own, el.dataset.file, false);
        else if (root.SNAPSHOT && (!dir || !dir.getDirectoryHandle)) {
          // Страница со встроенными данными (без папки): вложения уже готовы внутри файла
          const h = root.SNAPSHOT.att && root.SNAPSHOT.att[el.dataset.pid] && root.SNAPSHOT.att[el.dataset.pid][el.dataset.file];
          body.innerHTML = h || 'Вложение появится, когда помощник откроет свою страницу';
          activatePdf(body);
        } else {
          const p = M().personById(reg, el.dataset.pid);
          const { bytes } = await Store.readBytes(dir, [Store.DATA, Store.ATT, p.slug, el.dataset.file]);
          body.innerHTML = await attHtml(bytes, el.dataset.file, false);
        }
        body.classList.remove('muted', 'small');
      } catch (e) { body.textContent = 'Не удалось открыть вложение: ' + e.message; }
    }
  }
  function fmtNum(v, numFmt) {
    if (typeof v !== 'number') return v;
    const pct = /%/.test(numFmt || '');
    const x = pct ? v * 100 : v;
    const digits = Math.abs(x) >= 1000 ? 0 : 2;
    return x.toLocaleString('ru-RU', { maximumFractionDigits: digits }) + (pct ? '%' : '');
  }
  async function xlsxToHtml(bytes) {
    if (typeof ExcelJS === 'undefined') throw new Error('таблица появится, когда помощник обновит страницы');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    let out = '';
    for (const ws of wb.worksheets) {
      if (ws.state === 'hidden') continue;
      const maxR = ws.rowCount; let maxC = 0;
      const used = new Set();
      ws.eachRow((row) => { if (row.hidden) return; row.eachCell((c, i) => { if (M().cellText(c.value) !== '' && !ws.getColumn(i).hidden) { maxC = Math.max(maxC, i); used.add(i); } }); });
      if (!maxC) continue;
      const skip = new Set(); const span = {};
      for (const ref of Object.keys(ws._merges || {})) {
        const m = ws._merges[ref].model || ws._merges[ref];
        span[m.top + ':' + m.left] = { rs: m.bottom - m.top + 1, cs: m.right - m.left + 1 };
        for (let r = m.top; r <= m.bottom; r++) for (let c = m.left; c <= m.right; c++) if (r !== m.top || c !== m.left) skip.add(r + ':' + c);
      }
      // Показываем только колонки, где есть данные (пустые и скрытые убираем)
      const cols = []; for (let c = 1; c <= maxC; c++) if (used.has(c)) cols.push(c);
      const rowEmpty = (r) => { if (ws.getRow(r).hidden) return true; for (const c of cols) if (M().cellText(ws.getCell(r, c).value) !== '') return false; return true; };
      // Лист делим на таблицы по заголовкам: строка с одной заполненной ячейкой после пустой строки
      // («Таблица №2 — Контрактование»). Пустые строки внутри таблицы просто пропускаем.
      const filled = (r) => { let n = 0; for (const c of cols) if (M().cellText(ws.getCell(r, c).value) !== '') n++; return n; };
      const blocks = []; let cur = null; let prevEmpty = true;
      for (let r = 1; r <= maxR; r++) {
        if (rowEmpty(r)) { prevEmpty = true; continue; }
        const caption = filled(r) === 1 && prevEmpty;
        if (!cur || caption) { cur = { title: '', rows: [] }; blocks.push(cur); }
        if (caption) { for (const c of cols) { const t = M().cellText(ws.getCell(r, c).value); if (t) cur.title = t; } }
        else cur.rows.push(r);
        prevEmpty = false;
      }
      // ширина колонки из Excel — как минимальная (в символах), чтобы узкие колонки не сжимались «по букве»
      const minW = (c) => Math.max(4, Math.min(30, Math.round((ws.getColumn(c).width || 10) * 0.9)));
      out += (wb.worksheets.length > 1 ? '<div class="att-sheet">' + esc(ws.name) + '</div>' : '');
      for (const blk of blocks) {
        const rows = blk.rows;
        if (!rows.length) { if (blk.title) out += '<div class="att-cap">' + esc(blk.title) + '</div>'; continue; }
        let h = (blk.title ? '<div class="att-cap">' + esc(blk.title) + '</div>' : '') + '<table class="grid xl"><tbody>';
        let first = true;
        for (const r of rows) {
          h += '<tr>';
          for (const c of cols) {
            if (skip.has(r + ':' + c)) continue;
            const cell = ws.getCell(r, c);
            const sp = span[r + ':' + c];
            let v = M().cellText(cell.value);
            const raw = cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
            if (typeof raw === 'number') v = fmtNum(raw, cell.numFmt);
            if (raw instanceof Date) v = M().fmtISO(M().cellText(raw));
            const st = [];
            if (cell.font && cell.font.bold) st.push('font-weight:700');
            const fill = cell.fill && cell.fill.fgColor && cell.fill.fgColor.argb;
            if (fill && cell.fill.pattern === 'solid' && !/^FFFFFFFF$/i.test(fill)) st.push('background:#' + fill.slice(2));
            // объединение по вертикали считаем только по показанным строкам (пустые пропущены)
            const rs = sp ? rows.filter((x) => x >= r && x < r + sp.rs).length : 1;
            const cs = sp ? cols.filter((x) => x >= c && x < c + sp.cs).length : 1;
            if (first && cs === 1) st.push('min-width:' + minW(c) + 'ch');
            h += '<td' + (rs > 1 ? ' rowspan="' + rs + '"' : '') + (cs > 1 ? ' colspan="' + cs + '"' : '') +
              (typeof raw === 'number' ? ' class="num"' : '') + (st.length ? ' style="' + st.join(';') + '"' : '') + '>' + esc(v) + '</td>';
          }
          h += '</tr>';
          first = false;
        }
        out += h + '</tbody></table>';
      }
    }
    return out || '<div class="muted small">В файле нет данных</div>';
  }

  // ---------- свод поручений ----------
  function memoTable(reg, data, today, opts) {
    opts = opts || {};
    const list = reg.memo.filter((m) => (opts.closed ? m.closed : !m.closed))
      .map((m) => ({ ...m, st: M().memoStatus(reg, data, m) }))
      .filter((m) => !opts.flag || (opts.flag === 'late' ? M().isOverdue(m.due, m.st.flag, today) : (m.st.flag || 'none') === opts.flag))
      .filter((m) => !opts.person || M().isResp(m, opts.person));
    let h = '<table class="grid memo"><thead><tr><th class="c-due">Дата</th><th>Поручение</th><th class="c-resp">Ответственный</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th>Пояснение</th>' +
      (opts.actions ? '<th class="c-act no-print"></th>' : '') + '</tr></thead><tbody>';
    for (const m of list) {
      const co = (m.co || []).map((id) => (M().personById(reg, id) || {}).fio).filter(Boolean);
      h += '<tr><td>' + esc(M().fmtISO(m.date)) + '</td><td>' + esc(m.text) + (co.length ? '<div class="muted small">Соисп.: ' + esc(co.join(', ')) + '</div>' : '') +
        (m.closed ? '<div class="muted small">Снято ' + esc(M().fmtISO(m.closed.date)) + '</div>' : '') + '</td><td>' + esc(M().respName(reg, m)) + '</td><td>' + due(m.due, m.st.flag, today) +
        '</td><td>' + badge(m.st.flag) + (m.st.progress ? '<div class="small">' + m.st.progress.done + ' из ' + m.st.progress.total + '</div>' : '') + '</td><td>' + esc(m.st.text) + notesHtml(M().coNotes(reg, data, m)) + '</td>' + (opts.actions ? '<td class="no-print">' + opts.actions(m) + '</td>' : '') + '</tr>';
    }
    if (!list.length) h += '<tr><td colspan="7" class="muted">Ничего нет</td></tr>';
    return h + '</tbody></table>';
  }

  // ---------- сводка по УПЦ ----------
  function upcOverview(reg, data, today, opts) {
    opts = opts || {};
    let h = '';
    for (const k of reg.kpis) {
      if (opts.person && k.reporter !== opts.person && !reg.events.some((e) => e.kpi === k.id && e.speaker === opts.person)) continue;
      const rep = M().personById(reg, k.reporter);
      const evs = reg.events.filter((e) => e.kpi === k.id).map((e) => ({ ...e, st: M().eventStatus(reg, data, e) }));
      const comment = rep && data[rep.id] && data[rep.id].data && data[rep.id].data.kpi ? data[rep.id].data.kpi[k.id] : '';
      h += '<div class="kpi">' + kpiHead(k) + (opts.editor ? '' : '<div class="muted small">Отчитывается: <b>' + esc(rep ? rep.fio : 'не назначен') + '</b></div>') +
        (comment ? '<div class="kpi-comment"><b>Комментарий:</b> ' + esc(comment) + '</div>' : '') +
        (opts.editor ? opts.editor(k, evs) : eventsTable(evs, reg, today, true)) + '</div>';
    }
    return h || '<div class="muted">Показателей нет</div>';
  }

  // ---------- графики: поручения по руководителям, прогноз по показателям УПЦ ----------
  // Простые полосы на HTML (без скриптов) — открываются и в версии для телефона.
  const SEG = [['done', 'выполнено'], ['work', 'в работе'], ['fail', 'не выполнено'], ['none', 'без статуса'], ['na', 'неактуально']];
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
  function chartMemo(reg, data, today) {
    const rows = M().reportPeople(reg).map((p) => ({ p, c: M().personView(reg, data, p.id, today).counts }));
    const max = Math.max(1, ...rows.map((r) => r.c.total));
    const legend = '<div class="ch-legend">' + SEG.map(([k, t]) => '<span><i class="sw sw-' + k + '"></i>' + t + '</span>').join('') + '<span class="late">● срок прошёл</span></div>';
    return '<div class="chart ch-memo"><div class="ch-title">Поручения на контроле по руководителям</div>' + legend +
      rows.map(({ p, c }) => {
        const segs = SEG.filter(([k]) => c[k]).map(([k, t]) => '<span class="seg sw-' + k + '" style="flex:' + c[k] + '" title="' + esc(p.fio) + ': ' + t + ' — ' + c[k] + '"></span>').join('');
        return '<div class="ch-row"><div class="ch-name">' + esc(p.fio) + '</div><div class="ch-track"><div class="ch-bar" style="width:' + (100 * c.total / max).toFixed(1) + '%">' + segs + '</div></div>' +
          '<div class="ch-val">' + (c.total ? c.done + ' из ' + c.total + ' выполнено' : 'нет поручений') + (c.overdue ? ' · <span class="late">срок прошёл: ' + c.overdue + '</span>' : '') + '</div></div>';
      }).join('') + '</div>';
  }
  const num = (s) => { const t = String(s === null || s === undefined ? '' : s).replace(/\s/g, '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(t) ? +t : null; };
  const fmtN = (x) => (Math.abs(x) >= 100 ? Math.round(x) : Math.abs(x) >= 1 || x === 0 ? Math.round(x * 100) / 100 : +x.toPrecision(2)).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
  function chartKpi(reg, data) {
    const G = { A: 'good', B: 'warn', C: 'bad' };
    const ks = reg.kpis.map((k) => {
      const g = String(k.grade || '').trim().toUpperCase().charAt(0);
      const goal = num(k.goal), fact = num(k.fact), fc = num(k.forecast);
      const evs = reg.events.filter((e) => e.kpi === k.id).map((e) => M().eventStatus(reg, data, e).flag);
      return { k, g, goal, fact, fc, evDone: evs.filter((f) => f === 'done').length, evTotal: evs.length, numeric: goal !== null && goal > 0 && fc !== null && fact !== null };
    });
    const order = { C: 0, B: 1, A: 2 };
    ks.sort((a, b) => (order[a.g] ?? 3) - (order[b.g] ?? 3));
    const cnt = (g) => ks.filter((x) => x.g === g).length;
    const tiles = '<div class="ch-grades">' + [['A', 'достигнем'], ['B', 'есть риск'], ['C', 'не достигнем']].map(([g, t]) =>
      '<div class="ch-grade g-' + G[g] + '"><b>' + cnt(g) + '</b><span>оценка ' + g + ' · ' + t + '</span></div>').join('') + '</div>';
    const row = (x) => {
      const chip = '<span class="gchip g-' + (G[x.g] || 'none') + '">' + esc(x.g || '—') + '</span>';
      let bar = '', txt = '';
      if (x.numeric) {
        const pf = Math.min(150, 100 * x.fc / x.goal), pa = Math.min(150, 100 * x.fact / x.goal);
        bar = '<div class="ch-track ch-kpi"><div class="ch-goal" style="left:' + (100 / 1.5).toFixed(1) + '%" title="цель"></div>' +
          '<div class="ch-fc g-' + (G[x.g] || 'none') + '" style="width:' + (pf / 1.5).toFixed(1) + '%" title="прогноз ' + Math.round(100 * x.fc / x.goal) + '% цели"></div>' +
          '<div class="ch-fact" style="left:' + (pa / 1.5).toFixed(1) + '%" title="факт ' + Math.round(100 * x.fact / x.goal) + '% цели"></div></div>';
        txt = 'цель ' + fmtN(x.goal) + ' · факт ' + fmtN(x.fact) + ' · прогноз ' + fmtN(x.fc) + (x.k.unit ? ' ' + esc(x.k.unit) : '');
      } else if (x.evTotal) {
        bar = '<div class="ch-track"><div class="ch-bar" style="width:100%">' + (x.evDone ? '<span class="seg sw-done" style="flex:' + x.evDone + '" title="выполнено ' + x.evDone + '"></span>' : '') +
          (x.evTotal - x.evDone ? '<span class="seg sw-rest" style="flex:' + (x.evTotal - x.evDone) + '" title="не выполнено ' + (x.evTotal - x.evDone) + '"></span>' : '') + '</div></div>';
        txt = 'мероприятий выполнено ' + x.evDone + ' из ' + x.evTotal;
      } else txt = 'нет числовой цели и мероприятий';
      return '<div class="ch-row ch-krow">' + chip + '<div class="ch-name" title="' + esc(x.k.name) + '">' + esc(M().shortKpi(x.k.name)) + '</div>' + (bar || '<div class="ch-track"></div>') + '<div class="ch-val">' + txt + '</div></div>';
    };
    return '<div class="chart ch-kpis"><div class="ch-title">Показатели УПЦ: прогноз достижения целей</div>' + tiles +
      '<div class="ch-legend"><span><i class="sw sw-goalmark"></i>цель (100%)</span><span><i class="sw sw-factmark"></i>факт</span><span><i class="sw g-good"></i>прогноз, цвет — оценка</span>' +
      '<span class="muted">шкала до 150% цели; там, где лучше меньше (НЗС, инвентаризация), смотрите на оценку</span></div>' + ks.map(row).join('') + '</div>';
  }

  // ---------- кто обновил ----------
  function whoCards(reg, data, today) {
    return '<div class="who">' + reg.people.filter((p) => !p.extra).map((p) => {
      const v = M().personView(reg, data, p.id, today);
      const c = v.counts;
      return '<div class="card fr-' + v.fresh + '" data-person="' + esc(p.id) + '"><div class="name">' + esc(p.fio) + (p.onMeeting === false ? ' <span class="muted small">(не на совещании)</span>' : '') + (p.fileMode ? ' <span class="muted small">· через файл</span>' : '') + '</div>' +
        '<div class="when">' + freshBadge(v) + '</div><div class="nums">' +
        '<span class="badge s-done">выполнено ' + c.done + '</span><span class="badge s-work">в работе ' + c.work + '</span>' +
        (c.fail ? '<span class="badge s-fail">не выполнено ' + c.fail + '</span>' : '') + (c.none ? '<span class="badge s-none">без статуса ' + c.none + '</span>' : '') +
        (c.overdue ? '<span class="late small">срок прошёл: ' + c.overdue + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  // Печать нескольких докладов подряд, каждый с новой страницы.
  // prepare(el) — дождаться, пока в напечатанное попадут вложения.
  async function printHtml(html, prepare) {
    let el = $('#printArea');
    if (!el) { el = document.createElement('div'); el.id = 'printArea'; document.body.appendChild(el); }
    el.innerHTML = html;
    if (prepare) { try { await prepare(el); } catch (e) { /* печатаем без вложений */ } }
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
    el.innerHTML = '';
  }

  // ---------- поля ввода: растут под текст, «развернуть» — большое окно ----------
  function ta(attrs, value, placeholder) {
    return '<div class="ta-wrap"><textarea rows="2" ' + attrs + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>' + esc(value) + '</textarea>' +
      '<button type="button" class="ta-exp no-print" title="Развернуть в большое окно" tabindex="-1">⤢</button></div>';
  }
  function grow(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
  function autoGrow(container) { $$('.ta-wrap textarea', container).forEach(grow); }
  if (typeof document !== 'undefined') {
    document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('.ta-wrap textarea')) grow(e.target); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.ta-exp');
      if (!b) return;
      const src = b.parentNode.querySelector('textarea');
      const box = document.createElement('div');
      box.className = 'modal';
      const label = (src.closest('tr') && src.closest('tr').querySelector('textarea') !== src ? src.closest('tr').querySelector('textarea').value.slice(0, 120) : '') ||
        (src.closest('.edit-item') && src.closest('.edit-item').querySelector('.ei-text') ? src.closest('.edit-item').querySelector('.ei-text').innerText.split('\n')[0].slice(0, 160) : '');
      box.innerHTML = '<div class="modal-box"><div class="modal-title">' + esc(label || src.placeholder || 'Текст') + '</div><textarea class="modal-ta"></textarea>' +
        '<div class="row between"><span class="muted small">Esc — закрыть без изменений</span><span class="row"><button data-m="cancel">Отмена</button><button class="primary" data-m="ok">Готово</button></span></div></div>';
      document.body.appendChild(box);
      const t = box.querySelector('textarea');
      t.value = src.value; t.focus();
      const close = (ok) => {
        if (ok && t.value !== src.value) { src.value = t.value; src.dispatchEvent(new Event('input', { bubbles: true })); grow(src); }
        box.remove(); document.removeEventListener('keydown', key, true);
      };
      const key = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(false); } };
      document.addEventListener('keydown', key, true);
      box.addEventListener('click', (ev) => { const m = ev.target.dataset && ev.target.dataset.m; if (m) close(m === 'ok'); else if (ev.target === box) close(false); });
    });
  }

  // Новое письмо в веб-почте (OWA) или, если так выбрано в настройках, в почтовой программе.
  // Как открывать письмо. У OWA на своём сервере формат ссылки на новое письмо зависит от версии Exchange,
  // поэтому вариантов несколько; «copy» работает всегда: открывает почту и кладёт текст письма в буфер.
  const MAIL_MODES = [
    ['owa-path', 'Новое письмо в OWA (основной способ)'],
    ['owa-ae', 'Новое письмо в OWA — ссылка вида ?ae=Item'],
    ['owa-hash', 'Новое письмо в OWA — ссылка вида #path=/mail/action/compose'],
    ['owa-copy', 'Открыть почту, текст письма — в буфер'],
    ['mailto', 'В почтовой программе компьютера (Р7)'],
  ];
  function mailMode(settings) { return (settings && settings.mailMode) || 'owa-path'; }
  function owaBase(settings) { return ((settings && settings.owaUrl) || 'https://mail.gazprom-neft.ru/owa/').replace(/[?#].*$/, '').replace(/\/?$/, '/'); }
  function mailUrl(settings, to, subject, body, mode) {
    mode = mode || mailMode(settings);
    if (mode === 'mailto') return null;
    const base = owaBase(settings);
    if (mode === 'owa-copy') return base;
    const q = 'to=' + encodeURIComponent(to.join(';')) + '&subject=' + encodeURIComponent(subject) + (body ? '&body=' + encodeURIComponent(body) : '');
    if (mode === 'owa-ae') return base + '?ae=Item&a=New&t=IPM.Note&' + q;
    if (mode === 'owa-hash') return base + '#path=/mail/action/compose&' + q;
    return base + '?path=/mail/action/compose&' + q;
  }
  function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(() => copyOld(text)); return; } } catch (e) { /* старый способ */ }
    copyOld(text);
  }
  function copyOld(text) {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* */ } t.remove();
  }
  // Окошко с адресом, темой и текстом письма — каждое копируется кнопкой.
  function letterBox(to, subject, body) {
    let box = document.getElementById('letterBox');
    if (box) box.remove();
    box = document.createElement('div'); box.id = 'letterBox';
    box.innerHTML = '<div class="row between"><b>Письмо</b><button class="mini" data-lb="close">✕</button></div>' +
      '<div class="small muted">В почте нажмите «Создать», затем вставьте (Ctrl+V). Текст письма уже скопирован.</div>' +
      '<div class="lb-row"><span>Кому:</span> <b>' + esc(to.join('; ') || '—') + '</b> <button class="mini" data-lb="to">Копировать</button></div>' +
      '<div class="lb-row"><span>Тема:</span> <b>' + esc(subject) + '</b> <button class="mini" data-lb="subject">Копировать</button></div>' +
      '<div class="lb-row"><span>Текст:</span> <button class="mini" data-lb="body">Копировать текст</button></div>';
    box._v = { to: to.join('; '), subject, body };
    box.addEventListener('click', (e) => {
      const k = e.target.dataset && e.target.dataset.lb;
      if (!k) return;
      if (k === 'close') { box.remove(); return; }
      copyText(box._v[k]); toast('Скопировано', 'ok');
    });
    document.body.appendChild(box);
  }
  // Открыть письмо. Вызывать прямо по нажатию кнопки — иначе браузер не откроет новую вкладку.
  // Возвращает false, если вкладка не открылась.
  // Почтовый сервер не принимает слишком длинные ссылки (русская буква в ссылке занимает 6 знаков).
  // Длинный текст в ссылку не кладём: адресаты и тема встают сами, текст — в буфер, вставить Ctrl+V.
  // html — тот же текст с оформлением (таблицей), для вставки в письмо.
  const MAX_URL = 1900;
  function mail(settings, to, subject, body, mode, html) {
    mode = mode || mailMode(settings);
    if (mode === 'mailto') { mailto(to, subject, body); return true; }
    if (mode === 'owa-copy') { copyRich(html, body); letterBox(to, subject, body); return !!window.open(mailUrl(settings, to, subject, body, mode), '_blank'); }
    let url = mailUrl(settings, to, subject, body, mode);
    if (html || url.length > MAX_URL) {
      copyRich(html, body);
      url = mailUrl(settings, to, subject, '', mode);
      toast('Текст письма скопирован — в письме поставьте курсор в поле текста и нажмите Ctrl+V', 'ok');
    }
    return !!window.open(url, '_blank');
  }
  function copyRich(html, text) {
    if (!html) { copyText(text); return; }
    try {
      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).catch(() => copyText(text));
    } catch (e) { copyText(text); }
  }

  function mailto(to, subject, body) {
    const q = 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.length > 1800 ? body.slice(0, 1800) + '\n…' : body);
    const a = document.createElement('a');
    a.href = 'mailto:' + to.map(encodeURIComponent).join(';') + '?' + q;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function copyHtml(html, text) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    } catch (e) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e2) { return false; }
    }
  }
  // Сохранение файла с правильным именем. У страниц, открытых с диска, обычная загрузка теряет имя
  // («download»), поэтому сначала — окно «Сохранить как». Возвращает { ok, aborted, name }.
  async function saveFile(bytes, name, type, ext, what) {
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: name, startIn: 'downloads', types: [{ description: what || 'Файл', accept: { [type]: [ext] } }] });
        const w = await h.createWritable(); await w.write(bytes); await w.close();
        return { ok: true, name: h.name };
      } catch (e) {
        if (e.name === 'AbortError') return { ok: false, aborted: true };
      }
    }
    download(bytes, name, type);
    return { ok: true, name, viaDownload: true };
  }
  function download(bytes, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: type || 'application/octet-stream' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  function toast(msg, kind) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 3500);
  }

  // ---------- общий экран «откройте папку» ----------
  function folderScreen(opts) {
    return '<div class="panel empty-state">' + (opts.error ? '<div class="msg bad">' + esc(opts.error) + '</div>' : '') +
      '<h2>' + esc(opts.title) + '</h2><p>' + opts.text + '</p><div class="row center">' +
      (opts.saved ? '<button class="primary" data-act="grant">Продолжить с папкой «' + esc(opts.saved) + '»</button>' : '') +
      '<button class="' + (opts.saved ? '' : 'primary') + '" data-act="pick">Выбрать папку…</button>' +
      (opts.demo ? '<button data-act="demo">Посмотреть на демо-данных</button>' : '') + '</div>' +
      (opts.fallback ? '<p class="small" style="margin-top:18px"><button class="linkish" data-act="browse">' + esc(opts.fallback) + '</button></p>' +
        '<p class="muted small">Обычное окно выбора папки. Браузер спросит «Загрузить файлы?» — это только чтение с вашего диска, никуда ничего не отправляется.</p>' : '') + '</div>';
  }

  root.View = {
    esc, $, $$, badge, due, ago, statusSelect, tile, countTiles, freshBadge, itemCard, freeTable, kpiHead, eventsTable, personReport,
    hydrateAttachments, xlsxToHtml, memoTable, upcOverview, whoCards, printHtml, mailto, copyHtml, download, saveFile, toast, folderScreen,
    chartMemo, chartKpi, changesHtml, attentionHtml, personCard, noteHtml, notesBlock, FILTERS, flagPass, filterChips, filterCounts, notesHtml, fileKind, fileIcon, attHtml, docxToHtml, activatePdf, b64, ta, autoGrow, mail, mailUrl, mailMode, MAIL_MODES, copyText, MIME, EXT,
  };
})(typeof window !== 'undefined' ? window : globalThis);

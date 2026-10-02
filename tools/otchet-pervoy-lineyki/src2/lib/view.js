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
    return '<div class="item f-' + (st.flag || 'none') + '">' +
      '<div class="what">' + esc(it.text) + (extra || '') + '</div>' +
      '<div class="status">' + (st.text ? esc(st.text) : '<span class="muted">пояснения нет</span>') + '</div>' +
      '<div class="meta">' + badge(st.flag) + '<span>Срок: ' + due(it.due, st.flag, today) + '</span></div></div>';
  }

  // ---------- таблица РОС / проектов ----------
  function freeTable(rows, today) {
    if (!rows.length) return '<div class="muted small">Не заполнено</div>';
    let h = '<table class="grid"><thead><tr><th class="c-no">№</th><th>Задача</th><th>Пояснение</th><th class="c-resp">Ответственные</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th class="c-pct">%</th></tr></thead><tbody>';
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
    return '<div class="kpi-head"><div class="kpi-name">' + esc(M().shortKpi(k.name)) + (k.top3 ? ' <span class="badge s-work">ТОП-3</span>' : '') + '</div>' +
      '<div class="kpi-vals">' + val('Цель', k.goal) + val('Напряжённая', k.stretch) + val('Факт', k.fact) + val('Прогноз', k.forecast) +
      (k.grade ? '<span><b>Оценка прогноза:</b> ' + esc(k.grade) + '</span>' : '') + (k.unit ? '<span class="muted">' + esc(k.unit) + '</span>' : '') +
      '<span class="muted">Лидер: ' + esc(k.leader) + '</span></div></div>';
  }
  function eventsTable(events, reg, today, showSpeaker) {
    if (!events.length) return '<div class="muted small">Мероприятий нет</div>';
    let h = '<table class="grid"><thead><tr><th>Мероприятие</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th>Пояснение</th>' + (showSpeaker ? '<th class="c-resp">Заполняет</th>' : '') + '</tr></thead><tbody>';
    for (const e of events) {
      const sp = M().personById(reg, e.speaker);
      h += '<tr><td>' + esc(e.text) + (e.executors ? '<div class="muted small">Исп.: ' + esc(e.executors) + '</div>' : '') + '</td><td>' + due(e.due, e.st.flag, today) + '</td><td>' + badge(e.st.flag) + '</td><td>' + esc(e.st.text) + '</td>' +
        (showSpeaker ? '<td>' + esc(sp ? sp.fio : 'помощник') + '</td>' : '') + '</tr>';
    }
    return h + '</tbody></table>';
  }

  // ---------- доклад руководителя (экран совещания, директор, предпросмотр) ----------
  function personReport(reg, data, pid, today) {
    const v = M().personView(reg, data, pid, today);
    if (!v.person) return '<div class="panel">Нет такого руководителя</div>';
    let h = '<div class="report-head"><h1>' + esc(v.person.fio) + '</h1>' + freshBadge(v) + '</div>';
    h += countTiles(v.counts, 'поручений');
    h += '<h3 class="sec">1. Поручения</h3>' + (v.memo.length ? '<div class="items">' + v.memo.map((m) => itemCard(m, today)).join('') + '</div>' : '<div class="muted small">Открытых поручений нет</div>');
    if (v.co.length) h += '<h3 class="sec">Соисполнитель <span class="muted">статус ведёт ответственный</span></h3><div class="items">' + v.co.map((m) => itemCard(m, today, '<div class="muted small">Отв.: ' + esc(M().respName(reg, m)) + '</div>')).join('') + '</div>';
    h += '<h3 class="sec">2. РОС</h3>' + freeTable(v.ros, today);
    h += '<h3 class="sec">3. Текущие проекты</h3>' + freeTable(v.proj, today);
    h += '<h3 class="sec">4. Показатели УПЦ</h3>';
    if (!v.kpiOwn.length && !v.kpiOther.length) h += '<div class="muted small">Показателей, по которым руководитель отчитывается, нет</div>';
    for (const k of v.kpiOwn) {
      h += '<div class="kpi">' + kpiHead(k) + (k.comment ? '<div class="kpi-comment"><b>Комментарий:</b> ' + esc(k.comment) + '</div>' : '') + eventsTable(k.events, reg, today, k.events.some((e) => !e.mine)) + '</div>';
    }
    if (v.kpiOther.length) {
      h += '<h3 class="sec">Мероприятия по показателям других лидеров</h3>';
      for (const k of v.kpiOther) h += '<div class="kpi">' + kpiHead(k) + eventsTable(k.events, reg, today, false) + '</div>';
    }
    if (v.kpiTeam.length) {
      h += '<details class="team"><summary>В составе команды (справочно): ' + v.kpiTeam.length + '</summary><table class="grid"><thead><tr><th>Показатель</th><th>Цель</th><th>Факт</th><th>Прогноз</th><th>Лидер</th></tr></thead><tbody>' +
        v.kpiTeam.map((k) => '<tr><td>' + esc(M().shortKpi(k.name)) + '</td><td>' + esc(k.goal) + '</td><td>' + esc(short(k.fact)) + '</td><td>' + esc(short(k.forecast)) + '</td><td>' + esc(k.leader) + '</td></tr>').join('') + '</tbody></table></details>';
    }
    if (v.attachments.length) {
      h += '<h3 class="sec">Приложения</h3>' + v.attachments.map((a) => '<div class="att" data-pid="' + esc(pid) + '" data-file="' + esc(a.file) + '"><div class="att-title">' + esc(a.name) + '</div><div class="att-body muted small">Загрузка…</div></div>').join('');
    }
    return h;
  }
  function short(s) { s = String(s || ''); return s.length > 60 ? s.slice(0, 60) + '…' : s; }

  // ---------- вложения: xlsx → HTML-таблицы (объединения, жирный, заливка, блоки) ----------
  async function hydrateAttachments(container, dir, reg) {
    for (const el of $$('.att', container)) {
      const body = $('.att-body', el);
      try {
        const p = M().personById(reg, el.dataset.pid);
        const { bytes } = await Store.readBytes(dir, [Store.DATA, Store.ATT, p.slug, el.dataset.file]);
        body.innerHTML = await xlsxToHtml(bytes);
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
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    let out = '';
    for (const ws of wb.worksheets) {
      if (ws.state === 'hidden') continue;
      const maxR = ws.rowCount; let maxC = 0;
      ws.eachRow((row) => { row.eachCell((c, i) => { if (M().cellText(c.value) !== '') maxC = Math.max(maxC, i); }); });
      if (!maxC) continue;
      const skip = new Set(); const span = {};
      for (const ref of Object.keys(ws._merges || {})) {
        const m = ws._merges[ref].model || ws._merges[ref];
        span[m.top + ':' + m.left] = { rs: m.bottom - m.top + 1, cs: m.right - m.left + 1 };
        for (let r = m.top; r <= m.bottom; r++) for (let c = m.left; c <= m.right; c++) if (r !== m.top || c !== m.left) skip.add(r + ':' + c);
      }
      const rowEmpty = (r) => { for (let c = 1; c <= maxC; c++) if (M().cellText(ws.getCell(r, c).value) !== '') return false; return true; };
      // Лист делим на таблицы по заголовкам: строка с одной заполненной ячейкой после пустой строки
      // («Таблица №2 — Контрактование»). Пустые строки внутри таблицы просто пропускаем.
      const filled = (r) => { let n = 0; for (let c = 1; c <= maxC; c++) if (M().cellText(ws.getCell(r, c).value) !== '') n++; return n; };
      const blocks = []; let cur = null; let prevEmpty = true;
      for (let r = 1; r <= maxR; r++) {
        if (rowEmpty(r)) { prevEmpty = true; continue; }
        const caption = filled(r) === 1 && prevEmpty;
        if (!cur || caption) { cur = { title: '', rows: [] }; blocks.push(cur); }
        if (caption) { for (let c = 1; c <= maxC; c++) { const t = M().cellText(ws.getCell(r, c).value); if (t) cur.title = t; } }
        else cur.rows.push(r);
        prevEmpty = false;
      }
      const widths = []; let tw = 0;
      for (let c = 1; c <= maxC; c++) { const w = ws.getColumn(c).width || 10; widths.push(w); tw += w; }
      out += (wb.worksheets.length > 1 ? '<div class="att-sheet">' + esc(ws.name) + '</div>' : '');
      for (const blk of blocks) {
        const rows = blk.rows;
        if (!rows.length) { if (blk.title) out += '<div class="att-cap">' + esc(blk.title) + '</div>'; continue; }
        let h = (blk.title ? '<div class="att-cap">' + esc(blk.title) + '</div>' : '') + '<table class="grid xl"><colgroup>' + widths.map((w) => '<col style="width:' + (100 * w / tw).toFixed(1) + '%">').join('') + '</colgroup><tbody>';
        for (const r of rows) {
          h += '<tr>';
          for (let c = 1; c <= maxC; c++) {
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
            h += '<td' + (sp ? (rs > 1 ? ' rowspan="' + rs + '"' : '') + (sp.cs > 1 ? ' colspan="' + sp.cs + '"' : '') : '') +
              (typeof raw === 'number' ? ' class="num"' : '') + (st.length ? ' style="' + st.join(';') + '"' : '') + '>' + esc(v) + '</td>';
          }
          h += '</tr>';
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
      .filter((m) => !opts.person || m.resp === opts.person);
    let h = '<table class="grid memo"><thead><tr><th class="c-due">Дата</th><th>Поручение</th><th class="c-resp">Ответственный</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th>Пояснение</th>' +
      (opts.actions ? '<th class="c-act no-print"></th>' : '') + '</tr></thead><tbody>';
    for (const m of list) {
      const co = (m.co || []).map((id) => (M().personById(reg, id) || {}).fio).filter(Boolean);
      h += '<tr><td>' + esc(M().fmtISO(m.date)) + '</td><td>' + esc(m.text) + (co.length ? '<div class="muted small">Соисп.: ' + esc(co.join(', ')) + '</div>' : '') +
        (m.closed ? '<div class="muted small">Снято ' + esc(M().fmtISO(m.closed.date)) + '</div>' : '') + '</td><td>' + esc(M().respName(reg, m)) + '</td><td>' + due(m.due, m.st.flag, today) +
        '</td><td>' + badge(m.st.flag) + '</td><td>' + esc(m.st.text) + '</td>' + (opts.actions ? '<td class="no-print">' + opts.actions(m) + '</td>' : '') + '</tr>';
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

  // ---------- кто обновил ----------
  function whoCards(reg, data, today) {
    return '<div class="who">' + reg.people.map((p) => {
      const v = M().personView(reg, data, p.id, today);
      const c = v.counts;
      return '<div class="card fr-' + v.fresh + '" data-person="' + esc(p.id) + '"><div class="name">' + esc(p.fio) + (p.onMeeting === false ? ' <span class="muted small">(не на совещании)</span>' : '') + '</div>' +
        '<div class="when">' + freshBadge(v) + '</div><div class="nums">' +
        '<span class="badge s-done">выполнено ' + c.done + '</span><span class="badge s-work">в работе ' + c.work + '</span>' +
        (c.fail ? '<span class="badge s-fail">не выполнено ' + c.fail + '</span>' : '') + (c.none ? '<span class="badge s-none">без статуса ' + c.none + '</span>' : '') +
        (c.overdue ? '<span class="late small">срок прошёл: ' + c.overdue + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  // Печать нескольких докладов подряд, каждый с новой страницы.
  function printHtml(html) {
    let el = $('#printArea');
    if (!el) { el = document.createElement('div'); el.id = 'printArea'; document.body.appendChild(el); }
    el.innerHTML = html;
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
    el.innerHTML = '';
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
      (opts.demo ? '<button data-act="demo">Посмотреть на демо-данных</button>' : '') + '</div></div>';
  }

  root.View = {
    esc, $, $$, badge, due, ago, statusSelect, tile, countTiles, freshBadge, itemCard, freeTable, kpiHead, eventsTable, personReport,
    hydrateAttachments, xlsxToHtml, memoTable, upcOverview, whoCards, printHtml, mailto, copyHtml, download, toast, folderScreen,
  };
})(typeof window !== 'undefined' ? window : globalThis);

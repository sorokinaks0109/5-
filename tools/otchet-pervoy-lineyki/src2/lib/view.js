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
    return '<div class="kpi-head"><div class="kpi-name">' + esc(M().shortKpi(k.name)) + (k.top3 ? ' <span class="badge s-work">ТОП-3</span>' : '') + '</div>' +
      '<div class="kpi-vals">' + val('Цель', k.goal) + val('Напряжённая', k.stretch) + val('Факт', k.fact) + val('Прогноз', k.forecast) +
      (k.grade ? '<span><b>Оценка прогноза:</b> ' + esc(k.grade) + '</span>' : '') + (k.unit ? '<span class="muted">' + esc(k.unit) + '</span>' : '') +
      '<span class="muted">Лидер: ' + esc(k.leader) + '</span></div></div>';
  }
  function eventsTable(events, reg, today, showSpeaker, filter) {
    events = events.filter((e) => flagPass(filter, e.st.flag, e.due, today));
    if (!events.length) return '<div class="muted small">' + (filter ? 'Под фильтр ничего не попало' : 'Мероприятий нет') + '</div>';
    let h = '<table class="grid"><thead><tr><th>Мероприятие</th><th class="c-due">Срок</th><th class="c-st">Статус</th><th>Пояснение</th>' + (showSpeaker ? '<th class="c-resp">Заполняет</th>' : '') + '</tr></thead><tbody>';
    for (const e of events) {
      const sp = M().personById(reg, e.speaker);
      h += '<tr><td>' + esc(e.text) + (e.executors ? '<div class="muted small">Исп.: ' + esc(e.executors) + '</div>' : '') + '</td><td>' + due(e.due, e.st.flag, today) + '</td><td>' + badge(e.st.flag) + '</td><td>' + esc(e.st.text) + '</td>' +
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
    let h = '<div class="report-head"><h1>' + esc(v.person.fio) + '</h1>' + freshBadge(v) + (f ? '<span class="badge s-none">фильтр: ' + esc(FILTERS.find((x) => x[0] === f)[1]) + '</span>' : '') + '</div>';
    h += countTiles(v.counts, 'поручений');
    const memo = v.memo.filter(pass), co = v.co.filter(pass);
    h += '<h3 class="sec">1. Поручения</h3>' + (memo.length ? '<div class="items">' + memo.map((m) => itemCard(m, today)).join('') + '</div>' : '<div class="muted small">' + (f && v.memo.length ? 'Под фильтр ничего не попало' : 'Открытых поручений нет') + '</div>');
    if (co.length) h += '<h3 class="sec">Соисполнитель <span class="muted">статус ведёт ответственный</span></h3><div class="items">' + co.map((m) => itemCard(m, today, '<div class="muted small">Отв.: ' + esc(M().respName(reg, m)) + '</div>')).join('') + '</div>';
    h += '<h3 class="sec">2. РОС</h3>' + freeTable(v.ros, today, f);
    h += '<h3 class="sec">3. Текущие проекты</h3>' + freeTable(v.proj, today, f);
    h += '<h3 class="sec">4. Показатели УПЦ</h3>';
    if (!v.kpiOwn.length && !v.kpiOther.length) h += '<div class="muted small">Показателей, по которым руководитель отчитывается, нет</div>';
    for (const k of v.kpiOwn) {
      h += '<div class="kpi">' + kpiHead(k) + (k.comment ? '<div class="kpi-comment"><b>Комментарий:</b> ' + esc(k.comment) + '</div>' : '') + eventsTable(k.events, reg, today, k.events.some((e) => !e.mine), f) + '</div>';
    }
    if (v.kpiOther.length) {
      h += '<h3 class="sec">Мероприятия по показателям других лидеров</h3>';
      for (const k of v.kpiOther) h += '<div class="kpi">' + kpiHead(k) + eventsTable(k.events, reg, today, false, f) + '</div>';
    }
    if (v.kpiTeam.length) {
      h += '<details class="team"><summary>В составе команды (справочно): ' + v.kpiTeam.length + '</summary><table class="grid"><thead><tr><th>Показатель</th><th>Цель</th><th>Факт</th><th>Прогноз</th><th>Лидер</th></tr></thead><tbody>' +
        v.kpiTeam.map((k) => '<tr><td>' + esc(M().shortKpi(k.name)) + '</td><td>' + esc(k.goal) + '</td><td>' + esc(short(k.fact)) + '</td><td>' + esc(short(k.forecast)) + '</td><td>' + esc(k.leader) + '</td></tr>').join('') + '</tbody></table></details>';
    }
    if (v.attachments.length) {
      h += '<h3 class="sec">Приложения</h3>' + v.attachments.map((a) => '<div class="att" data-pid="' + esc(pid) + '" data-file="' + esc(a.file) + '"><div class="att-title">' + fileIcon(a.file) + ' ' + esc(a.name) + '</div><div class="att-body muted small">Загрузка…</div></div>').join('');
    }
    return h;
  }
  function short(s) { s = String(s || ''); return s.length > 60 ? s.slice(0, 60) + '…' : s; }

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

  // ---------- кто обновил ----------
  function whoCards(reg, data, today) {
    return '<div class="who">' + reg.people.map((p) => {
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
  function mailUrl(settings, to, subject, body) {
    if (((settings && settings.mailVia) || 'owa') === 'mailto') return null;
    const base = (settings && settings.owaUrl) || 'https://mail.gazprom-neft.ru/owa/';
    const cut = body.length > 1500 ? body.slice(0, 1500) + '\n…' : body;
    return base.replace(/[?#].*$/, '').replace(/\/?$/, '/') + '?path=/mail/action/compose&to=' + encodeURIComponent(to.join(';')) +
      '&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(cut);
  }
  // win — вкладка, открытая заранее, прямо по нажатию кнопки: иначе браузер блокирует новое окно,
  // если до его открытия страница несколько секунд готовила файл. Возвращает false, если окно не открылось.
  function mail(settings, to, subject, body, win) {
    const url = mailUrl(settings, to, subject, body);
    if (!url) { mailto(to, subject, body); return true; }
    if (win && !win.closed) { win.location.href = url; return true; }
    return !!window.open(url, '_blank');
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
    FILTERS, flagPass, filterChips, filterCounts, notesHtml, fileKind, fileIcon, attHtml, docxToHtml, activatePdf, b64, ta, autoGrow, mail, mailUrl, MIME, EXT,
  };
})(typeof window !== 'undefined' ? window : globalThis);

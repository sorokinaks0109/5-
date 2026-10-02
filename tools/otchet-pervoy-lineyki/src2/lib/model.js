// Данные отчёта: статусы, сроки, кто за что отчитывается, загрузка карты УПЦ, свод в Excel.
(function (root) {
  'use strict';

  // Единые статусы — одинаковые у руководителя, помощника и директора.
  const STATUSES = [
    { key: 'work', label: 'в работе' },
    { key: 'done', label: 'выполнено' },
    { key: 'fail', label: 'не выполнено' },
    { key: 'na', label: 'неактуально' },
  ];
  const NO_STATUS = { key: '', label: 'без статуса' };
  const statusLabel = (k) => (STATUSES.find((s) => s.key === k) || NO_STATUS).label;
  const isFinal = (k) => k === 'done' || k === 'na';

  // ---------- даты ----------
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtISO(s) { return ISO.test(s || '') ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : (s || ''); }
  // «02.10.2026», «2.10.26», «2026-10-02» → ISO; любой другой текст («постоянно») остаётся текстом.
  function parseDue(s) {
    s = String(s === null || s === undefined ? '' : s).trim();
    if (ISO.test(s)) return s;
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      const d = new Date(y, +m[2] - 1, +m[1]);
      if (d.getDate() === +m[1]) return todayISO(d);
    }
    return s;
  }
  function isOverdue(due, flag, today) { return ISO.test(due || '') && due < today && !isFinal(flag); }
  function fmtDateTime(ms) { const d = new Date(ms); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s.]+/g, ''); }
  function surname(s) { return norm(String(s || '').trim().split(/\s+/)[0]); }

  // ---------- люди ----------
  function personById(reg, id) { return reg.people.find((p) => p.id === id) || null; }
  // Ищем человека по «Мещеряков А.В.», «А.В. Мещеряков» или «Мещеряков Алексей Валериевич»
  function personByName(reg, name) {
    const n = norm(name);
    if (!n) return null;
    return reg.people.find((p) => norm(p.fio) === n || norm(p.full) === n) ||
      reg.people.find((p) => surname(p.fio) && String(name).toLowerCase().replace(/ё/g, 'е').split(/[\s,.()]+/).includes(surname(p.fio))) || null;
  }
  function inTeam(kpi, p) {
    const t = String(kpi.team || '').toLowerCase().replace(/ё/g, 'е');
    return !!p.full && t.includes(p.full.toLowerCase().replace(/ё/g, 'е')) || t.split(/[,()]+/).some((x) => surname(x) === surname(p.fio));
  }
  function shortKpi(name) {
    return String(name || '').replace(/(ГПН-ГПН_Снаб-)+/g, '').replace(/_/g, ' · ').trim();
  }

  // ---------- статусы из личных файлов ----------
  // data — объект { [personId]: { data, modified } } c содержимым личных файлов.
  function stOf(data, pid, kind, id) {
    const d = data[pid] && data[pid].data;
    const s = d && d[kind] && d[kind][id];
    return { flag: (s && s.flag) || '', text: (s && s.text) || '' };
  }
  function memoStatus(reg, data, m) { return m.resp ? stOf(data, m.resp, 'memo', m.id) : { flag: m.flag || '', text: m.note || '' }; }
  function eventStatus(reg, data, ev) { return ev.speaker ? stOf(data, ev.speaker, 'events', ev.id) : { flag: (ev.manual && ev.manual.flag) || '', text: (ev.manual && ev.manual.text) || '' }; }
  function respName(reg, m) { const p = personById(reg, m.resp); return p ? p.fio : (m.respText || '—'); }

  // Всё, что видно в отчёте одного руководителя.
  function personView(reg, data, pid, today) {
    const p = personById(reg, pid);
    const own = (data[pid] && data[pid].data) || {};
    const open = reg.memo.filter((m) => !m.closed);
    const memo = open.filter((m) => m.resp === pid).map((m) => ({ ...m, st: memoStatus(reg, data, m), role: 'ответственный' }));
    const co = open.filter((m) => m.resp !== pid && (m.co || []).includes(pid)).map((m) => ({ ...m, st: memoStatus(reg, data, m), role: 'соисполнитель' }));
    const evs = (k) => reg.events.filter((e) => e.kpi === k.id).map((e) => ({ ...e, st: eventStatus(reg, data, e), mine: e.speaker === pid }));
    const kpiOwn = reg.kpis.filter((k) => k.reporter === pid).map((k) => ({ ...k, comment: (own.kpi && own.kpi[k.id]) || '', events: evs(k) }));
    const otherK = reg.kpis.filter((k) => k.reporter !== pid && reg.events.some((e) => e.kpi === k.id && e.speaker === pid));
    const kpiOther = otherK.map((k) => ({ ...k, events: evs(k).filter((e) => e.mine) }));
    const kpiTeam = reg.kpis.filter((k) => k.reporter !== pid && !otherK.includes(k) && p && inTeam(k, p));
    const counts = countFlags(memo.map((m) => m.st.flag));
    counts.overdue = memo.filter((m) => isOverdue(m.due, m.st.flag, today)).length;
    const myEvents = [].concat(...kpiOwn.map((k) => k.events.filter((e) => e.mine)), ...kpiOther.map((k) => k.events));
    const evCounts = countFlags(myEvents.map((e) => e.st.flag));
    return {
      person: p, memo, co, kpiOwn, kpiOther, kpiTeam, counts, evCounts,
      ros: own.ros || [], proj: own.proj || [], attachments: own.attachments || [],
      reportDate: own.reportDate || '', savedAt: own.savedAt || 0, fresh: freshness(reg, own),
    };
  }
  function countFlags(flags) {
    const c = { total: flags.length, done: 0, work: 0, fail: 0, na: 0, none: 0 };
    flags.forEach((f) => { if (f === '') c.none++; else c[f]++; });
    return c;
  }
  // Отчёт свежий, если руководитель указал дату актуальности позже последнего совещания.
  function freshness(reg, own) {
    const d = own && own.reportDate;
    if (!d) return 'never';
    const last = reg.settings.lastMeeting || '';
    return !last || d > last ? 'fresh' : 'stale';
  }

  // ---------- карта УПЦ из выгрузки (xlsx) ----------
  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return todayISO(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
      if ('result' in v) return cellText(v.result);
      if ('text' in v) return cellText(v.text);
      return '';
    }
    return String(v).replace(/ /g, ' ').trim();
  }
  function parseCard(wb) {
    for (const ws of wb.worksheets) {
      let head = 0, cols = {}, date = '';
      for (let r = 1; r <= Math.min(ws.rowCount, 30) && !head; r++) {
        const row = ws.getRow(r);
        const cells = [];
        for (let c = 1; c <= Math.max(row.cellCount, 1); c++) cells.push(cellText(row.getCell(c).value));
        const di = cells.findIndex((x) => /дата выгрузки/i.test(x));
        if (di >= 0) {
          const near = [cells[di + 1], ws.getRow(r + 1).getCell(di + 1).value, ws.getRow(r + 1).getCell(di + 2).value].map(cellText).find((x) => /\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/.test(x));
          if (near) date = parseDue(near.match(/\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/)[0]);
        }
        if (cells.some((x) => /^идентификатор$/i.test(x)) && cells.some((x) => /^показатель$/i.test(x))) {
          head = r;
          const find = (re) => cells.findIndex((x) => re.test(x)) + 1;
          cols = {
            id: find(/^идентификатор$/i), top3: find(/^топ ?3$/i), name: find(/^показатель$/i), goal: find(/^цель$/i),
            stretch: find(/^напряженная цель$/i), fact: find(/^факт/i), forecast: find(/^прогноз/i), grade: find(/^оценка/i),
            team: find(/^команда/i), leader: find(/^лидер/i), unit: find(/^ед/i), type: find(/^тип$/i),
          };
        }
      }
      if (!head) continue;
      const kpis = [];
      for (let r = head + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const g = (k) => (cols[k] > 0 ? cellText(row.getCell(cols[k]).value) : '');
        if (!g('id') || !g('name')) continue;
        kpis.push({
          id: g('id'), top3: /да/i.test(g('top3')), name: g('name'), goal: g('goal'), stretch: g('stretch'), fact: g('fact'),
          forecast: g('forecast'), grade: g('grade'), team: g('team'), leader: g('leader'), unit: g('unit'), type: g('type'),
        });
      }
      return { date, kpis };
    }
    throw new Error('В файле не нашлась таблица карты УПЦ (нужны колонки «Идентификатор» и «Показатель»).');
  }
  const KPI_FIELDS = ['name', 'goal', 'stretch', 'fact', 'forecast', 'grade', 'team', 'leader', 'unit', 'type', 'top3'];
  function diffCard(reg, card) {
    const old = new Map(reg.kpis.map((k) => [k.id, k]));
    const neu = new Map(card.kpis.map((k) => [k.id, k]));
    const added = card.kpis.filter((k) => !old.has(k.id));
    const removed = reg.kpis.filter((k) => !neu.has(k.id)).map((k) => ({ ...k, eventCount: reg.events.filter((e) => e.kpi === k.id).length }));
    const changed = [];
    for (const k of card.kpis) {
      const o = old.get(k.id);
      if (!o) continue;
      const f = KPI_FIELDS.filter((x) => String(o[x] || '') !== String(k[x] || ''));
      if (f.length) changed.push({ id: k.id, name: k.name, fields: f, leaderChanged: f.includes('leader'), old: o, neu: k });
    }
    return { added, removed, changed, date: card.date };
  }
  function defaultReporter(reg, kpi) {
    const p = personByName(reg, kpi.leader);
    return p ? p.id : null;
  }
  function applyCard(reg, card) {
    const d = diffCard(reg, card);
    const keep = new Map(reg.kpis.map((k) => [k.id, k]));
    reg.kpis = card.kpis.map((k) => {
      const o = keep.get(k.id);
      const reporter = o && !d.changed.some((c) => c.id === k.id && c.leaderChanged) ? o.reporter : defaultReporter(reg, k);
      return { ...k, reporter: reporter === undefined ? null : reporter };
    });
    const ids = new Set(reg.kpis.map((k) => k.id));
    reg.events = reg.events.filter((e) => ids.has(e.kpi));
    reg.settings.cardDate = card.date || todayISO();
    return d;
  }

  // ---------- свод в Excel ----------
  function buildSummary(ExcelJS, reg, data, today) {
    const wb = new ExcelJS.Workbook();
    const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const FILL = { done: 'FFC6EFCE', work: 'FFDDEBF7', fail: 'FFFFC7CE', na: 'FFEDEDED', '': 'FFFFFFFF' };
    const sheet = (name, headers, widths, rows) => {
      const ws = wb.addWorksheet(name, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
      widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
      const h = ws.addRow(headers);
      h.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; c.border = border; c.alignment = { wrapText: true, vertical: 'top' }; });
      for (const r of rows) {
        const row = ws.addRow(r.vals);
        row.eachCell({ includeEmpty: true }, (c, i) => {
          c.border = border; c.alignment = { wrapText: true, vertical: 'top' };
          if (r.head) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; }
          if (r.flag !== undefined && i === r.flagCol) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.flag] } };
        });
      }
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      return ws;
    };
    const views = reg.people.map((p) => personView(reg, data, p.id, today));
    sheet('Кто обновил', ['Руководитель', 'Отчёт актуален на', 'Поручений', 'Выполнено', 'В работе', 'Не выполнено', 'Неактуально', 'Без статуса', 'Срок прошёл'],
      [24, 16, 11, 11, 11, 13, 13, 12, 12],
      views.map((v) => ({ vals: [v.person.fio, v.reportDate ? fmtISO(v.reportDate) : 'не заполнен', v.counts.total, v.counts.done, v.counts.work, v.counts.fail, v.counts.na, v.counts.none, v.counts.overdue] })));
    sheet('Поручения', ['Дата совещания', 'Поручение', 'Ответственный', 'Срок', 'Статус', 'Пояснение', 'Снято'], [13, 60, 20, 12, 14, 60, 14],
      reg.memo.map((m) => { const s = memoStatus(reg, data, m); return { vals: [fmtISO(m.date), m.text, respName(reg, m), fmtISO(m.due), statusLabel(s.flag), s.text, m.closed ? fmtISO(m.closed.date) : ''], flag: s.flag, flagCol: 5 }; }));
    const rows = [];
    for (const k of reg.kpis) {
      const rep = personById(reg, k.reporter);
      rows.push({ head: true, vals: [shortKpi(k.name), 'цель ' + k.goal + ' · факт ' + k.fact + ' · прогноз ' + k.forecast + (k.grade ? ' · оценка ' + k.grade : ''), rep ? rep.fio : 'не назначен', '', ''] });
      for (const e of reg.events.filter((x) => x.kpi === k.id)) {
        const s = eventStatus(reg, data, e); const sp = personById(reg, e.speaker);
        rows.push({ vals: [e.text, e.executors, sp ? sp.fio : '—', statusLabel(s.flag), s.text], flag: s.flag, flagCol: 4 });
      }
    }
    sheet('УПЦ', ['Показатель / мероприятие', 'Исполнители / значения', 'Отчитывается', 'Статус', 'Пояснение'], [60, 36, 20, 14, 60], rows);
    return wb;
  }

  // Короткий текст итогов для письма директору.
  function summaryText(reg, data, today) {
    const views = reg.people.filter((p) => p.onMeeting !== false).map((p) => personView(reg, data, p.id, today));
    const all = countFlags(reg.memo.filter((m) => !m.closed).map((m) => memoStatus(reg, data, m).flag));
    const overdue = reg.memo.filter((m) => !m.closed && isOverdue(m.due, memoStatus(reg, data, m).flag, today)).length;
    const lines = [];
    lines.push('Итоги по поручениям совещания первой линейки на ' + fmtISO(today) + '.');
    lines.push('');
    lines.push('Всего на контроле: ' + all.total + '. Выполнено: ' + all.done + ', в работе: ' + all.work + ', не выполнено: ' + all.fail +
      ', неактуально: ' + all.na + ', без статуса: ' + all.none + '. Срок прошёл: ' + overdue + '.');
    lines.push('');
    lines.push('По руководителям:');
    for (const v of views) {
      const c = v.counts;
      lines.push('— ' + v.person.fio + ': ' + c.total + ' пор.; выполнено ' + c.done + ', в работе ' + c.work + ', не выполнено ' + c.fail +
        (c.none ? ', без статуса ' + c.none : '') + (c.overdue ? ', срок прошёл ' + c.overdue : '') +
        (v.fresh === 'fresh' ? '' : ' (отчёт не обновлён)'));
    }
    return lines.join('\n');
  }

  root.Model = {
    STATUSES, NO_STATUS, statusLabel, isFinal, ISO, todayISO, fmtISO, parseDue, isOverdue, fmtDateTime, uid, norm, surname,
    personById, personByName, inTeam, shortKpi, memoStatus, eventStatus, respName, personView, countFlags, freshness,
    cellText, parseCard, diffCard, applyCard, defaultReporter, buildSummary, summaryText,
  };
})(typeof window !== 'undefined' ? window : globalThis);

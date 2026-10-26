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
  // Кто ведёт еженедельный отчёт (без участников «только план и УПЦ»), в порядке докладов: сначала участники совещания
  function reportPeople(reg) { const r = reg.people.filter((p) => !p.extra); return r.filter((p) => p.onMeeting !== false).concat(r.filter((p) => p.onMeeting === false)); }
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
  // Ответственные поручения. Старые записи — одно поле resp; новые, выданные нескольким, — список resps.
  function respsOf(m) { return m.resps && m.resps.length ? m.resps : m.resp ? [m.resp] : []; }
  function isResp(m, pid) { return respsOf(m).includes(pid); }
  // Общий статус поручения, выданного нескольким: у каждого свой, сверху — «выполнили N из M».
  function combineFlags(flags) {
    if (!flags.length) return '';
    if (flags.every(isFinal)) return flags.every((f) => f === 'na') ? 'na' : 'done';
    if (flags.includes('fail')) return 'fail';
    if (flags.some((f) => f === 'work' || isFinal(f))) return 'work';
    return '';
  }
  function memoStatus(reg, data, m) {
    const rs = respsOf(m);
    if (!rs.length) return { flag: m.flag || '', text: m.note || '' };
    if (rs.length === 1) return stOf(data, rs[0], 'memo', m.id);
    const parts = rs.map((pid) => ({ pid, fio: (personById(reg, pid) || {}).fio || pid, ...stOf(data, pid, 'memo', m.id) }));
    const done = parts.filter((x) => isFinal(x.flag)).length;
    return {
      flag: combineFlags(parts.map((x) => x.flag)), parts, progress: { done, total: parts.length },
      text: 'Выполнили ' + done + ' из ' + parts.length + '\n' + parts.map((x) => x.fio + ': ' + statusLabel(x.flag) + (x.text ? ' — ' + x.text : '')).join('\n'),
    };
  }
  // prev — статус, который был у мероприятия до смены «Заполняет»: виден, пока новый человек не заполнит своё
  // override — статус, который помощник перенёс из квартального плана: действует, пока руководитель не сохранит отчёт позже
  function eventStatus(reg, data, ev) {
    if (!ev.speaker) return { flag: (ev.manual && ev.manual.flag) || '', text: (ev.manual && ev.manual.text) || '' };
    const d = data[ev.speaker] && data[ev.speaker].data;
    if (ev.override && !(d && d.savedAt > ev.override.at)) return { flag: ev.override.flag || '', text: ev.override.text || '' };
    const s = stOf(data, ev.speaker, 'events', ev.id);
    const own = d && d.events && d.events[ev.id];
    const empty = !own || (!own.flag && !String(own.text || '').trim());
    return empty && ev.prev ? { flag: ev.prev.flag || '', text: ev.prev.text || '' } : s;
  }
  function respName(reg, m) {
    const rs = respsOf(m);
    if (!rs.length) return m.respText || '—';
    const meet = reg.people.filter((p) => p.onMeeting !== false).map((p) => p.id);
    if (rs.length > 2 && meet.every((id) => rs.includes(id))) return 'Все руководители (' + rs.length + ')';
    return rs.map((id) => (personById(reg, id) || {}).fio || id).join(', ');
  }
  // Комментарии соисполнителей: каждый пишет в своём отчёте, показываем у поручения.
  function coNotes(reg, data, m) {
    return (m.co || []).map((pid) => {
      const d = data[pid] && data[pid].data;
      const text = (d && d.coNotes && d.coNotes[m.id]) || '';
      return { pid, fio: (personById(reg, pid) || {}).fio || pid, text };
    }).filter((x) => x.text.trim());
  }

  // Всё, что видно в отчёте одного руководителя.
  function personView(reg, data, pid, today) {
    const p = personById(reg, pid);
    const own = (data[pid] && data[pid].data) || {};
    const open = reg.memo.filter((m) => !m.closed);
    // у поручения на нескольких у каждого свой статус; общий прогресс — в all
    const memo = open.filter((m) => isResp(m, pid)).map((m) => {
      const all = memoStatus(reg, data, m);
      return { ...m, st: respsOf(m).length > 1 ? stOf(data, pid, 'memo', m.id) : all, all, notes: coNotes(reg, data, m), role: 'ответственный' };
    });
    const co = open.filter((m) => !isResp(m, pid) && (m.co || []).includes(pid)).map((m) => ({ ...m, st: memoStatus(reg, data, m), myNote: (own.coNotes && own.coNotes[m.id]) || '', notes: coNotes(reg, data, m), role: 'соисполнитель' }));
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
      // колонок, которых нет в выгрузке (бывает выгрузка без факта, прогноза и оценки), — старые значения не трогаем
      const missing = KPI_FIELDS.filter((k) => k !== 'name' && !(cols[k] > 0));
      return { date, kpis, missing };
    }
    throw new Error('В файле не нашлась таблица карты УПЦ (нужны колонки «Идентификатор» и «Показатель»).');
  }
  const KPI_FIELDS = ['name', 'goal', 'stretch', 'fact', 'forecast', 'grade', 'team', 'leader', 'unit', 'type', 'top3'];
  const teamKey = (t) => String(t || '').split(',').map((x) => norm(x)).filter(Boolean).sort().join('|');
  function diffCard(reg, card) {
    const old = new Map(reg.kpis.map((k) => [k.id, k]));
    const neu = new Map(card.kpis.map((k) => [k.id, k]));
    const added = card.kpis.filter((k) => !old.has(k.id));
    // показатели, добавленные вручную, карта не трогает
    const removed = reg.kpis.filter((k) => !k.manual && !neu.has(k.id)).map((k) => ({ ...k, eventCount: reg.events.filter((e) => e.kpi === k.id).length }));
    const cardNames = new Set(card.kpis.map((k) => norm(shortKpi(k.name))));
    const manualDup = reg.kpis.filter((k) => k.manual && cardNames.has(norm(shortKpi(k.name))));
    const changed = [];
    for (const k of card.kpis) {
      const o = old.get(k.id);
      if (!o) continue;
      // состав команды сравниваем без учёта порядка фамилий — выгрузка его перемешивает
      const same = (x) => x === 'team' ? teamKey(o.team) === teamKey(k.team) : String(o[x] || '') === String(k[x] || '');
      const f = KPI_FIELDS.filter((x) => !(card.missing || []).includes(x) && !same(x));
      if (f.length) changed.push({ id: k.id, name: k.name, fields: f, leaderChanged: f.includes('leader'), old: o, neu: k });
    }
    return { added, removed, changed, manualDup, date: card.date, missing: card.missing || [] };
  }
  function defaultReporter(reg, kpi) {
    const p = personByName(reg, kpi.leader);
    return p ? p.id : null;
  }
  function applyCard(reg, card) {
    const d = diffCard(reg, card);
    const keep = new Map(reg.kpis.map((k) => [k.id, k]));
    const ids0 = new Set(card.kpis.map((k) => k.id));
    reg.kpis = card.kpis.map((k) => {
      const o = keep.get(k.id);
      const reporter = o && !d.changed.some((c) => c.id === k.id && c.leaderChanged) ? o.reporter : defaultReporter(reg, k);
      const kept = {}; if (o) for (const f of card.missing || []) kept[f] = o[f];
      return { ...k, ...kept, reporter: reporter === undefined ? null : reporter };
    }).concat(reg.kpis.filter((k) => k.manual && !ids0.has(k.id)));
    const ids = new Set(reg.kpis.map((k) => k.id));
    reg.events = reg.events.filter((e) => ids.has(e.kpi));
    reg.settings.cardDate = card.date || todayISO();
    return d;
  }

  // Факт, прогноз и оценка пропали (загрузили выгрузку карты без этих колонок) — вернуть из старой копии реестра
  const KEEP_FIELDS = ['fact', 'forecast', 'grade'];
  function kpiValuesLost(reg) { return reg.kpis.length > 0 && reg.kpis.filter((k) => !k.manual).every((k) => KEEP_FIELDS.every((f) => !String(k[f] || '').trim())); }
  function restoreKpiValues(reg, old) {
    const by = new Map((old.kpis || []).map((k) => [k.id, k])); let n = 0;
    for (const k of reg.kpis) {
      const o = by.get(k.id); if (!o) continue;
      let hit = false;
      for (const f of KEEP_FIELDS) if (!String(k[f] || '').trim() && String(o[f] || '').trim()) { k[f] = o[f]; hit = true; }
      if (hit) n++;
    }
    return n;
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
    const views = reportPeople(reg).map((p) => personView(reg, data, p.id, today));
    sheet('Кто обновил', ['Руководитель', 'Отчёт актуален на', 'Поручений', 'Выполнено', 'В работе', 'Не выполнено', 'Неактуально', 'Без статуса', 'Срок прошёл'],
      [24, 16, 11, 11, 11, 13, 13, 12, 12],
      views.map((v) => ({ vals: [v.person.fio, v.reportDate ? fmtISO(v.reportDate) : 'не заполнен', v.counts.total, v.counts.done, v.counts.work, v.counts.fail, v.counts.na, v.counts.none, v.counts.overdue] })));
    sheet('Поручения', ['Дата совещания', 'Поручение', 'Ответственный', 'Срок', 'Статус', 'Пояснение', 'Снято'], [13, 60, 20, 12, 14, 60, 14],
      reg.memo.map((m) => {
        const s = memoStatus(reg, data, m);
        const notes = coNotes(reg, data, m).map((x) => 'Соисп. ' + x.fio + ': ' + x.text).join('\n');
        return { vals: [fmtISO(m.date), m.text, respName(reg, m), fmtISO(m.due), statusLabel(s.flag), s.text + (notes ? (s.text ? '\n' : '') + notes : ''), m.closed ? fmtISO(m.closed.date) : ''], flag: s.flag, flagCol: 5 };
      }));
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

  // ---------- разделы отчёта: помощник переименовывает и скрывает РОС и «Текущие проекты» ----------
  const SECTION_DEFAULT = { memo: 'Поручения', ros: 'РОС', proj: 'Текущие проекты', upc: 'Показатели УПЦ', att: 'Приложения' };
  // { memo: '1. Поручения', ros: '2. РОС' | null (скрыт), … } — номера идут подряд по видимым разделам
  function sections(reg) {
    const cfg = (reg.settings && reg.settings.sections) || {};
    const out = {}; let n = 0;
    for (const k of Object.keys(SECTION_DEFAULT)) {
      const c = cfg[k] || {};
      if (c.hidden) { out[k] = null; continue; }
      const title = (c.title || '').trim() || SECTION_DEFAULT[k];
      out[k] = k === 'att' ? title : (++n) + '. ' + title;
      out[k + 'Plain'] = title;
    }
    return out;
  }
  // ---------- запрос итогов за квартал для АВР ----------
  // settings.avrReq = { on, period: '4 кв. 2026', due: 'ГГГГ-ММ-ДД', text }; итог руководителя — data.avrq['период|мероприятие']
  function avrReq(reg) { const r = reg.settings && reg.settings.avrReq; return r && r.on && (r.period || '').trim() ? r : null; }
  const avrqKey = (period, evId) => String(period).trim() + '|' + evId;
  function avrqText(reg, data, ev, period) {
    period = period || (avrReq(reg) || {}).period;
    if (!period || !ev.speaker) return '';
    const d = data[ev.speaker] && data[ev.speaker].data;
    return String((d && d.avrq && d.avrq[avrqKey(period, ev.id)]) || '').trim();
  }
  // Сколько своих мероприятий у руководителя и по скольким он написал итог за квартал
  function avrqProgress(reg, data, pid) {
    const r = avrReq(reg); if (!r) return null;
    const evs = reg.events.filter((e) => e.speaker === pid);
    return { total: evs.length, done: evs.filter((e) => avrqText(reg, data, e, r.period)).length };
  }

  // ---------- сбор мероприятий на следующий год (проект плана, Приложение 3 к приказу № 1) ----------
  // reg.plan = { year, on, due, text, kpis: [{ id, name, type, goal, leader }], events: [{ id, kpi, text, executors, due }] }
  // ответ лидера — в его файле: data.planK[показатель] = { st: 'ok' | 'edit', events: [...], at }, data.planBI = [предложенные БИ]
  function planOn(reg) { const p = reg.plan; return p && p.on && p.kpis && p.kpis.length ? p : null; }
  // Лидер показателя — подпись (может быть и не из списка, например директор); мероприятия заполняют k.fillers.
  // Каждое предложенное мероприятие закреплено за тем, кто его заполняет (e.who), — оно в отчёте этого человека.
  function planFillers(k) { return Array.isArray(k.fillers) ? k.fillers : k.leader ? [k.leader] : []; }
  function planLeaderName(reg, k) { const p = k.leader && personById(reg, k.leader); return p ? p.fio : k.leaderName || ''; }
  const planProposed = (reg, k) => ((reg.plan && reg.plan.events) || []).filter((e) => e.kpi === k.id);
  // Мероприятия одного заполняющего: его ответ, если он уже ответил, иначе — предложенные ему
  function planMine(reg, data, k, pid) {
    const d = data[pid] && data[pid].data;
    const own = d && d.planK && d.planK[k.id];
    if (own) return { events: own.events || [], st: own.st || 'edit', at: own.at };
    const fs = planFillers(k);
    return { events: planProposed(reg, k).filter((e) => (e.who && fs.includes(e.who) ? e.who === pid : pid === fs[0])), st: '' };
  }
  // Итог по показателю — все заполняющие вместе; st: '' никто не ответил, 'part' — часть, 'ok' / 'edit' — все
  function planFinal(reg, data, k) {
    const fs = planFillers(k);
    const parts = fs.map((pid) => ({ pid, ...planMine(reg, data, k, pid) }));
    const events = [].concat(...parts.map((x) => x.events.map((e) => ({ ...e, who: x.pid }))));
    if (!fs.length) events.push(...planProposed(reg, k));
    const done = parts.filter((x) => x.st);
    const st = !parts.length || !done.length ? '' : done.length < parts.length ? 'part' : parts.every((x) => x.st === 'ok') ? 'ok' : 'edit';
    return { events, st, parts };
  }
  function planProgress(reg, data, pid) {
    const p = reg.plan; if (!p) return null;
    const ks = p.kpis.filter((k) => planFillers(k).includes(pid));
    return { total: ks.length, done: ks.filter((k) => planMine(reg, data, k, pid).st).length };
  }

  // ---------- проект карты УПЦ на следующий год из xlsx («ПРОЕКТ карты УПЦ на 2027 год») ----------
  // Название показателя без префикса и хвоста подразделения — чтобы найти тот же показатель в карте текущего года
  const kpiCore = (name) => norm(shortKpi(name).replace(/\s·\s(вс|восточная\s+сибирь|восточ\S*\s+сиб\S*|логистика.*|дивизион.*|сибирь)$/i, '').replace(/\s·\s(вс|восточная\s+сибирь)$/i, ''));
  // «1. Проведён анализ…, срок: 30.06.2027 2. Разработан…» → мероприятия
  function splitEvents(text) {
    const t = String(text || '').trim(); if (!/^\s*1[.)]\s/.test(t)) return [];
    return t.split(/(?:^|\s)\d{1,2}[.)]\s+/).map((x) => x.trim()).filter(Boolean).map((x) => {
      const m = x.match(/,?\s*срок\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})\s*[.;]?\s*$/i);
      return { text: m ? x.slice(0, m.index).trim() : x, executors: '', due: m ? parseDue(m[1]) : '' };
    });
  }
  function parsePlanCard(wb) {
    for (const ws of wb.worksheets) {
      let head = 0, cols = {}, title = '';
      for (let r = 1; r <= Math.min(ws.rowCount, 30) && !head; r++) {
        const row = ws.getRow(r); const cells = [];
        for (let c = 1; c <= Math.max(row.cellCount, 1); c++) cells.push(cellText(row.getCell(c).value));
        const t = cells.find((x) => /проект\s+карты|карт\S*\s+упц\s+на\s+\d{4}/i.test(x)); if (t) title = t;
        if (cells.some((x) => /^показатель$/i.test(x))) {
          head = r;
          const find = (re) => cells.findIndex((x) => re.test(x)) + 1;
          cols = { id: find(/^идентификатор$/i), name: find(/^показатель$/i), goal: find(/^цель$/i), stretch: find(/^напряж[её]нная цель$/i), note: find(/^источник|^комментарий/i),
            team: find(/^команда/i), leader: find(/^лидер/i), unit: find(/^ед/i), type: find(/^тип$/i), top3: find(/^топ ?3$/i) };
        }
      }
      if (!head) continue;
      const year = +((title.match(/на\s+(\d{4})/) || [])[1]) || 0;
      const kpis = [];
      for (let r = head + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const g = (k) => (cols[k] > 0 ? cellText(row.getCell(cols[k]).value) : '');
        if (!g('name')) continue;
        kpis.push({ code: g('id'), name: g('name'), goal: g('goal'), stretch: g('stretch'), note: g('note'), team: g('team'), leaderName: g('leader'), unit: g('unit'), type: g('type'), top3: /да/i.test(g('top3')) });
      }
      if (kpis.length) return { year, title, kpis };
    }
    throw new Error('В файле не нашлась таблица с колонкой «Показатель»');
  }
  // Проект из файла: лидеры — по ФИО, мероприятия — из карты текущего года по тому же показателю, у БИ — из текста цели
  function planFromCard(reg, card, year) {
    const shift = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') && +d.slice(0, 4) === year - 1 ? year + d.slice(4) : d || '');
    const kpis = [], events = [], noLeader = [], noFill = [];
    const cores = new Set(card.kpis.map((c) => kpiCore(c.name))); // показатель текущего года, который в проекте есть под тем же названием, «похожим» не считаем
    for (const c of card.kpis) {
      const id = uid('P');
      const bi = /би/i.test(c.type);
      const cc = kpiCore(c.name);
      // тот же показатель: по коду, по названию; «Качество управления запасами» = «… запасами МТР»
      const src = !bi && (reg.kpis.find((k) => (c.code && k.id === c.code) || kpiCore(k.name) === cc) ||
        reg.kpis.find((k) => { const kc = kpiCore(k.name); return !cores.has(kc) && Math.min(kc.length, cc.length) >= 15 && (kc.startsWith(cc) || cc.startsWith(kc)); }));
      const lp = /уточн/i.test(c.leaderName) ? null : personByName(reg, c.leaderName);
      if (!lp) noLeader.push(shortKpi(c.name) + ' — ' + (c.leaderName || 'лидер не указан'));
      const fromStretch = bi ? splitEvents(c.stretch) : [];
      // заполняют: лидер (если он в списке) и те, кто в текущем году заполнял мероприятия этого показателя
      const srcEv = src ? reg.events.filter((x) => x.kpi === src.id) : [];
      const fillers = Array.from(new Set([...(lp ? [lp.id] : []), ...srcEv.map((e) => e.speaker).filter((x) => x && personById(reg, x))]));
      if (!fillers.length) noFill.push(shortKpi(c.name));
      kpis.push({ id, src: src ? src.id : '', code: c.code, name: c.name, type: bi ? 'БИ' : 'ФОП', goal: c.goal, stretch: fromStretch.length ? '' : c.stretch, unit: c.unit, note: c.note, team: c.team, leader: lp ? lp.id : null, leaderName: c.leaderName, top3: c.top3, fillers });
      for (const e of srcEv) events.push({ id: uid('pe'), kpi: id, text: e.text, executors: e.executors || '', due: shift(e.due), who: fillers.includes(e.speaker) ? e.speaker : fillers[0] || '' });
      for (const e of fromStretch) events.push({ id: uid('pe'), kpi: id, ...e, who: fillers[0] || '' });
    }
    return { kpis, events, noLeader, noFill, matched: kpis.filter((k) => k.src).length };
  }

  // ---------- история по неделям (для графиков динамики и дисциплины отчётности) ----------
  // Одна запись на неделю (по понедельнику); при повторной записи в ту же неделю — обновляется.
  function recordWeek(reg, data, today) {
    const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const week = todayISO(d);
    const open = reg.memo.filter((m) => !m.closed).map((m) => ({ m, f: memoStatus(reg, data, m).flag }));
    const c = countFlags(open.map((x) => x.f));
    const rec = { week, at: today, total: c.total, done: c.done, work: c.work, fail: c.fail, na: c.na, none: c.none,
      overdue: open.filter((x) => isOverdue(x.m.due, x.f, today)).length,
      fresh: reportPeople(reg).filter((p) => freshness(reg, data[p.id] && data[p.id].data) === 'fresh').map((p) => p.id),
      people: reportPeople(reg).map((p) => p.id) };
    const h = (reg.history || []).filter((x) => x.week !== week);
    h.push(rec); h.sort((a, b) => (a.week < b.week ? -1 : 1));
    reg.history = h.slice(-104);
    return rec;
  }

  // ---------- комментарии директора ----------
  // reg.dirNotes = [{ id, pid, kind: 'm' | 'e' | 'k' | 'g', ref, type: 'c' | 'meet' | 'rm', text, date, via, closed? }]
  // c — комментарий (руководитель отвечает в своём отчёте: data.dirAns[id]); meet — «хочу услышать на совещании»;
  // rm — «предлагаю снять с контроля» (решает помощник). kind g — к отчёту или разделу целиком (ref — раздел или '').
  const NOTE_TYPES = { c: 'Комментарий директора', meet: 'Директор хочет услышать на совещании', rm: 'Директор предлагает снять с контроля' };
  function dirAnswer(data, n) { const d = data[n.pid] && data[n.pid].data; return String((d && d.dirAns && d.dirAns[n.id]) || '').trim(); }
  function noteState(data, n) { return n.closed ? 'closed' : n.type !== 'c' ? n.type : dirAnswer(data, n) ? 'answered' : 'open'; }
  function dirNotes(reg, pid, kind, ref, all) {
    return (reg.dirNotes || []).filter((n) => (!pid || n.pid === pid) && (!kind || n.kind === kind) && (ref === undefined || n.ref === ref) && (all || !n.closed));
  }
  // Что за пункт: для письма, списка у помощника и карточки
  function noteItem(reg, n) {
    const p = personById(reg, n.pid) || { fio: n.pid };
    if (n.kind === 'm') { const m = reg.memo.find((x) => x.id === n.ref); return { fio: p.fio, what: 'поручение', text: m ? m.text : '(поручение удалено)', ok: !!m && !m.closed }; }
    if (n.kind === 'e') { const e = reg.events.find((x) => x.id === n.ref); return { fio: p.fio, what: 'мероприятие УПЦ', text: e ? e.text : '(мероприятие удалено)', ok: !!e }; }
    if (n.kind === 'k') { const k = reg.kpis.find((x) => x.id === n.ref); return { fio: p.fio, what: 'показатель', text: k ? shortKpi(k.name) : '(показатель удалён)', ok: !!k }; }
    const T = sections(reg);
    return { fio: p.fio, what: n.ref ? 'раздел' : 'отчёт', text: n.ref ? (T[n.ref + 'Plain'] || n.ref) : 'отчёт целиком', ok: true };
  }
  // Код в конце письма директора: по нему помощник вносит письмо одной кнопкой
  const dirCode = (type, kind, ref, pid) => '[код D|' + type + '|' + kind + '|' + ref + '|' + pid + ']';
  // Разбираем вставленный текст писем: перед каждым кодом — «Комментарий:» / «Причина:» и текст директора
  function parseDirMail(reg, text) {
    const out = []; const re = /\[код\s*D\|(c|meet|rm)\|([mekg])\|([^|\]]*)\|([^\]\s]+)\]/g;
    let m, from = 0;
    while ((m = re.exec(text))) {
      const seg = text.slice(from, m.index); from = re.lastIndex;
      const lab = /(?:Комментарий[^:\n]{0,20}|Причина)\s*:/gi; let last = null, x;
      while ((x = lab.exec(seg))) last = x;
      const body = last ? seg.slice(last.index + last[0].length) : '';
      const clean = body.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const n = { type: m[1], kind: m[2], ref: m[3], pid: m[4], text: clean };
      n.person = personById(reg, n.pid);
      n.item = n.person ? noteItem(reg, n) : null;
      n.dup = (reg.dirNotes || []).some((o) => !o.closed && o.pid === n.pid && o.kind === n.kind && o.ref === n.ref && o.type === n.type && (o.text || '') === n.text);
      out.push(n);
    }
    // письмо без кода (почта не вставила текст): узнаём поручение по теме «… — Фамилия, поручение №12: «…»»
    if (!out.length) {
      const sm = /(Комментарий директора|На совещание|Снять с контроля)\s*[—–-]\s*([А-ЯЁа-яё-]+),\s*поручение\s*№\s*(\d+)/i.exec(text);
      if (sm) {
        const type = /^ком/i.test(sm[1]) ? 'c' : /^на/i.test(sm[1]) ? 'meet' : 'rm';
        const p = reg.people.find((x) => norm(x.slug) === norm(sm[2]) || surname(x.fio) === norm(sm[2]));
        const m = reg.memo.find((x) => String(x.num) === sm[3] && (!p || isResp(x, p.id)));
        if (m) {
          const pid = p ? p.id : respsOf(m)[0];
          // текст директора — всё, кроме темы и служебных строк почты
          const body = text.split('\n').filter((l) => !sm[0] || !l.includes(sm[0])).filter((l) => !/^\s*(От|Отправлено|Кому|Копия|Тема|From|Sent|To|Cc|Subject)\s*:/i.test(l) && !/^\s*>/.test(l)).join('\n').trim();
          const n = { type, kind: 'm', ref: m.id, pid, text: body, bySubject: true };
          n.person = personById(reg, pid); n.item = noteItem(reg, n);
          n.dup = (reg.dirNotes || []).some((o) => !o.closed && o.pid === n.pid && o.kind === 'm' && o.ref === n.ref && o.type === n.type && (o.text || '') === n.text);
          out.push(n);
        }
      }
    }
    return out;
  }
  function addDirNote(reg, n, today) {
    const note = { id: uid('dn'), pid: n.pid, kind: n.kind, ref: n.ref || '', type: n.type, text: String(n.text || '').trim(), date: today, via: n.via || 'mail' };
    reg.dirNotes = (reg.dirNotes || []).concat(note);
    return note;
  }

  // ---------- что требует внимания: пояснения без движения, просрочки, переносы сроков ----------
  // reg.track = { items: { ключ: { h, since, due, moves } }, snap: { date, flags: { ключ: статус }, late: [ключи] } }
  // since — с какого дня пояснение не менялось (считаем с первого открытия помощника после обновления).
  function trackItems(reg, data) {
    const out = [];
    for (const m of reg.memo.filter((x) => !x.closed)) {
      for (const pid of respsOf(m)) { const s = stOf(data, pid, 'memo', m.id); out.push({ key: 'm|' + m.id + '|' + pid, kind: 'm', ref: m.id, pid, text: m.text, due: m.due, flag: s.flag, note: s.text }); }
    }
    for (const e of reg.events.filter((x) => x.speaker)) { const s = eventStatus(reg, data, e); out.push({ key: 'e|' + e.id, kind: 'e', ref: e.id, pid: e.speaker, text: e.text, due: e.due, flag: s.flag, note: s.text }); }
    return out;
  }
  const hashOf = (it) => norm(it.flag + '|' + it.note);
  function updateTrack(reg, data, today) {
    const t = reg.track = reg.track || { items: {} };
    const before = JSON.stringify(t);
    const items = trackItems(reg, data); const keep = {};
    for (const it of items) {
      const o = t.items[it.key]; const h = hashOf(it);
      if (!o) keep[it.key] = { h, since: today, due: it.due || '', moves: 0 };
      else {
        const n = { ...o };
        if (o.h !== h) { n.h = h; n.since = today; }
        if (ISO.test(o.due || '') && ISO.test(it.due || '') && o.due !== it.due) n.moves = (o.moves || 0) + 1;
        n.due = it.due || '';
        keep[it.key] = n;
      }
    }
    t.items = keep;
    if (!t.snap) takeSnap(reg, data, today, items);
    return JSON.stringify(t) !== before;
  }
  // Снимок статусов на день совещания — от него считаем «что изменилось»
  function takeSnap(reg, data, today, items) {
    items = items || trackItems(reg, data);
    reg.track = reg.track || { items: {} };
    reg.track.snap = { date: today, flags: Object.fromEntries(items.map((x) => [x.key, x.flag])), late: items.filter((x) => isOverdue(x.due, x.flag, today)).map((x) => x.key) };
  }
  const weeksBetween = (a, b) => Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 6048e5);
  // [{ ...пункт, reasons: ['…'] }] — по всем или по одному руководителю
  function attention(reg, data, today, pid) {
    const tr = (reg.track && reg.track.items) || {};
    const out = [];
    for (const it of trackItems(reg, data)) {
      if (pid && it.pid !== pid) continue;
      if (isFinal(it.flag)) continue;
      const o = tr[it.key];
      const since = o && o.h === hashOf(it) ? o.since : today; // текст поменяли после последнего открытия помощника — свежий
      const r = [];
      const late = isOverdue(it.due, it.flag, today);
      if (late && since <= it.due) r.push('срок прошёл ' + fmtISO(it.due) + ', пояснение с тех пор не менялось');
      else { const w = weeksBetween(since, today); if (w >= 3) r.push('пояснение не менялось ' + w + ' нед.'); }
      if (o && o.moves >= 2) r.push('срок переносили ' + o.moves + ' раз' + (o.moves < 5 ? 'а' : ''));
      if (it.flag && !String(it.note).trim() && weeksBetween(since, today) >= 1) r.push('статус есть, пояснения нет');
      if (r.length) out.push({ ...it, reasons: r, late });
    }
    return out;
  }
  // Что изменилось с последнего совещания (или с первого открытия после обновления)
  function changes(reg, data, today) {
    const sn = reg.track && reg.track.snap; if (!sn) return null;
    const items = trackItems(reg, data);
    const was = (k) => sn.flags[k];
    return {
      since: sn.date,
      done: items.filter((x) => x.flag === 'done' && was(x.key) !== undefined && was(x.key) !== 'done'),
      fail: items.filter((x) => x.flag === 'fail' && was(x.key) !== undefined && was(x.key) !== 'fail'),
      late: items.filter((x) => isOverdue(x.due, x.flag, today) && !sn.late.includes(x.key)),
      added: reg.memo.filter((m) => !m.closed && m.date && m.date >= sn.date),
      closed: reg.memo.filter((m) => m.closed && m.closed.date >= sn.date),
    };
  }
  // Как руководитель обновлял отчёт к совещаниям (по истории недель)
  function discipline(reg, pid, weeks) {
    const h = (reg.history || []).filter((x) => (x.people || []).includes(pid)).slice(-(weeks || 13));
    return h.map((x) => ({ week: x.week, fresh: (x.fresh || []).includes(pid) }));
  }

  // ---------- слияние правок: один отчёт заполняют несколько человек ----------
  // base — версия, с которой человек начал; mine — что он сохраняет; theirs — что сейчас лежит в папке.
  // Берём из mine только то, что он сам поменял относительно base; остальное — из theirs.
  const J = (x) => JSON.stringify(x === undefined ? null : x);
  function mergeReport(base, mine, theirs) {
    if (!theirs) return mine;
    base = base || {};
    const out = { ...theirs };
    for (const f of ['memo', 'events']) {
      const b = base[f] || {}, m = mine[f] || {};
      out[f] = { ...(theirs[f] || {}) };
      for (const id of new Set([...Object.keys(b), ...Object.keys(m)])) {
        const bi = b[id] || {}, mi = m[id] || {};
        for (const k of new Set([...Object.keys(bi), ...Object.keys(mi)])) {
          if (J(bi[k]) !== J(mi[k])) out[f][id] = { ...(out[f][id] || {}), [k]: mi[k] };
        }
      }
    }
    for (const f of ['kpi', 'coNotes', 'avrq', 'planK', 'planG', 'dirAns']) {
      const b = base[f] || {}, m = mine[f] || {};
      out[f] = { ...(theirs[f] || {}) };
      for (const id of new Set([...Object.keys(b), ...Object.keys(m)])) if (J(b[id]) !== J(m[id])) out[f][id] = m[id];
    }
    for (const f of ['ros', 'proj', 'planBI']) if (J(base[f] || []) !== J(mine[f] || [])) out[f] = mine[f];
    // вложения — по имени файла: добавленные мной добавляются, удалённые мной удаляются, чужие остаются
    const bA = base.attachments || [], mA = mine.attachments || [];
    const removed = bA.filter((a) => !mA.some((x) => x.file === a.file)).map((a) => a.file);
    const changed = mA.filter((a) => J(a) !== J(bA.find((x) => x.file === a.file)));
    out.attachments = (theirs.attachments || []).filter((a) => !removed.includes(a.file) && !changed.some((x) => x.file === a.file)).concat(changed);
    out.reportDate = [mine.reportDate || '', theirs.reportDate || ''].sort().pop();
    for (const k of ['personId', 'fio', 'savedAt', 'saveId']) if (mine[k] !== undefined) out[k] = mine[k];
    out.saveIds = Array.from(new Set([...(theirs.saveIds || []), ...(mine.saveIds || [])])).slice(-100);
    return out;
  }
  // Изменилось ли что-то в папке с тех пор, как человек открыл отчёт.
  function sameVersion(a, b) {
    if (!a || !b) return !a && !b;
    return (a.saveId || '') === (b.saveId || '') && (a.savedAt || 0) === (b.savedAt || 0);
  }

  root.Model = {
    STATUSES, NO_STATUS, statusLabel, isFinal, ISO, todayISO, fmtISO, parseDue, isOverdue, fmtDateTime, uid, norm, surname,
    personById, reportPeople, personByName, inTeam, shortKpi, memoStatus, eventStatus, respName, personView, countFlags, freshness,
    respsOf, isResp, combineFlags, coNotes, mergeReport, sameVersion, stOf, sections, avrReq, avrqKey, avrqText, avrqProgress, planOn, planFinal, planProgress, planMine, planFillers, planLeaderName, recordWeek,
    parsePlanCard, planFromCard, splitEvents, kpiCore,
    NOTE_TYPES, dirAnswer, noteState, dirNotes, noteItem, dirCode, parseDirMail, addDirNote, updateTrack, takeSnap, attention, changes, discipline,
    cellText, parseCard, diffCard, applyCard, kpiValuesLost, restoreKpiValues, defaultReporter, buildSummary, summaryText,
  };
})(typeof window !== 'undefined' ? window : globalThis);

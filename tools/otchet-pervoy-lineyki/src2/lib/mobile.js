/* global Model, View */
// Версия для телефона директора: один HTML-файл без скриптов (Outlook на iPhone скрипты не запускает).
// Всё вписано в файл, руководители раскрываются нажатием, широкие таблицы листаются вбок.
(function (root) {
  'use strict';
  const M = () => root.Model;
  const V = () => root.View;

  const CSS = [
    'body{margin:0;background:#f4f6f9;color:#1d2733;font:15px/1.4 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-text-size-adjust:100%}',
    'header{background:#1f3a5f;color:#fff;padding:12px 14px}header h1{margin:0;font-size:18px}header div{font-size:13px;opacity:.85}',
    'main{padding:10px 10px 40px;max-width:900px;margin:0 auto}',
    'h2{font-size:16px;margin:18px 0 8px;color:#1f3a5f}',
    '.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
    '.tile{background:#fff;border:1px solid #d9e0e8;border-radius:10px;padding:8px 10px}.tile b{display:block;font-size:24px;line-height:1.1}.tile span{font-size:12px;color:#5d6b7a}',
    '.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}',
    '.s-done{background:#e3f4ea;color:#1e7b45}.s-work{background:#e5eef9;color:#1f5fa8}.s-fail{background:#fde4e2;color:#b3261e}.s-na{background:#eceff2;color:#5d6b7a}.s-none{background:#fff4d6;color:#8a5a00}',
    '.t-done b{color:#1e7b45}.t-work b{color:#1f5fa8}.t-fail b{color:#b3261e}.t-na b{color:#5d6b7a}.t-none b{color:#8a5a00}',
    '.card{background:#fff;border:1px solid #d9e0e8;border-left:5px solid #e0a800;border-radius:10px;padding:8px 10px;margin:6px 0}',
    '.f-done{border-left-color:#1e7b45}.f-work{border-left-color:#1f5fa8}.f-fail{border-left-color:#b3261e}.f-na{border-left-color:#9aa6b2}',
    '.what{font-weight:600}.st{white-space:pre-wrap;margin:4px 0}.meta{font-size:13px;color:#5d6b7a}.late{color:#b3261e;font-weight:600}',
    '.notes{font-size:13px;background:#f6f8fa;border-radius:6px;padding:4px 8px;margin-top:4px;white-space:pre-wrap}',
    'details{background:#fff;border:1px solid #d9e0e8;border-radius:10px;margin:8px 0}',
    'details>summary{padding:10px 12px;cursor:pointer;list-style:none}details>summary::-webkit-details-marker{display:none}',
    'details>summary .nm{font-weight:700;font-size:16px}details>summary .nm:after{content:" ▸";color:#5d6b7a}details[open]>summary .nm:after{content:" ▾"}',
    'details .in{padding:0 10px 10px}',
    'h3{font-size:13px;text-transform:uppercase;letter-spacing:.03em;color:#1f3a5f;margin:14px 0 6px}',
    '.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:4px 0}',
    'table{border-collapse:collapse;background:#fff;font-size:13px}td,th{border:1px solid #d9e0e8;padding:4px 6px;vertical-align:top;text-align:left;white-space:pre-wrap}th{background:#e9eff6}',
    '.free td,.free th{min-width:90px}.free td:first-child{min-width:150px}.free td:nth-child(2){min-width:180px}',
    'table.xl td{min-width:60px}.num{text-align:right}',
    '.kpi{background:#fbfcfe;border:1px solid #d9e0e8;border-radius:8px;padding:8px;margin:6px 0}.kpi .nm{font-weight:700}.kpi .v{font-size:13px;color:#5d6b7a}',
    'img{max-width:100%;height:auto;border:1px solid #d9e0e8;border-radius:6px}',
    '.muted{color:#5d6b7a}.small{font-size:13px}',
    '.att-doc{background:#fff;border:1px solid #d9e0e8;border-radius:8px;padding:8px 10px}.att-doc table{margin:6px 0}',
    '.att-cap{font-weight:700;margin:8px 0 4px}.att-sheet{font-weight:600;color:#5d6b7a;margin:8px 0 4px}',
  ].join('\n');

  function build(reg, data, today, att, at) {
    const esc = V().esc;
    const badge = (f) => '<span class="badge s-' + (f || 'none') + '">' + esc(M().statusLabel(f)) + '</span>';
    const due = (d, f) => (d ? (M().isOverdue(d, f, today) ? '<span class="late">' + esc(M().fmtISO(d)) + ' · срок прошёл</span>' : esc(M().fmtISO(d))) : '—');
    const notes = (list) => (list && list.length ? '<div class="notes">' + list.map((x) => '<b>Соисп. ' + esc(x.fio) + ':</b> ' + esc(x.text)).join('\n') + '</div>' : '');
    const card = (it, extra) => '<div class="card f-' + (it.st.flag || 'none') + '"><div class="what">' + esc(it.text) + '</div>' + (extra || '') +
      (it.st.text ? '<div class="st">' + esc(it.st.text) + '</div>' : '') + notes(it.notes) +
      '<div class="meta">' + badge(it.st.flag) + ' · срок: ' + due(it.due, it.st.flag) + '</div></div>';
    const tiles = (c, label) => '<div class="tiles">' + [[c.total, label, ''], [c.done, 'выполнено', 'done'], [c.work, 'в работе', 'work'], [c.fail, 'не выполнено', 'fail'], [c.none, 'без статуса', 'none'], [c.overdue || 0, 'срок прошёл', 'fail']]
      .map(([v, l, k]) => '<div class="tile t-' + k + '"><b>' + v + '</b><span>' + l + '</span></div>').join('') + '</div>';
    const free = (rows) => {
      const r = rows.filter((x) => x.kind !== 'head' || x.task);
      if (!r.some((x) => x.kind !== 'head')) return '<div class="muted small">Не заполнено</div>';
      return '<div class="scroll"><table class="free"><tr><th>Задача</th><th>Пояснение</th><th>Отв.</th><th>Срок</th><th>Статус</th><th>%</th></tr>' +
        r.map((x) => (x.kind === 'head' ? '<tr><td colspan="6"><b>' + esc(x.task) + '</b></td></tr>'
          : '<tr><td>' + esc(x.task) + '</td><td>' + esc(x.text) + '</td><td>' + esc(x.resp) + '</td><td>' + due(x.due, x.flag) + '</td><td>' + (x.flag ? badge(x.flag) : '') + '</td><td class="num">' + (x.pct === '' || x.pct === undefined ? '' : esc(x.pct) + '%') + '</td></tr>')).join('') + '</table></div>';
    };
    const events = (evs) => (evs.length ? evs.map((e) => '<div class="card f-' + (e.st.flag || 'none') + '"><div>' + esc(e.text) + '</div>' + (e.st.text ? '<div class="st">' + esc(e.st.text) + '</div>' : '') +
      '<div class="meta">' + badge(e.st.flag) + ' · срок: ' + due(e.due, e.st.flag) + '</div></div>').join('') : '<div class="muted small">Мероприятий нет</div>');
    const kpiHead = (k) => '<div class="nm">' + esc(M().shortKpi(k.name)) + (k.top3 ? ' <span class="badge s-work">ТОП-3</span>' : '') + '</div>' +
      '<div class="v">Цель: ' + esc(k.goal) + ' · Факт: ' + esc(String(k.fact).slice(0, 80)) + ' · Прогноз: ' + esc(String(k.forecast).slice(0, 80)) + (k.grade ? ' · Оценка: ' + esc(k.grade) : '') + '</div>';

    const open = reg.memo.filter((m) => !m.closed).map((m) => ({ ...m, st: M().memoStatus(reg, data, m), notes: M().coNotes(reg, data, m) }));
    const all = M().countFlags(open.map((m) => m.st.flag));
    all.overdue = open.filter((m) => M().isOverdue(m.due, m.st.flag, today)).length;
    const bad = open.filter((m) => m.st.flag === 'fail' || M().isOverdue(m.due, m.st.flag, today));

    let h = '<header><h1>Отчёт первой линейки</h1><div>Данные на ' + esc(M().fmtDateTime(at)) + '</div></header><main>';
    h += '<h2>Поручения на контроле</h2>' + tiles(all, 'на контроле');
    h += '<h2>Просрочено и не выполнено: ' + bad.length + '</h2>' + (bad.length ? bad.map((m) => card(m, '<div class="meta">Отв.: ' + esc(M().respName(reg, m)) + '</div>')).join('') : '<div class="muted">Нет</div>');
    h += '<h2>По руководителям</h2>';
    const people = reg.people.filter((p) => p.onMeeting !== false).concat(reg.people.filter((p) => p.onMeeting === false));
    for (const p of people) {
      const v = M().personView(reg, data, p.id, today);
      const c = v.counts;
      const fresh = v.fresh === 'fresh' ? '<span class="badge s-done">актуален на ' + esc(M().fmtISO(v.reportDate)) + '</span>' : v.fresh === 'stale' ? '<span class="badge s-fail">не обновлён</span>' : '<span class="badge s-fail">не заполнялся</span>';
      h += '<details><summary><div class="nm">' + esc(p.fio) + '</div><div class="small">' + fresh + ' ' +
        '<span class="badge s-done">' + c.done + '</span> <span class="badge s-work">' + c.work + '</span> ' + (c.fail ? '<span class="badge s-fail">не вып. ' + c.fail + '</span> ' : '') +
        (c.none ? '<span class="badge s-none">без статуса ' + c.none + '</span> ' : '') + (c.overdue ? '<span class="late">срок прошёл: ' + c.overdue + '</span>' : '') + '</div></summary><div class="in">';
      h += '<h3>Поручения</h3>' + (v.memo.length ? v.memo.map((m) => card(m, m.all && m.all.progress ? '<div class="meta">Поручено ' + m.all.progress.total + ' · выполнили ' + m.all.progress.done + '</div>' : '')).join('') : '<div class="muted small">Открытых нет</div>');
      if (v.co.length) h += '<h3>Соисполнитель</h3>' + v.co.map((m) => card(m, '<div class="meta">Отв.: ' + esc(M().respName(reg, m)) + '</div>')).join('');
      h += '<h3>РОС</h3>' + free(v.ros) + '<h3>Текущие проекты</h3>' + free(v.proj);
      if (v.kpiOwn.length || v.kpiOther.length) {
        h += '<h3>Показатели УПЦ</h3>';
        for (const k of v.kpiOwn) h += '<div class="kpi">' + kpiHead(k) + (k.comment ? '<div class="notes">' + esc(k.comment) + '</div>' : '') + events(k.events) + '</div>';
        for (const k of v.kpiOther) h += '<div class="kpi">' + kpiHead(k) + events(k.events) + '</div>';
      }
      if (v.attachments.length) {
        h += '<h3>Приложения</h3>';
        for (const a of v.attachments) {
          const body = att && att[p.id] && att[p.id][a.file];
          const kind = V().fileKind(a.file);
          h += '<div class="small"><b>' + esc(a.name) + '</b></div>' +
            (body && (kind === 'xlsx' || kind === 'img' || kind === 'docx') ? '<div class="scroll">' + body.replace(/<div class="att-tools">[\s\S]*?<\/div>$/, '').replace(/<button[^>]*>[\s\S]*?<\/button>/g, '') + '</div>'
              : '<div class="muted small">' + esc(a.file) + ' — файл в папке отчёта</div>');
        }
      }
      h += '</div></details>';
    }
    h += '<h2>Показатели УПЦ</h2>';
    for (const k of reg.kpis) {
      const rep = M().personById(reg, k.reporter);
      const c = M().countFlags(reg.events.filter((e) => e.kpi === k.id).map((e) => M().eventStatus(reg, data, e).flag));
      h += '<div class="kpi">' + kpiHead(k) + '<div class="small">Отчитывается: ' + esc(rep ? rep.fio : '—') + (c.total ? ' · мероприятий выполнено ' + c.done + ' из ' + c.total : '') + '</div></div>';
    }
    h += '</main>';
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Отчёт первой линейки ' + esc(M().fmtISO(today)) + '</title><style>' + CSS + '</style></head><body>' + h + '</body></html>';
  }

  root.Mobile = { build };
})(typeof window !== 'undefined' ? window : globalThis);

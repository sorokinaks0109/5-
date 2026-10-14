/* global JSZip, Model */
// План мероприятий по достижению целевых показателей (АВР): статусы из отчёта — в квартальный файл.
// Файл меняется точечно: только ячейки статуса и «выполнено» на листе дивизиона, всё остальное остаётся байт в байт.
(function (root) {
  'use strict';
  const M = () => root.Model;
  const NS_XML = 'http://www.w3.org/XML/1998/namespace';

  const colNum = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const refParts = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { col: colNum(m[1]), row: +m[2] }; };
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]/g, '');
  // текст без номера в начале («1. Проведена…» = «Проведена…») и без хвоста «срок: …»
  const core = (s) => norm(String(s || '').trim().replace(/^\d+[.)]\s*/, '').replace(/,?\s*срок\s*:?.*$/is, ''));
  const words = (s) => new Set(String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^0-9a-zа-я]+/).filter((w) => w.length > 3));
  const kpiKey = (name) => norm(M().shortKpi(String(name || '').replace(/(ГПН-ГПН_Снаб-)+/g, '')));

  async function open(bytes) {
    const zip = await JSZip.loadAsync(bytes);
    const parse = async (p) => new DOMParser().parseFromString(await zip.file(p).async('string'), 'application/xml');
    const wb = await parse('xl/workbook.xml');
    const rels = await parse('xl/_rels/workbook.xml.rels');
    const target = {};
    for (const r of Array.from(rels.getElementsByTagName('Relationship'))) target[r.getAttribute('Id')] = r.getAttribute('Target');
    const sheets = Array.from(wb.getElementsByTagName('sheet')).map((s) => {
      const t = target[s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] || '';
      return { name: s.getAttribute('name'), path: t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '') };
    });
    let strings = [];
    if (zip.file('xl/sharedStrings.xml')) {
      const ss = await parse('xl/sharedStrings.xml');
      strings = Array.from(ss.getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join(''));
    }
    return { zip, sheets, strings, parse };
  }

  function cellText(c, strings) {
    const t = c.getAttribute('t');
    if (t === 'inlineStr') return Array.from(c.getElementsByTagName('t')).map((x) => x.textContent).join('');
    const v = c.getElementsByTagName('v')[0];
    if (!v) return '';
    return t === 's' ? strings[+v.textContent] || '' : v.textContent;
  }

  // Читаем лист: строка заголовков («Мероприятие»), колонки статуса и «выполнено», показатели и мероприятия.
  async function readSheet(book, sheet) {
    const doc = await book.parse(sheet.path);
    const rows = Array.from(doc.getElementsByTagName('row'));
    const grid = new Map();
    for (const r of rows) {
      const cells = {};
      for (const c of Array.from(r.getElementsByTagName('c'))) { const p = refParts(c.getAttribute('r')); const v = cellText(c, book.strings).trim(); if (v) cells[p.col] = v; }
      grid.set(+r.getAttribute('r'), cells);
    }
    let head = 0;
    for (const [n, cells] of grid) if (Object.values(cells).some((v) => /^мероприятие$/i.test(v))) { head = n; break; }
    if (!head) throw new Error('На листе «' + sheet.name + '» не нашлась строка с заголовком «Мероприятие»');
    const hc = grid.get(head);
    const col = (re) => Object.keys(hc).filter((k) => re.test(hc[k])).map(Number).sort((a, b) => a - b);
    const textCol = col(/^мероприятие$/i)[0];
    const statusCols = col(/статус/i).map((c) => ({ col: c, title: hc[c] }));
    const doneCols = col(/^выполнено$/i);
    const noteCol = col(/примечани/i)[0];
    if (!statusCols.length) throw new Error('На листе «' + sheet.name + '» нет колонки «Статус … кв.»');
    const items = []; let kpi = '';
    for (const [n, cells] of grid) {
      if (n <= head) continue;
      const text = cells[textCol];
      const first = cells[1] || '';
      if (!text) { if (/снаб|гпн/i.test(first) || (first && !/^блок/i.test(first) && first.length > 12)) kpi = first; continue; }
      if (!first && /^(директор|начальник|руководитель|заместитель)\s/i.test(text)) continue; // подпись под таблицей
      const note = noteCol ? cells[noteCol] || '' : '';
      // «Цель отменена…», «Показатель исключён…» — строку не заполняем
      items.push({ row: n, num: first, text, kpi, note, cancelled: /^\s*(цель отменена|мероприятие отменено|показатель исключ)/i.test(note) });
    }
    return { doc, head, textCol, statusCols, doneCols, noteCol, items, grid };
  }

  // Сопоставление строки плана с мероприятием отчёта: сохранённая связь → тот же показатель и текст → похожий текст.
  // excluded — строки, которые помощник раньше отметил исключёнными: { ключ: текст примечания }
  function matchItems(reg, items, saved, excluded) {
    saved = saved || {}; excluded = excluded || {};
    const byKpi = new Map();
    for (const k of reg.kpis) byKpi.set(kpiKey(k.name), k);
    const evOf = (kid) => reg.events.filter((e) => e.kpi === kid);
    return items.map((it) => {
      const key = kpiKey(it.kpi) + '|' + norm(it.text).slice(0, 80);
      let k = byKpi.get(kpiKey(it.kpi)) || reg.kpis.find((x) => kpiKey(x.name) && kpiKey(it.kpi) && (kpiKey(x.name).includes(kpiKey(it.kpi)) || kpiKey(it.kpi).includes(kpiKey(x.name)))) || null;
      const res = { ...it, key, kpiId: k ? k.id : '', eventId: '', how: '' };
      if (it.cancelled) return { ...res, how: 'cancelled' };
      if (excluded[key]) return { ...res, how: 'cancelled', exclude: excluded[key], learned: true };
      if (saved[key] && reg.events.some((e) => e.id === saved[key])) return { ...res, eventId: saved[key], how: 'saved' };
      if (saved[key] === '') return { ...res, how: 'skip' };
      const t = core(it.text);
      const pool = k ? evOf(k.id) : [];
      let e = pool.find((x) => core(x.text) === t) || pool.find((x) => core(x.text).slice(0, 50) === t.slice(0, 50) && t.length >= 20) ||
        reg.events.find((x) => core(x.text) === t && t.length >= 20);
      if (e) return { ...res, eventId: e.id, kpiId: res.kpiId || e.kpi, how: 'auto' };
      // похожий текст (больше половины значимых слов совпадает) — помечаем «проверьте»
      const w = words(it.text); let best = null, score = 0;
      for (const x of pool) { // похожие ищем только внутри своего показателя
        const xw = words(x.text); if (!w.size || !xw.size) continue;
        let common = 0; for (const a of w) if (xw.has(a)) common++;
        const s = common / Math.max(w.size, xw.size);
        if (s > score) { score = s; best = x; }
      }
      if (best && score >= 0.5) return { ...res, eventId: best.id, kpiId: res.kpiId || best.kpi, how: 'similar' };
      return k ? res : { ...res, how: 'nokpi', exclude: 'Цель отменена. Показатель исключён из карты УПЦ' };
    });
  }

  // Записываем значения: cells — [{ row, col, text } | { row, col, num }]. Возвращает байты нового файла.
  async function write(book, sheet, info, cells) {
    const doc = info.doc;
    const ns = doc.documentElement.namespaceURI;
    const sheetData = doc.getElementsByTagName('sheetData')[0];
    const rowEl = new Map(Array.from(sheetData.getElementsByTagName('row')).map((r) => [+r.getAttribute('r'), r]));
    const styleOf = (col, row) => {
      for (let r = row - 1; r > info.head; r--) {
        const re = rowEl.get(r); if (!re) continue;
        const c = Array.from(re.getElementsByTagName('c')).find((x) => refParts(x.getAttribute('r')).col === col);
        if (c && c.getAttribute('s')) return c.getAttribute('s');
      }
      return null;
    };
    const skipped = [];
    for (const w of cells) {
      let r = rowEl.get(w.row);
      if (!r) {
        r = doc.createElementNS(ns, 'row'); r.setAttribute('r', String(w.row));
        const after = Array.from(rowEl.keys()).filter((n) => n > w.row).sort((a, b) => a - b)[0];
        sheetData.insertBefore(r, after ? rowEl.get(after) : null); rowEl.set(w.row, r);
      }
      const ref = colName(w.col) + w.row;
      const list = Array.from(r.getElementsByTagName('c'));
      let c = list.find((x) => x.getAttribute('r') === ref);
      if (c && c.getElementsByTagName('f').length) { skipped.push(ref); continue; } // формулу не трогаем
      if (!c) {
        c = doc.createElementNS(ns, 'c'); c.setAttribute('r', ref);
        const s = styleOf(w.col, w.row); if (s) c.setAttribute('s', s);
        r.insertBefore(c, list.find((x) => refParts(x.getAttribute('r')).col > w.col) || null);
      }
      while (c.firstChild) c.removeChild(c.firstChild);
      if (w.num !== undefined) {
        c.removeAttribute('t');
        const v = doc.createElementNS(ns, 'v'); v.textContent = String(w.num); c.appendChild(v);
      } else if (!w.text) {
        c.removeAttribute('t');
      } else {
        c.setAttribute('t', 'inlineStr');
        const is = doc.createElementNS(ns, 'is'); const t = doc.createElementNS(ns, 't');
        t.setAttributeNS(NS_XML, 'xml:space', 'preserve'); t.textContent = w.text;
        is.appendChild(t); c.appendChild(is);
      }
    }
    book.zip.file(sheet.path, new XMLSerializer().serializeToString(doc), { createFolders: false });
    const bytes = await book.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { bytes, skipped };
  }

  root.Avr = { open, readSheet, matchItems, write, colName, norm };
})(typeof window !== 'undefined' ? window : globalThis);

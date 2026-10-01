// Ядро «Сборщика»: чтение реестра и личных файлов, сборка личного листа, контроль сроков, свод.
// Работает и в браузере (window.Core), и в Node (module.exports). ExcelJS передаётся снаружи.
(function (root) {
  'use strict';

  const REPORT_SHEET = 'Отчёт';
  const SECTION = {
    memo: { no: 1, title: '1. ПОРУЧЕНИЯ ПО МЕМО', re: /^1\.\s*ПОРУЧЕНИЯ/ },
    ros: { no: 2, title: '2. РОС', re: /^2\.\s*РОС/ },
    proj: { no: 3, title: '3. ТЕКУЩИЕ ПРОЕКТЫ', re: /^3\.\s*ТЕКУЩИЕ/ },
    upc: { no: 4, title: '4. МЕРОПРИЯТИЯ УПЦ (Я ДОКЛАДЧИК)', re: /^4\.\s*МЕРОПРИЯТИЯ/ },
  };
  const FREE_HEADER = ['№', 'Задача', 'Статус', 'Ответственные', 'Срок', '% выполнения'];
  const MEMO_HEADER = ['№', 'Поручение', 'Пояснение (заполнить)', 'Ответственные', 'Срок', 'Выполнено? (выбрать)', 'Моя роль'];
  const UPC_HEADER = ['№', 'Мероприятие', 'Пояснение (заполнить)', 'Ответственный исполнитель', 'Срок', 'Выполнено? (выбрать)', 'Показатель'];
  // Колонки, которые руководитель заполняет в блоках 1 и 4: пояснение (C) и отметка из списка (F).
  const TEXT_COL = 3;
  const FLAG_COL = 6;
  const FLAGS = ['выполнено', 'не выполнено'];
  const MAX_COLS = 12;
  // Служебный ключ строки (связь с реестром) лежит в скрытой колонке N — руководитель его не видит.
  const KEY_COL = 14;
  const COL_WIDTHS = [9, 58, 58, 28, 13, 15, 16, 14, 14, 14, 14, 14];
  const FREE_BLANK_ROWS = 5;

  // Только готовые формы: «выполнено», «проведена», «снято»; «завершение», «выполняется» не считаются.
  const DONE_WORD = '(выполнен|проведен|исполнен|завершен|снят|закрыт)(о|а|ы)?(?![а-яё])';
  const DONE_RE = new RegExp('(^|[^а-яё])' + DONE_WORD, 'i');
  const NOT_DONE_RE = new RegExp('(^|[^а-яё])не\\s+' + DONE_WORD, 'i');

  // ---------- значения ячеек ----------
  function cellVal(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
      if ('result' in v || 'formula' in v || 'sharedFormula' in v) return cellVal(v.result);
      if ('text' in v) return cellVal(v.text);
      if ('error' in v) return null;
      return null;
    }
    if (typeof v === 'string') return v.replace(/ /g, ' ');
    return v;
  }
  function txt(v) {
    v = cellVal(v);
    if (v === null) return '';
    if (v instanceof Date) return fmtDate(v);
    return String(v).trim();
  }
  function isEmpty(v) {
    v = cellVal(v);
    return v === null || (typeof v === 'string' && v.trim() === '');
  }
  function fmtDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
  }
  // Срок: дата (Date или «дд.мм.гггг») или null, если это текст вроде «постоянно».
  function asDate(v) {
    v = cellVal(v);
    if (v instanceof Date) return v;
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    }
    return null;
  }
  function normName(s) {
    return txt(s).toLowerCase().replace(/ё/g, 'е').replace(/[\s ]+/g, '');
  }
  function splitNames(s) {
    return txt(s).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  }
  // Ключ поручения: номер из реестра, а если его нет — отпечаток текста.
  function itemKey(num, text) {
    num = txt(num);
    if (num) return num;
    const t = txt(text).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
    return 'т' + h.toString(36);
  }
  function isDone(text) {
    text = txt(text);
    return DONE_RE.test(text) && !NOT_DONE_RE.test(text);
  }

  // ---------- контроль срока ----------
  // code: closed | done | overdue | check | work | nodate
  // flag — отметка руководителя из списка: «выполнено» / «не выполнено» / пусто.
  // Если отметки нет, смотрим на слово «выполнено» в пояснении (как было раньше).
  function normFlag(v) {
    const t = txt(v).toLowerCase().replace(/\s+/g, ' ');
    if (!t) return '';
    if (/^не /.test(t)) return 'не выполнено';
    return isDone(t) ? 'выполнено' : '';
  }
  function control(status, mark, deadline, today, flag) {
    if (isDone(mark)) return { code: 'closed', label: 'закрыто' };
    if (flag === 'выполнено' || (flag !== 'не выполнено' && isDone(status))) return { code: 'done', label: 'выполнено' };
    const d = asDate(deadline);
    const hasStatus = txt(status) !== '';
    if (d) {
      if (d.getTime() < today.getTime()) {
        return hasStatus
          ? { code: 'check', label: 'срок прошёл — проверить' }
          : { code: 'overdue', label: 'просрочено, нет статуса' };
      }
      return { code: 'work', label: 'в работе' };
    }
    return { code: 'nodate', label: hasStatus ? 'в работе, без даты' : 'без даты' };
  }
  function todayUTC(d) {
    d = d || new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  // ---------- реестр ----------
  function findHeader(ws, mustHave, maxRow) {
    for (let r = 1; r <= Math.min(ws.rowCount, maxRow || 30); r++) {
      const row = ws.getRow(r);
      const cells = [];
      for (let c = 1; c <= Math.max(row.cellCount, 1); c++) cells.push(txt(row.getCell(c).value));
      if (mustHave.every((h) => cells.some((x) => x.toLowerCase().startsWith(h.toLowerCase())))) {
        const col = (h) => cells.findIndex((x) => x.toLowerCase().startsWith(h.toLowerCase())) + 1;
        return { row: r, col };
      }
    }
    return null;
  }

  function parseRegistry(wb) {
    const errors = [];
    const out = { memo: [], upc: [], people: [], kpi: [], errors };

    const wsP = wb.getWorksheet('Руководители');
    if (!wsP) errors.push('В реестре нет листа «Руководители».');
    else {
      const h = findHeader(wsP, ['ФИО', 'Файл']);
      if (!h) errors.push('На листе «Руководители» не найдена шапка «ФИО | Файл».');
      else {
        const cFull = h.col('Полное');
        for (let r = h.row + 1; r <= wsP.rowCount; r++) {
          const row = wsP.getRow(r);
          const fio = txt(row.getCell(h.col('ФИО')).value);
          const file = txt(row.getCell(h.col('Файл')).value);
          if (!fio) continue;
          out.people.push({
            fio,
            file: file || fio.split(/\s+/)[0] + '.xlsx',
            full: cFull > 0 ? txt(row.getCell(cFull).value) : '',
            key: normName(fio),
          });
        }
      }
    }

    const wsM = wb.getWorksheet('Мемо');
    if (!wsM) errors.push('В реестре нет листа «Мемо».');
    else {
      const h = findHeader(wsM, ['Поручение', 'Ответственный', 'Срок']);
      if (!h) errors.push('На листе «Мемо» не найдена шапка (Поручение, Ответственный, Срок).');
      else {
        const c = {
          id: Math.max(h.col('№'), h.col('ID')), date: h.col('Дата'), text: h.col('Поручение'), resp: h.col('Ответственный'),
          co: h.col('Соисполн'), due: h.col('Срок'), mark: h.col('Отметка'),
        };
        for (let r = h.row + 1; r <= wsM.rowCount; r++) {
          const row = wsM.getRow(r);
          const g = (k) => (c[k] > 0 ? cellVal(row.getCell(c[k]).value) : null);
          const text = txt(g('text'));
          if (!text) continue;
          out.memo.push({
            id: itemKey(g('id'), text), num: txt(g('id')), row: r, markCol: c.mark, date: g('date'), text, resp: txt(g('resp')), co: txt(g('co')),
            due: g('due'), mark: txt(g('mark')),
          });
        }
      }
    }

    const wsU = wb.getWorksheet('План УПЦ');
    if (wsU) {
      const h = findHeader(wsU, ['Мероприятие', 'Докладчик']);
      if (!h) errors.push('На листе «План УПЦ» не найдена шапка (Мероприятие, Докладчик).');
      else {
        const c = {
          id: Math.max(h.col('Код'), h.col('ID')), kpi: h.col('Показатель'), block: h.col('Блок'), text: h.col('Мероприятие'),
          resp: h.col('Ответственный'), due: h.col('Срок'), note: h.col('Примечан'),
          speaker: h.col('Докладчик'), status: h.col('Статус'),
        };
        for (let r = h.row + 1; r <= wsU.rowCount; r++) {
          const row = wsU.getRow(r);
          const g = (k) => (c[k] > 0 ? cellVal(row.getCell(c[k]).value) : null);
          const text = txt(g('text'));
          if (!text) continue;
          out.upc.push({
            id: itemKey(g('id'), text), block: txt(g('block')), kpi: txt(g('kpi')), text, resp: txt(g('resp')),
            due: g('due'), note: txt(g('note')), speaker: txt(g('speaker')), manualStatus: txt(g('status')),
          });
        }
      }
    }

    const wsK = wb.getWorksheet('Показатели УПЦ');
    if (wsK) {
      const h = findHeader(wsK, ['Показатель', 'Цель']);
      if (h) {
        const c = {
          kpi: h.col('Показатель'), goal: h.col('Цель'), stretch: h.col('Напряж'), team: h.col('Команда'),
          leader: h.col('Лидер'), unit: h.col('Ед'), top3: h.col('ТОП'),
        };
        for (let r = h.row + 1; r <= wsK.rowCount; r++) {
          const row = wsK.getRow(r);
          const g = (k) => (c[k] > 0 ? txt(row.getCell(c[k]).value) : '');
          if (!g('kpi')) continue;
          out.kpi.push({
            kpi: g('kpi'), goal: g('goal'), stretch: g('stretch'), team: g('team'), leader: g('leader'),
            unit: g('unit'), top3: g('top3'),
          });
        }
      }
    }
    return out;
  }

  function surname(fio) {
    return normName(txt(fio).split(/\s+/)[0]);
  }

  // Поручения и мероприятия, которые должны стоять в личном файле человека.
  function itemsForPerson(reg, person, today) {
    const key = person.key;
    const memo = [];
    for (const m of reg.memo) {
      const isResp = normName(m.resp) === key;
      const isCo = !isResp && splitNames(m.co).some((n) => normName(n) === key);
      if (!isResp && !isCo) continue;
      memo.push({ ...m, role: isResp ? 'ответственный' : 'соисполнитель' });
    }
    const upc = reg.upc.filter((u) => normName(u.speaker) === key);
    const sn = surname(person.fio);
    const kpi = reg.kpi.filter((k) => normName(k.team).includes(sn) || normName(k.leader).includes(sn))
      .map((k) => ({ ...k, isLeader: normName(k.leader).includes(sn) }));
    return { memo, upc, kpi };
  }

  // ---------- личный файл: чтение ----------
  function rowValues(ws, r) {
    const row = ws.getRow(r);
    const vals = [];
    for (let c = 1; c <= MAX_COLS; c++) vals.push(cellVal(row.getCell(c).value));
    while (vals.length && isEmpty(vals[vals.length - 1])) vals.pop();
    return vals;
  }

  function sectionOf(ws, r) {
    const a = txt(ws.getCell(r, 1).value).toUpperCase();
    for (const k of Object.keys(SECTION)) if (SECTION[k].re.test(a)) return k;
    return null;
  }

  function parsePersonal(wb) {
    const ws = wb.getWorksheet(REPORT_SHEET) || wb.worksheets[0];
    const res = emptyParsed();
    if (!ws) {
      res.errors.push('В файле нет листа «Отчёт».');
      return res;
    }
    const starts = {};
    for (let r = 1; r <= ws.rowCount; r++) {
      const s = sectionOf(ws, r);
      if (s && !starts[s]) starts[s] = r;
    }
    const missing = Object.keys(SECTION).filter((k) => !starts[k]);
    if (missing.length) {
      res.errors.push('Не найдены заголовки блоков: ' + missing.map((k) => '«' + SECTION[k].title + '»').join(', ') +
        '. Названия блоков в колонке A менять нельзя.');
      return res;
    }
    const order = Object.keys(starts).sort((a, b) => starts[a] - starts[b]);
    order.forEach((k, i) => {
      const from = starts[k] + 2; // заголовок блока + шапка таблицы
      const to = i + 1 < order.length ? starts[order[i + 1]] - 1 : ws.rowCount;
      for (let r = from; r <= to; r++) {
        if (k === 'memo' || k === 'upc') {
          const id = txt(ws.getCell(r, KEY_COL).value);
          if (id) {
            res[k][id] = txt(ws.getCell(r, TEXT_COL).value);
            res[k + 'Flag'][id] = normFlag(ws.getCell(r, FLAG_COL).value);
          }
          continue;
        }
        const vals = rowValues(ws, r);
        if (!vals.length) continue;
        {
          res[k].push(vals);
        }
      }
    });
    for (const w of wb.worksheets) {
      if (w === ws) continue;
      const rows = [];
      for (let r = 1; r <= w.rowCount; r++) rows.push(rowValues(w, r));
      while (rows.length && !rows[rows.length - 1].length) rows.pop();
      if (rows.length) res.appendix.push({ name: w.name, rows });
    }
    return res;
  }

  // ---------- личный файл: сборка листа «Отчёт» ----------
  const COLORS = {
    title: 'FF1F3A5F', titleFont: 'FFFFFFFF', head: 'FFDCE6F1', yellow: 'FFFFF2CC', sub: 'FFF2F2F2', border: 'FFBFBFBF',
  };
  const thin = { style: 'thin', color: { argb: COLORS.border } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

  function estHeight(vals) {
    let lines = 1;
    vals.forEach((v, i) => {
      const s = v instanceof Date ? '00.00.0000' : txt(v);
      if (!s) return;
      const w = COL_WIDTHS[i] || 14;
      const n = s.split('\n').reduce((acc, part) => acc + Math.max(1, Math.ceil(part.length / (w * 1.05))), 0);
      lines = Math.max(lines, n);
    });
    return Math.min(409, Math.max(15, lines * 14.5));
  }

  function buildReportSheet(ExcelJS, wb, person, data) {
    const old = wb.getWorksheet(REPORT_SHEET);
    let orderNo = 0;
    if (old) {
      orderNo = old.orderNo;
      wb.removeWorksheet(old.id);
    }
    const ws = wb.addWorksheet(REPORT_SHEET, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    if (old) ws.orderNo = orderNo;
    else ws.orderNo = Math.min(0, ...wb.worksheets.map((w) => w.orderNo)) - 1;

    COL_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getColumn(KEY_COL).hidden = true;
    let r = 1;
    const put = (vals, style) => {
      const row = ws.getRow(r);
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v === '' ? null : v;
        cell.alignment = { wrapText: true, vertical: 'top' };
        if (v instanceof Date) cell.numFmt = 'dd.mm.yyyy';
        if (style) style(cell, i);
      });
      row.height = estHeight(vals);
      r++;
      return row;
    };

    put([person.fio.toUpperCase() + ' — отчёт к совещанию первой линейки'], (c) => (c.font = { bold: true, size: 14 }));
    ws.mergeCells(1, 1, 1, 7);
    put(['Блоки 1 и 4: заполняйте только жёлтые ячейки — пояснение и «Выполнено?» (выбрать из списка). ' +
      'Блоки 2 и 3: правьте текст в строках, новые задачи пишите в пустые строки, ненужную строку просто очистите. ' +
      'Вставлять и удалять строки нельзя — лист защищён. Выполненное помощник уберёт сам после совещания.'],
    (c) => (c.font = { italic: true, size: 9, color: { argb: 'FF595959' } }));
    ws.mergeCells(2, 1, 2, 7);
    ws.getRow(2).height = 40;
    r++;

    const title = (sec) => {
      put([SECTION[sec].title], (c) => {
        c.font = { bold: true, color: { argb: COLORS.titleFont }, size: 12 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.title } };
      });
      ws.mergeCells(r - 1, 1, r - 1, 7);
      ws.getRow(r - 1).height = 20;
    };
    const header = (cols) => put(cols, (c) => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.head } };
      c.border = BORDER;
    });
    const unlock = (c) => (c.protection = { locked: false });
    const yellow = (c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.yellow } };
      unlock(c);
    };
    // Строка блоков 1 и 4: открыты только пояснение и отметка из списка.
    const itemRow = (vals, key, flag) => {
      const row = put(vals, (c, i) => {
        c.border = BORDER;
        if (i === TEXT_COL - 1 || i === FLAG_COL - 1) yellow(c);
      });
      const f = row.getCell(FLAG_COL);
      f.value = flag || null;
      f.alignment = { vertical: 'top', horizontal: 'center' };
      f.dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"' + FLAGS.join(',') + '"'],
        showErrorMessage: true, errorTitle: 'Выберите из списка', error: 'Можно выбрать «выполнено» или «не выполнено».',
      };
      row.getCell(KEY_COL).value = key;
      return row;
    };
    // Строка блоков 2 и 3: открыта целиком, чтобы править и дописывать.
    const freeRow = (vals, style) => put(ensureCols(vals, MAX_COLS), (c, i) => {
      if (i < 7) c.border = BORDER;
      unlock(c);
      if (style) style(c);
    });
    const ensureCols = (vals, n) => {
      const out = vals.slice();
      while (out.length < n) out.push('');
      return out;
    };

    // 1. Мемо
    title('memo');
    header(MEMO_HEADER);
    if (!data.memo.length) put(['Открытых поручений нет'], (c) => (c.font = { italic: true, color: { argb: 'FF808080' } }));
    data.memo.forEach((m, i) => {
      const people = m.resp + (m.co ? '\nСоисп.: ' + m.co : '');
      itemRow([i + 1, m.text, data.memoStatus[m.id] || '', people, m.due === null ? '' : m.due, '', m.role], m.id, data.memoFlag[m.id]);
    });
    r++;

    // 2–3. РОС и текущие проекты — свободные блоки
    for (const sec of ['ros', 'proj']) {
      title(sec);
      header(FREE_HEADER);
      for (const vals of data[sec]) {
        const isSub = !isEmpty(vals[0]) && vals.slice(1).every(isEmpty) && !/^\d+\.?$/.test(txt(vals[0]));
        freeRow(vals, (c) => {
          if (isSub) {
            c.font = { bold: true };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sub } };
          }
        });
      }
      for (let i = 0; i < FREE_BLANK_ROWS; i++) freeRow([]);
      r++;
    }

    // 4. УПЦ
    title('upc');
    header(UPC_HEADER);
    if (!data.upc.length) put(['Мероприятий, где вы докладчик, нет'], (c) => (c.font = { italic: true, color: { argb: 'FF808080' } }));
    data.upc.forEach((u, i) => {
      itemRow([i + 1, u.text, data.upcStatus[u.id] || '', u.resp, u.due === null ? '' : u.due, '', u.kpi], u.id, data.upcFlag[u.id]);
    });
    // Защита без пароля: от случайных правок. Можно менять ширину колонок и высоту строк, нельзя вставлять и удалять.
    ws.sheetProtection = { sheet: true, formatColumns: true, formatRows: true, selectLockedCells: true, selectUnlockedCells: true };
    return ws;
  }

  // Полный цикл обновления личного файла. Возвращает {wb, added, removed, kept}.
  function refreshPersonal(ExcelJS, wb, person, reg, parsed) {
    const items = itemsForPerson(reg, person);
    const memoOpen = items.memo.filter((m) => !isDone(m.mark));
    const before = new Set(Object.keys(parsed.memo));
    const after = new Set(memoOpen.map((m) => m.id));
    buildReportSheet(ExcelJS, wb, person, {
      memo: memoOpen, upc: items.upc, ros: parsed.ros, proj: parsed.proj,
      memoStatus: parsed.memo, upcStatus: parsed.upc, memoFlag: parsed.memoFlag || {}, upcFlag: parsed.upcFlag || {},
    });
    return {
      added: [...after].filter((id) => !before.has(id)),
      removed: [...before].filter((id) => !after.has(id)),
      total: after.size,
    };
  }

  function emptyParsed() {
    return { memo: {}, upc: {}, memoFlag: {}, upcFlag: {}, ros: [], proj: [], errors: [], appendix: [] };
  }

  // ---------- сборка общей модели для экрана ----------
  // files: { [fileName]: { parsed, modified: Date } | { missing: true } | { error } }
  function collect(reg, files, today) {
    const people = reg.people.map((p) => {
      const f = files[p.file] || { missing: true };
      const parsed = f.parsed || emptyParsed();
      const items = itemsForPerson(reg, p);
      const memo = items.memo.map((m) => {
        const status = parsed.memo[m.id] || '';
        const flag = (parsed.memoFlag || {})[m.id] || '';
        return { ...m, status, flag, ctl: control(status, m.mark, m.due, today, flag) };
      });
      const upc = items.upc.map((u) => ({ ...u, status: parsed.upc[u.id] || '', flag: (parsed.upcFlag || {})[u.id] || '' }));
      const resp = memo.filter((m) => m.role === 'ответственный');
      const counts = { total: 0, done: 0, overdue: 0, check: 0, work: 0, empty: 0 };
      for (const m of resp) {
        if (m.ctl.code === 'closed') continue;
        counts.total++;
        if (m.ctl.code === 'done') counts.done++;
        else if (m.ctl.code === 'overdue') counts.overdue++;
        else if (m.ctl.code === 'check') counts.check++;
        else counts.work++;
        if (!m.status && !m.flag && m.ctl.code !== 'done') counts.empty++;
      }
      return {
        ...p, modified: f.modified || null, missing: !!f.missing, error: f.error || (parsed.errors[0] || ''),
        memo, upc, kpi: items.kpi, ros: parsed.ros, proj: parsed.proj, appendix: parsed.appendix, counts,
      };
    });
    const byKey = {};
    people.forEach((p) => (byKey[p.key] = p));
    const memo = reg.memo.map((m) => {
      const owner = byKey[normName(m.resp)];
      const parsed = owner && files[owner.file] && files[owner.file].parsed;
      const status = parsed ? parsed.memo[m.id] || '' : '';
      const flag = parsed ? (parsed.memoFlag || {})[m.id] || '' : '';
      return { ...m, status, flag, inList: !!owner, ctl: control(status, m.mark, m.due, today, flag) };
    });
    const upc = reg.upc.map((u) => {
      const owner = byKey[normName(u.speaker)];
      const parsed = owner && files[owner.file] && files[owner.file].parsed;
      const fromFile = parsed ? parsed.upc[u.id] || '' : '';
      const flag = parsed ? (parsed.upcFlag || {})[u.id] || '' : '';
      return { ...u, status: owner ? fromFile : u.manualStatus, flag, fromFile: !!owner };
    });
    return { people, memo, upc, kpi: reg.kpi, today };
  }

  // ---------- свод в Excel ----------
  const CTL_FILL = {
    closed: 'FFC6EFCE', done: 'FFC6EFCE', check: 'FFFFEB9C', overdue: 'FFFFC7CE', work: 'FFFFFFFF', nodate: 'FFFFFFFF',
  };
  function buildSummary(ExcelJS, model) {
    const wb = new ExcelJS.Workbook();
    const table = (ws, headers, widths, rows, fillCol) => {
      widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
      const h = ws.addRow(headers);
      h.eachCell((c) => {
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.head } };
        c.border = BORDER;
        c.alignment = { wrapText: true, vertical: 'top' };
      });
      for (const { vals, fill } of rows) {
        const row = ws.addRow(vals.map((v) => (v === null || v === undefined ? '' : v)));
        row.eachCell({ includeEmpty: true }, (c, i) => {
          c.border = BORDER;
          c.alignment = { wrapText: true, vertical: 'top' };
          if (c.value instanceof Date) c.numFmt = 'dd.mm.yyyy';
          if (fill && i === fillCol) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        });
        row.height = estHeight(vals.map((v, i) => (widths[i] ? String(txt(v)).slice(0, 2000) : '')));
      }
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    };

    const wsS = wb.addWorksheet('Кто обновил');
    table(wsS, ['Руководитель', 'Файл изменён', 'Поручений (отв.)', 'Выполнено', 'Просрочено', 'Срок прошёл', 'Без статуса'],
      [24, 18, 16, 12, 12, 12, 12],
      model.people.map((p) => ({
        vals: [p.fio, p.missing ? 'нет файла' : p.modified ? fmtDateTime(p.modified) : '', p.counts.total, p.counts.done,
          p.counts.overdue, p.counts.check, p.counts.empty],
      })));

    const wsM = wb.addWorksheet('Мемо');
    table(wsM, ['Дата совещания', 'Поручение', 'Ответственный', 'Соисполнители', 'Срок', 'Статус', 'Отметка секретаря', 'Контроль срока'],
      [13, 60, 18, 22, 12, 60, 18, 20],
      model.memo.map((m) => ({
        vals: [m.date, m.text, m.resp, m.co, m.due, m.status, m.mark, m.ctl.label],
        fill: CTL_FILL[m.ctl.code],
      })), 8);

    const wsU = wb.addWorksheet('План УПЦ');
    table(wsU, ['Показатель', 'Мероприятие', 'Ответственный исполнитель', 'Срок', 'Докладчик', 'Статус'],
      [26, 60, 26, 14, 18, 60],
      model.upc.map((u) => ({ vals: [u.kpi, u.text, u.resp, u.due, u.speaker || '—', u.status] })));

    for (const p of model.people) {
      const ws = wb.addWorksheet(p.fio.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
      ws.getColumn(1).width = 9;
      const rows = [];
      const sec = (t) => rows.push({ vals: [t], fill: 'FFDCE6F1' });
      sec('Поручения по Мемо');
      p.memo.filter((m) => m.ctl.code !== 'closed').forEach((m, i) => rows.push({
        vals: [i + 1, m.text, m.status, m.role, m.due, m.ctl.label], fill: CTL_FILL[m.ctl.code],
      }));
      sec('РОС');
      p.ros.forEach((v) => rows.push({ vals: v }));
      sec('Текущие проекты');
      p.proj.forEach((v) => rows.push({ vals: v }));
      sec('Мероприятия УПЦ');
      p.upc.forEach((u, i) => rows.push({ vals: [i + 1, u.text, u.status, u.resp, u.due, u.kpi] }));
      table(ws, ['№', 'Задача', 'Статус', 'Ответственные / роль', 'Срок', 'Контроль / прочее'],
        [9, 55, 60, 24, 12, 18], rows.map((x) => ({ vals: x.vals, fill: x.fill })), 6);
    }
    return wb;
  }
  function fmtDateTime(d) {
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // Помощник подтвердил выполненные — пишем отметку в реестр, при рассылке они уйдут из личных файлов.
  function closeInRegistry(wb, reg, ids, label) {
    const ws = wb.getWorksheet('Мемо');
    let n = 0;
    for (const m of reg.memo) {
      if (!ids.includes(m.id) || m.markCol <= 0) continue;
      const cell = ws.getCell(m.row, m.markCol);
      const old = txt(cell.value);
      cell.value = old ? old + '; ' + label : label;
      n++;
    }
    return n;
  }

  const Core = {
    REPORT_SHEET, SECTION, cellVal, txt, isEmpty, fmtDate, fmtDateTime, asDate, normName, splitNames, isDone,
    control, normFlag, todayUTC, itemKey, closeInRegistry, parseRegistry, itemsForPerson, parsePersonal, buildReportSheet, refreshPersonal,
    emptyParsed, collect, buildSummary,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);

/* global ExcelJS, Store, Model, View, Base, Avr */
// Страница помощника: реестр поручений, УПЦ, совещание, свод, письма, настройки.
(function () {
  'use strict';
  const { esc, $, $$ } = View;
  const S = {
    dir: null, reg: null, data: {}, regModified: 0, tab: 'who', person: 0, locked: false, demo: false,
    memoFilter: '', memoPerson: '', edit: null, cardDiff: null, card: null, upcPerson: '', log: [], meetFilter: '', sentFile: '',
  };
  const today = () => Model.todayISO();
  const TABS = [['who', 'Кто обновил'], ['meeting', 'Совещание'], ['memo', 'Поручения'], ['upc', 'УПЦ'], ['avr', 'План АВР'], ['plan', 'План на год'], ['out', 'Свод и письма'], ['settings', 'Настройки'], ['help', 'Как пользоваться']];

  const conn = Base.connector({ mode: 'readwrite', render: () => render(), onDir: async (dir) => { S.dir = dir; await load(); } });

  async function load() {
    const all = await Base.loadAll(S.dir);
    S.reg = all.reg; S.data = all.data; S.regModified = all.regModified ? all.regModified.getTime() : 0;
    S.restored = all.restored || [];
    if (!S.demo && !conn.readOnly && !S.restored.length) {
      Base.weeklyBackup(S.dir, S.reg);
      // статистика недели для будущих графиков: если за эту неделю записи ещё нет — записываем
      const wk = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return Model.todayISO(d); })();
      if (!(S.reg.history || []).some((x) => x.week === wk)) { Model.recordWeek(S.reg, S.data, today()); S.histPending = true; }
    }
    let unlocked = false; try { unlocked = sessionStorage.getItem('otchet.unlocked') === S.reg.settings.passHash; } catch (e) { /* нет хранилища */ }
    S.locked = !!S.reg.settings.passHash && !unlocked;
    if (!S.demo && !conn.readOnly) {
      // Отчёты руководителей с Windows: забираем из папки «Входящие»
      try {
        const r = await Base.processInbox(S.dir, S.reg, S.data);
        if (r.total) { S.log.push(...r.log); View.toast('Из «Входящих» принято отчётов: ' + r.accepted + (r.accepted < r.total ? ' (файлов было ' + r.total + ')' : ''), 'ok'); }
      } catch (e) { S.log.push('«Входящие» не обработаны: ' + e.message); }
    }
    try { S.avrSaved = (await Store.readJSON(S.dir, [Store.DATA, 'АВР', 'работа.json'])).data; } catch (e) { S.avrSaved = null; }
    render();
    snapshotSoon();
    if (S.histPending && !S.locked) { S.histPending = false; saveReg(); }
  }
  async function importFiles(list) {
    let ok = 0;
    for (const f of Array.from(list)) {
      try {
        const r = await Base.acceptReport(S.dir, S.reg, S.data, JSON.parse(await f.text()), f.name);
        S.log.push(r.msg); if (r.ok) ok++;
      } catch (e) { S.log.push(f.name + ': не читается — ' + e.message); }
    }
    View.toast('Принято отчётов: ' + ok + ' из ' + list.length + (ok < list.length ? '. Подробности — «Свод и письма» → Журнал' : ''), ok ? 'ok' : 'bad');
    render(); snapshotSoon();
  }
  // После загрузки и каждого изменения обновляем «Для директора.html» (в фоне, не чаще раза в 2 секунды).
  let snapTimer = null;
  function snapshotSoon() {
    if (S.demo || conn.readOnly) return;
    clearTimeout(snapTimer);
    snapTimer = setTimeout(async () => { S.snapOk = await Base.writeSnapshot(S.dir, S.reg, S.data); }, 2000);
  }
  async function reloadData() { if (S.dir) { await load(); View.toast('Данные обновлены', 'ok'); } }

  // Любое изменение реестра сразу записывается. Если реестр поменяли в другом месте — сначала перечитываем.
  async function saveReg(msg) {
    try {
      const cur = await Store.readBytes(S.dir, [Store.DATA, Store.REG]);
      if (S.regModified && cur.modified.getTime() > S.regModified + 1000) {
        alert('Реестр только что изменили на другом компьютере. Страница перечитает его — повторите последнее действие.');
        await load(); return false;
      }
      await Store.dailyBackup(S.dir, [Store.DATA, Store.REG], 'реестр', 30);
      await Store.writeJSON(S.dir, [Store.DATA, Store.REG], S.reg);
      const after = await Store.readBytes(S.dir, [Store.DATA, Store.REG]);
      S.regModified = after.modified.getTime();
      snapshotSoon();
      if (msg) View.toast(msg, 'ok');
      return true;
    } catch (e) { View.toast('Реестр не записан: ' + e.message, 'bad'); return false; }
  }

  // ---------- отрисовка ----------
  function render() {
    const main = $('#main');
    $('#tabs').innerHTML = S.reg && !S.locked ? TABS.map(([k, t]) => '<button data-tab="' + k + '" class="' + (S.tab === k ? 'active' : '') + '">' + t + '</button>').join('') : '';
    $('#folder').textContent = S.dir ? (S.demo ? 'Демо-данные (вымышленные)' : 'Папка: ' + S.dir.name) : '';
    if (!S.dir || !S.reg) {
      main.innerHTML = conn.screen('Помощник: отчёт первой линейки', 'Выберите общую папку «Отчёт первой линейки» (в ней папка «Данные»).', true);
      return;
    }
    if (S.locked) {
      main.innerHTML = '<div class="panel empty-state"><h2>Введите пароль помощника</h2><div class="row center"><input type="password" id="pass" autofocus><button class="primary" data-act="unlock">Войти</button></div></div>';
      setTimeout(() => $('#pass') && $('#pass').focus(), 0);
      return;
    }
    const views = { who: whoTab, meeting: meetingTab, memo: memoTab, upc: upcTab, avr: avrTab, plan: planTab, out: outTab, settings: settingsTab, help: helpTab };
    main.innerHTML = views[S.tab]();
    if (S.tab === 'meeting') View.hydrateAttachments(main, S.dir, S.reg);
    View.autoGrow(main);
  }

  // Повреждённые файлы, открытые из архивной копии, и напоминание о копии на компьютер
  function safetyPanel() {
    let h = '';
    if (S.restored && S.restored.length) {
      h += '<div class="panel msg bad"><b>Найдены повреждённые файлы — открыты последние исправные копии из архива.</b> Ничего не потеряно, кроме изменений после времени копии.<ul>' +
        S.restored.map((r, i) => '<li>' + esc(r.what) + ' — копия «' + esc(r.from) + '» <button class="mini primary" data-restore="' + i + '">Вернуть эту копию на место</button></li>').join('') + '</ul></div>';
    }
    const last = S.reg.settings.lastExport || 0;
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    if (!S.demo && (days === null || days >= 14)) {
      h += '<div class="panel msg warn row between"><span>' + (days === null ? 'Копии данных на ваш компьютер ещё не было.' : 'Копия данных на ваш компьютер делалась ' + days + ' дн. назад.') +
        ' Это страховка на случай, если что-то случится с самой сетевой папкой.</span><button data-act="exportZip">Скачать копию данных</button></div>';
    }
    return h;
  }
  function whoTab() {
    const st = S.reg.settings;
    const stale = Model.reportPeople(S.reg).filter((p) => Model.personView(S.reg, S.data, p.id, today()).fresh !== 'fresh');
    return '<div class="panel"><div class="row between"><div><h2>Кто обновил отчёт</h2><div class="muted small">Зелёный — руководитель указал дату актуальности позже последнего совещания. ' +
      'Дату ставит сам руководитель, поэтому ваши действия на неё не влияют.</div></div>' +
      '<div class="row"><label class="small">Последнее совещание <input type="date" id="lastMeeting" value="' + esc(st.lastMeeting || '') + '"></label>' +
      '<button data-act="meetingToday">Совещание прошло сегодня</button><button data-act="reload">Обновить</button></div></div>' +
      '<div class="msg ' + (stale.length ? 'bad' : 'ok') + '" style="margin-top:10px">' + (stale.length ? 'Не обновили: ' + stale.map((p) => esc(p.fio)).join(', ') : 'Все обновили отчёт') + '</div>' +
      '<div class="row">' + (stale.length ? '<button data-act="remind">Написать напоминание не обновившим</button>' : '') +
      '<label class="button">Загрузить отчёты из файлов (присланные по почте)<input type="file" id="importFiles" multiple hidden></label></div>' +
      '<div class="muted small">Отчёты из папки «Входящие» забираются сами, когда вы открываете эту страницу или нажимаете «Обновить».</div></div>' + safetyPanel() + avrReqPanel() + View.chartMemo(S.reg, S.data, today()) + View.whoCards(S.reg, S.data, today());
  }
  // Ход запроса итогов за квартал (АВР): кто сколько заполнил
  function avrReqPanel() {
    const r = Model.avrReq(S.reg); if (!r) return '';
    const rows = S.reg.people.map((p) => ({ p, g: Model.avrqProgress(S.reg, S.data, p.id) })).filter((x) => x.g && x.g.total);
    const left = rows.filter((x) => x.g.done < x.g.total);
    return '<div class="panel"><div class="row between"><h2>Итоги за ' + esc(r.period) + ' для АВР' + (r.due ? ' — срок ' + esc(Model.fmtISO(r.due)) : '') + '</h2>' +
      (left.length ? '<button data-act="remindAvr">Напомнить не заполнившим</button>' : '') + '</div><div class="nums">' +
      rows.map((x) => '<span class="badge ' + (x.g.done >= x.g.total ? 's-done' : x.g.done ? 's-work' : 's-fail') + '">' + esc(x.p.fio) + ': ' + x.g.done + ' из ' + x.g.total + '</span>').join('') +
      '</div><div class="muted small" style="margin-top:6px">Запрос включается и выключается в «Настройках». Заполненные итоги подставляются в «Заполнить план мероприятий (АВР)» вместо еженедельных пояснений.</div></div>';
  }

  function meetingTab() {
    const people = Model.reportPeople(S.reg);
    if (S.person >= people.length) S.person = 0;
    const p = people[S.person];
    return '<div class="people-bar">' + people.map((x, i) => '<button class="chip ' + (i === S.person ? 'active' : '') + '" data-person-idx="' + i + '">' + esc(x.fio) + '</button>').join('') +
      '<span class="tools row"><button data-act="prev">←</button><button data-act="next">→</button><button class="primary" data-act="present">На весь экран</button>' +
      '<button data-act="print">Печать</button><button data-act="printAll">Печать всех</button></span></div>' +
      View.filterChips(S.meetFilter, 'data-meetf') +
      '<div id="report">' + (p ? View.personReport(S.reg, S.data, p.id, today(), { filter: S.meetFilter }) : '') + '</div>';
  }

  // ---------- поручения ----------
  function memoForm() {
    const e = S.edit || { date: today(), text: '', resp: '', co: [], due: '' };
    const rs = Model.respsOf(e);
    return '<div class="panel form"><h2>' + (S.edit && S.edit.id ? 'Изменить поручение' : 'Новое поручение') + '</h2>' +
      '<div class="form-grid"><label>Дата совещания<input type="date" id="f_date" value="' + esc(e.date) + '"></label>' +
      '<label class="wide">Поручение' + View.ta('id="f_text"', e.text) + '</label>' +
      '<div class="wide"><div class="small muted">Ответственные — можно нескольких: у каждого будет свой статус, у поручения — общий итог «выполнили N из M» ' +
      '<button type="button" class="mini" data-act="respAll">Все на совещании</button> <button type="button" class="mini" data-act="respNone">Снять всех</button></div>' +
      '<div class="checks">' + S.reg.people.filter((p) => !p.extra || rs.includes(p.id)).map((p) => '<label class="chk"><input type="checkbox" class="f_resp" value="' + esc(p.id) + '"' + (rs.includes(p.id) ? ' checked' : '') + '>' + esc(p.fio) + '</label>').join('') + '</div>' +
      '<input id="f_respText" placeholder="Если ответственного нет в списке — впишите ФИО" value="' + esc(rs.length ? '' : e.respText || '') + '" style="margin-top:6px;min-width:320px"></div>' +
      '<label>Срок<input id="f_due" placeholder="дд.мм.гггг или «постоянно»" value="' + esc(Model.fmtISO(e.due)) + '"></label>' +
      '<div class="wide"><div class="small muted">Соисполнители</div><div class="checks">' + S.reg.people.filter((p) => !p.extra || (e.co || []).includes(p.id)).map((p) => '<label class="chk"><input type="checkbox" class="f_co" value="' + esc(p.id) + '"' + ((e.co || []).includes(p.id) ? ' checked' : '') + '>' + esc(p.fio) + '</label>').join('') + '</div></div></div>' +
      '<div class="row"><button class="primary" data-act="memoSave">' + (S.edit && S.edit.id ? 'Сохранить изменения' : 'Добавить поручение') + '</button>' + (S.edit ? '<button data-act="memoCancel">Отмена</button>' : '') + '</div></div>';
  }
  function memoTab() {
    const open = S.reg.memo.filter((m) => !m.closed).map((m) => ({ ...m, st: Model.memoStatus(S.reg, S.data, m) }));
    const cnt = Model.countFlags(open.map((m) => m.st.flag));
    const late = open.filter((m) => Model.isOverdue(m.due, m.st.flag, today())).length;
    const chip = (k, t, n) => '<button class="chip ' + (S.memoFilter === k ? 'active' : '') + '" data-mf="' + k + '">' + t + ' · ' + n + '</button>';
    const ready = open.filter((m) => Model.isFinal(m.st.flag));
    const actions = (m) => m.closed
      ? '<button class="mini" data-memo="reopen|' + esc(m.id) + '">Вернуть</button>'
      : '<button class="mini" data-memo="edit|' + esc(m.id) + '">Изменить</button><button class="mini ' + (Model.isFinal(m.st.flag) ? 'primary' : '') + '" data-memo="close|' + esc(m.id) + '">Снять с контроля</button>';
    return memoForm() +
      '<div class="panel"><div class="row between"><h2>На контроле: ' + open.length + '</h2><span class="row no-print"><button data-act="print">Печать</button></span></div>' +
      '<p class="muted small">Поручение у руководителя появляется сразу после добавления. Выполненное и неактуальное покажите на совещании, потом нажмите «Снять с контроля» — у руководителя оно исчезнет. Ошиблись — верните из списка «Снятые».</p>' +
      (ready.length ? '<div class="msg ok row between">Выполнено или неактуально: ' + ready.length + '. После совещания их можно снять.<button data-act="closeReady">Снять все выполненные и неактуальные (' + ready.length + ')</button></div>' : '') +
      '<div class="filters">' + chip('', 'Все', open.length) + chip('done', 'Выполнено', cnt.done) + chip('work', 'В работе', cnt.work) + chip('fail', 'Не выполнено', cnt.fail) +
      chip('na', 'Неактуально', cnt.na) + chip('none', 'Без статуса', cnt.none) + chip('late', 'Срок прошёл', late) + chip('closed', 'Снятые', S.reg.memo.filter((m) => m.closed).length) +
      '<select id="memoPerson"><option value="">Все ответственные</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (S.memoPerson === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('') + '</select></div>' +
      View.memoTable(S.reg, S.data, today(), { closed: S.memoFilter === 'closed', flag: S.memoFilter === 'closed' ? '' : S.memoFilter, person: S.memoPerson, actions }) + '</div>';
  }
  async function memoSave() {
    const text = $('#f_text').value.trim();
    const rs = $$('.f_resp').filter((x) => x.checked).map((x) => x.value);
    const respText = $('#f_respText').value.trim();
    if (!text) { View.toast('Впишите текст поручения', 'bad'); return; }
    if (!rs.length && !respText) { View.toast('Выберите ответственного', 'bad'); return; }
    const item = S.edit && S.edit.id ? S.reg.memo.find((m) => m.id === S.edit.id) : { id: Model.uid('m'), created: today() };
    // один ответственный — по-старому поле resp; несколько — ещё и список resps
    Object.assign(item, {
      date: $('#f_date').value || today(), text, resp: rs[0] || '', respText: rs.length ? '' : respText,
      due: Model.parseDue($('#f_due').value), co: $$('.f_co').filter((x) => x.checked).map((x) => x.value).filter((x) => !rs.includes(x)),
    });
    if (rs.length > 1) item.resps = rs; else delete item.resps;
    if (!(S.edit && S.edit.id)) { item.num = Math.max(0, ...S.reg.memo.map((m) => m.num || 0)) + 1; S.reg.memo.push(item); }
    S.edit = null;
    if (await saveReg('Поручение сохранено')) render();
  }
  async function memoAction(op, id) {
    const m = S.reg.memo.find((x) => x.id === id);
    if (op === 'edit') { S.edit = { ...m }; render(); window.scrollTo(0, 0); return; }
    if (op === 'close') {
      const st = Model.memoStatus(S.reg, S.data, m);
      if (!Model.isFinal(st.flag) && !confirm('Поручение не отмечено как выполненное. Всё равно снять с контроля?')) return;
      m.closed = { date: today(), flag: st.flag, text: st.text };
    }
    if (op === 'reopen') delete m.closed;
    if (await saveReg(op === 'close' ? 'Снято с контроля' : 'Возвращено на контроль')) render();
  }
  async function closeReady() {
    const list = S.reg.memo.filter((m) => !m.closed && Model.isFinal(Model.memoStatus(S.reg, S.data, m).flag));
    if (!confirm('Снять с контроля ' + list.length + ' поручений со статусом «выполнено» или «неактуально»?')) return;
    list.forEach((m) => { const st = Model.memoStatus(S.reg, S.data, m); m.closed = { date: today(), flag: st.flag, text: st.text }; });
    if (await saveReg('Снято: ' + list.length)) render();
  }

  // ---------- УПЦ ----------
  function upcTab() {
    const peopleOpts = (sel) => '<option value="">— помощник —</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (sel === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('');
    let h = '<div class="panel"><div class="row between"><div><h2>Показатели УПЦ</h2><div class="muted small">Карта от ' + esc(Model.fmtISO(S.reg.settings.cardDate) || '—') +
      '. «Отчитывается» — кто отвечает за показатель целиком (обычно лидер команды или его руководитель первой линейки). «Заполняет» — кто ведёт статус конкретного мероприятия.</div></div>' +
      '<span class="row"><button data-tab="avr">План мероприятий (АВР) →</button><button data-act="kpiNew">+ Показатель вручную</button><label class="button">Загрузить новую карту УПЦ (xlsx)<input type="file" id="cardFile" accept=".xlsx" hidden></label></span></div>' +
      '<div class="muted small" style="margin-top:6px">Новая карта не стирает заполненное: статусы и комментарии руководителей привязаны к коду показателя и мероприятию. Уходят только показатели, которых нет в новой карте, — перед применением список видно. ' +
      'Мероприятие можно перенести на другой показатель — список «Перенести» в строке мероприятия, статус сохранится.</div></div>';
    if (S.kpiForm) h += kpiForm();
    if (S.cardDiff) h += cardDiffPanel();
    const unassigned = S.reg.kpis.filter((k) => !k.reporter).length;
    if (unassigned) h += '<div class="msg warn">Показателей без отчитывающегося: ' + unassigned + '. Назначьте руководителя в списке «Отчитывается».</div>';
    h += '<div class="filters"><select id="upcPerson"><option value="">Все руководители</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (S.upcPerson === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('') + '</select><button data-act="print">Печать</button></div>';
    h += View.upcOverview(S.reg, S.data, today(), {
      person: S.upcPerson,
      editor: (k, evs) => '<div class="row small no-print">Отчитывается: <select data-kpi-rep="' + esc(k.id) + '">' + peopleOpts(k.reporter).replace('— помощник —', '— не назначен —') + '</select>' +
        (k.manual ? '<span class="badge s-none">добавлен вручную</span><button class="mini" data-kpiedit="' + esc(k.id) + '">Изменить</button><button class="mini danger" data-kpidel="' + esc(k.id) + '">Удалить показатель</button>' : '') + '</div>' +
        '<table class="grid"><thead><tr><th>Мероприятие</th><th class="c-resp">Исполнители</th><th class="c-due">Срок</th><th class="c-resp">Заполняет</th><th class="c-st">Статус</th><th>Пояснение</th><th class="c-act no-print"></th></tr></thead><tbody>' +
        evs.map((e) => '<tr><td>' + View.ta('data-ev="' + esc(e.id) + '|text"', e.text) + '</td><td><input data-ev="' + esc(e.id) + '|executors" value="' + esc(e.executors) + '"></td>' +
          '<td><input data-ev="' + esc(e.id) + '|due" value="' + esc(Model.fmtISO(e.due)) + '"></td><td><select data-ev="' + esc(e.id) + '|speaker">' + peopleOpts(e.speaker) + '</select></td>' +
          (e.speaker ? '<td>' + View.badge(e.st.flag) + '</td><td class="small">' + esc(e.st.text) + '</td>'
            : '<td>' + View.statusSelect('', e.st.flag, 'data-ev="' + esc(e.id) + '|mflag"') + '</td><td>' + View.ta('data-ev="' + esc(e.id) + '|mtext"', e.st.text) + '</td>') +
          '<td class="no-print"><select class="ev-move" data-ev="' + esc(e.id) + '|kpi" title="Перенести мероприятие на другой показатель"><option value="">Перенести…</option>' +
          S.reg.kpis.filter((x) => x.id !== k.id).map((x) => '<option value="' + esc(x.id) + '">' + esc(Model.shortKpi(x.name).slice(0, 60)) + '</option>').join('') + '</select>' +
          '<button class="mini danger" data-evdel="' + esc(e.id) + '">✕</button></td></tr>').join('') +
        '</tbody></table><button class="mini no-print" data-evadd="' + esc(k.id) + '">+ мероприятие</button>',
    });
    return h;
  }
  // ---------- план мероприятий (АВР): сверка статусов файла и отчёта, запись в файл и перенос в отчёт ----------
  function avrText(ev) {
    const st = Model.eventStatus(S.reg, S.data, ev);
    const label = st.flag ? Model.statusLabel(st.flag) : '';
    const cap = label ? label[0].toUpperCase() + label.slice(1) : '';
    // итог за квартал из запроса помощника важнее еженедельного пояснения
    const text = Model.avrqText(S.reg, S.data, ev, (S.reg.settings.avrReq || {}).period) || (st.text || '').trim();
    if (!text) return { rep: cap, repDone: st.flag === 'done', repFlag: st.flag };
    return { rep: cap && !text.toLowerCase().startsWith(label) ? cap + '. ' + text : text, repDone: st.flag === 'done', repFlag: st.flag };
  }
  // Статус по тексту из файла: «Выполнено…», «В работе…», «Выполняется на постоянной основе» и т. п.
  function flagFromText(t, done) {
    if (done) return 'done';
    const x = String(t || '').trim().toLowerCase();
    if (/^не выполн/.test(x)) return 'fail';
    if (/^(неактуальн|цель отменена|отменен)/.test(x)) return 'na';
    if (/^выполнено/.test(x)) return 'done';
    if (x) return 'work';
    return '';
  }
  const avrDoneCol = () => { const d = S.avr.info.doneCols; return d.find((c) => c > S.avr.statusCol) || d[d.length - 1] || 0; };
  // «В работе. Текст» и «Текст» — одно и то же: слово статуса в начале не считаем расхождением
  const bare = (t) => Avr.norm(String(t || '').trim().replace(/^(в работе|выполнено|не выполнено|неактуально|без статуса)\s*[.:—-]?\s*/i, ''));
  const same = (a, b) => Avr.norm(a) === Avr.norm(b) || (bare(a) && bare(a) === bare(b));
  // Для каждой строки: что в файле, что в отчёте, что запишем. По умолчанию заполненное в файле остаётся,
  // из отчёта подставляется только в пустые ячейки.
  function avrPrepare(row) {
    const A = S.avr; const g = A.info.grid.get(row.row) || {};
    const ev = S.reg.events.find((e) => e.id === row.eventId);
    const rep = ev && row.how !== 'cancelled' ? avrText(ev) : { rep: '', repDone: false, repFlag: '' };
    const file = (g[A.statusCol] || '').trim();
    const fileDone = String(g[avrDoneCol()] || '').trim() === '1';
    const state = !file && !rep.rep ? 'none' : !rep.rep ? 'fileonly' : !file ? 'reponly' : same(file, rep.rep) ? 'same' : 'diff';
    Object.assign(row, rep, { file, fileDone, state });
    if (row.src === 'report' && rep.rep) { row.out = rep.rep; row.done = rep.repDone || fileDone; }
    else if (row.src === 'edit') { /* оставляем, что вписали руками */ }
    else { row.src = file ? 'file' : rep.rep ? 'report' : ''; row.out = file || rep.rep; row.done = fileDone || (!file && rep.repDone); }
    return row;
  }
  // Разобрать файл; saved — сохранённая работа (выбор по строкам), чтобы продолжить с того же места
  async function avrOpen(name, bytes, saved) {
    const book = await Avr.open(bytes);
    const sheet = book.sheets.find((x) => /восточн\S*\s+сибир/i.test(x.name));
    if (!sheet) throw new Error('В файле нет листа «Дивизион "Восточная сибирь"»');
    const info = await Avr.readSheet(book, sheet);
    const statusCol = saved && info.statusCols.some((c) => c.col === saved.statusCol) ? saved.statusCol : info.statusCols[info.statusCols.length - 1].col;
    S.avr = { name, book, sheet, info, statusCol, filter: '', rows: Avr.matchItems(S.reg, info.items, S.reg.settings.avrMap, S.reg.settings.avrExcluded) };
    const ch = (saved && saved.choices) || {};
    // учимся на файле: строки, где в «Примечаниях» уже написано «Цель отменена…», запоминаем на следующие кварталы
    const learned = { ...(S.reg.settings.avrExcluded || {}) }; let fresh = 0;
    for (const r of S.avr.rows) if (r.how === 'cancelled' && !r.learned && r.note && learned[r.key] !== r.note.trim()) { learned[r.key] = r.note.trim(); fresh++; }
    if (fresh) { S.reg.settings.avrExcluded = learned; saveReg('Запомнила исключённые мероприятия из примечаний файла: ' + fresh + '. В следующем квартале они отметятся сами.'); }
    for (const r of S.avr.rows) {
      const c = ch[r.key];
      if (c) {
        if (c.how === 'manual') Object.assign(r, { eventId: c.eventId || '', how: 'manual' });
        if (c.exclude !== undefined) { r.exclude = c.exclude; if (c.exclude) r.how = 'cancelled'; else if (r.how === 'cancelled' && r.learned) { r.how = ''; r.learned = false; } }
        r.src = c.src || ''; if (c.src === 'edit') r.out = c.out || '';
      }
      avrPrepare(r);
      if (c && c.done !== undefined) r.done = c.done;
    }
  }
  async function avrLoad(file) {
    try {
      View.toast('Читаю файл…');
      const bytes = new Uint8Array(await file.arrayBuffer());
      await avrOpen(file.name, bytes, null);
      // файл и выбор сохраняем в общей папке — можно закрыть страницу и продолжить потом
      try { await Store.writeBytes(S.dir, [Store.DATA, 'АВР', 'план.xlsx'], bytes); } catch (e) { S.log.push('Файл плана не сохранился в папку: ' + e.message); }
      await avrPersist(true);
      render(); window.scrollTo(0, 0);
    } catch (e) { View.toast('Файл не прочитался: ' + e.message, 'bad'); }
  }
  async function avrResume() {
    try {
      S.avrBusy = true; render();
      const { bytes } = await Store.readBytes(S.dir, [Store.DATA, 'АВР', 'план.xlsx']);
      await avrOpen(S.avrSaved.file, bytes, S.avrSaved);
    } catch (e) { View.toast('Не получилось открыть сохранённый план: ' + e.message, 'bad'); }
    S.avrBusy = false; render();
  }
  let avrTimer = null;
  async function avrPersist(now) {
    if (!S.avr) return;
    const run = async () => {
      const choices = {};
      for (const r of S.avr.rows) choices[r.key] = { src: r.src, out: r.src === 'edit' ? r.out : undefined, done: r.done, how: r.how === 'manual' ? 'manual' : undefined, eventId: r.how === 'manual' ? r.eventId : undefined, exclude: r.exclude !== undefined ? r.exclude : undefined };
      S.avrSaved = { file: S.avr.name, statusCol: S.avr.statusCol, at: Date.now(), choices, savedFile: (S.avrSaved && S.avrSaved.file === S.avr.name && S.avrSaved.savedFile) || '' };
      try { await Store.writeJSON(S.dir, [Store.DATA, 'АВР', 'работа.json'], S.avrSaved); } catch (e) { /* без сохранения тоже работает */ }
    };
    clearTimeout(avrTimer);
    if (now) await run(); else avrTimer = setTimeout(run, 700);
  }
  function avrTab() {
    if (S.avr) return avrPanel();
    if (S.avrBusy) return '<div class="panel empty-state"><h2>Открываю сохранённый план…</h2></div>';
    const sv = S.avrSaved;
    return '<div class="panel"><h2>План мероприятий по достижению целевых показателей (АВР)</h2>' +
      (sv ? '<div class="msg ok row between"><span>В работе файл <b>' + esc(sv.file) + '</b> — сохранён ' + esc(Model.fmtDateTime(sv.at)) + '. Ваш выбор по строкам сохранён.' +
        (sv.savedFile ? ' Последний заполненный файл: <b>' + esc(sv.savedFile) + '</b>.' : '') + '</span><button class="primary" data-act="avrResume">Продолжить</button></div>' : '') +
      '<ol class="help"><li>Загрузите квартальный файл плана (с новой колонкой «Статус … кв.»).</li>' +
      '<li>Сверьте строки: что в файле, что в отчёте первой линейки. Где расходится — выберите «из файла» или «из отчёта», или поправьте текст. Всё сохраняется само, можно закрыть страницу и продолжить потом.</li>' +
      '<li>«Перенести в отчёт» — ваш итоговый текст станет статусом у руководителей.</li>' +
      '<li>«Сохранить заполненный файл» — готовый файл ляжет в папку «Своды» и в окно «Сохранить как». Его и отправляете.</li></ol>' +
      '<div class="row"><label class="button' + (sv ? '' : ' primary') + '">' + (sv ? 'Загрузить другой файл…' : 'Загрузить квартальный файл…') + '<input type="file" id="avrFile" accept=".xlsx" hidden></label></div></div>';
  }
  // Что перенести в отчёт: итоговый текст строки («Впишется в файл») отличается от статуса в отчёте
  const avrPushable = () => S.avr.rows.filter((r) => r.eventId && r.how !== 'cancelled' && r.out.trim() && !same(r.out, r.rep));
  function avrPanel() {
    const A = S.avr; const I = A.info;
    const n = (h) => A.rows.filter((r) => r.how === h).length;
    const st = (x) => A.rows.filter((r) => r.state === x).length;
    const col = (I.statusCols.find((c) => c.col === A.statusCol) || {}).title || '';
    const evOpts = (r) => {
      const own = S.reg.events.filter((e) => e.kpi === r.kpiId);
      const list = own.length ? own : S.reg.events;
      return '<option value="">— нет в отчёте —</option>' + list.map((e) => '<option value="' + esc(e.id) + '"' + (e.id === r.eventId ? ' selected' : '') + '>' + esc(e.text.slice(0, 110)) + '</option>').join('') +
        (r.eventId && !list.some((e) => e.id === r.eventId) ? '<option value="' + esc(r.eventId) + '" selected>' + esc((S.reg.events.find((e) => e.id === r.eventId) || {}).text || '') + '</option>' : '');
    };
    const chip = (k, t, c) => '<button class="chip ' + (A.filter === k ? 'active' : '') + '" data-avrf="' + k + '">' + t + ' · ' + c + '</button>';
    const push = avrPushable();
    let h = '<div class="panel"><div class="row between"><h2>План мероприятий (АВР): ' + esc(A.name) + '</h2><span class="row"><button class="primary" data-act="avrSave">Сохранить заполненный файл</button><button data-act="avrClose">Свернуть</button></span></div>' +
      '<div class="muted small">Ваш выбор сохраняется сам — можно уйти на другую вкладку или закрыть страницу и потом продолжить здесь же.' +
      (S.avrSaved && S.avrSaved.savedFile ? ' Последний заполненный файл: <b>' + esc(S.avrSaved.savedFile) + '</b>.' : '') + '</div>' +
      '<p class="muted small">Лист «' + esc(A.sheet.name) + '». Сверка: что стоит в файле в колонке «' + esc(col) + '» и что — в отчёте первой линейки. ' +
      '<b>Заполненное в файле остаётся</b>, из отчёта подставляется только в пустые ячейки. Где расходится — выберите в строке «из файла» или «из отчёта», или поправьте текст. В файле меняются только колонка статуса и «выполнено» на этом листе.</p>' +
      '<div class="row"><label class="small">Колонка статуса <select id="avrCol">' + I.statusCols.map((c) => '<option value="' + c.col + '"' + (c.col === A.statusCol ? ' selected' : '') + '>' + esc(c.title) + ' (колонка ' + Avr.colName(c.col) + ')</option>').join('') + '</select></label>' +
      '<span class="small">«выполнено» — колонка ' + (avrDoneCol() ? Avr.colName(avrDoneCol()) : '<b>не найдена</b>') + '</span>' +
      '<span class="spacer"></span><button class="mini" data-act="avrAllFile">Везде оставить из файла</button><button class="mini" data-act="avrAllRep">Везде взять из отчёта</button></div>' +
      '<div class="filters">' + chip('', 'Все', A.rows.length) + chip('diff', 'Расходятся', st('diff')) + chip('fileonly', 'Есть только в файле', st('fileonly')) + chip('reponly', 'Есть только в отчёте', st('reponly')) +
      chip('same', 'Совпадают', st('same')) + chip('none', 'Пусто везде', st('none')) + '</div>' +
      '<div class="msg ' + (n('') ? 'warn' : 'ok') + '">Найдено в отчёте: ' + (n('auto') + n('saved') + n('manual')) + (n('similar') ? ', похожих (проверьте): ' + n('similar') : '') +
      (n('cancelled') ? ', исключено (отменено): ' + n('cancelled') : '') + (n('nokpi') ? ', показателя нет в карте УПЦ: ' + n('nokpi') : '') + (n('') ? ', не найдено: ' + n('') : '') + '.</div>' +
      (push.length ? '<div class="msg ok row between"><span>Отличается от отчёта первой линейки: <b>' + push.length + '</b> строк. «Перенести в отчёт» — то, что стоит в колонке «Впишется в файл», станет статусом у руководителей ' +
        '(и там, где было пусто, и там, где вы выбрали «из файла» или поправили текст). Руководитель увидит его у себя заполненным и сможет поправить.</span>' +
        '<button class="primary" data-act="avrPush">Перенести в отчёт (' + push.length + ')</button></div>' : '<div class="msg ok">Статусы в отчёте первой линейки совпадают с тем, что впишется в файл.</div>') +
      '<table class="grid avr"><thead><tr><th class="c-no">№</th><th>Мероприятие в плане</th><th>Мероприятие в отчёте</th><th>Впишется в файл</th><th class="c-no">Вып.</th></tr></thead><tbody>';
    let kpi = null;
    const tags = { similar: '<span class="badge s-none">похоже — проверьте</span>', '': '<span class="badge s-fail">не найдено</span>', cancelled: '<span class="badge s-na">отменено</span>', nokpi: '<span class="badge s-na">показателя нет в карте</span>', manual: '<span class="badge s-work">выбрано</span>' };
    const exclBtn = (r, i) => {
      if (r.how === 'cancelled' && !r.exclude) return ''; // уже отмечено в самом файле
      if (r.exclude) return '<div class="avr-excl small">Исключено' + (r.learned ? ' (запомнено с прошлого раза)' : '') + ': в «Примечания» впишется «' + esc(r.exclude) + '» <button class="mini" data-avr-excl="' + i + '">вернуть</button></div>';
      if (r.how === '' || r.how === 'nokpi' || r.how === 'similar') return '<div><button class="mini" data-avr-excl="' + i + '">Отметить «исключено»</button></div>';
      return '';
    };
    // мероприятия отчёта, которых нет в шаблоне плана (новые после корректировки УПЦ)
    const usedEv = new Set(A.rows.map((r) => r.eventId).filter(Boolean));
    const missing = S.reg.events.filter((e) => !usedEv.has(e.id));
    const stTag = { diff: '<span class="badge s-fail">расходится</span>', fileonly: '<span class="badge s-work">только в файле</span>', reponly: '<span class="badge s-done">только в отчёте</span>' };
    A.rows.forEach((r, i) => {
      if (A.filter && r.state !== A.filter) return;
      if (r.kpi !== kpi) { kpi = r.kpi; h += '<tr class="sub"><td colspan="5">' + esc(Model.shortKpi(kpi) || '—') + '</td></tr>'; }
      const both = r.file && r.rep && !same(r.file, r.rep);
      h += '<tr class="avr-' + (r.how || 'none') + ' st-' + r.state + '"><td class="c-no">' + esc(r.num) + '</td><td class="small">' + esc(r.text) +
        (r.note ? '<div class="muted small">примечание: ' + esc(r.note.slice(0, 160)) + '</div>' : '') + '</td>' +
        '<td><select data-avr-ev="' + i + '">' + evOpts(r) + '</select> ' + (tags[r.how] || '') + ' ' + (stTag[r.state] || '') + exclBtn(r, i) +
        (both ? '<div class="avr-cmp"><div><b>В файле:</b> ' + esc(r.file.slice(0, 300)) + '</div><div><b>В отчёте:</b> ' + esc(r.rep.slice(0, 300)) + '</div></div>' : '') + '</td>' +
        '<td>' + View.ta('data-avr-text="' + i + '"', r.out) +
        (both ? '<div class="row small"><button class="mini' + (r.src === 'file' ? ' primary' : '') + '" data-avr-src="file|' + i + '">из файла</button><button class="mini' + (r.src === 'report' ? ' primary' : '') + '" data-avr-src="report|' + i + '">из отчёта</button>' + (r.src === 'edit' ? '<span class="muted">поправлено вручную</span>' : '') + '</div>' : '') +
        '</td><td class="c-no"><input type="checkbox" data-avr-done="' + i + '"' + (r.done ? ' checked' : '') + '></td></tr>';
    });
    h += '</tbody></table>';
    if (missing.length) {
      const byK = new Map(); for (const e of missing) { const k = S.reg.kpis.find((x) => x.id === e.kpi); const n = k ? Model.shortKpi(k.name) : '—'; (byK.get(n) || byK.set(n, []).get(n)).push(e); }
      h += '<details class="avr-missing"><summary>Есть в отчёте, нет в шаблоне плана: <b>' + missing.length + '</b> — новые мероприятия после корректировки УПЦ. Их нужно дописать в файл вручную</summary>' +
        Array.from(byK).map(([k, list]) => '<div class="small" style="margin-top:6px"><b>' + esc(k) + '</b><ul>' + list.map((e) => '<li>' + esc(e.text.slice(0, 200)) + ' — <i>' + esc(avrText(e).rep || 'без статуса') + '</i></li>').join('') + '</ul></div>').join('') + '</details>';
    }
    return h + '</div>';
  }
  async function avrSave() {
    const A = S.avr; const done = avrDoneCol();
    const cells = [];
    for (const r of A.rows) {
      if (r.exclude && A.info.noteCol && (r.note || '').trim() !== r.exclude) cells.push({ row: r.row, col: A.info.noteCol, text: r.exclude });
      if (r.how === 'cancelled') continue;
      if (r.out.trim() && r.out.trim() !== r.file) cells.push({ row: r.row, col: A.statusCol, text: r.out.trim() });
      if (r.done && !r.fileDone && done) cells.push({ row: r.row, col: done, num: 1 });
    }
    if (!cells.length) { View.toast('Менять в файле нечего: всё уже совпадает', 'ok'); return; }
    try {
      const { bytes, skipped } = await Avr.write(A.book, A.sheet, A.info, cells);
      const name = A.name.replace(/\.xlsx$/i, '').replace(/ — заполнено$/, '') + ' — заполнено.xlsx';
      let inFolder = false;
      if (!S.demo) { try { await Store.writeBytes(S.dir, ['Своды', name], bytes); inFolder = true; } catch (e) { S.log.push('В «Своды» не записалось: ' + e.message); } }
      const res = await View.saveFile(bytes, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', 'Excel');
      if (!res.ok && !inFolder) return;
      if (inFolder) { S.avrSaved = { ...(S.avrSaved || {}), savedFile: 'Своды/' + name }; await avrPersist(true); }
      if (!res.ok) res.name = 'Своды/' + name;
      // запоминаем, что выбрали вручную, — в следующем квартале подставится само
      const map = { ...(S.reg.settings.avrMap || {}) };
      for (const r of A.rows) if (r.how === 'manual') map[r.key] = r.eventId;
      S.reg.settings.avrMap = map;
      // исключённые строки запоминаем на следующие кварталы, снятые — забываем
      const ex = { ...(S.reg.settings.avrExcluded || {}) };
      for (const r of A.rows) { if (r.exclude) ex[r.key] = r.exclude; else if (r.exclude === '' ) delete ex[r.key]; }
      S.reg.settings.avrExcluded = ex;
      await saveReg('Файл сохранён: ' + res.name + ', изменено ячеек: ' + cells.length + (skipped.length ? '. Ячейки с формулами не тронуты: ' + skipped.join(', ') : ''));
      S.log.push('План мероприятий (АВР) заполнен: ' + res.name + ', изменено ячеек: ' + cells.length);
    } catch (e) { View.toast('Не получилось записать файл: ' + e.message, 'bad'); }
  }
  // Статус из файла — в отчёт первой линейки. Свой отчёт руководителя не трогаем: статус встаёт как стартовый,
  // руководитель видит его у себя заполненным и при следующем сохранении он становится его собственным.
  async function avrPush() {
    const list = avrPushable();
    if (!confirm('Перенести в отчёт первой линейки статусы по ' + list.length + ' мероприятиям — так, как они стоят в колонке «Впишется в файл»?')) return;
    const at = Date.now();
    for (const r of list) {
      const e = S.reg.events.find((x) => x.id === r.eventId);
      const flag = flagFromText(r.out, r.done);
      // «Выполнено. Текст» → статус «выполнено» и пояснение «Текст»
      const text = r.out.trim().replace(/^(в работе|выполнено|не выполнено|неактуально)\s*[.:—-]?\s*/i, '') || r.out.trim();
      if (e.speaker) e.override = { flag, text, at }; else e.manual = { flag, text };
    }
    if (await saveReg('Перенесено в отчёт: ' + list.length + '. Руководители увидят статусы у себя.')) { S.avr.rows.forEach(avrPrepare); render(); }
  }

  // ---------- сбор мероприятий на следующий год (Приложение 3 к приказу № 1) ----------
  const planOf = () => (S.reg.plan = S.reg.plan || { year: new Date().getFullYear() + 1, on: false, due: '', text: '', kpis: [], events: [] });
  let planTimer = null;
  const planSaveSoon = (msg) => { clearTimeout(planTimer); planTimer = setTimeout(() => saveReg(msg || ''), 700); };
  function planTab() {
    const P = planOf();
    const ppl = (sel) => '<option value="">— не назначен —</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (sel === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('');
    let h = '<div class="panel"><h2>Сбор мероприятий на ' + esc(P.year) + ' год</h2><p class="muted small">Порядок: 1) возьмите показатели и мероприятия текущего года, поправьте список и цели, добавьте новые; ' +
      '2) включите сбор — у лидеров в отчёте появится раздел «Проект на ' + esc(P.year) + ' год» с уже вписанными мероприятиями, они подтверждают или правят и могут предложить свои бизнес-инициативы; ' +
      '3) следите за ходом ниже; 4) «Выгрузить в форму Приложения 3» — Excel для управления. Текущий отчёт руководителей это не меняет.</p>' +
      '<div class="form-grid"><label>Год<input id="plan_year" type="number" value="' + esc(P.year) + '"></label>' +
      '<label>Сбор<select id="plan_on"><option value="0">выключен</option><option value="1"' + (P.on ? ' selected' : '') + '>включён</option></select></label>' +
      '<label>Срок<input type="date" id="plan_due" value="' + esc(P.due || '') + '"></label>' +
      '<label class="wide">Текст для руководителей' + View.ta('id="plan_text"', P.text || 'Прошу проверить мероприятия по своим показателям на следующий год: подтвердить или поправить, указать ответственных и сроки.') + '</label></div>' +
      '<div class="row"><button class="primary" data-act="planCfg">Сохранить</button></div></div>';
    // ход сбора
    if (P.on) {
      const rows = S.reg.people.map((p) => ({ p, g: Model.planProgress(S.reg, S.data, p.id), bi: ((S.data[p.id] && S.data[p.id].data && S.data[p.id].data.planBI) || []).length })).filter((x) => x.g.total || x.bi);
      const left = rows.filter((x) => x.g.done < x.g.total);
      h += '<div class="panel"><div class="row between"><h2>Ход сбора</h2>' + (left.length ? '<button data-act="planRemind">Напомнить не заполнившим</button>' : '') + '</div><div class="nums">' +
        rows.map((x) => '<span class="badge ' + (x.g.done >= x.g.total ? 's-done' : x.g.done ? 's-work' : 's-fail') + '">' + esc(x.p.fio) + ': ' + x.g.done + ' из ' + x.g.total + (x.bi ? ' · БИ: ' + x.bi : '') + '</span>').join('') + '</div></div>';
    }
    // показатели проекта
    h += '<div class="panel"><div class="row between"><h2>Показатели и мероприятия на ' + esc(P.year) + ' год: ' + P.kpis.length + '</h2><span class="row">' +
      '<button data-act="planCopy">Взять показатели и мероприятия текущего года</button><button data-act="planKpiAdd">+ Показатель</button>' +
      '<button class="primary" data-act="planExport">Выгрузить в форму Приложения 3</button></span></div>' +
      '<p class="muted small">Цель — для ФОП из присланной таблицы кроссфункциональных показателей. Лидер — кто проверяет мероприятия по показателю. Мероприятия ниже — то, что увидит лидер; после его ответа показывается его вариант.</p>';
    if (!P.kpis.length) h += '<div class="muted">Пока пусто. Нажмите «Взять показатели и мероприятия текущего года».</div>';
    const noLead = P.kpis.filter((k) => !k.leader).length;
    if (noLead) h += '<div class="msg warn">Без лидера: ' + noLead + ' — эти показатели в отчётах никто не увидит. Назначьте лидера в списке «Лидер».</div>';
    const PST = { '': '<span class="badge s-none">лидер ещё не смотрел</span>', ok: '<span class="badge s-done">лидер подтвердил</span>', edit: '<span class="badge s-work">лидер изменил</span>' };
    for (const k of P.kpis) {
      const f = Model.planFinal(S.reg, S.data, k);
      h += '<div class="kpi"><div class="row"><input data-pkf="' + esc(k.id) + '|name" value="' + esc(k.name) + '" style="flex:1;min-width:280px;font-weight:600">' +
        '<select data-pkf="' + esc(k.id) + '|type">' + ['ФОП', 'БИ', 'другое'].map((t) => '<option' + ((k.type || 'ФОП') === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
        '<label class="small">Цель <input data-pkf="' + esc(k.id) + '|goal" value="' + esc(k.goal || '') + '" style="width:160px"></label>' +
        '<label class="small">Лидер <select data-pkf="' + esc(k.id) + '|leader">' + ppl(k.leader) + '</select></label>' + PST[f.st || ''] +
        '<button class="mini danger" data-pkdel="' + esc(k.id) + '">✕</button></div>';
      if (f.st) {
        h += '<div class="small" style="margin-top:6px"><b>Вариант лидера:</b><ol>' + f.events.map((e) => '<li>' + esc(e.text) + (e.executors ? ' — <i>' + esc(e.executors) + '</i>' : '') + (e.due ? ' · ' + esc(Model.fmtISO(e.due)) : '') + '</li>').join('') + '</ol></div>';
      } else {
        const evs = P.events.filter((e) => e.kpi === k.id);
        h += '<details' + (evs.length ? '' : ' open') + '><summary class="small">Предложенные мероприятия: ' + evs.length + '</summary><table class="grid edit"><tbody>' +
          evs.map((e) => '<tr><td>' + View.ta('data-pef="' + esc(e.id) + '|text"', e.text) + '</td><td class="c-resp">' + View.ta('data-pef="' + esc(e.id) + '|executors"', e.executors || '') + '</td>' +
            '<td class="c-due"><input data-pef="' + esc(e.id) + '|due" value="' + esc(Model.fmtISO(e.due || '')) + '"></td><td class="c-act"><button class="mini danger" data-pedel="' + esc(e.id) + '">✕</button></td></tr>').join('') +
          '</tbody></table><button class="mini" data-peadd="' + esc(k.id) + '">+ мероприятие</button></details>';
      }
      h += '</div>';
    }
    // предложенные руководителями бизнес-инициативы
    const bis = [];
    for (const p of S.reg.people) for (const b of ((S.data[p.id] && S.data[p.id].data && S.data[p.id].data.planBI) || [])) if ((b.name || '').trim()) bis.push({ p, b });
    if (bis.length) h += '<h3 class="sec">Предложенные бизнес-инициативы: ' + bis.length + '</h3>' + bis.map(({ p, b }) => '<div class="kpi"><b>' + esc(b.name) + '</b> <span class="muted small">— ' + esc(p.fio) + '</span>' +
      (b.goal ? '<div class="small">Цель: ' + esc(b.goal) + '</div>' : '') + (b.measure ? '<div class="small">Как оцениваем: ' + esc(b.measure) + '</div>' : '') +
      '<ol class="small">' + (b.events || []).map((e) => '<li>' + esc(e.text) + (e.executors ? ' — <i>' + esc(e.executors) + '</i>' : '') + (e.due ? ' · ' + esc(Model.fmtISO(e.due)) : '') + '</li>').join('') + '</ol></div>').join('') +
      '<p class="muted small">Попадут в выгрузку в «Блок БИ».</p>';
    return h + '</div>';
  }
  // Показатели и мероприятия текущего года — основа проекта на следующий
  function planCopy() {
    const P = planOf();
    if (P.kpis.length && !confirm('В проекте уже есть показатели. Заменить их показателями и мероприятиями текущего года? Ответы лидеров по старому списку перестанут отображаться.')) return;
    const shift = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') && +d.slice(0, 4) === P.year - 1 ? P.year + d.slice(4) : d || '');
    P.kpis = []; P.events = [];
    for (const k of S.reg.kpis) {
      const id = Model.uid('P');
      P.kpis.push({ id, src: k.id, name: k.name, type: k.type || 'ФОП', goal: '', leader: k.reporter || null });
      for (const e of S.reg.events.filter((x) => x.kpi === k.id)) P.events.push({ id: Model.uid('pe'), kpi: id, text: e.text, executors: e.executors || '', due: shift(e.due) });
    }
    saveReg('Взято показателей: ' + P.kpis.length + ', мероприятий: ' + P.events.length + '. Поправьте список и цели, затем включите сбор.').then(() => render());
  }
  async function planExport() {
    const P = planOf();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Дивизион "Восточная сибирь"', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    [8.7, 71, 45, 22, 30, 40].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    const thin = { style: 'thin', color: { argb: 'FF808080' } }; const border = { top: thin, left: thin, bottom: thin, right: thin };
    ws.getCell('D1').value = 'Приложение 3'; ws.getCell('D2').value = 'к приказу № 1-П';
    ws.mergeCells('A4:F4'); ws.getCell('A4').value = 'План мероприятий по достижению целевых показателей на ' + P.year + 'г.'; ws.getCell('A4').font = { bold: true, size: 13 }; ws.getCell('A4').alignment = { horizontal: 'center' };
    ws.getCell('A5').value = 'Дивизион "Восточная сибирь"'; ws.getCell('A5').font = { bold: true };
    const hr = ws.getRow(6); hr.values = ['№ п/п', 'Мероприятие', 'Ответственный исполнитель', 'Срок исполнения', 'Примечания', 'Ресурсы на реализацию мероприятия (при необходимости)'];
    hr.eachCell((c) => { c.font = { bold: true }; c.border = border; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; });
    const band = (text, argb) => { const r = ws.addRow([text]); ws.mergeCells(r.number, 1, r.number, 6); r.getCell(1).font = { bold: true }; r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; r.getCell(1).border = border; r.getCell(1).alignment = { wrapText: true }; };
    const evRows = (evs, note) => evs.forEach((e, i) => { const r = ws.addRow([i + 1, e.text, e.executors || '', Model.fmtISO(e.due || ''), i === 0 && note ? note : '', '']); r.eachCell({ includeEmpty: true }, (c) => { c.border = border; c.alignment = { wrapText: true, vertical: 'top' }; }); });
    const blocks = [['Блок ФОП', P.kpis.filter((k) => k.type !== 'БИ')], ['Блок БИ', P.kpis.filter((k) => k.type === 'БИ')]];
    let n = 0;
    for (const [title, ks] of blocks) {
      band(title, 'FFBDD7EE');
      for (const k of ks) { band(k.name + (k.goal ? ' (цель: ' + k.goal + ')' : ''), 'FFF2F2F2'); const f = Model.planFinal(S.reg, S.data, k); evRows(f.events); n += f.events.length; }
      if (title === 'Блок БИ') {
        for (const p of S.reg.people) for (const b of ((S.data[p.id] && S.data[p.id].data && S.data[p.id].data.planBI) || [])) {
          if (!(b.name || '').trim()) continue;
          band(b.name + ' (предложено: ' + p.fio + ')', 'FFFFF2CC');
          evRows(b.events || [], [b.goal ? 'Цель: ' + b.goal : '', b.measure ? 'Как оцениваем: ' + b.measure : '', b.due ? 'Срок: ' + Model.fmtISO(b.due) : ''].filter(Boolean).join('\n'));
          n += (b.events || []).length;
        }
      }
    }
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const name = 'План мероприятий на ' + P.year + ' — Восточная Сибирь.xlsx';
    if (!S.demo) { try { await Store.writeBytes(S.dir, ['Своды', name], bytes); } catch (e) { S.log.push('В «Своды» не записалось: ' + e.message); } }
    await View.saveFile(bytes, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', 'Excel');
    View.toast('Выгружено мероприятий: ' + n + '. Файл — в папке «Своды»', 'ok');
  }

  // ---------- показатель вручную (пока его нет в выгрузке карты) ----------
  function kpiForm() {
    const k = S.kpiForm.id ? S.reg.kpis.find((x) => x.id === S.kpiForm.id) : { name: '', type: 'БИ', leader: '', goal: '', fact: '', forecast: '', reporter: '' };
    const inp = (id, label, v, wide) => '<label' + (wide ? ' class="wide"' : '') + '>' + label + '<input id="' + id + '" value="' + esc(v || '') + '"></label>';
    return '<div class="panel form"><h2>' + (S.kpiForm.id ? 'Изменить показатель' : 'Новый показатель вручную') + '</h2>' +
      '<p class="muted small">Например, бизнес-инициатива, которую уже выделили, а в выгрузке карты её ещё нет. Когда она появится в карте, перенесите мероприятия на показатель из карты, а этот удалите.</p>' +
      '<div class="form-grid">' + inp('k_name', 'Название', k.name, true) +
      '<label>Тип<select id="k_type">' + ['БИ', 'ФОП', 'другое'].map((t) => '<option' + (k.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
      inp('k_leader', 'Лидер (ФИО)', k.leader) +
      '<label>Отчитывается<select id="k_rep"><option value="">— по лидеру —</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (k.reporter === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('') + '</select></label>' +
      inp('k_goal', 'Цель', k.goal) + inp('k_fact', 'Факт', k.fact) + inp('k_forecast', 'Прогноз', k.forecast) + '</div>' +
      '<div class="row"><button class="primary" data-act="kpiSave">Сохранить</button><button data-act="kpiCancel">Отмена</button></div></div>';
  }
  async function kpiSave() {
    const name = $('#k_name').value.trim();
    if (!name) { View.toast('Впишите название показателя', 'bad'); return; }
    const k = S.kpiForm.id ? S.reg.kpis.find((x) => x.id === S.kpiForm.id) : { id: Model.uid('R'), manual: true, top3: false, stretch: '', grade: '', team: '', unit: '' };
    Object.assign(k, { name, type: $('#k_type').value, leader: $('#k_leader').value.trim(), goal: $('#k_goal').value.trim(), fact: $('#k_fact').value.trim(), forecast: $('#k_forecast').value.trim() });
    k.reporter = $('#k_rep').value || Model.defaultReporter(S.reg, k) || null;
    if (!S.kpiForm.id) S.reg.kpis.push(k);
    S.kpiForm = null;
    if (await saveReg('Показатель сохранён')) render();
  }
  function cardDiffPanel() {
    const d = S.cardDiff;
    const li = (arr, f) => (arr.length ? '<ul>' + arr.map(f).join('') + '</ul>' : '<div class="muted small">нет</div>');
    return '<div class="panel"><h2>Что изменится по новой карте от ' + esc(Model.fmtISO(d.date) || '—') + '</h2>' +
      '<h3 class="sec">Новые показатели</h3>' + li(d.added, (k) => '<li>' + esc(Model.shortKpi(k.name)) + ' — лидер ' + esc(k.leader) + '</li>') +
      '<h3 class="sec">Уйдут из отчётов (их нет в карте)</h3>' + li(d.removed, (k) => '<li>' + esc(Model.shortKpi(k.name)) + (k.eventCount ? ' — и ' + k.eventCount + ' мероприятий' : '') + '</li>') +
      (d.manualDup && d.manualDup.length ? '<div class="msg warn">Есть в карте и уже добавлены вручную: ' + d.manualDup.map((k) => esc(Model.shortKpi(k.name))).join(', ') + '. После применения перенесите мероприятия на показатель из карты и удалите ручной.</div>' : '') +
      '<h3 class="sec">Изменятся</h3>' + li(d.changed, (c) => '<li>' + esc(Model.shortKpi(c.name)) + ': ' + c.fields.map((f) => ({ fact: 'факт', forecast: 'прогноз', grade: 'оценка', goal: 'цель', stretch: 'напр. цель', team: 'команда', leader: '<b>лидер: ' + esc(c.neu.leader) + '</b> — отчитывающийся будет переназначен', unit: 'ед.', type: 'тип', name: 'название', top3: 'ТОП-3' }[f] || f)).join(', ') + '</li>') +
      '<p class="muted small">Статусы, пояснения и комментарии руководителей по остающимся показателям сохранятся.</p>' +
      '<div class="row"><button class="primary" data-act="cardApply">Применить</button><button data-act="cardCancel">Отмена</button></div></div>';
  }
  async function loadCard(file) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(new Uint8Array(await file.arrayBuffer()));
      S.card = Model.parseCard(wb);
      S.cardDiff = Model.diffCard(S.reg, S.card);
      render();
    } catch (e) { View.toast(e.message, 'bad'); }
  }
  async function cardApply() {
    Model.applyCard(S.reg, S.card);
    S.card = null; S.cardDiff = null;
    if (await saveReg('Карта УПЦ обновлена')) render();
  }
  let evTimer = null;
  function evEdit(key, value) {
    const [id, f] = key.split('|');
    const e = S.reg.events.find((x) => x.id === id);
    if (f === 'mflag' || f === 'mtext') { e.manual = { ...(e.manual || {}), [f === 'mflag' ? 'flag' : 'text']: value }; }
    else if (f === 'kpi') { if (!value) return; const to = S.reg.kpis.find((x) => x.id === value); e.kpi = value; View.toast('Мероприятие перенесено в «' + Model.shortKpi(to.name) + '». Статус сохранён.', 'ok'); }
    else if (f === 'speaker') {
      // статус прежнего «Заполняет» остаётся виден, пока новый человек не заполнит своё
      const st = Model.eventStatus(S.reg, S.data, e);
      if (st.flag || st.text) e.prev = { flag: st.flag, text: st.text };
      e.speaker = value || null;
      if (!e.speaker) e.manual = e.manual || { flag: st.flag, text: st.text };
    } else e[f] = f === 'due' ? Model.parseDue(value) : value;
    clearTimeout(evTimer);
    evTimer = setTimeout(() => saveReg(f === 'kpi' ? '' : 'Сохранено'), f === 'speaker' || f === 'mflag' || f === 'kpi' ? 0 : 800);
    if (f === 'speaker' || f === 'kpi') setTimeout(render, 50);
  }

  // ---------- свод и письма ----------
  function outTab() {
    const st = S.reg.settings;
    return '<div class="panel"><h2>Отправить отчёт директору</h2><p class="muted small">Готовит файл для телефона (iPhone, Outlook): сводка, «Просрочено и не выполнено», ' +
      'руководители раскрываются нажатием. Файл кладётся в папку «Своды», затем открывается новое письмо в веб-почте — <b>прикрепите файл к письму</b> (браузер сам прикрепить не может).</p>' +
      '<div class="row"><label class="small">Почта директора <input id="dirEmail" value="' + esc(st.directorEmail || '') + '" placeholder="director@..."></label>' +
      '<button class="primary" data-act="sendDirector">Отправить отчёт директору</button><button data-act="mobileCopy">Сохранить копию файла…</button></div>' +
      (S.sentFile && S.mailBlocked ? '<div class="msg warn">Браузер не дал открыть письмо сам. Нажмите «Открыть письмо» справа.</div>' : '') +
      (S.sentFile ? '<div class="msg ok">' + (S.letter ? '<button class="primary" data-act="openMail" style="float:right;margin-left:10px">Открыть письмо ещё раз</button>' : '') +
        'Файл: <b>' + esc(S.sentFile) + '</b>. В письме нажмите «Вложить» (скрепка) и выберите этот файл ' +
        '(папка «Отчёт первой линейки» → «Своды»), или «Сохранить копию файла…» в «Загрузки» и прикрепите оттуда. ' +
        'Если почта не пропустит .html — откройте файл и напечатайте в PDF.</div>' : '') + '</div>' +
      '<div class="panel"><h2>Итоговое мемо после совещания</h2><p class="muted small">Открывает письмо всем руководителям (у кого указана почта) с текстом и таблицей актуальных поручений. ' +
      'Таблица копируется — в письме поставьте курсор в поле текста и нажмите Ctrl+V. Мемо в Excel кладётся в папку «Своды», его можно приложить.</p>' +
      '<div class="row"><button class="primary" data-act="sendMemo">Отправить мемо всем</button></div></div>' +
      '<div class="panel"><h2>Свод для директора</h2><p class="muted small">Excel-файл: кто обновил, все поручения со статусами, УПЦ. ' + (S.demo ? 'В демо файл скачается.' : 'Файл появится в папке «Своды».') + '</p>' +
      '<div class="row"><button class="primary" data-act="summary">Сохранить свод в Excel</button><button data-act="printAll">Печать всех докладов</button></div></div>' +
      '<div class="panel"><h2>Письмо директору с итогами</h2><p class="muted small">«Скопировать итоги» кладёт в буфер таблицу по руководителям — вставьте её в письмо (Ctrl+V). «Открыть письмо» создаёт письмо в веб-почте с текстом итогов. ' +
      'Файл свода прикрепите сами — браузер не умеет прикреплять файлы к письмам.</p>' +
      '<div class="row"><button data-act="copySummary">Скопировать итоги</button><button data-act="mailDirector">Открыть письмо</button></div>' +
      '<pre class="summary">' + esc(Model.summaryText(S.reg, S.data, today())) + '</pre></div>' +
      (S.log.length ? '<div class="panel"><h2>Журнал</h2><pre class="log">' + esc(S.log.join('\n')) + '</pre></div>' : '');
  }
  function summaryHtml() {
    const rows = S.reg.people.filter((p) => p.onMeeting !== false).map((p) => {
      const v = Model.personView(S.reg, S.data, p.id, today()); const c = v.counts;
      return '<tr><td>' + esc(p.fio) + '</td><td>' + c.total + '</td><td>' + c.done + '</td><td>' + c.work + '</td><td>' + c.fail + '</td><td>' + c.none + '</td><td>' + c.overdue + '</td><td>' + (v.fresh === 'fresh' ? Model.fmtISO(v.reportDate) : 'не обновлён') + '</td></tr>';
    }).join('');
    return '<p>Итоги по поручениям совещания первой линейки на ' + Model.fmtISO(today()) + '</p><table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>Руководитель</th><th>Поручений</th><th>Выполнено</th><th>В работе</th><th>Не выполнено</th><th>Без статуса</th><th>Срок прошёл</th><th>Отчёт актуален</th></tr>' + rows + '</table>';
  }
  // ---------- итоговое мемо после совещания ----------
  function memoLetter() {
    const meet = S.reg.settings.lastMeeting || today();
    const list = S.reg.memo.filter((m) => !m.closed).slice().sort((a, b) => (a.num || 0) - (b.num || 0));
    const intro = ['Коллеги, добрый день!',
      'По итогам совещания с руководителями первой линейки от ' + Model.fmtISO(meet) + ' направляю актуализированное мемо совещания. Прошу принять поручения в работу и обеспечить их исполнение в установленные сроки.',
      'Поручения в отчёте первой линейки уже обновлены. Прошу своевременно вносить в свой отчёт актуальные статусы и пояснения — директор просматривает отчёт на постоянной основе.'];
    const row = (m, i) => ({ n: i + 1, text: m.text, resp: Model.respName(S.reg, m), co: (m.co || []).map((id) => (Model.personById(S.reg, id) || {}).fio).filter(Boolean).join(', '), due: Model.fmtISO(m.due) || '—', isNew: m.date === meet });
    const rows = list.map(row);
    const text = intro.join('\n\n') + '\n\nАктуальные поручения (' + rows.length + '):\n' +
      rows.map((r) => r.n + '. ' + r.text + ' — отв.: ' + r.resp + (r.co ? '; соисп.: ' + r.co : '') + '; срок: ' + r.due + (r.isNew ? ' (новое)' : '')).join('\n') + '\n\nСпасибо!';
    const td = 'style="border:1px solid #999;padding:4px 6px;vertical-align:top"';
    const html = intro.map((x) => '<p>' + esc(x) + '</p>').join('') + '<p><b>Актуальные поручения (' + rows.length + ')</b></p>' +
      '<table style="border-collapse:collapse;font-size:10pt"><tr><th ' + td + '>№</th><th ' + td + '>Поручение</th><th ' + td + '>Ответственный</th><th ' + td + '>Соисполнители</th><th ' + td + '>Срок</th></tr>' +
      rows.map((r) => '<tr' + (r.isNew ? ' style="background:#fff4d6"' : '') + '><td ' + td + '>' + r.n + '</td><td ' + td + '>' + esc(r.text) + (r.isNew ? ' <b>(новое)</b>' : '') + '</td><td ' + td + '>' + esc(r.resp) + '</td><td ' + td + '>' + esc(r.co) + '</td><td ' + td + '>' + esc(r.due) + '</td></tr>').join('') +
      '</table><p>Спасибо!</p>';
    return { meet, rows, text, html };
  }
  async function sendMemo() {
    const L = memoLetter();
    const to = S.reg.people.map((p) => p.email).filter(Boolean);
    const noMail = S.reg.people.filter((p) => !p.email).map((p) => p.fio);
    const subject = 'Мемо совещания первой линейки от ' + Model.fmtISO(L.meet);
    // письмо открываем сразу по нажатию — до любых ожиданий, иначе браузер не откроет вкладку
    View.mail(S.reg.settings, to, subject, L.text, null, L.html);
    if (noMail.length) setTimeout(() => View.toast('Нет почты у: ' + noMail.join(', ') + '. Добавьте в «Настройках».', 'bad'), 3600);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Мемо', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
      ws.addRow(['Мемо совещания первой линейки от ' + Model.fmtISO(L.meet)]).font = { bold: true, size: 13 };
      ws.addRow([]);
      const h = ws.addRow(['№', 'Поручение', 'Ответственный', 'Соисполнители', 'Срок']);
      h.font = { bold: true };
      L.rows.forEach((r) => { const x = ws.addRow([r.n, r.text + (r.isNew ? ' (новое)' : ''), r.resp, r.co, r.due]); x.alignment = { wrapText: true, vertical: 'top' }; });
      [6, 70, 26, 26, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
      const name = 'Мемо ' + Model.fmtISO(L.meet) + '.xlsx';
      if (S.demo) return;
      await Store.writeBytes(S.dir, ['Своды', name], bytes);
      S.log.push('Мемо сохранено: Своды/' + name);
    } catch (e) { S.log.push('Мемо в Excel не сохранилось: ' + e.message); }
  }
  const mobileName = () => 'Отчёт директору ' + Model.fmtISO(today()) + '.html';
  async function sendDirector() {
    // Письмо открываем сразу по нажатию, уже с адресом и текстом: если сначала готовить файл,
    // браузер считает новое окно «не по нажатию» и не открывает его. Файл к письму готовится следом.
    const to = (($('#dirEmail') && $('#dirEmail').value) || S.reg.settings.directorEmail || '').trim();
    const subject = 'Отчёт первой линейки на ' + Model.fmtISO(today());
    const body = 'Добрый день!\n\nВо вложении — отчёт первой линейки на ' + Model.fmtISO(today()) + '. Откройте файл: сверху сводка и просроченные поручения, по руководителям — нажмите на фамилию.';
    S.mailUrl = View.mailUrl(S.reg.settings, to ? [to] : [], subject, body);
    S.mailBlocked = !View.mail(S.reg.settings, to ? [to] : [], subject, body);
    S.letter = { to: to ? [to] : [], subject, body };
    S.sentFile = '';
    View.toast((View.mailMode(S.reg.settings) === 'owa-copy' ? 'Почта открыта в соседней вкладке, текст письма скопирован. ' : 'Письмо открыто в соседней вкладке. ') + 'Готовлю файл для вложения…');
    const name = mobileName();
    let bytes;
    try { bytes = await Base.mobileFile(S.dir, S.reg, S.data); } catch (e) {
      S.log.push('Файл для директора не собрался: ' + e.message); View.toast('Файл для директора не собрался: ' + e.message, 'bad'); render(); return;
    }
    try {
      if (S.demo) throw new Error('демо');
      await Store.writeBytes(S.dir, ['Своды', name], bytes);
      S.sentFile = 'Своды/' + name; S.log.push('Отчёт для директора сохранён: Своды/' + name);
    } catch (e) {
      const r = await View.saveFile(bytes, name, 'text/html', '.html', 'Страница');
      if (!r.ok) { render(); return; }
      S.sentFile = r.name + ' (сохранён отдельно)';
    }
    View.toast('Файл готов: ' + S.sentFile + '. Прикрепите его к письму.', 'ok');
    render();
  }
  async function saveSummary() {
    const wb = Model.buildSummary(ExcelJS, S.reg, S.data, today());
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const name = 'Свод_' + today() + '.xlsx';
    if (S.demo) { await View.saveFile(bytes, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', 'Excel'); return; }
    try { await Store.writeBytes(S.dir, ['Своды', name], bytes); S.log.push('Свод сохранён: Своды/' + name); View.toast('Свод сохранён в папку «Своды»', 'ok'); }
    catch (e) { await View.saveFile(bytes, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', 'Excel'); S.log.push('В папку записать не удалось (' + e.message + '), файл сохранён отдельно'); }
    render();
  }

  // ---------- настройки ----------
  function settingsTab() {
    const st = S.reg.settings;
    return '<div class="panel"><h2>Руководители</h2><p class="muted small">Порядок строк — порядок докладов. «На совещании: нет» — человек заполняет отчёт, но в очереди докладов идёт в конце. «Нет — только план и УПЦ» — для лидеров команд не из первой линейки: у них в отчёте только мероприятия УПЦ и проект плана на год, на совещании, в «Кто обновил» и у директора их нет. ' +
      '«Имя файла» — фамилия в имени личной страницы «Отчёт — Фамилия.html». «Страница» — «с данными» для тех, у кого Windows, и для отчётов, которые заполняют люди на разных системах: страница сама получает поручения; на Windows отчёт сохраняется файлом в «Входящие», на Astra — кнопкой «Сохранять сразу в папку».</p><table class="grid"><thead><tr><th>ФИО (как в поручениях)</th><th>Полное ФИО (как в карте УПЦ)</th><th class="c-resp">Имя файла</th><th>Почта</th><th class="c-st">На совещании</th><th class="c-st">Страница</th><th class="c-act"></th></tr></thead><tbody>' +
      S.reg.people.map((p, i) => '<tr><td><input data-pp="' + i + '|fio" value="' + esc(p.fio) + '"></td><td><input data-pp="' + i + '|full" value="' + esc(p.full || '') + '"></td><td>' + esc(p.slug) + '</td>' +
        '<td><input data-pp="' + i + '|email" value="' + esc(p.email || '') + '"></td><td><select data-pp="' + i + '|onMeeting"><option value="1">да</option><option value="0"' + (p.onMeeting === false && !p.extra ? ' selected' : '') + '>нет</option><option value="extra"' + (p.extra ? ' selected' : '') + '>нет — только план и УПЦ</option></select></td>' +
        '<td><select data-pp="' + i + '|fileMode"><option value="0">обычная (Astra)</option><option value="1"' + (p.fileMode ? ' selected' : '') + '>с данными (Windows / смешанно)</option></select></td>' +
        '<td class="c-act"><button class="mini" data-pmove="up|' + i + '">↑</button><button class="mini" data-pmove="down|' + i + '">↓</button><button class="mini danger" data-pmove="del|' + i + '">✕</button></td></tr>').join('') +
      '</tbody></table><div class="row" style="margin-top:8px"><input id="newFio" placeholder="Фамилия И.О."><button data-act="addPerson">Добавить руководителя</button></div>' +
      '<p class="muted small">Новому руководителю скопируйте любую страницу из папки «Страницы руководителей» и переименуйте в «Отчёт — Фамилия.html».</p></div>' +
      sectionsPanel() + avrReqSettings() +
      '<div class="panel"><h2>Почта</h2><p class="muted small">Как открывать письма (напоминания, директору). Ссылка на новое письмо в OWA зависит от версии почтового сервера. ' +
      'Нажмите по очереди кнопки «Проверить»: какая откроет <b>новое письмо с заполненными адресом и темой</b> — тот способ и выберите. Если ни одна — оставьте первый способ: почта откроется, а текст письма будет скопирован, останется вставить Ctrl+V.</p>' +
      '<div class="row"><label class="small">Открывать письма <select id="mailVia">' + View.MAIL_MODES.map(([k, t]) => '<option value="' + k + '"' + (View.mailMode(st) === k ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>' +
      '<label class="small">Адрес OWA <input id="owaUrl" style="min-width:320px" value="' + esc(st.owaUrl || 'https://mail.gazprom-neft.ru/owa/') + '"></label></div>' +
      '<div class="row" style="margin-top:8px"><span class="small muted">Проверить:</span>' + View.MAIL_MODES.filter(([k]) => /^owa-(ae|hash|path)$/.test(k)).map(([k], i) => '<button class="mini" data-mailtest="' + k + '">Проверить вариант ' + (i + 1) + '</button>').join('') +
      '<span class="small muted">Письмо-проверку не отправляйте, просто закройте.</span></div></div>' +
      '<div class="panel"><h2>Пароль помощника</h2><p class="muted small">Пароль защищает страницу помощника от случайного входа. Настоящая защита реестра — права на папку «Данные» (см. «Как пользоваться»).</p>' +
      '<div class="row"><input type="password" id="newPass" placeholder="' + (st.passHash ? 'Новый пароль' : 'Пароль') + '"><button data-act="setPass">' + (st.passHash ? 'Сменить пароль' : 'Установить пароль') + '</button>' +
      (st.passHash ? '<button data-act="clearPass">Убрать пароль</button>' : '') + '</div></div>';
  }
  function sectionsPanel() {
    const cfg = S.reg.settings.sections || {};
    const row = (k, def) => { const c = cfg[k] || {}; return '<tr><td>' + esc(def) + '</td><td><input data-sec-title="' + k + '" value="' + esc(c.title || '') + '" placeholder="' + esc(def) + '"></td>' +
      '<td><select data-sec-hidden="' + k + '"><option value="0">показывать</option><option value="1"' + (c.hidden ? ' selected' : '') + '>скрыть</option></select></td></tr>'; };
    return '<div class="panel"><h2>Разделы отчёта руководителя</h2><p class="muted small">Название раздела можно поменять, раздел — скрыть. Скрытый раздел пропадает у руководителей, на совещании и у директора, ' +
      'но то, что в нём было заполнено, не удаляется: вернёте «показывать» — всё на месте. Номера разделов пересчитываются сами.</p>' +
      '<table class="grid" style="max-width:760px"><thead><tr><th>Раздел</th><th>Название в отчёте</th><th class="c-st">Показывать</th></tr></thead><tbody>' +
      row('ros', 'РОС') + row('proj', 'Текущие проекты') + '</tbody></table></div>';
  }
  function avrReqSettings() {
    const r = S.reg.settings.avrReq || {};
    const def = 'Прошу по каждому своему мероприятию УПЦ написать итог за квартал: что выполнено, с цифрами и датами. Эти итоги пойдут в план мероприятий для анализа высшего руководства.';
    return '<div class="panel"><h2>Запрос итогов за квартал (АВР)</h2><p class="muted small">Включите в начале месяца после квартала. У руководителей вверху отчёта появится напоминание, ' +
      'а у каждого их мероприятия УПЦ — поле «Итог за квартал». Ход заполнения — на вкладке «Кто обновил». После сбора выключите.</p>' +
      '<div class="form-grid"><label>Запрос<select id="avr_on"><option value="0">выключен</option><option value="1"' + (r.on ? ' selected' : '') + '>включён</option></select></label>' +
      '<label>Квартал<input id="avr_period" value="' + esc(r.period || '') + '" placeholder="4 кв. 2026"></label>' +
      '<label>Заполнить до<input type="date" id="avr_due" value="' + esc(r.due || '') + '"></label>' +
      '<label class="wide">Текст для руководителей' + View.ta('id="avr_text"', r.text || def) + '</label></div>' +
      '<div class="row"><button class="primary" data-act="avrReqSave">Сохранить запрос</button></div></div>';
  }
  async function settingsEdit(key, value) {
    const [i, f] = key.split('|');
    const p = S.reg.people[+i];
    if (f === 'onMeeting') { p.onMeeting = value === '1'; if (value === 'extra') p.extra = true; else delete p.extra; }
    else p[f] = f === 'fileMode' ? value === '1' : value;
    await saveReg();
  }

  function helpTab() {
    return '<div class="panel help"><h2>Как это устроено</h2>' +
      '<p>Всё лежит в общей папке «Отчёт первой линейки». Excel и Р7 не нужны: каждый работает в своей странице в браузере, данные хранятся в папке «Данные».</p>' +
      '<ul><li><b>Помощник.html</b> — эта страница: поручения, показатели УПЦ, совещание, свод, письма.</li>' +
      '<li><b>Страницы руководителей/Отчёт — Фамилия.html</b> — каждый руководитель заполняет свой отчёт. Ярлык можно положить на рабочий стол.</li>' +
      '<li><b>Для директора.html</b> — снимок всех данных для директора. Открывается двойным щелчком в любом браузере, ничего не спрашивает. Обновляется сам, когда вы открываете эту страницу или руководитель сохраняет отчёт.</li>' +
      '<li><b>Директор.html</b> — то же, но читает папку напрямую (нужен доступ браузера к папке).</li>' +
      '<li><b>Входящие</b> — сюда руководители на Windows кладут файл отчёта после «Сохранить». Эта страница забирает их сама.</li>' +
      '<li><b>Данные</b> — реестр и отчёты в виде файлов. Руками их не открывать.</li></ul>' +
      '<h3>Неделя помощника</h3><ol>' +
      '<li><b>На совещании</b>: вкладка «Совещание» → «На весь экран», стрелки ← → листают докладчиков.</li>' +
      '<li><b>После совещания</b>: «Кто обновил» → «Совещание прошло сегодня». Вкладка «Поручения»: добавьте новые (появляются у руководителей сразу). ' +
      'Выполненные и неактуальные, которые показали на совещании, снимите кнопкой «Снять с контроля» — по одному или все сразу.</li>' +
      '<li><b>За день до совещания</b>: «Кто обновил» — красные не обновили. Кнопка «Написать напоминание» откроет письмо им в веб-почте.</li>' +
      '<li><b>Директору</b>: «Свод и письма» → «Отправить отчёт директору» — файл для телефона в папке «Своды» и новое письмо; файл прикрепите к письму. Там же Excel-свод.</li>' +
      '<li><b>Поручение нескольким</b>: отметьте нескольких ответственных (или «Все на совещании»). У каждого свой статус, у поручения — «выполнили N из M». Снимается, когда выполнили все (или вручную).</li>' +
      '<li><b>Соисполнители</b> пишут свой комментарий по поручению в своём отчёте — он виден у ответственного и на совещании.</li>' +
      '<li><b>Раз в месяц</b>: «УПЦ» → «Загрузить новую карту УПЦ». Сборщик покажет, что добавится, уйдёт и изменится.</li>' +
      '<li><b>Ноябрь–декабрь</b>: вкладка «План на год» → «Взять показатели и мероприятия текущего года», поправьте список, впишите цели, назначьте лидеров, включите сбор. Лидеры подтверждают или правят мероприятия в разделе «Проект на … год» своего отчёта и предлагают бизнес-инициативы. Затем «Выгрузить в форму Приложения 3».</li>' +
      '<li><b>В начале месяца после квартала</b>: «Настройки» → «Запрос итогов за квартал» → включите, укажите квартал и срок. Руководители увидят запрос у себя и заполнят «Итог за квартал» у своих мероприятий; кто сколько заполнил — на вкладке «Кто обновил». После сбора выключите.</li>' +
      '<li><b>Раз в квартал</b>: вкладка «План АВР» → загрузите квартальный файл. Статусы и пояснения подставятся из отчёта в новую колонку «Статус … кв.», в «выполнено» — 1 у выполненных. Проверьте, поправьте, «Сохранить заполненный файл». Что сопоставили вручную, запоминается на следующий квартал.</li></ol>' +
      '<h3>Статусы</h3><p>Везде одни и те же: ' + Model.STATUSES.map((s) => View.badge(s.key)).join(' ') + ' и ' + View.badge('') + '. ' +
      'Если срок прошёл, а статус не «выполнено» и не «неактуально», дата подсвечивается красным.</p>' +
      '<h3>Защита</h3><p>Пароль на странице помощника — от случайного входа. Надёжно защищают права на сетевую папку, их настраивает ИТ за несколько минут: ' +
      '<b>Данные/реестр.json</b> — запись только помощнику; <b>Данные/руководители/Фамилия.json</b> и <b>Данные/вложения/Фамилия</b> — запись только этому руководителю; директору — только чтение.</p>' +
      '<h3>Резервные копии</h3><p>Каждый день перед первой записью копия реестра и отчётов кладётся в «Данные/архив» (реестр — 30 дней, отчёты — 10).</p></div>';
  }

  // ---------- события ----------
  function people() { return Model.reportPeople(S.reg); }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tab],[data-act],[data-mailtest],[data-kpiedit],[data-kpidel],[data-avrf],[data-avr-src],[data-avr-excl],[data-restore],[data-pkdel],[data-pedel],[data-peadd],[data-person-idx],[data-mf],[data-meetf],[data-memo],[data-evdel],[data-evadd],[data-pmove],.who .card');
    if (!b) return;
    if (b.dataset.tab) { S.tab = b.dataset.tab; render(); return; }
    if (b.dataset.meetf !== undefined) { S.meetFilter = b.dataset.meetf; render(); return; }
    if (b.dataset.avrf !== undefined) { S.avr.filter = b.dataset.avrf; render(); return; }
    if (b.dataset.restore !== undefined) {
      const r = S.restored[+b.dataset.restore];
      if (!confirm('Записать копию «' + r.from + '» на место повреждённого файла?')) return;
      try { await Store.writeJSON(S.dir, r.path, r.data); S.restored.splice(+b.dataset.restore, 1); View.toast('Восстановлено', 'ok'); await load(); } catch (e) { View.toast('Не получилось: ' + e.message, 'bad'); }
      return;
    }
    if (b.dataset.pkdel) { const P = planOf(); if (!confirm('Убрать показатель из проекта?')) return; P.kpis = P.kpis.filter((k) => k.id !== b.dataset.pkdel); P.events = P.events.filter((e) => e.kpi !== b.dataset.pkdel); if (await saveReg('Убрано')) render(); return; }
    if (b.dataset.pedel) { const P = planOf(); P.events = P.events.filter((e) => e.id !== b.dataset.pedel); if (await saveReg()) render(); return; }
    if (b.dataset.peadd) { const P = planOf(); P.events.push({ id: Model.uid('pe'), kpi: b.dataset.peadd, text: '', executors: '', due: '' }); if (await saveReg()) render(); return; }
    if (b.dataset.avrExcl !== undefined) {
      const r = S.avr.rows[+b.dataset.avrExcl];
      if (r.exclude) { r.exclude = ''; r.how = r.eventId ? 'manual' : ''; r.learned = false; }
      else { r.exclude = r.kpiId ? 'Цель отменена' : 'Цель отменена. Показатель исключён из карты УПЦ'; r.how = 'cancelled'; }
      avrPrepare(r); avrPersist(); render(); return;
    }
    if (b.dataset.avrSrc) { const [src, i] = b.dataset.avrSrc.split('|'); const r = S.avr.rows[+i]; r.src = src; avrPrepare(r); avrPersist(); render(); return; }
    if (b.dataset.kpiedit) { S.kpiForm = { id: b.dataset.kpiedit }; render(); window.scrollTo(0, 0); return; }
    if (b.dataset.kpidel) {
      const k = S.reg.kpis.find((x) => x.id === b.dataset.kpidel);
      const n = S.reg.events.filter((x) => x.kpi === k.id).length;
      if (!confirm('Удалить показатель «' + Model.shortKpi(k.name) + '»' + (n ? ' и его мероприятия (' + n + ')? Чтобы сохранить мероприятия, сначала перенесите их на другой показатель.' : '?'))) return;
      S.reg.kpis = S.reg.kpis.filter((x) => x.id !== k.id); S.reg.events = S.reg.events.filter((x) => x.kpi !== k.id);
      if (await saveReg('Показатель удалён')) render(); return;
    }
    if (b.dataset.mailtest) { const to = S.reg.settings.directorEmail || ''; View.mail(S.reg.settings, to ? [to] : [], 'Проверка ссылки — не отправлять', 'Это проверка: открылось ли новое письмо с адресом и темой.', b.dataset.mailtest); return; }
    if (b.classList.contains('card') && b.dataset.person) { S.person = people().findIndex((p) => p.id === b.dataset.person); S.tab = 'meeting'; render(); return; }
    if (b.dataset.personIdx) { S.person = +b.dataset.personIdx; render(); return; }
    if (b.dataset.mf !== undefined) { S.memoFilter = b.dataset.mf; render(); return; }
    if (b.dataset.memo) { const [op, id] = b.dataset.memo.split('|'); memoAction(op, id); return; }
    if (b.dataset.evdel) { if (confirm('Удалить мероприятие?')) { S.reg.events = S.reg.events.filter((x) => x.id !== b.dataset.evdel); if (await saveReg('Удалено')) render(); } return; }
    if (b.dataset.evadd) { const k = S.reg.kpis.find((x) => x.id === b.dataset.evadd); S.reg.events.push({ id: Model.uid('e'), kpi: k.id, text: 'Новое мероприятие', executors: '', due: '', speaker: k.reporter }); if (await saveReg()) render(); return; }
    if (b.dataset.pmove) {
      const [op, i] = b.dataset.pmove.split('|'); const n = +i; const arr = S.reg.people;
      if (op === 'del') {
        const p = arr[n];
        if (S.reg.memo.some((m) => !m.closed && Model.isResp(m, p.id)) || S.reg.kpis.some((k) => k.reporter === p.id)) { alert('У ' + p.fio + ' есть открытые поручения или показатели. Сначала передайте их другому.'); return; }
        if (!confirm('Убрать ' + p.fio + ' из списка? Его отчёт останется в папке.')) return;
        arr.splice(n, 1);
      }
      if (op === 'up' && n > 0) [arr[n - 1], arr[n]] = [arr[n], arr[n - 1]];
      if (op === 'down' && n < arr.length - 1) [arr[n + 1], arr[n]] = [arr[n], arr[n + 1]];
      if (await saveReg()) render(); return;
    }
    const a = b.dataset.act;
    const n = S.reg ? people().length : 0;
    if (a === 'pick') conn.pick();
    else if (a === 'grant') conn.grant();
    else if (a === 'demo') { S.demo = true; S.dir = await Base.demoFolder(); await load(); }
    else if (a === 'reload') reloadData();
    else if (a === 'unlock') { const h = await Base.sha($('#pass').value); if (h === S.reg.settings.passHash) { try { sessionStorage.setItem('otchet.unlocked', h); } catch (x) { /* */ } S.locked = false; render(); } else View.toast('Неверный пароль', 'bad'); }
    else if (a === 'meetingToday') { Model.recordWeek(S.reg, S.data, today()); S.reg.settings.lastMeeting = today(); if (await saveReg('Отмечено: совещание прошло сегодня. Отчёты станут «не обновлён», пока руководители не поставят новую дату.')) render(); }
    else if (a === 'remind') {
      const stale = Model.reportPeople(S.reg).filter((p) => Model.personView(S.reg, S.data, p.id, today()).fresh !== 'fresh');
      const to = stale.map((p) => p.email).filter(Boolean);
      const noMail = stale.filter((p) => !p.email).map((p) => p.fio);
      if (noMail.length) View.toast('Нет почты у: ' + noMail.join(', ') + '. Добавьте в «Настройках».', 'bad');
      View.mail(S.reg.settings, to, 'Отчёт к совещанию первой линейки', 'Коллеги, добрый день!\n\nНапоминаю: обновите, пожалуйста, свой отчёт к совещанию первой линейки — статусы поручений и мероприятий, дату «Отчёт актуален на» — и нажмите «Сохранить».\n\nСпасибо!');
    }
    else if (a === 'prev') { S.person = (S.person - 1 + n) % n; render(); }
    else if (a === 'next') { S.person = (S.person + 1) % n; render(); }
    else if (a === 'present') { document.body.classList.add('present'); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
    else if (a === 'print') window.print();
    else if (a === 'printAll') { View.printHtml(people().map((p, i) => '<div class="' + (i ? 'page-break' : '') + '">' + View.personReport(S.reg, S.data, p.id, today(), { filter: S.tab === 'meeting' ? S.meetFilter : '' }) + '</div>').join(''), (el) => View.hydrateAttachments(el, S.dir, S.reg)); }
    else if (a === 'respAll') { const ids = S.reg.people.filter((p) => p.onMeeting !== false).map((p) => p.id); $$('.f_resp').forEach((x) => { x.checked = ids.includes(x.value); }); }
    else if (a === 'respNone') { $$('.f_resp').forEach((x) => { x.checked = false; }); }
    else if (a === 'sendDirector') sendDirector();
    else if (a === 'sendMemo') sendMemo();
    else if (a === 'avrReqSave') {
      const period = $('#avr_period').value.trim(); const on = $('#avr_on').value === '1';
      if (on && !period) { View.toast('Укажите квартал, например «4 кв. 2026»', 'bad'); return; }
      S.reg.settings.avrReq = { on, period, due: $('#avr_due').value, text: $('#avr_text').value.trim() };
      if (await saveReg(on ? 'Запрос включён: руководители увидят его в своих отчётах' : 'Запрос выключен')) render();
    }
    else if (a === 'remindAvr') {
      const r = Model.avrReq(S.reg);
      const left = S.reg.people.filter((p) => { const g = Model.avrqProgress(S.reg, S.data, p.id); return g && g.total && g.done < g.total; });
      const to = left.map((p) => p.email).filter(Boolean);
      const noMail = left.filter((p) => !p.email).map((p) => p.fio);
      if (noMail.length) View.toast('Нет почты у: ' + noMail.join(', ') + '. Добавьте в «Настройках».', 'bad');
      View.mail(S.reg.settings, to, 'Итоги за ' + r.period + ' для отчёта анализа высшего руководства',
        'Коллеги, добрый день!\n\nПрошу заполнить в отчёте первой линейки итоги за ' + r.period + ' по своим мероприятиям УПЦ (поле «Итог за ' + r.period + '»)' + (r.due ? ' до ' + Model.fmtISO(r.due) : '') + ' и нажать «Сохранить».\n\nСпасибо!');
    }
    else if (a === 'kpiNew') { S.kpiForm = {}; render(); }
    else if (a === 'avrSave') avrSave();
    else if (a === 'avrClose') { await avrPersist(true); S.avr = null; render(); }
    else if (a === 'avrResume') avrResume();
    else if (a === 'planCopy') planCopy();
    else if (a === 'exportZip') {
      View.toast('Собираю копию…');
      try {
        const bytes = await Base.exportZip(S.dir);
        const r = await View.saveFile(bytes, 'Отчёт первой линейки — копия данных ' + today() + '.zip', 'application/zip', '.zip', 'Архив');
        if (r.ok) { S.reg.settings.lastExport = Date.now(); if (await saveReg('Копия данных сохранена: ' + r.name + '. Храните её у себя.')) render(); }
      } catch (e) { View.toast('Копия не собралась: ' + e.message, 'bad'); }
    }
    else if (a === 'planExport') planExport();
    else if (a === 'planKpiAdd') { const P = planOf(); P.kpis.push({ id: Model.uid('P'), name: 'Новый показатель', type: 'БИ', goal: '', leader: null }); if (await saveReg()) render(); }
    else if (a === 'planCfg') {
      const P = planOf(); P.year = +$('#plan_year').value || P.year; P.on = $('#plan_on').value === '1'; P.due = $('#plan_due').value; P.text = $('#plan_text').value.trim();
      if (P.on && !P.kpis.length) { View.toast('Сначала добавьте показатели: «Взять показатели и мероприятия текущего года»', 'bad'); P.on = false; }
      if (await saveReg(P.on ? 'Сбор включён: лидеры увидят раздел «Проект на ' + P.year + ' год»' : 'Сохранено')) render();
    }
    else if (a === 'planRemind') {
      const P = planOf();
      const left = S.reg.people.filter((p) => { const g = Model.planProgress(S.reg, S.data, p.id); return g.total && g.done < g.total; });
      const to = left.map((p) => p.email).filter(Boolean);
      const noMail = left.filter((p) => !p.email).map((p) => p.fio);
      if (noMail.length) View.toast('Нет почты у: ' + noMail.join(', ') + '. Добавьте в «Настройках».', 'bad');
      View.mail(S.reg.settings, to, 'Мероприятия на ' + P.year + ' год', 'Коллеги, добрый день!\n\nПрошу в отчёте первой линейки, раздел «Проект на ' + P.year + ' год», проверить мероприятия по своим показателям — подтвердить или поправить' + (P.due ? ' до ' + Model.fmtISO(P.due) : '') + ' — и нажать «Сохранить». Если есть предложения по новым бизнес-инициативам — добавьте их там же.\n\nСпасибо!');
    }
    else if (a === 'avrPush') avrPush();
    else if (a === 'avrAllFile' || a === 'avrAllRep') { S.avr.rows.forEach((r) => { if (r.file && r.rep && !same(r.file, r.rep)) { r.src = a === 'avrAllFile' ? 'file' : 'report'; avrPrepare(r); } }); avrPersist(); render(); }
    else if (a === 'kpiSave') kpiSave();
    else if (a === 'kpiCancel') { S.kpiForm = null; render(); }
    else if (a === 'openMail') { if (S.letter) View.mail(S.reg.settings, S.letter.to, S.letter.subject, S.letter.body); }
    else if (a === 'mobileCopy') { await View.saveFile(await Base.mobileFile(S.dir, S.reg, S.data), mobileName(), 'text/html', '.html', 'Страница'); }
    else if (a === 'memoSave') memoSave();
    else if (a === 'memoCancel') { S.edit = null; render(); }
    else if (a === 'closeReady') closeReady();
    else if (a === 'cardApply') cardApply();
    else if (a === 'cardCancel') { S.card = null; S.cardDiff = null; render(); }
    else if (a === 'summary') saveSummary();
    else if (a === 'copySummary') { const ok = await View.copyHtml(summaryHtml(), Model.summaryText(S.reg, S.data, today())); View.toast(ok ? 'Итоги скопированы — вставьте в письмо (Ctrl+V)' : 'Не удалось скопировать', ok ? 'ok' : 'bad'); }
    else if (a === 'mailDirector') { const to = (S.reg.settings.directorEmail || '').trim(); View.mail(S.reg.settings, to ? [to] : [], 'Итоги по поручениям совещания первой линейки на ' + Model.fmtISO(today()), Model.summaryText(S.reg, S.data, today()), null, summaryHtml()); }
    else if (a === 'addPerson') {
      const fio = $('#newFio').value.trim(); if (!fio) return;
      const slug = fio.split(/\s+/)[0];
      if (S.reg.people.some((p) => p.slug === slug)) { View.toast('Человек с такой фамилией уже есть', 'bad'); return; }
      S.reg.people.push({ id: Model.uid('p'), fio, full: '', slug, email: '', onMeeting: true });
      if (await saveReg('Добавлен ' + fio)) render();
    }
    else if (a === 'setPass') { const v = $('#newPass').value; if (v.length < 4) { View.toast('Пароль — не короче 4 символов', 'bad'); return; } S.reg.settings.passHash = await Base.sha(v); try { sessionStorage.setItem('otchet.unlocked', S.reg.settings.passHash); } catch (x) { /* */ } if (await saveReg('Пароль установлен')) render(); }
    else if (a === 'clearPass') { delete S.reg.settings.passHash; if (await saveReg('Пароль убран')) render(); }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'mailVia') { S.reg.settings.mailMode = t.value; saveReg('Сохранено'); }
    if (t.dataset.secTitle !== undefined || t.dataset.secHidden !== undefined) {
      const k = t.dataset.secTitle || t.dataset.secHidden; const cfg = S.reg.settings.sections = S.reg.settings.sections || {};
      cfg[k] = { ...(cfg[k] || {}) };
      if (t.dataset.secTitle !== undefined) cfg[k].title = t.value.trim(); else cfg[k].hidden = t.value === '1';
      if (await saveReg('Разделы отчёта сохранены — у руководителей изменится при следующем открытии')) render();
    }
    if (t.id === 'owaUrl') { S.reg.settings.owaUrl = t.value.trim(); saveReg('Адрес почты сохранён'); }
    if (t.id === 'memoPerson') { S.memoPerson = t.value; render(); }
    if (t.id === 'upcPerson') { S.upcPerson = t.value; render(); }
    if (t.id === 'lastMeeting') { S.reg.settings.lastMeeting = t.value; if (await saveReg('Дата совещания сохранена')) render(); }
    if (t.id === 'dirEmail') { S.reg.settings.directorEmail = t.value.trim(); saveReg('Почта сохранена'); }
    if (t.id === 'cardFile' && t.files[0]) loadCard(t.files[0]);
    if (t.id === 'avrFile' && t.files[0]) avrLoad(t.files[0]);
    if (t.dataset.pkf && t.tagName === 'SELECT') { const [id, f] = t.dataset.pkf.split('|'); planOf().kpis.find((k) => k.id === id)[f] = t.value || null; if (await saveReg('Сохранено')) render(); }
    if (t.id === 'avrCol') { S.avr.statusCol = +t.value; S.avr.rows.forEach((r) => { if (r.src !== 'edit') r.src = ''; avrPrepare(r); }); avrPersist(); render(); }
    if (t.dataset.avrDone) { S.avr.rows[+t.dataset.avrDone].done = t.checked; avrPersist(); }
    if (t.dataset.avrEv) {
      const r = S.avr.rows[+t.dataset.avrEv]; const ev = S.reg.events.find((x) => x.id === t.value);
      Object.assign(r, { eventId: t.value, how: 'manual', src: '' }); avrPrepare(r);
      if (!ev) r.rep = '';
      avrPersist(); render();
    }
    if (t.id === 'importFiles' && t.files.length) importFiles(t.files);
    if (t.dataset.kpiRep) { S.reg.kpis.find((k) => k.id === t.dataset.kpiRep).reporter = t.value || null; if (await saveReg('Назначено')) render(); }
    if (t.dataset.ev && (t.tagName === 'SELECT')) evEdit(t.dataset.ev, t.value);
    if (t.dataset.pp) settingsEdit(t.dataset.pp, t.value);
  });
  document.addEventListener('input', (e) => {
    if (e.target.dataset.ev && e.target.tagName !== 'SELECT') evEdit(e.target.dataset.ev, e.target.value);
    if (e.target.dataset.pkf && e.target.tagName !== 'SELECT') { const [id, f] = e.target.dataset.pkf.split('|'); planOf().kpis.find((k) => k.id === id)[f] = e.target.value; planSaveSoon(); }
    if (e.target.dataset.pef) { const [id, f] = e.target.dataset.pef.split('|'); planOf().events.find((x) => x.id === id)[f] = f === 'due' ? Model.parseDue(e.target.value) : e.target.value; planSaveSoon(); }
    if (e.target.dataset.avrText) { Object.assign(S.avr.rows[+e.target.dataset.avrText], { out: e.target.value, src: 'edit' }); avrPersist(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'pass') $('[data-act=unlock]').click();
    if (S.tab !== 'meeting' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || !S.reg) return;
    const n = S.reg ? people().length : 0;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { S.person = (S.person + 1) % n; render(); window.scrollTo(0, 0); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { S.person = (S.person - 1 + n) % n; render(); window.scrollTo(0, 0); }
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('present'); });

  window.Otchet = { S, load, render, Base };
  render();
  conn.init().then((ok) => { if (!ok) render(); });
})();

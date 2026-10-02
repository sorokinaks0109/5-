/* global ExcelJS, Store, Model, View, Base */
// Страница помощника: реестр поручений, УПЦ, совещание, свод, письма, настройки.
(function () {
  'use strict';
  const { esc, $, $$ } = View;
  const S = {
    dir: null, reg: null, data: {}, regModified: 0, tab: 'who', person: 0, locked: false, demo: false,
    memoFilter: '', memoPerson: '', edit: null, cardDiff: null, card: null, upcPerson: '', log: [],
  };
  const today = () => Model.todayISO();
  const TABS = [['who', 'Кто обновил'], ['meeting', 'Совещание'], ['memo', 'Поручения'], ['upc', 'УПЦ'], ['out', 'Свод и письма'], ['settings', 'Настройки'], ['help', 'Как пользоваться']];

  const conn = Base.connector({ mode: 'readwrite', render: () => render(), onDir: async (dir) => { S.dir = dir; await load(); } });

  async function load() {
    const all = await Base.loadAll(S.dir);
    S.reg = all.reg; S.data = all.data; S.regModified = all.regModified ? all.regModified.getTime() : 0;
    let unlocked = false; try { unlocked = sessionStorage.getItem('otchet.unlocked') === S.reg.settings.passHash; } catch (e) { /* нет хранилища */ }
    S.locked = !!S.reg.settings.passHash && !unlocked;
    render();
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
    const views = { who: whoTab, meeting: meetingTab, memo: memoTab, upc: upcTab, out: outTab, settings: settingsTab, help: helpTab };
    main.innerHTML = views[S.tab]();
    if (S.tab === 'meeting') View.hydrateAttachments(main, S.dir, S.reg);
  }

  function whoTab() {
    const st = S.reg.settings;
    const stale = S.reg.people.filter((p) => Model.personView(S.reg, S.data, p.id, today()).fresh !== 'fresh');
    return '<div class="panel"><div class="row between"><div><h2>Кто обновил отчёт</h2><div class="muted small">Зелёный — руководитель указал дату актуальности позже последнего совещания. ' +
      'Дату ставит сам руководитель, поэтому ваши действия на неё не влияют.</div></div>' +
      '<div class="row"><label class="small">Последнее совещание <input type="date" id="lastMeeting" value="' + esc(st.lastMeeting || '') + '"></label>' +
      '<button data-act="meetingToday">Совещание прошло сегодня</button><button data-act="reload">Обновить</button></div></div>' +
      '<div class="msg ' + (stale.length ? 'bad' : 'ok') + '" style="margin-top:10px">' + (stale.length ? 'Не обновили: ' + stale.map((p) => esc(p.fio)).join(', ') : 'Все обновили отчёт') + '</div>' +
      (stale.length ? '<button data-act="remind">Написать напоминание не обновившим</button>' : '') + '</div>' + View.whoCards(S.reg, S.data, today());
  }

  function meetingTab() {
    const people = S.reg.people.filter((p) => p.onMeeting !== false).concat(S.reg.people.filter((p) => p.onMeeting === false));
    if (S.person >= people.length) S.person = 0;
    const p = people[S.person];
    return '<div class="people-bar">' + people.map((x, i) => '<button class="chip ' + (i === S.person ? 'active' : '') + '" data-person-idx="' + i + '">' + esc(x.fio) + '</button>').join('') +
      '<span class="tools row"><button data-act="prev">←</button><button data-act="next">→</button><button class="primary" data-act="present">На весь экран</button>' +
      '<button data-act="print">Печать</button><button data-act="printAll">Печать всех</button></span></div>' +
      '<div id="report">' + (p ? View.personReport(S.reg, S.data, p.id, today()) : '') + '</div>';
  }

  // ---------- поручения ----------
  function memoForm() {
    const e = S.edit || { date: today(), text: '', resp: '', co: [], due: '' };
    const opts = '<option value="">— выбрать —</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (e.resp === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('') +
      '<option value="__other"' + (!e.resp && e.respText ? ' selected' : '') + '>другой (вписать)</option>';
    return '<div class="panel form"><h2>' + (S.edit && S.edit.id ? 'Изменить поручение' : 'Новое поручение') + '</h2>' +
      '<div class="form-grid"><label>Дата совещания<input type="date" id="f_date" value="' + esc(e.date) + '"></label>' +
      '<label class="wide">Поручение<textarea id="f_text" rows="2">' + esc(e.text) + '</textarea></label>' +
      '<label>Ответственный<select id="f_resp">' + opts + '</select><input id="f_respText" placeholder="ФИО, если нет в списке" value="' + esc(e.respText || '') + '" ' + (!e.resp && e.respText ? '' : 'hidden') + '></label>' +
      '<label>Срок<input id="f_due" placeholder="дд.мм.гггг или «постоянно»" value="' + esc(Model.fmtISO(e.due)) + '"></label>' +
      '<div class="wide"><div class="small muted">Соисполнители</div><div class="checks">' + S.reg.people.map((p) => '<label class="chk"><input type="checkbox" class="f_co" value="' + esc(p.id) + '"' + ((e.co || []).includes(p.id) ? ' checked' : '') + '>' + esc(p.fio) + '</label>').join('') + '</div></div></div>' +
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
    const respSel = $('#f_resp').value;
    if (!text) { View.toast('Впишите текст поручения', 'bad'); return; }
    if (!respSel) { View.toast('Выберите ответственного', 'bad'); return; }
    const item = S.edit && S.edit.id ? S.reg.memo.find((m) => m.id === S.edit.id) : { id: Model.uid('m'), created: today() };
    Object.assign(item, {
      date: $('#f_date').value || today(), text, resp: respSel === '__other' ? '' : respSel, respText: respSel === '__other' ? $('#f_respText').value.trim() : '',
      due: Model.parseDue($('#f_due').value), co: $$('.f_co').filter((x) => x.checked).map((x) => x.value).filter((x) => x !== respSel),
    });
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
      '<label class="button">Загрузить новую карту УПЦ (xlsx)<input type="file" id="cardFile" accept=".xlsx" hidden></label></div></div>';
    if (S.cardDiff) h += cardDiffPanel();
    const unassigned = S.reg.kpis.filter((k) => !k.reporter).length;
    if (unassigned) h += '<div class="msg warn">Показателей без отчитывающегося: ' + unassigned + '. Назначьте руководителя в списке «Отчитывается».</div>';
    h += '<div class="filters"><select id="upcPerson"><option value="">Все руководители</option>' + S.reg.people.map((p) => '<option value="' + esc(p.id) + '"' + (S.upcPerson === p.id ? ' selected' : '') + '>' + esc(p.fio) + '</option>').join('') + '</select><button data-act="print">Печать</button></div>';
    h += View.upcOverview(S.reg, S.data, today(), {
      person: S.upcPerson,
      editor: (k, evs) => '<div class="row small no-print">Отчитывается: <select data-kpi-rep="' + esc(k.id) + '">' + peopleOpts(k.reporter).replace('— помощник —', '— не назначен —') + '</select></div>' +
        '<table class="grid"><thead><tr><th>Мероприятие</th><th class="c-resp">Исполнители</th><th class="c-due">Срок</th><th class="c-resp">Заполняет</th><th class="c-st">Статус</th><th>Пояснение</th><th class="c-act no-print"></th></tr></thead><tbody>' +
        evs.map((e) => '<tr><td><textarea rows="2" data-ev="' + esc(e.id) + '|text">' + esc(e.text) + '</textarea></td><td><input data-ev="' + esc(e.id) + '|executors" value="' + esc(e.executors) + '"></td>' +
          '<td><input data-ev="' + esc(e.id) + '|due" value="' + esc(Model.fmtISO(e.due)) + '"></td><td><select data-ev="' + esc(e.id) + '|speaker">' + peopleOpts(e.speaker) + '</select></td>' +
          (e.speaker ? '<td>' + View.badge(e.st.flag) + '</td><td class="small">' + esc(e.st.text) + '</td>'
            : '<td>' + View.statusSelect('', e.st.flag, 'data-ev="' + esc(e.id) + '|mflag"') + '</td><td><textarea rows="2" data-ev="' + esc(e.id) + '|mtext">' + esc(e.st.text) + '</textarea></td>') +
          '<td class="no-print"><button class="mini danger" data-evdel="' + esc(e.id) + '">✕</button></td></tr>').join('') +
        '</tbody></table><button class="mini no-print" data-evadd="' + esc(k.id) + '">+ мероприятие</button>',
    });
    return h;
  }
  function cardDiffPanel() {
    const d = S.cardDiff;
    const li = (arr, f) => (arr.length ? '<ul>' + arr.map(f).join('') + '</ul>' : '<div class="muted small">нет</div>');
    return '<div class="panel"><h2>Что изменится по новой карте от ' + esc(Model.fmtISO(d.date) || '—') + '</h2>' +
      '<h3 class="sec">Новые показатели</h3>' + li(d.added, (k) => '<li>' + esc(Model.shortKpi(k.name)) + ' — лидер ' + esc(k.leader) + '</li>') +
      '<h3 class="sec">Уйдут из отчётов (их нет в карте)</h3>' + li(d.removed, (k) => '<li>' + esc(Model.shortKpi(k.name)) + (k.eventCount ? ' — и ' + k.eventCount + ' мероприятий' : '') + '</li>') +
      '<h3 class="sec">Изменятся</h3>' + li(d.changed, (c) => '<li>' + esc(Model.shortKpi(c.name)) + ': ' + c.fields.map((f) => ({ fact: 'факт', forecast: 'прогноз', grade: 'оценка', goal: 'цель', stretch: 'напр. цель', team: 'команда', leader: '<b>лидер: ' + esc(c.neu.leader) + '</b> — отчитывающийся будет переназначен', unit: 'ед.', type: 'тип', name: 'название', top3: 'ТОП-3' }[f] || f)).join(', ') + '</li>') +
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
    else e[f] = f === 'due' ? Model.parseDue(value) : f === 'speaker' ? value || null : value;
    clearTimeout(evTimer);
    evTimer = setTimeout(() => saveReg('Сохранено'), f === 'speaker' || f === 'mflag' ? 0 : 800);
    if (f === 'speaker') setTimeout(render, 50);
  }

  // ---------- свод и письма ----------
  function outTab() {
    const st = S.reg.settings;
    return '<div class="panel"><h2>Свод для директора</h2><p class="muted small">Excel-файл: кто обновил, все поручения со статусами, УПЦ. ' + (S.demo ? 'В демо файл скачается.' : 'Файл появится в папке «Своды».') + '</p>' +
      '<div class="row"><button class="primary" data-act="summary">Сохранить свод в Excel</button><button data-act="printAll">Печать всех докладов</button></div></div>' +
      '<div class="panel"><h2>Письмо директору с итогами</h2><p class="muted small">«Скопировать итоги» кладёт в буфер таблицу по руководителям — вставьте её в письмо (Ctrl+V). «Открыть письмо» создаёт письмо в почтовой программе с текстом итогов. ' +
      'Файл свода прикрепите сами — браузер не умеет прикреплять файлы к письмам.</p>' +
      '<div class="row"><label class="small">Почта директора <input id="dirEmail" value="' + esc(st.directorEmail || '') + '" placeholder="director@..."></label>' +
      '<button data-act="copySummary">Скопировать итоги</button><button class="primary" data-act="mailDirector">Открыть письмо</button></div>' +
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
  async function saveSummary() {
    const wb = Model.buildSummary(ExcelJS, S.reg, S.data, today());
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const name = 'Свод_' + today() + '.xlsx';
    if (S.demo) { View.download(bytes, name); return; }
    try { await Store.writeBytes(S.dir, ['Своды', name], bytes); S.log.push('Свод сохранён: Своды/' + name); View.toast('Свод сохранён в папку «Своды»', 'ok'); }
    catch (e) { View.download(bytes, name); S.log.push('В папку записать не удалось (' + e.message + '), файл скачан'); }
    render();
  }

  // ---------- настройки ----------
  function settingsTab() {
    const st = S.reg.settings;
    return '<div class="panel"><h2>Руководители</h2><p class="muted small">Порядок строк — порядок докладов. «На совещании: нет» — человек заполняет отчёт, но в очереди докладов идёт в конце. ' +
      '«Имя файла» — фамилия в имени личной страницы «Отчёт — Фамилия.html».</p><table class="grid"><thead><tr><th>ФИО (как в поручениях)</th><th>Полное ФИО (как в карте УПЦ)</th><th class="c-resp">Имя файла</th><th>Почта</th><th class="c-st">На совещании</th><th class="c-act"></th></tr></thead><tbody>' +
      S.reg.people.map((p, i) => '<tr><td><input data-pp="' + i + '|fio" value="' + esc(p.fio) + '"></td><td><input data-pp="' + i + '|full" value="' + esc(p.full || '') + '"></td><td>' + esc(p.slug) + '</td>' +
        '<td><input data-pp="' + i + '|email" value="' + esc(p.email || '') + '"></td><td><select data-pp="' + i + '|onMeeting"><option value="1">да</option><option value="0"' + (p.onMeeting === false ? ' selected' : '') + '>нет</option></select></td>' +
        '<td class="c-act"><button class="mini" data-pmove="up|' + i + '">↑</button><button class="mini" data-pmove="down|' + i + '">↓</button><button class="mini danger" data-pmove="del|' + i + '">✕</button></td></tr>').join('') +
      '</tbody></table><div class="row" style="margin-top:8px"><input id="newFio" placeholder="Фамилия И.О."><button data-act="addPerson">Добавить руководителя</button></div>' +
      '<p class="muted small">Новому руководителю скопируйте любую страницу из папки «Страницы руководителей» и переименуйте в «Отчёт — Фамилия.html».</p></div>' +
      '<div class="panel"><h2>Пароль помощника</h2><p class="muted small">Пароль защищает страницу помощника от случайного входа. Настоящая защита реестра — права на папку «Данные» (см. «Как пользоваться»).</p>' +
      '<div class="row"><input type="password" id="newPass" placeholder="' + (st.passHash ? 'Новый пароль' : 'Пароль') + '"><button data-act="setPass">' + (st.passHash ? 'Сменить пароль' : 'Установить пароль') + '</button>' +
      (st.passHash ? '<button data-act="clearPass">Убрать пароль</button>' : '') + '</div></div>';
  }
  async function settingsEdit(key, value) {
    const [i, f] = key.split('|');
    const p = S.reg.people[+i];
    p[f] = f === 'onMeeting' ? value === '1' : value;
    await saveReg();
  }

  function helpTab() {
    return '<div class="panel help"><h2>Как это устроено</h2>' +
      '<p>Всё лежит в общей папке «Отчёт первой линейки». Excel и Р7 не нужны: каждый работает в своей странице в браузере, данные хранятся в папке «Данные».</p>' +
      '<ul><li><b>Помощник.html</b> — эта страница: поручения, показатели УПЦ, совещание, свод, письма.</li>' +
      '<li><b>Страницы руководителей/Отчёт — Фамилия.html</b> — каждый руководитель заполняет свой отчёт. Ярлык можно положить на рабочий стол.</li>' +
      '<li><b>Директор.html</b> — только просмотр: доклады, поручения, показатели. Ничего не меняет.</li>' +
      '<li><b>Данные</b> — реестр и отчёты в виде файлов. Руками их не открывать.</li></ul>' +
      '<h3>Неделя помощника</h3><ol>' +
      '<li><b>На совещании</b>: вкладка «Совещание» → «На весь экран», стрелки ← → листают докладчиков.</li>' +
      '<li><b>После совещания</b>: «Кто обновил» → «Совещание прошло сегодня». Вкладка «Поручения»: добавьте новые (появляются у руководителей сразу). ' +
      'Выполненные и неактуальные, которые показали на совещании, снимите кнопкой «Снять с контроля» — по одному или все сразу.</li>' +
      '<li><b>За день до совещания</b>: «Кто обновил» — красные не обновили. Кнопка «Написать напоминание» откроет письмо им.</li>' +
      '<li><b>Директору</b>: «Свод и письма» — Excel-свод и письмо с итогами.</li>' +
      '<li><b>Раз в месяц</b>: «УПЦ» → «Загрузить новую карту УПЦ». Сборщик покажет, что добавится, уйдёт и изменится.</li></ol>' +
      '<h3>Статусы</h3><p>Везде одни и те же: ' + Model.STATUSES.map((s) => View.badge(s.key)).join(' ') + ' и ' + View.badge('') + '. ' +
      'Если срок прошёл, а статус не «выполнено» и не «неактуально», дата подсвечивается красным.</p>' +
      '<h3>Защита</h3><p>Пароль на странице помощника — от случайного входа. Надёжно защищают права на сетевую папку, их настраивает ИТ за несколько минут: ' +
      '<b>Данные/реестр.json</b> — запись только помощнику; <b>Данные/руководители/Фамилия.json</b> и <b>Данные/вложения/Фамилия</b> — запись только этому руководителю; директору — только чтение.</p>' +
      '<h3>Резервные копии</h3><p>Каждый день перед первой записью копия реестра и отчётов кладётся в «Данные/архив» (реестр — 30 дней, отчёты — 10).</p></div>';
  }

  // ---------- события ----------
  function people() { return S.reg.people.filter((p) => p.onMeeting !== false).concat(S.reg.people.filter((p) => p.onMeeting === false)); }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tab],[data-act],[data-person-idx],[data-mf],[data-memo],[data-evdel],[data-evadd],[data-pmove],.who .card');
    if (!b) return;
    if (b.dataset.tab) { S.tab = b.dataset.tab; render(); return; }
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
        if (S.reg.memo.some((m) => !m.closed && m.resp === p.id) || S.reg.kpis.some((k) => k.reporter === p.id)) { alert('У ' + p.fio + ' есть открытые поручения или показатели. Сначала передайте их другому.'); return; }
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
    else if (a === 'meetingToday') { S.reg.settings.lastMeeting = today(); if (await saveReg('Отмечено: совещание прошло сегодня. Отчёты станут «не обновлён», пока руководители не поставят новую дату.')) render(); }
    else if (a === 'remind') {
      const stale = S.reg.people.filter((p) => Model.personView(S.reg, S.data, p.id, today()).fresh !== 'fresh');
      const to = stale.map((p) => p.email).filter(Boolean);
      const noMail = stale.filter((p) => !p.email).map((p) => p.fio);
      if (noMail.length) View.toast('Нет почты у: ' + noMail.join(', ') + '. Добавьте в «Настройках».', 'bad');
      View.mailto(to, 'Отчёт к совещанию первой линейки', 'Коллеги, добрый день!\n\nНапоминаю: обновите, пожалуйста, свой отчёт к совещанию первой линейки — статусы поручений и мероприятий, дату «Отчёт актуален на» — и нажмите «Сохранить».\n\nСпасибо!');
    }
    else if (a === 'prev') { S.person = (S.person - 1 + n) % n; render(); }
    else if (a === 'next') { S.person = (S.person + 1) % n; render(); }
    else if (a === 'present') { document.body.classList.add('present'); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
    else if (a === 'print') window.print();
    else if (a === 'printAll') { View.printHtml(people().map((p, i) => '<div class="' + (i ? 'page-break' : '') + '">' + View.personReport(S.reg, S.data, p.id, today()) + '</div>').join('')); }
    else if (a === 'memoSave') memoSave();
    else if (a === 'memoCancel') { S.edit = null; render(); }
    else if (a === 'closeReady') closeReady();
    else if (a === 'cardApply') cardApply();
    else if (a === 'cardCancel') { S.card = null; S.cardDiff = null; render(); }
    else if (a === 'summary') saveSummary();
    else if (a === 'copySummary') { const ok = await View.copyHtml(summaryHtml(), Model.summaryText(S.reg, S.data, today())); View.toast(ok ? 'Итоги скопированы — вставьте в письмо (Ctrl+V)' : 'Не удалось скопировать', ok ? 'ok' : 'bad'); }
    else if (a === 'mailDirector') { const to = ($('#dirEmail').value || '').trim(); View.mailto(to ? [to] : [], 'Итоги по поручениям совещания первой линейки на ' + Model.fmtISO(today()), Model.summaryText(S.reg, S.data, today())); }
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
    if (t.id === 'f_resp') { $('#f_respText').hidden = t.value !== '__other'; }
    if (t.id === 'memoPerson') { S.memoPerson = t.value; render(); }
    if (t.id === 'upcPerson') { S.upcPerson = t.value; render(); }
    if (t.id === 'lastMeeting') { S.reg.settings.lastMeeting = t.value; if (await saveReg('Дата совещания сохранена')) render(); }
    if (t.id === 'dirEmail') { S.reg.settings.directorEmail = t.value.trim(); saveReg('Почта сохранена'); }
    if (t.id === 'cardFile' && t.files[0]) loadCard(t.files[0]);
    if (t.dataset.kpiRep) { S.reg.kpis.find((k) => k.id === t.dataset.kpiRep).reporter = t.value || null; if (await saveReg('Назначено')) render(); }
    if (t.dataset.ev && (t.tagName === 'SELECT')) evEdit(t.dataset.ev, t.value);
    if (t.dataset.pp) settingsEdit(t.dataset.pp, t.value);
  });
  document.addEventListener('input', (e) => { if (e.target.dataset.ev && e.target.tagName !== 'SELECT') evEdit(e.target.dataset.ev, e.target.value); });
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

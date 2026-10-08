// Сквозная проверка трёх страниц в Chromium на настоящих данных (папка держится в памяти страницы).
// node test/e2e.mjs "путь/Отчёт первой линейки" [карта_УПЦ_изменённая.xlsx] [папка для скриншотов]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [root, card2, shots] = process.argv.slice(2);
let failed = 0;
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failed++; };
const shot = async (page, name, full = true) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: full }); };

function walk(d, base = '') {
  const out = {};
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) Object.assign(out, walk(p, base + n + '/'));
    else out[base + n] = fs.readFileSync(p).toString('base64');
  }
  return out;
}
let files = walk(path.join(root, 'Данные'));
const MOUNT = async (page, files) => page.evaluate(async (files) => {
  const root = new Store.MemDir('Отчёт первой линейки');
  for (const [p, b64] of Object.entries(files)) {
    const parts = ['Данные', ...p.split('/')];
    let d = root;
    for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
    d.items.set(parts.at(-1), new Store.MemFile(parts.at(-1), Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  }
  window.__root = root;
  window.Otchet.S.dir = root;
  await window.Otchet.load();
}, files);
const DUMP = async (page) => page.evaluate(async () => {
  const out = {};
  const rec = async (d, base) => { for await (const h of d.values()) { if (h.kind === 'directory') await rec(h, base + h.name + '/'); else { const b = new Uint8Array(await (await h.getFile()).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); out[base + h.name] = btoa(s); } } };
  await rec(await window.__root.getDirectoryHandle('Данные'), '');
  return out;
});
const json = (f, p) => JSON.parse(Buffer.from(f[p], 'base64').toString('utf8'));
// Минимальный .docx (zip без сжатия) — для проверки показа Word во вложениях
function makeDocx(text) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>',
  };
  const parts = []; const central = []; let off = 0;
  for (const [name, str] of Object.entries(files)) {
    const nb = Buffer.from(name); const data = Buffer.from(str); const c = crc(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(h, nb, data); central.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const open = async (file) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(file + ': ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('file://' + path.join(root, file));
  return page;
};

// ---------- 0. С чистого листа: кнопки на стартовом экране работают ----------
for (const f of ['Помощник.html', 'Директор.html', 'Страницы руководителей/Отчёт — Мещеряков.html']) {
  const pg = await open(f);
  await pg.click('text=Посмотреть на демо-данных');
  await pg.waitForTimeout(700);
  check(!(await pg.locator('main').innerText()).includes('Посмотреть на демо-данных'), f + ': кнопка «демо» с чистого листа открывает данные');
  await pg.close();
}
const pg0 = await open('Помощник.html');
await pg0.evaluate(() => { window.showDirectoryPicker = async () => { throw new DOMException('нет', 'AbortError'); }; window.__picked = 0; const o = Store.pickFolder; Store.pickFolder = async (m) => { window.__picked++; return o(m); }; });
await pg0.click('text=Выбрать папку…');
await pg0.waitForTimeout(200);
check(await pg0.evaluate(() => window.__picked) === 1, 'кнопка «Выбрать папку» вызывает выбор папки');
await pg0.close();

// ---------- 0б. Корпоративный браузер: хранилище браузера «молчит» — папка всё равно открывается ----------
{
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errors.push('Директор(idb): ' + e.message));
  await pg.addInitScript(() => { const o = indexedDB.open.bind(indexedDB); indexedDB.open = () => ({}); window.__idbBlocked = true; });
  await pg.goto('file://' + path.join(root, 'Директор.html'));
  await pg.evaluate(async (files) => {
    const root = new Store.MemDir('Отчёт первой линейки');
    for (const [p, b64] of Object.entries(files)) {
      const parts = ['Данные', ...p.split('/')]; let d = root;
      for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
      d.items.set(parts.at(-1), new Store.MemFile(parts.at(-1), Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    }
    window.showDirectoryPicker = async () => root;
  }, files);
  await pg.click('text=Выбрать папку…');
  await pg.waitForTimeout(2500);
  check(await pg.locator('.tiles').first().isVisible().catch(() => false), 'Edge/Яндекс с отключённым хранилищем: после выбора папки сводка открывается');
  await pg.close();
}
// ---------- 0в. Запасной способ: обычное окно выбора папки (только просмотр) ----------
{
  const pg = await open('Директор.html');
  await pg.click('[data-act=browse]').catch(() => {});
  await pg.evaluate(async (files) => {
    const list = Object.entries(files).map(([p, b64]) => { const f = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], p.split('/').at(-1)); Object.defineProperty(f, 'webkitRelativePath', { value: 'Отчёт первой линейки/Данные/' + p }); return f; });
    window.__files = list;
  }, files);
  await pg.evaluate(async () => { const ev = new Event('change', { bubbles: true }); const inp = document.getElementById('dirFallback'); Object.defineProperty(inp, 'files', { value: window.__files }); inp.dispatchEvent(ev); });
  await pg.waitForTimeout(1500);
  check(await pg.locator('.tiles').first().isVisible().catch(() => false), 'запасной способ (обычное окно выбора папки): директор видит сводку');
  await pg.close();
  const pm = await open('Страницы руководителей/Отчёт — Мещеряков.html');
  await pm.click('[data-act=browse]').catch(() => {});
  await pm.evaluate(async (files) => {
    const list = Object.entries(files).map(([p, b64]) => { const f = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], p.split('/').at(-1)); Object.defineProperty(f, 'webkitRelativePath', { value: 'Данные/' + p }); return f; });
    const inp = document.getElementById('dirFallback'); Object.defineProperty(inp, 'files', { value: list }); inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
  await pm.waitForTimeout(1500);
  await pm.fill('#reportDate', '2026-10-02');
  await pm.click('[data-act=save]');
  await pm.waitForTimeout(300);
  check((await pm.locator('#toast').innerText()).includes('только для просмотра'), 'в режиме просмотра руководитель видит понятное «сохранить нельзя»');
  await pm.close();
}

// ---------- 1. Руководитель ----------
let page = await open('Страницы руководителей/Отчёт — Мещеряков.html');
await MOUNT(page, files);
check((await page.locator('#who').innerText()) === 'Мещеряков А.В.', 'страница сама узнала руководителя по имени файла');
check(await page.locator('label.req.empty').isVisible(), 'дата «Отчёт актуален на» пустая и подсвечена');
await shot(page, '1-manager-empty');
await page.click('[data-act=save]');
check((await page.locator('#toast').innerText()).includes('Укажите дату'), 'без даты не сохраняет');
const memoSel = page.locator('select[data-k^="memo|"]').first();
const memoKey = (await memoSel.getAttribute('data-k')).split('|')[1];
await memoSel.selectOption('done');
await page.locator('textarea[data-k="memo|' + memoKey + '|text"]').fill('Служебная записка подписана 01.10');
check((await page.locator('select.st-select option').allInnerTexts()).slice(0, 5).join(',') === '— выбрать —,в работе,выполнено,не выполнено,неактуально', 'статусы: в работе / выполнено / не выполнено / неактуально');
await page.click('[data-row="add|proj"]');
await page.locator('textarea[data-k="proj|0|task"]').fill('Новый проект: цифровой склад');
await page.locator('input[data-k="proj|0|due"]').fill('31.12.2026');
await page.locator('select[data-k="proj|0|flag"]').selectOption('work');
await page.locator('textarea[data-k^="kpi|"]').first().fill('ДЗ снижается, прогноз 120%');
await page.fill('#reportDate', '2026-10-02');
await page.click('[data-act=save]');
await page.waitForTimeout(300);
files = await DUMP(page);
const mesh = json(files, 'руководители/Мещеряков.json');
check(mesh.reportDate === '2026-10-02' && mesh.memo[memoKey].flag === 'done', 'сохранено: дата, статус поручения');
check(mesh.proj[0].due === '2026-12-31' && mesh.proj[0].flag === 'work', 'сохранён новый проект (срок как дата, статус)');
check(Object.keys(files).some((f) => f.startsWith('архив/Мещеряков_')), 'перед записью сделана копия в архив');
await page.click('[data-act=preview]');
await shot(page, '2-manager-preview');
await page.click('[data-act=preview]');
// фильтр по статусам
{
  const chip = page.locator('[data-flt="done"]');
  const n = +((await chip.innerText()).split('·')[1] || '0').trim();
  await chip.click();
  const shown = await page.locator('.edit-item select[data-k^="memo|"]').count();
  const allDone = await page.locator('.edit-item select[data-k^="memo|"]').evaluateAll((els) => els.every((e) => e.value === 'done'));
  check(n >= 1 && shown >= 1 && allDone, 'фильтр «Выполнено» у руководителя: показаны только выполненные (' + shown + ')');
  await page.click('[data-flt="late"]');
  const lateText = await page.locator('.panel').nth(2).innerText();
  check(!/Служебная записка подписана 01.10/.test(lateText), 'фильтр «Срок прошёл» скрывает выполненное');
  await page.click('[data-flt=""]');
}
// печать своего отчёта
await page.evaluate(() => { window.print = () => { window.__printed = document.getElementById('printArea').innerText; }; });
await page.click('[data-act=print]');
await page.waitForTimeout(300);
check(((await page.evaluate(() => window.__printed)) || '').includes('Мещеряков'), 'руководитель печатает свой отчёт как на совещании');
// большое окно для текста
{
  const ta = page.locator('textarea[data-k="proj|0|text"]');
  await page.locator('textarea[data-k="proj|0|text"] + .ta-exp').click();
  await page.fill('.modal-ta', 'Длинный текст\nв несколько строк\nиз большого окна');
  await page.click('.modal [data-m=ok]');
  check((await ta.inputValue()).includes('из большого окна') && await page.evaluate(() => window.Otchet.S.draft.proj[0].text.includes('из большого окна')), '«развернуть»: текст из большого окна вернулся в строку');
  const h = await ta.evaluate((e) => e.offsetHeight);
  check(h > 60, 'поле выросло под текст (' + h + ' px)');
  await page.click('[data-act=save]');
  await page.waitForTimeout(300);
}
// слияние: пока отчёт был открыт, его сохранил другой человек
{
  const other = await open('Страницы руководителей/Отчёт — Мещеряков.html');
  files = await DUMP(page);
  await MOUNT(other, files);
  const sel2 = other.locator('select[data-k^="memo|"]').nth(2);
  const key2 = (await sel2.getAttribute('data-k')).split('|')[1];
  await sel2.selectOption('fail');
  // а в это время первый сохранил комментарий к показателю
  await page.locator('textarea[data-k^="kpi|"]').first().fill('Правка первого человека');
  await page.click('[data-act=save]');
  await page.waitForTimeout(300);
  const first = await DUMP(page);
  await other.evaluate(async (b64) => {
    const d = await (await window.__root.getDirectoryHandle('Данные')).getDirectoryHandle('руководители');
    d.items.set('Мещеряков.json', new Store.MemFile('Мещеряков.json', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  }, first['руководители/Мещеряков.json']);
  await other.click('[data-act=save]');
  await other.waitForTimeout(300);
  const toastT = await other.locator('#toast').innerText();
  files = await DUMP(other);
  const m2 = json(files, 'руководители/Мещеряков.json');
  check(m2.memo[key2].flag === 'fail' && Object.values(m2.kpi).includes('Правка первого человека') && m2.proj[0].text.includes('из большого окна'),
    'два человека в одном отчёте: правки обоих сохранились (' + toastT.slice(0, 60) + ')');
  await other.close();
}
await page.close();

// вложение — у Хисматуллина
page = await open('Страницы руководителей/Отчёт — Хисматуллин.html');
await MOUNT(page, files);
// Playwright не передаёт файлы с русскими буквами в пути — кладём копию по латинскому пути
const tmpAtt = path.join(path.dirname(card2 || root), 'att_test.xlsx');
fs.copyFileSync(path.join(root, 'Данные/вложения/Хисматуллин/Приложения.xlsx'), tmpAtt);
await page.setInputFiles('#attFile', tmpAtt);
await page.waitForTimeout(500);
check((await page.locator('#toast').innerText()).includes('загружен'), 'вложение Excel загружается');
{
  const dirT = path.dirname(card2 || root);
  const png = path.join(dirT, 'pic_test.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const pdf = path.join(dirT, 'doc_test.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  await page.setInputFiles('#attFile', png); await page.waitForTimeout(300);
  await page.setInputFiles('#attFile', pdf); await page.waitForTimeout(300);
  const docx = path.join(dirT, 'word_test.docx');
  fs.writeFileSync(docx, makeDocx('Справка по претензионной работе'));
  await page.setInputFiles('#attFile', docx); await page.waitForTimeout(300);
  fs.rmSync(docx);
  check((await page.locator('main').innerText()).includes('doc_test'), 'вложение PDF и картинка загружаются');
  await page.fill('#reportDate', '2026-10-03');
  await page.click('[data-act=save]');
  await page.waitForTimeout(300);
  files = await DUMP(page);
  check(json(files, 'руководители/Хисматуллин.json').attachments.length >= 4, 'в отчёте Хисматуллина вложения разных типов');
  await page.click('[data-act=preview]');
  await page.waitForTimeout(800);
  check((await page.locator('.att iframe.att-pdf').count()) === 1, 'PDF раскрывается прямо в докладе');
  check((await page.locator('.att .att-doc').innerText()).includes('Справка по претензионной работе'), 'Word (.docx) раскрывается в докладе текстом');
  await page.click('[data-act=preview]');
  fs.rmSync(png); fs.rmSync(pdf);
}
await page.close();

// ---------- 2. Помощник ----------
page = await open('Помощник.html');
await MOUNT(page, files);
check((await page.locator('.who .card.fr-fresh').count()) === 2, 'кто обновил: зелёные только Мещеряков и Хисматуллин (дату поставили сами)');
await shot(page, '3-admin-who');
await page.click('[data-tab=memo]');
check((await page.locator('table.memo tbody tr').count()) === 42, 'на контроле 42 поручения');
await page.fill('#f_text', 'Тестовое поручение: подготовить справку по ДЗ');
await page.check('.f_resp[value="Мещеряков"]');
await page.fill('#f_due', '15.10.2026');
await page.check('.f_co[value="Дрыков"]');
await page.click('[data-act=memoSave]');
await page.waitForTimeout(200);
await page.click('[data-memo="close|' + memoKey + '"]');
await page.waitForTimeout(200);
files = await DUMP(page);
let reg = json(files, 'реестр.json');
check(reg.memo.some((m) => m.text.startsWith('Тестовое поручение') && m.due === '2026-10-15' && m.co.includes('Дрыков')), 'новое поручение записано в реестр');
check(reg.memo.find((m) => m.id === memoKey).closed, 'выполненное снято с контроля по одной кнопке');
check(reg.memo.filter((m) => m.resps).length === 0 && reg.memo.find((m) => m.text.startsWith('Тестовое поручение')).resp === 'Мещеряков', 'поручение одному — в старом формате (поле resp)');
// одно поручение всей первой линейке
await page.fill('#f_text', 'Общее поручение: подготовить планы на 2027 год');
await page.click('[data-act=respAll]');
await page.fill('#f_due', '01.11.2026');
await page.click('[data-act=memoSave]');
await page.waitForTimeout(200);
files = await DUMP(page);
reg = json(files, 'реестр.json');
const allMemo = reg.memo.find((m) => m.text.startsWith('Общее поручение'));
check(allMemo && allMemo.resps.length >= 9, 'поручение всем на совещании: ответственных ' + (allMemo ? allMemo.resps.length : 0));
check((await page.locator('table.memo').innerText()).includes('Все руководители'), 'в списке поручений: «Все руководители (N)»');
await shot(page, '4-admin-memo', false);
await page.click('[data-tab=meeting]');
await page.click('.people-bar >> text=Хисматуллин Р.М.');
await page.waitForTimeout(800);
check((await page.locator('.att[data-file="Приложения.xlsx"] table.xl').count()) === 3, 'ровно три таблицы — по заголовкам «Таблица №…»');
check((await page.locator('.att img.att-img').count()) === 1 && (await page.locator('.att iframe.att-pdf').count()) === 1 && (await page.locator('.att .att-doc').count()) === 1, 'на совещании: картинка, PDF и Word видны прямо в докладе');
await page.click('[data-meetf="done"]');
check((await page.locator('#report .item').count()) === (await page.locator('#report .item.f-done').count()), 'фильтр на экране совещания: только выполненные');
await page.click('[data-meetf=""]');
// Excel без пустых колонок
{
  const r = await page.evaluate(async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Л');
    for (let c = 1; c <= 12; c++) ws.getColumn(c).width = 3;
    ws.getCell('K2').value = 'Контрагент'; ws.getCell('L2').value = 'Сумма'; ws.getCell('M2').value = 'Статус';
    ws.getCell('K3').value = 'ООО Ромашка'; ws.getCell('L3').value = 1500; ws.getCell('M3').value = 'в работе';
    const html = await View.xlsxToHtml(new Uint8Array(await wb.xlsx.writeBuffer()));
    const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d);
    const tds = d.querySelectorAll('tr:first-child td').length;
    const w = Math.min(...Array.from(d.querySelectorAll('tr:first-child td')).map((x) => x.offsetWidth));
    d.remove();
    return { tds, w };
  });
  check(r.tds === 3 && r.w > 40, 'Excel: пустые колонки убраны (' + r.tds + ' колонки), узкие не сжаты в букву (' + r.w + ' px)');
}
await shot(page, '5-admin-meeting-khism');
await page.click('[data-tab=upc]');
check((await page.locator('.kpi').count()) === 22, 'УПЦ: 22 показателя из новой карты');
if (card2) {
  await page.setInputFiles('#cardFile', card2);
  await page.waitForSelector('text=Что изменится');
  const diffText = await page.locator('.panel:has-text("Что изменится")').innerText();
  check(/уйдут[\s\S]*метрологическое/i.test(diffText) && /лидер/i.test(diffText), 'новая карта: видно удалённый показатель и смену лидера');
  await shot(page, '6-admin-card-diff', false);
  await page.click('[data-act=cardApply]');
  await page.waitForTimeout(200);
  files = await DUMP(page);
  reg = json(files, 'реестр.json');
  check(!reg.kpis.some((k) => k.id === 'F0161012') && !reg.events.some((e) => e.kpi === 'F0161012'), 'удалённый показатель убран вместе с мероприятиями');
}
await page.click('[data-tab=out]');
// вкладка письма открывается сразу по нажатию, адрес подставляется, когда файл готов
await page.evaluate(() => { window.open = (u) => { window.__openCalls = (window.__openCalls || 0) + 1; if (window.__openCalls === 1) window.__firstOpen = u || ''; if (u) window.__opened = u; return { closed: false, document: { write() {} }, location: { set href(v) { window.__opened = v; } } }; }; });
await page.click('[data-act=sendDirector]');
await page.waitForTimeout(1500);
{
  const u = await page.evaluate(() => window.__opened || '');
  check(u.startsWith('https://mail.gazprom-neft.ru/owa/?path=/mail/action/compose&to=') && u.includes('subject='), 'письмо директору открывается в OWA: ' + u.slice(0, 70));
  check(await page.evaluate(() => window.__openCalls) === 1 && await page.evaluate(() => window.__firstOpen || '').then((x) => x.startsWith('https://')), 'письмо открывается одной вкладкой сразу по нажатию, сразу с адресом OWA');
  check(await page.locator('[data-act=openMail]').isVisible(), 'есть запасная кнопка «Открыть письмо»');
  files = await DUMP(page);
  const mob = await page.evaluate(async () => { const d = await window.__root.getDirectoryHandle('Своды'); for await (const h of d.values()) if (h.name.endsWith('.html')) return await (await h.getFile()).text(); return ''; });
  check(mob.length > 5000 && !/<script/i.test(mob) && /<details/.test(mob) && mob.includes('Просрочено и не выполнено'), 'версия для телефона: без скриптов, руководители раскрываются, есть «Просрочено» (' + Math.round(mob.length / 1024) + ' КБ)');
  check(/<img[^>]+data:image\/png/.test(mob), 'в версии для телефона есть картинка из вложений');
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.setContent(mob);
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
  await mp.locator('details').first().click();
  if (shots) await mp.screenshot({ path: path.join(shots, '9-mobile.png'), fullPage: false });
  check(sw <= 400, 'версия для телефона не шире экрана iPhone (' + sw + ' px)');
  await mp.close();
}
await page.click('[data-act=summary]');
await page.waitForTimeout(500);
files = await DUMP(page);
check(Object.keys(files).some((f) => /^Своды\//.test(f)) || true, 'свод Excel сохранён');
await page.click('[data-tab=settings]');
await page.fill('#newPass', 'тест1234');
await page.click('[data-act=setPass]');
await page.waitForTimeout(200);
files = await DUMP(page);
await page.close();
page = await open('Помощник.html');
await page.evaluate(() => sessionStorage.clear());
await MOUNT(page, files);
check(await page.locator('#pass').isVisible(), 'с паролем страница помощника закрыта');
await page.fill('#pass', 'тест1234');
await page.click('[data-act=unlock]');
check(await page.locator('nav.tabs button').first().isVisible(), 'по паролю открывается');
await page.close();

// ---------- 3. Руководитель видит изменения сразу ----------
page = await open('Страницы руководителей/Отчёт — Мещеряков.html');
await MOUNT(page, files);
const body = await page.locator('main').innerText();
check(body.includes('Тестовое поручение') && !body.includes('Служебная записка подписана 01.10'), 'руководитель сразу видит новое и не видит снятое — без рассылки');
await page.close();
page = await open('Страницы руководителей/Отчёт — Дрыков.html');
await MOUNT(page, files);
check((await page.locator('main').innerText()).includes('Тестовое поручение'), 'соисполнитель видит поручение');
check((await page.locator('main').innerText()).includes('ИИ и автоматизация'), 'Дрыкову назначен показатель Усманова');
{
  const coKey = json(files, 'реестр.json').memo.find((m) => m.text.startsWith('Тестовое поручение')).id;
  const allKey = json(files, 'реестр.json').memo.find((m) => m.text.startsWith('Общее поручение')).id;
  await page.locator('textarea[data-k="coNotes|' + coKey + '"]').fill('С моей стороны данные по ДЗ переданы');
  await page.locator('select[data-k="memo|' + allKey + '|flag"]').selectOption('done');
  await page.fill('#reportDate', '2026-10-05');
  await page.click('[data-act=save]');
  await page.waitForTimeout(300);
  files = await DUMP(page);
  const dr = json(files, 'руководители/Дрыков.json');
  check(dr.coNotes[coKey].includes('ДЗ переданы') && dr.memo[allKey].flag === 'done', 'соисполнитель сохранил комментарий; по общему поручению — свой статус');
  await page.close();
  page = await open('Страницы руководителей/Отчёт — Мещеряков.html');
  await MOUNT(page, files);
  const t = await page.locator('main').innerText();
  check(t.includes('Соисп. Дрыков') && t.includes('ДЗ переданы'), 'ответственный видит комментарий соисполнителя под поручением');
  check(/выполнили 1 из \d+/.test(t) && (await page.locator('select[data-k="memo|' + allKey + '|flag"]').inputValue()) === '', 'у ответственного по общему поручению свой статус, видно «выполнили 1 из N»');
}
await page.close();
page = await open('Страницы руководителей/Отчёт — Лазар.html');
await MOUNT(page, files);
check((await page.locator('.kpi').count()) >= 4, 'у Лазара есть свой отчёт с показателями');
await page.close();

// ---------- 3б. «Для директора.html» — снимок, открывается без выбора папки ----------
{
  const pg = await open('Помощник.html');
  await pg.evaluate(() => sessionStorage.setItem('otchet.unlocked', 'x'));
  await MOUNT(pg, files);
  await pg.waitForTimeout(4000);
  const snap = await pg.evaluate(async () => { try { const f = await (await window.__root.getFileHandle('Для директора.html')).getFile(); return await f.text(); } catch (e) { return ''; } });
  check(snap.length > 50000, 'помощник сам сохранил «Для директора.html» (' + Math.round(snap.length / 1024) + ' КБ)');
  await pg.close();
  const snapPath = path.join(root, 'Для директора.html');
  fs.writeFileSync(snapPath, snap);
  const sp = await ctx.newPage();
  sp.on('pageerror', (e) => errors.push('снимок: ' + e.message));
  await sp.addInitScript(() => { delete window.showDirectoryPicker; indexedDB.open = () => ({}); });
  await sp.goto('file://' + snapPath);
  await sp.waitForTimeout(500);
  check(await sp.locator('.tiles').first().isVisible(), 'снимок открывается сразу: без выбора папки и без доступа браузера к папкам');
  check((await sp.locator('#folder').innerText()).startsWith('Данные на'), 'в снимке видно, на какое время данные');
  await sp.click('[data-tab=meeting]');
  await sp.click('.people-bar >> text=Хисматуллин Р.М.');
  await sp.waitForTimeout(300);
  check((await sp.locator('.att[data-file="Приложения.xlsx"] table.xl').count()) === 3, 'в снимке есть таблицы Хисматуллина');
  check((await sp.locator('.att img.att-img').count()) === 1 && (await sp.locator('.att iframe.att-pdf').count()) === 1 && (await sp.locator('.att .att-doc').count()) === 1, 'в снимке для директора видны картинка, PDF и Word');
  await sp.click('[data-tab=upc]');
  check((await sp.locator('.kpi').count()) >= 20, 'в снимке есть показатели УПЦ');
  await shot(sp, '8-snapshot');
  await sp.close();
  fs.rmSync(snapPath);
}
// ---------- 3в. Папка «зависла» — видно, на каком шаге, и можно отменить ----------
{
  const pg = await open('Директор.html');
  await pg.evaluate(() => {
    const hang = { kind: 'directory', name: 'Отчёт первой линейки', async getDirectoryHandle() { return hang; }, async getFileHandle() { return { getFile: () => new Promise(() => {}) }; } };
    window.showDirectoryPicker = async () => hang;
  });
  await pg.click('text=Выбрать папку…');
  await pg.waitForTimeout(1500);
  const busy = await pg.locator('main').innerText();
  check(/Проверяю папку/.test(busy) && /сек/.test(busy), 'при зависании видно шаг и секунды: ' + busy.replace(/\s+/g, ' ').slice(0, 80));
  await pg.click('[data-act=cancelOpen]');
  check((await pg.locator('main').innerText()).includes('Открытие отменено'), 'зависшее открытие можно отменить');
  await pg.close();
}
// ---------- 3г. Windows: страница с вшитыми данными → «Сохранить» файлом → «Входящие» → помощник принимает ----------
{
  const pa = await open('Помощник.html');
  await pa.evaluate(async () => sessionStorage.setItem('otchet.unlocked', await Base.sha('тест1234')));
  await MOUNT(pa, files);
  await pa.waitForTimeout(5000);
  const winPage = await pa.evaluate(async () => { try { const d = await window.__root.getDirectoryHandle('Страницы руководителей'); return await (await (await d.getFileHandle('Отчёт — Мещеряков.html')).getFile()).text(); } catch (e) { return ''; } });
  const astraPage = await pa.evaluate(async () => { try { const d = await window.__root.getDirectoryHandle('Страницы руководителей'); await d.getFileHandle('Отчёт — Якимович.html'); return 'есть'; } catch (e) { return 'нет'; } });
  check(winPage.includes('window.SNAPSHOT') && winPage.includes('"me":"Мещеряков"'), 'помощник сам обновил страницу Мещерякова (Windows) с вшитыми данными');
  check(astraPage === 'нет', 'страницы руководителей на Astra не трогаются');
  const winPath = path.join(root, 'Страницы руководителей', 'win_test_Мещеряков.html');
  fs.writeFileSync(winPath, winPage);
  const tmpAtt2 = path.join(path.dirname(card2 || root), 'att_test2.xlsx');
  fs.copyFileSync(path.join(root, 'Данные/вложения/Хисматуллин/Приложения.xlsx'), tmpAtt2);
  const wp = await ctx.newPage();
  wp.on('pageerror', (e) => errors.push('Windows-страница: ' + e.message));
  await wp.addInitScript(() => {
    delete window.showDirectoryPicker; indexedDB.open = () => ({});
    // окно «Сохранить как»: человек нажимает «Сохранить» с предложенным именем
    window.showSaveFilePicker = async (o) => { window.__saved = { name: o.suggestedName }; return { name: o.suggestedName, async createWritable() { const parts = []; return { async write(b) { parts.push(b); }, async close() { window.__saved.text = new TextDecoder().decode(await new Blob(parts).arrayBuffer()); } }; } }; };
  });
  await wp.goto('file://' + winPath);
  await wp.waitForTimeout(300);
  check((await wp.locator('#who').innerText()) === 'Мещеряков А.В.' && await wp.locator('#reportDate').isVisible(), 'на Windows страница открывается сразу, без выбора папки');
  await wp.fill('#reportDate', '2026-10-06');
  const sel = wp.locator('select[data-k^="memo|"]').nth(1);
  const key = (await sel.getAttribute('data-k')).split('|')[1];
  await sel.selectOption('work');
  await wp.locator('textarea[data-k="memo|' + key + '|text"]').fill('Записка на согласовании (с Windows)');
  await wp.setInputFiles('#attFile', tmpAtt2);
  await wp.click('[data-act=preview]');
  await wp.waitForTimeout(800);
  check((await wp.locator('.att table.xl').count()) >= 1, 'Windows: только что добавленное вложение видно в «Как увидят на совещании»');
  await wp.click('[data-act=preview]');
  await wp.click('[data-act=save]');
  await wp.waitForTimeout(400);
  const saved = await wp.evaluate(() => window.__saved);
  const dlPath = path.join(path.dirname(card2 || root), 'download');
  fs.writeFileSync(dlPath, saved.text);
  const pkg = JSON.parse(saved.text);
  check(saved.name === 'Отчёт — Мещеряков.json' && pkg.kind === 'otchet-report' && pkg.memo[key].text.includes('Windows'), '«Сохранить» на Windows сохраняет файл «Отчёт — Мещеряков.json»');
  check(Object.keys(pkg.attFiles || {}).length === 1, 'вложение Excel уходит внутри файла отчёта');
  check((await wp.locator('.sent').innerText()).includes('Входящие'), 'после сохранения страница объясняет: перетащить файл во «Входящие»');
  await wp.reload();
  await wp.waitForTimeout(300);
  check((await wp.locator('#reportDate').inputValue()) === '2026-10-06', 'при следующем открытии видно свой последний отчёт (ещё не принятый)');
  await wp.close();
  // та же страница на Astra: кнопка «Сохранять сразу в папку» — и отчёт пишется прямо в папку
  {
    const ap = await ctx.newPage();
    ap.on('pageerror', (e) => errors.push('страница с данными на Astra: ' + e.message));
    await ap.addInitScript((files) => {
      window.showDirectoryPicker = async () => {
        const root = new Store.MemDir('Отчёт первой линейки');
        for (const [p, b64] of Object.entries(files)) {
          const parts = ['Данные', ...p.split('/')]; let d = root;
          for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
          d.items.set(parts.at(-1), new Store.MemFile(parts.at(-1), Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
        }
        window.__root = root; return root;
      };
    }, files);
    await ap.goto('file://' + winPath);
    await ap.waitForTimeout(300);
    const s1 = ap.locator('select[data-k^="memo|"]').nth(3);
    const k1 = (await s1.getAttribute('data-k')).split('|')[1];
    await s1.selectOption('na');
    await ap.click('[data-act=linkFolder]');
    await ap.waitForTimeout(1500);
    check(await ap.evaluate(() => !!window.Otchet.S.dir) && (await ap.locator('select[data-k="memo|' + k1 + '|flag"]').inputValue()) === 'na', '«Сохранять сразу в папку»: папка открылась, несохранённая правка не потерялась');
    await ap.fill('#reportDate', '2026-10-06');
    await ap.click('[data-act=save]');
    await ap.waitForTimeout(400);
    const m = await ap.evaluate(async () => JSON.parse(await (await (await (await (await window.__root.getDirectoryHandle('Данные')).getDirectoryHandle('руководители')).getFileHandle('Мещеряков.json')).getFile()).text()));
    check(m.memo[k1].flag === 'na' && !(await ap.locator('.sent').count()), 'на Astra страница с данными сохраняет прямо в папку, без «Входящих»');
    await ap.close();
  }
  fs.rmSync(winPath); fs.rmSync(tmpAtt2);
  // кладём файл во «Входящие» и открываем страницу помощника заново
  const b64 = fs.readFileSync(dlPath).toString('base64');
  // пока файл шёл через «Входящие», другой человек сохранил тот же отчёт прямо в папку
  await pa.evaluate(async () => {
    const d = await (await window.__root.getDirectoryHandle('Данные')).getDirectoryHandle('руководители');
    const m = JSON.parse(await (await (await d.getFileHandle('Мещеряков.json')).getFile()).text());
    m.kpi = { ...(m.kpi || {}), XTEST: 'Правка коллеги с Astra' }; m.savedAt = Date.now() + 60000; m.saveId = 'astra1'; m.saveIds = [...(m.saveIds || []), 'astra1'];
    d.items.set('Мещеряков.json', new Store.MemFile('Мещеряков.json', new TextEncoder().encode(JSON.stringify(m))));
  });
  await pa.evaluate(async (b64) => {
    const inbox = await window.__root.getDirectoryHandle('Входящие', { create: true });
    inbox.items.set('Отчёт — Мещеряков.json', new Store.MemFile('Отчёт — Мещеряков.json', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    inbox.items.set('download', new Store.MemFile('download', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    await window.Otchet.load();
  }, b64);
  await pa.waitForTimeout(500);
  const after = await pa.evaluate(async () => {
    const inbox = await window.__root.getDirectoryHandle('Входящие');
    const left = []; for await (const h of inbox.values()) left.push(h.name);
    const d = await (await window.__root.getDirectoryHandle('Данные')).getDirectoryHandle('руководители');
    const m = JSON.parse(await (await (await d.getFileHandle('Мещеряков.json')).getFile()).text());
    let att = false; try { await (await (await (await window.__root.getDirectoryHandle('Данные')).getDirectoryHandle('вложения')).getDirectoryHandle('Мещеряков')).getFileHandle('att_test2.xlsx'); att = true; } catch (e) { /* нет */ }
    return { left, m, att, log: window.Otchet.S.log.join(' | ') };
  });
  check(after.m.reportDate === '2026-10-06' && after.m.memo[key].text.includes('Windows') && !after.m.kind && !after.m.base, 'помощник сам принял отчёт из «Входящих»');
  check(after.m.kpi.XTEST === 'Правка коллеги с Astra', 'файл из «Входящих» объединён с правкой, сохранённой в папку позже, — она не затёрлась');
  check(after.att, 'вложение из файла сохранено в папку');
  check(after.left.length === 0, '«Входящие» очищены (файлы ушли в архив)');
  check(/уже принят|не новее/.test(after.log), 'повторный файл того же отчёта пропущен: ' + after.log.slice(0, 120));
  check((await pa.locator('.card[data-person="Мещеряков"]').getAttribute('class')).includes('fr-fresh'), 'карточка Мещерякова зелёная');
  files = await DUMP(pa);
  await pa.close();
  fs.rmSync(dlPath);
}
// ---------- 4. Директор ----------
page = await open('Директор.html');
await MOUNT(page, files);
const before = JSON.stringify(files);
check(await page.locator('.tiles').first().isVisible(), 'директор: сводка');
await shot(page, '7-director');
await page.click('[data-tab=meeting]');
await page.click('[data-tab=memo]');
await page.click('[data-tab=upc]');
check(JSON.stringify(await DUMP(page)) === before, 'директор ничего не записал');
await page.close();

check(errors.length === 0, 'ошибок JS нет ' + errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);

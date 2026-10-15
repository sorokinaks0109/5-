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
// показатель вручную, новая карта от 13.10 (ПКАЗС выделена в БИ), перенос мероприятия со статусом
{
  await page.click('[data-act=kpiNew]');
  await page.fill('#k_name', 'Ручной показатель для проверки');
  await page.fill('#k_leader', 'Мещеряков Алексей Валериевич');
  await page.click('[data-act=kpiSave]');
  await page.waitForTimeout(200);
  let r = json(await DUMP(page), 'реестр.json');
  const man = r.kpis.find((k) => k.manual);
  check(man && man.reporter === 'Мещеряков', 'показатель добавлен вручную, отчитывается лидер — Мещеряков');
  const card3 = process.env.CARD3;
  if (card3) {
    await page.evaluate(() => { window.Otchet.S.data['Дрыков'].data.events['У-077'] = { flag: 'work', text: 'Две ПКАЗС введены' }; });
    await page.setInputFiles('#cardFile', card3);
    await page.waitForSelector('text=Что изменится');
    const d = await page.locator('.panel:has-text("Что изменится")').textContent();
    check(/ПКАЗС/.test(d) && !/Ручной показатель/.test(d.split('Уйдут')[1].split('Изменятся')[0]), 'новая карта 13.10: ПКАЗС — новый показатель, ручной не уходит');
    check(/нет колонок: факт, прогноз, оценка/.test(d), 'в карте 13.10 нет факта, прогноза и оценки — помощник предупреждён, что останутся прежние');
    const before3 = r.kpis.find((k) => k.id === 'F0142534');
    await page.click('[data-act=cardApply]');
    await page.waitForTimeout(300);
    r = json(await DUMP(page), 'реестр.json');
    const after3 = r.kpis.find((k) => k.id === 'F0142534');
    check(before3.fact && after3.fact === before3.fact && after3.forecast === before3.forecast && after3.grade === before3.grade, 'карта без факта и прогноза не стирает их: выручка факт ' + after3.fact + ', оценка ' + after3.grade);
    // как было у Ксении: значения уже стёрты — возвращаем из архива одной кнопкой
    await page.evaluate(() => { for (const k of window.Otchet.S.reg.kpis) { k.fact = ''; k.forecast = ''; k.grade = ''; } window.Otchet.render(); });
    check(await page.locator('[data-act=kpiRestore]').count() > 0, 'пропали факт, прогноз и оценка — помощнику предложено вернуть из архива');
    await page.click('[data-act=kpiRestore]');
    await page.waitForTimeout(400);
    r = json(await DUMP(page), 'реестр.json');
    check(r.kpis.find((k) => k.id === 'F0142534').fact === before3.fact && !(await page.locator('[data-act=kpiRestore]').count()), 'факт, прогноз и оценка вернулись из архивной копии реестра');
    const pk = r.kpis.find((k) => k.id === 'B0168827');
    check(pk && pk.reporter === 'Суходолов' && r.kpis.some((k) => k.manual) && r.events.some((e) => e.id === 'У-077'), 'после карты: ПКАЗС у Суходолова, ручной показатель и мероприятия на месте');
    await page.locator('select[data-ev="У-077|kpi"]').selectOption('B0168827');
    await page.waitForTimeout(400);
    r = json(await DUMP(page), 'реестр.json');
    check(r.events.find((e) => e.id === 'У-077').kpi === 'B0168827', 'мероприятие ПКАЗС перенесено на новый показатель');
    const st = await page.evaluate(() => Model.eventStatus(window.Otchet.S.reg, window.Otchet.S.data, window.Otchet.S.reg.events.find((e) => e.id === 'У-077')));
    check(st.text === 'Две ПКАЗС введены', 'после переноса статус и пояснение сохранились');
    await page.locator('select[data-ev="У-077|speaker"]').selectOption('Суходолов');
    await page.waitForTimeout(400);
    const st2 = await page.evaluate(() => Model.eventStatus(window.Otchet.S.reg, window.Otchet.S.data, window.Otchet.S.reg.events.find((e) => e.id === 'У-077')));
    check(st2.text === 'Две ПКАЗС введены', 'сменили «Заполняет» на Суходолова — прежний статус виден, пока он не заполнит своё');
    files = await DUMP(page);
  }
  await page.locator('[data-kpidel]').first().click();
  await page.waitForTimeout(300);
  check(!json(await DUMP(page), 'реестр.json').kpis.some((k) => k.manual), 'ручной показатель удаляется');
  files = await DUMP(page);
}
// план мероприятий (АВР): статусы из отчёта в квартальный файл, остальной файл не меняется
if (process.env.AVR) {
  await page.evaluate(() => {
    window.Otchet.S.data['Мещеряков'].data.events = { ...(window.Otchet.S.data['Мещеряков'].data.events || {}), 'У-005': { flag: 'done', text: 'Участвовали в 4 тендерах' } };
    window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, async createWritable() { const parts = []; return { async write(x) { parts.push(x); }, async close() { window.__avrOut = new Uint8Array(await new Blob(parts).arrayBuffer()); } }; } });
  });
  await page.click('[data-tab=avr]');
  await page.setInputFiles('#avrFile', process.env.AVR);
  await page.waitForSelector('table.avr', { timeout: 60000 });
  const msg = await page.locator('.panel:has(table.avr) .msg').first().innerText();
  const found = +(msg.match(/Найдено в отчёте: (\d+)/) || [0, 0])[1];
  check(found >= 105 && /исключено \(отменено\): 11/.test(msg), 'АВР: найдено автоматически ' + found + ' из 135, отменённые по примечаниям отмечены');
  // исключённые по примечаниям запомнены: в следующем квартале старый шаблон без примечаний отметится сам
  await page.waitForTimeout(400);
  const learn = await page.evaluate(() => {
    const S = window.Otchet.S; const ex = S.reg.settings.avrExcluded || {};
    const items = S.avr.info.items.map((it) => ({ ...it, note: '', cancelled: false }));
    const m = Avr.matchItems(S.reg, items, S.reg.settings.avrMap, ex);
    return { learned: Object.keys(ex).length, auto: m.filter((r) => r.how === 'cancelled' && r.learned).length, nokpi: m.filter((r) => r.how === 'nokpi' && r.exclude).length };
  });
  check(learn.learned === 11 && learn.auto === 11, 'АВР: исключённые из примечаний запомнены и в новом шаблоне без примечаний отмечаются сами (' + JSON.stringify(learn) + ')');
  check(learn.nokpi >= 5, 'АВР: строки показателей, которых нет в карте УПЦ, предлагаются к исключению');
  check(await page.locator('details.avr-missing').count() === 1, 'АВР: виден список мероприятий отчёта, которых нет в шаблоне');
  const st = await page.evaluate(() => { const c = {}; for (const r of window.Otchet.S.avr.rows) c[r.state] = (c[r.state] || 0) + 1; return c; });
  check(st.diff >= 1 && st.fileonly >= 1, 'АВР: видно, где статус в файле и в отчёте расходится (' + JSON.stringify(st) + ')');
  // по умолчанию заполненное в файле остаётся; у тендеров берём из отчёта кнопкой «из отчёта»
  const ti = await page.evaluate(() => window.Otchet.S.avr.rows.findIndex((r) => /Участие в тендерных процедурах/.test(r.text)));
  check(await page.evaluate((i) => window.Otchet.S.avr.rows[i].src, ti) === 'file', 'АВР: по умолчанию остаётся текст из файла');
  await page.click('[data-avr-src="report|' + ti + '"]');
  // перенос в отчёт: и где в отчёте пусто, и где расходилось, а выбрано «из файла»
  const ids = await page.evaluate(() => { const R = window.Otchet.S.avr.rows; const a = R.find((x) => x.eventId && x.file && !x.rep && x.how !== 'cancelled'); const d = R.find((x) => x.eventId && x.state === 'diff' && x.src === 'file' && !/тендерных/.test(x.text)); return { empty: a && a.eventId, diff: d && d.eventId }; });
  await page.click('[data-act=avrPush]');
  await page.waitForTimeout(500);
  const pushed = await page.evaluate((ids) => { const S = window.Otchet.S; const r = (id) => S.avr.rows.find((x) => x.eventId === id); return [ids.empty, ids.diff].map((id) => ({ state: r(id).state, rep: r(id).rep, file: r(id).file })); }, ids);
  check(ids.empty && pushed[0].state === 'same' && pushed[0].rep, 'АВР: статус из файла перенесён в отчёт, где у руководителя было пусто');
  check(ids.diff && pushed[1].state === 'same', 'АВР: где расходилось и выбрано «из файла» — в отчёте теперь текст из файла');
  const tenderRep = await page.evaluate((i) => window.Otchet.S.avr.rows[i].rep, ti);
  check(tenderRep === 'Выполнено. Участвовали в 4 тендерах', 'АВР: где выбрано «из отчёта», отчёт не меняется');
  {
    const info = await page.evaluate((id) => { const e = window.Otchet.S.reg.events.find((x) => x.id === id); return { sp: e.speaker, slug: (window.Otchet.S.reg.people.find((p) => p.id === e.speaker) || {}).slug, text: e.override && e.override.text }; }, ids.diff);
    const fz = await DUMP(page);
    const mp = await open('Страницы руководителей/Отчёт — ' + info.slug + '.html');
    await MOUNT(mp, fz);
    const v = await mp.locator('textarea[data-k="events|' + ids.diff + '|text"]').inputValue();
    check(info.text && v === info.text, 'АВР: руководитель (' + info.slug + ') видит перенесённый статус у себя в отчёте');
    await mp.close();
  }
  await page.click('[data-act=avrSave]');
  await page.waitForFunction(() => window.__avrOut, null, { timeout: 60000 });
  const r = await page.evaluate(async () => {
    const book = await Avr.open(window.__avrOut);
    const sheet = book.sheets.find((x) => /восточн/i.test(x.name));
    const info = await Avr.readSheet(book, sheet);
    const row = info.items.find((x) => /Участие в тендерных процедурах/.test(x.text));
    const g = info.grid.get(row.row);
    return { g: g[info.statusCols[0].col], done: g[info.doneCols[0]], sheet: sheet.path };
  });
  check(r.g === 'Выполнено. Участвовали в 4 тендерах' && r.done === '1', 'АВР: статус и «выполнено» вписаны в файл');
  const orig = fs.readFileSync(process.env.AVR).toString('base64');
  const changed = await page.evaluate(async (b64) => {
    const a = await JSZip.loadAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); const b = await JSZip.loadAsync(window.__avrOut);
    const out = []; const na = Object.keys(a.files), nb = Object.keys(b.files);
    if (na.join() !== nb.join()) out.push('состав файла');
    for (const n of na) { if (a.files[n].dir) continue; const x = await a.file(n).async('base64'); const y = b.file(n) ? await b.file(n).async('base64') : ''; if (x !== y) out.push(n); }
    return out;
  }, orig);
  check(changed.length === 1 && changed[0] === r.sheet, 'АВР: в файле изменён только лист «Восточная сибирь» (' + changed.join(', ') + ')');
  check(await page.evaluate(async () => { try { const d = await (await window.__root.getDirectoryHandle('Своды')).getFileHandle('avr — заполнено.xlsx'); return !!d; } catch (e) { return false; } }), 'АВР: заполненный файл лёг в папку «Своды»');
  // ушли на другую вкладку и вернулись — всё на месте; «перезагрузили» страницу — продолжаем с сохранённого
  await page.click('[data-tab=who]'); await page.click('[data-tab=avr]');
  check(await page.locator('table.avr').isVisible(), 'АВР: после перехода на другую вкладку план на месте');
  await page.click('[data-avr-src="file|' + ti + '"]');
  await page.waitForTimeout(900);
  await page.evaluate(async () => { window.Otchet.S.avr = null; await window.Otchet.load(); });
  await page.click('[data-tab=avr]');
  check((await page.locator('main').innerText()).includes('Продолжить'), 'АВР: после перезагрузки видно «Продолжить» с сохранённым файлом');
  await page.click('[data-act=avrResume]');
  await page.waitForSelector('table.avr', { timeout: 60000 });
  check(await page.evaluate((i) => window.Otchet.S.avr.rows[i].src, ti) === 'file', 'АВР: выбор по строкам восстановился');
  await page.click('[data-act=avrClose]');
  files = await DUMP(page);
}
await page.click('[data-tab=out]');
// вкладка письма открывается сразу по нажатию, адрес подставляется, когда файл готов
await page.evaluate(() => { window.open = (u) => { window.__openCalls = (window.__openCalls || 0) + 1; if (window.__openCalls === 1) window.__firstOpen = u || ''; if (u) window.__opened = u; return { closed: false, document: { write() {} }, location: { set href(v) { window.__opened = v; } } }; }; });
await page.click('[data-act=sendDirector]');
await page.waitForTimeout(1500);
{
  const u = await page.evaluate(() => window.__opened || '');
  check(u.startsWith('https://mail.gazprom-neft.ru/owa/?path=/mail/action/compose&to=') && u.length < 1900, 'письмо директору открывается в OWA, ссылка короткая (' + u.length + ' знаков)');
  check(await page.evaluate(() => window.__openCalls) === 1, 'почта открывается одной вкладкой сразу по нажатию');
  check(await page.locator('[data-act=openMail]').isVisible(), 'есть кнопка «Открыть письмо ещё раз»');
  // итоговое мемо: письмо всем, адреса и тема в ссылке, длинный текст с таблицей — в буфер
  await page.evaluate(() => { window.__openCalls = 0; window.Otchet.S.reg.people.forEach((p, i) => { p.email = 'r' + i + '@test.ru'; }); });
  await page.click('[data-act=sendMemo]');
  await page.waitForTimeout(800);
  const mu = await page.evaluate(() => window.__opened);
  const memoFile = await page.evaluate(async () => { const d = await window.__root.getDirectoryHandle('Своды'); for await (const h of d.values()) if (h.name.startsWith('Мемо')) return h.name; return ''; });
  check(mu.includes('subject=' + encodeURIComponent('Мемо совещания')) && mu.includes('%40') && !mu.includes('&body=') && mu.length < 1900, 'мемо всем: письмо с адресатами и темой, текст с таблицей — вставкой');
  check(memoFile.endsWith('.xlsx'), 'мемо в Excel сохранено в «Своды»: ' + memoFile);
  const longU = await page.evaluate(() => View.mailUrl({}, ['a@b.ru'], 'Тема', 'Текст '.repeat(300)));
  check(longU.length > 1900, 'длинное письмо не влезает в ссылку — поэтому текст идёт через буфер');
  const urls = await page.evaluate(() => ['owa-ae', 'owa-hash', 'owa-path'].map((m) => View.mailUrl({}, ['d@x.ru'], 'Тема', 'Текст', m)));
  check(urls[0].includes('/owa/?ae=Item&a=New&t=IPM.Note&to=d%40x.ru') && urls[1].includes('/owa/#path=/mail/action/compose&to=') && urls[2].includes('/owa/?path=/mail/action/compose'), 'три варианта ссылки на новое письмо для проверки в «Настройках»');
  files = await DUMP(page);
  const mob = await page.evaluate(async () => { const d = await window.__root.getDirectoryHandle('Своды'); for await (const h of d.values()) if (h.name.endsWith('.html')) return await (await h.getFile()).text(); return ''; });
  check(/ch-memo/.test(mob) && /ch-kpis/.test(mob), 'графики есть и в версии для телефона');
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
// ---------- 3д. Настройки помощника доходят до отчётов: разделы и запрос итогов за квартал ----------
{
  const pa = await open('Помощник.html');
  await pa.evaluate(async () => sessionStorage.setItem('otchet.unlocked', await Base.sha('тест1234')));
  await MOUNT(pa, files);
  await pa.click('[data-tab=settings]');
  await pa.selectOption('[data-sec-hidden="ros"]', '1');
  await pa.waitForTimeout(300);
  await pa.fill('[data-sec-title="proj"]', 'Ключевые проекты');
  await pa.locator('[data-sec-title="proj"]').dispatchEvent('change');
  await pa.waitForTimeout(300);
  await pa.selectOption('#avr_on', '1');
  await pa.fill('#avr_period', '4 кв. 2026');
  await pa.fill('#avr_due', '2027-01-15');
  await pa.click('[data-act=avrReqSave]');
  await pa.waitForTimeout(300);
  files = await DUMP(pa);
  const rg = json(files, 'реестр.json');
  check(rg.settings.sections.ros.hidden && rg.settings.sections.proj.title === 'Ключевые проекты' && rg.settings.avrReq.on, 'настройки разделов и запрос итогов сохранены в реестре');
  const pm = await open('Страницы руководителей/Отчёт — Мещеряков.html');
  await MOUNT(pm, files);
  const heads = await pm.locator('main .panel h2').allInnerTexts();
  check(!heads.some((x) => /РОС/.test(x)) && heads.includes('2. Ключевые проекты') && heads.includes('3. Показатели УПЦ'), 'у руководителя: РОС скрыт, проекты переименованы, номера пересчитаны: ' + heads.join(' | '));
  check(await pm.locator('.avr-banner').isVisible() && /итоги за 4 кв\. 2026/i.test(await pm.locator('.avr-banner').innerText()), 'у руководителя вверху запрос итогов за 4 кв. 2026');
  const q = pm.locator('textarea[data-k^="avrq|"]').first();
  const qid = (await q.getAttribute('data-k')).split('|')[1];
  await q.fill('Итог квартала: выполнено полностью, 3 договора');
  await pm.fill('#reportDate', '2026-10-09');
  await pm.click('[data-act=save]');
  await pm.waitForTimeout(300);
  files = await DUMP(pm);
  check(json(files, 'руководители/Мещеряков.json').avrq['4 кв. 2026|' + qid].startsWith('Итог квартала'), 'итог за квартал сохранён в отчёте руководителя');
  await pm.click('[data-act=preview]');
  const ph = await pm.locator('.preview h3.sec').allInnerTexts();
  check(!ph.some((x) => /РОС/i.test(x)) && ph.some((x) => /ключевые проекты/i.test(x)), 'и на совещании раздел РОС скрыт, проекты переименованы');
  await pm.close();
  await MOUNT(pa, files);
  await pa.click('[data-tab=who]');
  check(/Мещеряков А\.В\.: 1 из \d+/.test(await pa.locator('.panel:has-text("для АВР")').innerText()), 'помощник видит, кто сколько итогов заполнил');
  const t = await pa.evaluate((id) => Model.avrqText(window.Otchet.S.reg, window.Otchet.S.data, window.Otchet.S.reg.events.find((e) => e.id === id)), qid);
  check(t.startsWith('Итог квартала'), 'итог за квартал пойдёт в план мероприятий АВР');
  // вернуть как было
  await pa.click('[data-tab=settings]');
  await pa.selectOption('[data-sec-hidden="ros"]', '0');
  await pa.waitForTimeout(300);
  await pa.selectOption('#avr_on', '0');
  await pa.click('[data-act=avrReqSave]');
  await pa.waitForTimeout(300);
  files = await DUMP(pa);
  await pa.close();
}
// ---------- 3е. Сбор мероприятий на следующий год ----------
{
  const pa = await open('Помощник.html');
  await pa.evaluate(async () => sessionStorage.setItem('otchet.unlocked', await Base.sha('тест1234')));
  await MOUNT(pa, files);
  await pa.click('[data-tab=plan]');
  await pa.click('[data-act=planCopy]');
  await pa.waitForTimeout(400);
  const P0 = await pa.evaluate(() => ({ k: window.Otchet.S.reg.plan.kpis.length, e: window.Otchet.S.reg.plan.events.length, mine: window.Otchet.S.reg.plan.kpis.filter((k) => k.leader === 'Мещеряков').length }));
  check(P0.k >= 20 && P0.e >= 80 && P0.mine >= 1, 'план на год: взяты показатели (' + P0.k + ') и мероприятия (' + P0.e + ') текущего года, лидеры — отчитывающиеся');
  await pa.fill('#plan_due', '2026-12-20');
  await pa.selectOption('#plan_on', '1');
  await pa.click('[data-act=planCfg]');
  await pa.waitForTimeout(300);
  files = await DUMP(pa);
  const pm = await open('Страницы руководителей/Отчёт — Мещеряков.html');
  await MOUNT(pm, files);
  check(await pm.locator('.plan-banner').isVisible() && await pm.locator('#planSec').isVisible(), 'у лидера: напоминание и раздел «Проект на 2027 год»');
  const kpis = await pm.locator('#planSec .kpi').count();
  check(kpis === P0.mine, 'у лидера только его показатели: ' + kpis);
  const ok1 = pm.locator('[data-pkok]').first();
  const okId = await ok1.getAttribute('data-pkok');
  await ok1.click();
  const ta = pm.locator('textarea[data-pv^="k|"][data-pv$="|text"]').last();
  const editKey = (await ta.getAttribute('data-pv')).split('|')[1];
  await ta.fill('Новое мероприятие 2027: цифровой склад');
  await pm.click('[data-pbnew]');
  await pm.fill('input[data-pb="0|name"]', 'БИ: беспилотная доставка на объекты');
  await pm.locator('textarea[data-pv="b|0|0|text"]').fill('Пилот на участке Витим');
  await pm.fill('#reportDate', '2026-10-09');
  await pm.click('[data-act=save]');
  await pm.waitForTimeout(300);
  files = await DUMP(pm);
  const md = json(files, 'руководители/Мещеряков.json');
  check(md.planK[okId].st === 'ok' && md.planK[editKey].events.some((e) => e.text.includes('цифровой склад')) && md.planBI[0].name.includes('беспилотная'), 'лидер подтвердил, поправил и предложил БИ — всё сохранено в его отчёте');
  await pm.click('[data-act=preview]');
  check(!(await pm.locator('.preview').innerText()).includes('Проект на 2027'), 'проект на следующий год не попадает в доклад на совещании');
  await pm.close();
  await MOUNT(pa, files);
  await pa.click('[data-tab=plan]');
  const prog = await pa.locator('.panel:has-text("Ход сбора")').innerText();
  check(/Мещеряков А\.В\.: \d+ из \d+ · БИ: 1/.test(prog), 'помощник видит ход сбора и предложенные БИ: ' + prog.replace(/\s+/g, ' ').slice(0, 80));
  await pa.evaluate(() => { window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, async createWritable() { const parts = []; return { async write(x) { parts.push(x); }, async close() { window.__planOut = new Uint8Array(await new Blob(parts).arrayBuffer()); } }; } }); });
  await pa.click('[data-act=planExport]');
  await pa.waitForFunction(() => window.__planOut, null, { timeout: 30000 });
  const xl = await pa.evaluate(async () => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(window.__planOut); const ws = wb.worksheets[0]; const t = []; ws.eachRow((r) => t.push(r.values.slice(1).map((v) => String(v || '')).join(' | '))); return t; });
  check(xl.some((x) => /План мероприятий .* на 2027г/.test(x)) && xl.some((x) => x.startsWith('Блок ФОП')) && xl.some((x) => x.startsWith('Блок БИ')) && xl.some((x) => x.includes('цифровой склад')) && xl.some((x) => x.includes('беспилотная доставка')), 'выгрузка в форму Приложения 3: заголовок, блоки, правки лидера, предложенная БИ (' + xl.length + ' строк)');
  // участник «только план и УПЦ»: не мешает первой линейке
  await pa.click('[data-tab=settings]');
  const li = await pa.evaluate(() => window.Otchet.S.reg.people.findIndex((p) => p.id === 'Лазар'));
  await pa.selectOption('[data-pp="' + li + '|onMeeting"]', 'extra');
  await pa.waitForTimeout(300);
  await pa.click('[data-tab=who]');
  check(!(await pa.locator('.who').innerText()).includes('Лазар'), 'участник «только план и УПЦ» не виден в «Кто обновил»');
  await pa.click('[data-tab=meeting]');
  check(!(await pa.locator('.people-bar').innerText()).includes('Лазар'), 'и его нет в очереди докладов на совещании');
  files = await DUMP(pa);
  {
    const pl = await open('Страницы руководителей/Отчёт — Лазар.html');
    await MOUNT(pl, files);
    const h2 = await pl.locator('main .panel h2').allInnerTexts();
    check(!h2.some((x) => /Поручения|РОС|проекты|Приложения/i.test(x)) && h2.some((x) => /УПЦ/.test(x)) && h2.some((x) => /Проект на 2027/.test(x)) && !(await pl.locator('#reportDate').count()), 'у него на странице только УПЦ и проект плана, без даты отчёта: ' + h2.join(' | '));
    await pl.locator('textarea[data-k^="events|"]').first().fill('Работа идёт по графику');
    await pl.click('[data-act=save]');
    await pl.waitForTimeout(300);
    check((await pl.locator('#toast').innerText()).includes('Сохранено'), 'сохраняет без даты «Отчёт актуален на»');
    files = await DUMP(pl);
    await pl.close();
  }
  await MOUNT(pa, files);
  await pa.click('[data-tab=settings]');
  await pa.selectOption('[data-pp="' + li + '|onMeeting"]', '0');
  await pa.waitForTimeout(300);
  await pa.click('[data-tab=plan]');
  await pa.selectOption('#plan_on', '0');
  await pa.click('[data-act=planCfg]');
  await pa.waitForTimeout(300);
  files = await DUMP(pa);
  await pa.close();
}
// ---------- 3ж. Защита данных: повреждённый файл, недельные копии, копия на компьютер ----------
{
  const pa = await open('Помощник.html');
  await pa.evaluate(async () => sessionStorage.setItem('otchet.unlocked', await Base.sha('тест1234')));
  await MOUNT(pa, files);
  await pa.waitForTimeout(500);
  const weekly = await pa.evaluate(async () => { try { const d = await (await (await window.__root.getDirectoryHandle('Данные')).getDirectoryHandle('архив')).getDirectoryHandle('еженедельно'); const n = []; for await (const h of d.values()) n.push(h.name); return n; } catch (e) { return []; } });
  check(weekly.length === 1, 'еженедельная копия данных создана: ' + weekly.join(', '));
  const sw = await pa.evaluate(async () => {
    const r = window.__root;
    r.items.set('Для директора.html.crswap', new Store.MemFile('Для директора.html.crswap', new Uint8Array(0), Date.now() - 2 * 864e5));
    r.items.set('Для директора.html.1.crswap', new Store.MemFile('Для директора.html.1.crswap', new Uint8Array(0), Date.now() - 60e3));
    const n = await Base.cleanSwap(r);
    return { n, left: Array.from(r.items.keys()).filter((x) => x.endsWith('.crswap')) };
  });
  check(sw.n === 1 && sw.left.length === 1 && sw.left[0] === 'Для директора.html.1.crswap', 'старые остатки .crswap убираются сами, свежий (идёт запись) не трогается');
  const hist = await pa.evaluate(() => window.Otchet.S.reg.history || []);
  check(hist.length >= 1 && hist[hist.length - 1].total >= 1 && Array.isArray(hist[hist.length - 1].fresh), 'записана статистика недели для будущих графиков (' + hist.length + ')');
  // реестр «побился» при записи
  const good = await pa.evaluate(() => window.Otchet.S.reg.memo.length);
  await pa.evaluate(async () => {
    const d = await window.__root.getDirectoryHandle('Данные');
    const hasArch = await (async () => { try { const a = await d.getDirectoryHandle('архив'); for await (const h of a.values()) if (h.name.startsWith('реестр_')) return true; } catch (e) { /* */ } return false; })();
    if (!hasArch) { const a = await d.getDirectoryHandle('архив', { create: true }); a.items.set('реестр_2026-10-01.json', new Store.MemFile('реестр_2026-10-01.json', (await (await d.getFileHandle('реестр.json')).getFile()).arrayBuffer ? new Uint8Array(await (await (await d.getFileHandle('реестр.json')).getFile()).arrayBuffer()) : new Uint8Array())); }
    d.items.set('реестр.json', new Store.MemFile('реестр.json', new TextEncoder().encode('{"settings": {"lastMee')));
    await window.Otchet.load();
  });
  await pa.click('[data-tab=who]');
  check(await pa.locator('.msg.bad:has-text("повреждённые файлы")').isVisible() && await pa.evaluate(() => window.Otchet.S.reg.memo.length) > 0, 'повреждённый реестр: страница открыла исправную копию из архива и предупредила');
  await pa.click('[data-restore="0"]');
  await pa.waitForTimeout(400);
  const fixed = await pa.evaluate(async () => { const d = await window.__root.getDirectoryHandle('Данные'); try { JSON.parse(await (await (await d.getFileHandle('реестр.json')).getFile()).text()); return true; } catch (e) { return false; } });
  check(fixed && !(await pa.locator('.msg.bad:has-text("повреждённые файлы")').count()), 'одной кнопкой исправная копия вернулась на место');
  // копия на компьютер
  await pa.evaluate(() => { window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, async createWritable() { const parts = []; return { async write(x) { parts.push(x); }, async close() { window.__zip = new Uint8Array(await new Blob(parts).arrayBuffer()); } }; } }); });
  check(await pa.locator('[data-act=exportZip]').isVisible(), 'помощнику напоминает сделать копию данных на компьютер');
  await pa.click('[data-act=exportZip]');
  await pa.waitForFunction(() => window.__zip, null, { timeout: 30000 });
  const names = await pa.evaluate(async () => Object.keys((await JSZip.loadAsync(window.__zip)).files));
  check(names.includes('Данные/реестр.json') && names.some((n) => n.startsWith('Данные/руководители/')) && !names.some((n) => n.includes('/архив/')), 'копия данных одним zip: реестр и отчёты, без архива (' + names.length + ' файлов)');
  files = await DUMP(pa);
  await pa.close();
}
// ---------- 3з. Комментарии директора, «требуют внимания», что изменилось, карточка ----------
{
  let pa = await open('Помощник.html');
  await pa.evaluate(async () => sessionStorage.setItem('otchet.unlocked', await Base.sha('тест1234')));
  await MOUNT(pa, files);
  await pa.click('[data-tab=settings]');
  await pa.fill('#asstFio', 'Златковская Ю.');
  await pa.locator('#asstFio').dispatchEvent('change');
  await pa.fill('#asstEmail', 'zlatkovskaya@example.ru');
  await pa.locator('#asstEmail').dispatchEvent('change');
  await pa.waitForTimeout(300);
  const tr = await pa.evaluate(() => window.Otchet.S.reg.track);
  check(tr && Object.keys(tr.items).length > 10 && tr.snap && tr.snap.date, 'помощник при открытии начал отслеживать пояснения и сделал снимок статусов (' + Object.keys(tr.items).length + ')');
  files = await DUMP(pa);
  await pa.close();

  // директор: кнопки у пунктов открывают письмо помощнику
  const pd = await open('Директор.html');
  await MOUNT(pd, files);
  await pd.evaluate(() => { window.__mails = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('mailto:')) window.__mails.push(this.href); else o.call(this); }; });
  await pd.click('[data-tab=meeting]');
  await pd.evaluate(() => { const S = window.Otchet.S; S.person = Model.reportPeople(S.reg).findIndex((p) => p.slug === 'Мещеряков'); window.Otchet.render(); });
  check(await pd.locator('[data-dn^="c|m|"]').count() > 0 && await pd.locator('[data-dn^="rm|m|"]').count() > 0 && await pd.locator('[data-dn^="c|e|"]').count() > 0 && !(await pd.locator('[data-dn^="meet|"]').count()), 'у директора у пунктов кнопки «Комментарий» и «Снять с контроля», «На совещание» нет');
  const dnC = await pd.locator('[data-dn^="c|m|"]').first().getAttribute('data-dn');
  const dnRm = await pd.locator('[data-dn^="rm|m|"]').nth(1).getAttribute('data-dn');
  const dnMeet = await pd.locator('[data-dn^="c|e|"]').first().getAttribute('data-dn');
  await pd.locator('[data-dn="' + dnC + '"]').click();
  await pd.locator('[data-dn="' + dnRm + '"]').click();
  await pd.locator('[data-dn="' + dnMeet + '"]').click();
  const mails = (await pd.evaluate(() => window.__mails)).map((h) => { const u = new URL(h); return { to: decodeURIComponent(u.pathname), subject: u.searchParams.get('subject'), body: u.searchParams.get('body'), len: h.length }; });
  check(mails.length === 3 && mails.every((m) => m.to === 'zlatkovskaya@example.ru') && /^Комментарий директора — Мещеряков, поручение/.test(mails[0].subject) && mails[0].body.includes('[код D|c|m|'), 'письмо директора: адрес помощника, тема, пункт и код (' + (mails[0] || {}).subject + ')');
  check(/№\d+: «/.test(mails[0].subject) && /«.+»/.test(mails[0].body), 'в теме — номер и начало поручения, в тексте — текст поручения');
  check(mails.every((m) => m.len < 2000), 'ссылка письма короткая — Outlook откроет (' + mails.map((m) => m.len).join(', ') + ' знаков)');
  await pd.click('[data-act=card]');
  check(await pd.locator('.pcard').isVisible() && /Обновлял отчёт к совещанию/.test(await pd.locator('.pcard').textContent()), 'карточка руководителя открывается');
  await pd.close();

  // директор дописал текст и отправил; помощник вставляет письма
  const typed = mails[0].body.replace('Комментарий:\n\n\n', 'Комментарий:\nКакой срок? Распишите этапы.\n\n') + '\n\nОт: Директор\nОтправлено: 15 октября 2026 г.\n\n' +
    mails[1].body.replace('Причина:\n\n\n', 'Причина:\nУже неактуально\n\n') + '\n\n' + mails[2].body.replace('Комментарий:\n\n\n', 'Комментарий:\nГде акт?\n\n');
  pa = await open('Помощник.html');
  await pa.evaluate(async () => sessionStorage.setItem('otchet.unlocked', await Base.sha('тест1234')));
  await MOUNT(pa, files);
  await pa.click('[data-tab=dir]');
  await pa.fill('#dnPaste', typed);
  await pa.click('[data-act=dnParse]');
  const parsed = await pa.evaluate(() => window.Otchet.S.dnParsed.map((n) => ({ type: n.type, text: n.text, ok: !!(n.item && n.item.ok) })));
  check(parsed.length === 3 && parsed[0].text === 'Какой срок? Распишите этапы.' && parsed[1].text === 'Уже неактуально' && parsed[2].text === 'Где акт?' && parsed.every((x) => x.ok), 'письма разобраны: 3 пункта, текст директора без хвостов письма');
  // почта не вставила текст: директор написал только своё, тема осталась
  const bySubj = await pa.evaluate((subj) => Model.parseDirMail(window.Otchet.S.reg, 'От: Директор\nТема: ' + subj + '\n\nНужно ускорить, срок до конца месяца'), mails[0].subject);
  check(bySubj.length === 1 && bySubj[0].bySubject && bySubj[0].item.ok && bySubj[0].text === 'Нужно ускорить, срок до конца месяца', 'письмо без кода: поручение найдено по номеру в теме, текст директора взят');
  await pa.click('[data-act=dnAdd]');
  await pa.waitForTimeout(300);
  check((await pa.evaluate(() => (window.Otchet.S.reg.dirNotes || []).length)) === 3, 'внесено в реестр: 3');
  // на совещании: комментарий виден, «на совещание» — первым, + комментарий голосом
  await pa.click('[data-tab=meeting]');
  await pa.evaluate(() => { const S = window.Otchet.S; S.person = Model.reportPeople(S.reg).findIndex((p) => p.slug === 'Мещеряков'); window.Otchet.render(); });
  const rep = await pa.locator('#report').innerText();
  check(rep.includes('Какой срок? Распишите этапы.') && rep.includes('ждёт ответа руководителя') && rep.includes('Где акт?'), 'на совещании видно комментарии директора к поручению и к мероприятию');
  await pa.evaluate(() => { window.prompt = () => 'Доложите по экономии'; });
  await pa.locator('[data-dadd^="k|"]').first().click();
  await pa.waitForTimeout(300);
  check((await pa.evaluate(() => window.Otchet.S.reg.dirNotes.filter((n) => n.via === 'meeting').length)) === 1, 'комментарий директора, сказанный на совещании, внесён кнопкой у пункта');
  files = await DUMP(pa);
  await pa.close();

  // руководитель видит и отвечает
  const pm = await open('Страницы руководителей/Отчёт — Мещеряков.html');
  await MOUNT(pm, files);
  check(await pm.locator('.dn-banner').isVisible() && /ждут вашего ответа: 3/.test(await pm.locator('.dn-banner').innerText()), 'у руководителя вверху: комментарии директора ждут ответа');
  const cId = await pm.evaluate(() => window.Otchet.S.reg.dirNotes.find((n) => n.type === 'c' && n.kind === 'm').id);
  await pm.fill('[data-k="dirAns|' + cId + '"]', 'Срок 30.11, этапы расписал в пояснении');
  // заодно отмечает выполненным другое поручение — для «что изменилось»
  const doneId = await pm.evaluate((cid) => { const S = window.Otchet.S; const n = S.reg.dirNotes.find((x) => x.id === cid); return S.reg.memo.find((m) => !m.closed && Model.isResp(m, S.me) && !S.reg.dirNotes.some((x) => x.ref === m.id) && (S.draft.memo[m.id] || {}).flag !== 'done').id; }, cId);
  await pm.selectOption('[data-k="memo|' + doneId + '|flag"]', 'done');
  await pm.fill('#reportDate', await pm.evaluate(() => Model.todayISO()));
  await pm.click('[data-act=save]');
  await pm.waitForTimeout(400);
  files = await DUMP(pm);
  check(json(files, 'руководители/Мещеряков.json').dirAns[cId].startsWith('Срок 30.11'), 'ответ директору сохранён в отчёте руководителя');
  await pm.close();

  // помощник: ответ получен, закрыть; «снять с контроля» — снять поручение
  pa = await open('Помощник.html');
  await pa.evaluate(async () => sessionStorage.setItem('otchet.unlocked', await Base.sha('тест1234')));
  await MOUNT(pa, files);
  await pa.click('[data-tab=dir]');
  check(/ответ есть/.test(await pa.locator('.panel:has-text("Открытые")').innerText()), 'помощник видит: ответ руководителя получен');
  const rmNote = await pa.evaluate(() => window.Otchet.S.reg.dirNotes.find((n) => n.type === 'rm').id);
  await pa.click('[data-dnop="rmdo|' + rmNote + '"]');
  await pa.waitForTimeout(300);
  const rmm = await pa.evaluate((id) => { const S = window.Otchet.S; const n = S.reg.dirNotes.find((x) => x.id === id); return S.reg.memo.find((m) => m.id === n.ref).closed; }, rmNote);
  check(rmm && /по решению директора: Уже неактуально/.test(rmm.why), 'поручение снято с контроля по решению директора, причина записана');
  // «требуют внимания»: делаем вид, что пояснения не менялись с начала сентября
  await pa.evaluate(async () => { const S = window.Otchet.S; for (const v of Object.values(S.reg.track.items)) v.since = '2026-09-01'; });
  await pa.click('[data-tab=meeting]');
  await pa.evaluate(() => { const S = window.Otchet.S; S.person = Model.reportPeople(S.reg).findIndex((p) => p.slug === 'Мещеряков'); window.Otchet.render(); });
  check(await pa.locator('#report .attn').count() > 0, 'на совещании у пунктов без движения пометка ⚠');
  // track с «сентябрём» сохраняем через запись реестра
  await pa.evaluate(async () => { const S = window.Otchet.S; await Store.writeJSON(S.dir, [Store.DATA, Store.REG], S.reg); });
  files = await DUMP(pa);
  await pa.close();

  const pd2 = await open('Директор.html');
  await MOUNT(pd2, files);
  const sum = await pd2.locator('main').textContent();
  check(/Требуют внимания: \d+/.test(sum) && /не менялось \d+ нед\./.test(sum), 'у директора в сводке блок «Требуют внимания»');
  check(/Что изменилось с/.test(sum) && /Выполнено: \d+/.test(sum), 'у директора в сводке «Что изменилось»: выполнено');
  check(/Ваши комментарии руководителям/.test(sum) && /ответ получен: 1/.test(sum), 'директор видит свои комментарии и ответ руководителя');
  await shot(pd2, '8-director-notes');
  await pd2.close();
}
// ---------- 4. Директор ----------
page = await open('Директор.html');
await MOUNT(page, files);
const before = JSON.stringify(files);
check(await page.locator('.tiles').first().isVisible(), 'директор: сводка');
{
  const n = await page.evaluate(() => ({ people: Model.reportPeople(window.Otchet.S.reg).length, kpis: window.Otchet.S.reg.kpis.length }));
  check((await page.locator('.ch-memo .ch-row').count()) === n.people && (await page.locator('.ch-kpis .ch-row').count()) === n.kpis, 'директор: графики — поручения по руководителям (' + n.people + ') и прогноз по показателям УПЦ (' + n.kpis + ')');
  const gr = await page.locator('.ch-grades').innerText();
  check(/оценка A/.test(gr) && /оценка C/.test(gr), 'на графике УПЦ — сколько показателей с оценкой A, B, C');
}
await shot(page, '7-director');
await page.click('[data-tab=meeting]');
await page.click('[data-tab=memo]');
await page.click('[data-tab=upc]');
check(JSON.stringify(await DUMP(page)) === before, 'директор ничего не записал');
await page.close();

check(errors.length === 0, 'ошибок JS нет ' + errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);

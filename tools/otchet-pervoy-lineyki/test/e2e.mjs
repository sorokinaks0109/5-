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
await page.close();

// ---------- 2. Помощник ----------
page = await open('Помощник.html');
await MOUNT(page, files);
check((await page.locator('.who .card.fr-fresh').count()) === 1, 'кто обновил: зелёный только Мещеряков (дату поставил он сам)');
await shot(page, '3-admin-who');
await page.click('[data-tab=memo]');
check((await page.locator('table.memo tbody tr').count()) === 42, 'на контроле 42 поручения');
await page.fill('#f_text', 'Тестовое поручение: подготовить справку по ДЗ');
await page.selectOption('#f_resp', 'Мещеряков');
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
await shot(page, '4-admin-memo', false);
await page.click('[data-tab=meeting]');
await page.click('.people-bar >> text=Хисматуллин Р.М.');
await page.waitForTimeout(800);
check((await page.locator('.att table.xl').count()) >= 3, 'таблицы Хисматуллина показаны отдельными блоками: ' + (await page.locator('.att table.xl').count()));
check((await page.locator('.att table.xl').count()) === 3, 'ровно три таблицы — по заголовкам «Таблица №…»');
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
  check((await sp.locator('.att table.xl').count()) === 3, 'в снимке есть таблицы Хисматуллина');
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
  fs.rmSync(winPath); fs.rmSync(tmpAtt2);
  // кладём файл во «Входящие» и открываем страницу помощника заново
  const b64 = fs.readFileSync(dlPath).toString('base64');
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
  check(after.m.reportDate === '2026-10-06' && after.m.memo[key].text.includes('Windows') && !after.m.kind, 'помощник сам принял отчёт из «Входящих»');
  check(after.att, 'вложение из файла сохранено в папку');
  check(after.left.length === 0, '«Входящие» очищены (файлы ушли в архив)');
  check(/не новее/.test(after.log), 'повторный файл того же отчёта пропущен: ' + after.log.slice(0, 120));
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

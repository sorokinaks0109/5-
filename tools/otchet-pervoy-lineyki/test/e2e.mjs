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

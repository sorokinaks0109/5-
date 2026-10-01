// Сквозная проверка Сборщика в Chromium на настоящей папке (в памяти страницы).
// node test/e2e.mjs "путь/Отчёт первой линейки" [папка для скриншотов]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const Core = require('../src/core.js');

const dir = process.argv[2];
const shots = process.argv[3];
const html = path.join(dir, 'Сборщик.html');
let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failed++; };

function walk(d, base = '') {
  const out = {};
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) Object.assign(out, walk(p, base + n + '/'));
    else if (n.endsWith('.xlsx')) out[base + n] = fs.readFileSync(p).toString('base64');
  }
  return out;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.goto('file://' + html);

// 1. Демо
await page.click('text=Посмотреть на демо-данных');
await page.waitForSelector('.who .card');
check((await page.locator('.who .card').count()) === 3, 'демо: три карточки');
check((await page.locator('.who .card.stale').count()) === 1, 'демо: один не обновил (Сидоров, 12 дней)');
await page.click('[data-tab=report]');
check(await page.isVisible('text=Проект графика на согласовании у ГД'), 'демо: статус Иванова на экране');
if (shots) await page.screenshot({ path: path.join(shots, 'demo-report.png'), fullPage: true });

// 2. Настоящая папка
const files = walk(dir);
await page.evaluate(async (files) => {
  const { MemDir, MemFile } = window.Otchet;
  const root = new MemDir('Отчёт первой линейки');
  for (const [p, b64] of Object.entries(files)) {
    const parts = p.split('/');
    let d = root;
    for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    d.items.set(parts.at(-1), new MemFile(parts.at(-1), bin, Date.now() - 3 * 864e5));
  }
  window.__root = root;
  window.Otchet.state.tab = 'who';
  await window.Otchet.useDir(root, false, false);
}, files);
check((await page.locator('.who .card').count()) === 9, 'реальные данные: 9 руководителей');
check((await page.locator('.msg.bad').count()) === 0 || !(await page.locator('.msg.bad').first().innerText()).includes('Не найдены'), 'нет ошибок разбора');
if (shots) await page.screenshot({ path: path.join(shots, 'who.png'), fullPage: true });

await page.click('[data-tab=report]');
await page.click('.people-bar >> text=Мещеряков А.В.');
check(await page.isVisible('text=Выполнено, встреча организована на ежедневной основе'), 'Мещеряков: статус М-010 подтянулся');
check(await page.isVisible('text=Выручка по ДО 14 387 млн. руб.'), 'Мещеряков: РОС на месте');
if (shots) await page.screenshot({ path: path.join(shots, 'report-meshcheryakov.png'), fullPage: true });
await page.click('.people-bar >> text=Хисматуллин Р.М.');
check(await page.isVisible('summary:has-text("Приложения")'), 'Хисматуллин: приложения видны');
await page.click('[data-tab=memo]');
check((await page.locator('table.grid tbody tr').count()) >= 40, 'свод: все открытые поручения');
if (shots) await page.screenshot({ path: path.join(shots, 'memo.png'), fullPage: false });
await page.click('[data-tab=upc]');
if (shots) await page.screenshot({ path: path.join(shots, 'upc.png'), fullPage: false });

// 3. Руководитель пишет статус в своём файле → секретарь добавляет поручение и закрывает другое → рассылка
const edited = await page.evaluate(async () => {
  const root = window.__root;
  const pd = await root.getDirectoryHandle('Руководители');
  const fh = await pd.getFileHandle('Мещеряков.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await (await fh.getFile()).arrayBuffer());
  const ws = wb.getWorksheet('Отчёт');
  let row = 0;
  ws.eachRow((r, i) => { if (Core.txt(r.getCell(2).value).startsWith('Подготовить служебную записку за подписью Карпикова')) row = i; });
  ws.getCell(row, 3).value = 'Служебная записка подписана';
  ws.getCell(row, 6).value = 'выполнено';
  const w = await fh.createWritable(); await w.write(await wb.xlsx.writeBuffer()); await w.close();

  const rh = await root.getFileHandle('Реестр.xlsx');
  const rwb = new ExcelJS.Workbook();
  await rwb.xlsx.load(await (await rh.getFile()).arrayBuffer());
  const m = rwb.getWorksheet('Мемо');
  m.addRow([null, '01.10.2026', 'Тестовое новое поручение без номера', 'Мещеряков А.В.', 'Губарев Д.А.', new Date(Date.UTC(2026, 9, 20)), '']);
  const w2 = await rh.createWritable(); await w2.write(await rwb.xlsx.writeBuffer()); await w2.close();
  return row;
});
check(edited > 0, 'статус вписан в файл Мещерякова');
await page.click('[data-tab=send]');
await page.click('text=Проверить, что изменится');
await page.waitForSelector('text=Будет поручений');
await page.waitForSelector('text=Выполненные — убрать из отчётов?');
const boxes = await page.locator('.closeBox').count();
check(boxes >= 3, 'к уборке предложено выполненных: ' + boxes);
check(!(await page.locator('main').innerText()).match(/М-0\d\d|У-0\d\d/), 'служебных номеров на экране нет');
await page.uncheck('.closeBox[data-id="11"]');
if (shots) await page.screenshot({ path: path.join(shots, 'send.png'), fullPage: true });
await page.click('button:has-text("Разослать")');
await page.waitForSelector('text=Готово: записано');
const logText = await page.locator('.log').innerText();
check(logText.includes('записано 9, с ошибками 0'), 'рассылка: 9 файлов записано');

const after = await page.evaluate(async () => {
  const root = window.__root;
  const read = async (d, n) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await (await (await d.getFileHandle(n)).getFile()).arrayBuffer()); return wb; };
  const pd = await root.getDirectoryHandle('Руководители');
  const m = Core.parsePersonal(await read(pd, 'Мещеряков.xlsx'));
  const g = Core.parsePersonal(await read(pd, 'Губарев.xlsx'));
  const h = await read(pd, 'Хисматуллин.xlsx');
  const reg = await read(root, 'Реестр.xlsx');
  const rm = Core.parseRegistry(reg).memo.find((x) => x.id === '10');
  const mw = await read(pd, 'Мещеряков.xlsx');
  const ows = mw.getWorksheet('Отчёт');
  const idHidden = ows.getColumn(14).hidden === true;
  let rr = 0; ows.eachRow((r, i) => { if (!rr && Core.txt(r.getCell(14).value)) rr = i; });
  const lk = (c) => (ows.getCell(rr, c).protection && ows.getCell(rr, c).protection.locked === false ? 'false' : 'locked');
  const unlocked = 'C:' + lk(3) + ' F:' + lk(6) + ' B:' + lk(2);
  const dv = ows.getCell(rr, 6).dataValidation && ows.getCell(rr, 6).dataValidation.type;
  const prot = ows.sheetProtection;
  const arch = await root.getDirectoryHandle('Архив');
  let archCount = 0; for await (const d of arch.values()) for await (const f of d.values()) archCount++;
  return { m, g, sheets: h.worksheets.map((w) => w.name), archCount, mark10: rm.mark, idHidden, unlocked, dv, prot };
});
const newKey = Core.itemKey('', 'Тестовое новое поручение без номера');
check(after.m.memo['11'] === 'Служебная записка подписана' && after.m.memoFlag['11'] === 'выполнено', 'неотмеченное выполненное осталось с пояснением и отметкой из списка');
check(after.prot && after.prot.sheet && !after.prot.insertRows && !after.prot.deleteRows, 'лист защищён: вставка и удаление строк запрещены');
check(after.unlocked === 'C:false F:false B:locked', 'открыты только пояснение и «Выполнено?»: ' + after.unlocked);
check(after.dv === 'list', 'в «Выполнено?» выпадающий список');
check(newKey in after.m.memo && !('10' in after.m.memo), 'новое поручение без номера добавлено, отмеченное выполненное убрано');
check(newKey in after.g.memo, 'соисполнитель получил поручение');
check(after.mark10.startsWith('убрано из отчёта'), 'в реестре отметка: ' + after.mark10);
check(after.idHidden, 'колонка с ключом скрыта');
check(after.m.ros.length === 5, 'РОС Мещерякова не потерялся');
check(after.sheets.join(',') === 'Отчёт,Приложения', 'приложения Хисматуллина на месте и лист «Отчёт» первый');
check(after.archCount === 10, 'в архиве 9 личных файлов + реестр');

await page.click('button:has-text("Сохранить свод")');
await page.waitForSelector('text=Свод сохранён');
const sum = await page.evaluate(async () => {
  const sd = await window.__root.getDirectoryHandle('Своды');
  for await (const f of sd.values()) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await (await f.getFile()).arrayBuffer()); return wb.worksheets.map((w) => w.name + ':' + w.rowCount); }
});
check(sum && sum.length === 12, 'свод: 3 общих листа + 9 личных — ' + (sum || []).slice(0, 4).join(', '));

// 4. Режим показа
await page.click('[data-tab=report]');
await page.click('text=На весь экран');
await page.keyboard.press('ArrowRight');
if (shots) await page.screenshot({ path: path.join(shots, 'present.png') });

check(errors.length === 0, 'ошибок JS нет ' + errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);

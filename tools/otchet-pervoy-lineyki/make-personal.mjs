// Достраивает личные файлы после migrate.py тем же кодом, что и Сборщик (src/core.js).
// Запуск: node make-personal.mjs "папка/Отчёт первой линейки" migr.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const Core = require('./src/core.js');

const [outDir, migrPath] = process.argv.slice(2);
const migr = JSON.parse(fs.readFileSync(migrPath, 'utf8'));
const revive = (v) => (v && typeof v === 'object' && v.$d ? new Date(v.$d + 'T00:00:00Z') : v);

const regWb = new ExcelJS.Workbook();
await regWb.xlsx.readFile(path.join(outDir, 'Реестр.xlsx'));
const reg = Core.parseRegistry(regWb);
if (reg.errors.length) throw new Error(reg.errors.join('\n'));

for (const p of reg.people) {
  const m = migr.find((x) => x.file === p.file) || { ros: [], proj: [], memo: {}, upc: {} };
  const file = path.join(outDir, 'Руководители', p.file);
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(file)) await wb.xlsx.readFile(file);
  const parsed = {
    ...Core.emptyParsed(),
    ros: m.ros.map((r) => r.map(revive)),
    proj: m.proj.map((r) => r.map(revive)),
    memo: Object.fromEntries(Object.entries(m.memo).map(([k, v]) => [k, Core.txt(revive(v))])),
    upc: Object.fromEntries(Object.entries(m.upc).map(([k, v]) => [k, Core.txt(revive(v))])),
  };
  const res = Core.refreshPersonal(ExcelJS, wb, p, reg, parsed);
  await wb.xlsx.writeFile(file);
  console.log(`${p.fio}: поручений ${res.total}, мероприятий УПЦ ${Core.itemsForPerson(reg, p).upc.length}`);
}

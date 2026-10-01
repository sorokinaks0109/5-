// Собирает один автономный файл «Сборщик.html»: ExcelJS, ядро и интерфейс встраиваются внутрь,
// чтобы всё работало без интернета.  Запуск: node build.mjs [куда положить]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2] || path.join(here, 'build', 'Сборщик.html');
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const exceljs = fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js'), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const html = read('src/index.template.html')
  .replace('/*CSS*/', () => read('src/app.css'))
  .replace('/*EXCELJS*/', () => safe(exceljs))
  .replace('/*CORE*/', () => safe(read('src/core.js')))
  .replace('/*APP*/', () => safe(read('src/app.js')));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Готово:', out, Math.round(html.length / 1024) + ' КБ');

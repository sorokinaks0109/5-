// Собирает автономные страницы (всё внутри, интернет не нужен):
//   Помощник.html, Директор.html, Страницы руководителей/Отчёт — <Фамилия>.html
// Запуск: node build.mjs "папка/Отчёт первой линейки"   (фамилии берутся из Данные/реестр.json)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2] || path.join(here, 'build', 'Отчёт первой линейки');
const read = (p) => fs.readFileSync(path.join(here, 'src2', p), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');
const exceljs = safe(fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js'), 'utf8'));
const libs = ['lib/store.js', 'lib/model.js', 'lib/view.js', 'lib/base.js'].map(read).map(safe).join('\n');

function page(app, title, header) {
  return read('template.html')
    .replace('/*TITLE*/', () => title).replace('/*HEADER*/', () => header)
    .replace('/*CSS*/', () => read('styles.css'))
    .replace('/*EXCELJS*/', () => exceljs).replace('/*LIBS*/', () => libs)
    .replace('/*APP*/', () => safe(read('apps/' + app)));
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'Помощник.html'), page('admin.js', 'Помощник — отчёт первой линейки', 'Помощник · отчёт первой линейки'));
fs.writeFileSync(path.join(out, 'Директор.html'), page('director.js', 'Отчёт первой линейки', 'Отчёт первой линейки'));
const mgr = page('manager.js', 'Мой отчёт', 'Мой отчёт к совещанию');
const dir = path.join(out, 'Страницы руководителей');
fs.mkdirSync(dir, { recursive: true });
let slugs = [];
try { slugs = JSON.parse(fs.readFileSync(path.join(out, 'Данные', 'реестр.json'), 'utf8')).people.map((p) => p.slug); } catch (e) { /* нет данных — только общий файл */ }
fs.writeFileSync(path.join(dir, 'Мой отчёт.html'), mgr);
for (const s of slugs) fs.writeFileSync(path.join(dir, 'Отчёт — ' + s + '.html'), mgr);
console.log('Готово:', out, '· страниц руководителей:', slugs.length + 1, '·', Math.round(mgr.length / 1024) + ' КБ каждая');

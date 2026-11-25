// Печать памятки в PDF: node make_pdf.js <файл.html> <папка>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [, , html, out] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(html));
  await p.evaluate(() => document.fonts.ready);
  const pdf = { format: 'A4', printBackground: true, preferCSSPageSize: true };
  await p.evaluate(() => document.querySelector('.tab[data-v="a4View"]').click());
  await p.pdf({ ...pdf, path: path.join(out, 'Памятка_модели_поведения_А4.pdf') });
  await p.evaluate(() => document.querySelector('.tab[data-v="cardsView"]').click());
  await p.pdf({ ...pdf, path: path.join(out, 'Карточки_модели_поведения_А6.pdf') });
  await b.close();
  console.log('PDF: Памятка_модели_поведения_А4.pdf, Карточки_модели_поведения_А6.pdf');
})();

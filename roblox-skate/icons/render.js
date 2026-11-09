const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file://' + process.cwd() + '/icons.html');
  const names = await p.$$eval('.icon', els => els.map(e => e.id));
  for (const n of names) {
    await (await p.$('#' + n)).screenshot({ path: `out/${n}.png`, omitBackground: true });
  }
  await p.screenshot({ path: 'out/_all.png', omitBackground: false, fullPage: true });
  await b.close();
})();

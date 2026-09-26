/* Работа без интернета. Сначала пробуем взять свежий файл из сети (не дольше 3 секунд),
   а если сети нет или она медленная — берём из кэша телефона. Поэтому обновления
   видны сразу при следующем открытии. Меняйте VERSION при крупных изменениях. */
const VERSION = 'slovarik-v14';
const FILES = ['./', 'index.html', 'app.js', 'words.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (!cached) return fresh;
    const slow = new Promise((ok) => setTimeout(() => ok(cached), 3000));
    return Promise.race([fresh.catch(() => cached), slow]);
  }));
});

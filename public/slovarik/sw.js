/* Работа без интернета и мгновенный запуск.
   Все файлы словарика хранятся в кэше одной версией (VERSION) и отдаются сразу, без ожидания сети.
   Когда на сайте меняется этот файл (новая VERSION), браузер фоном скачивает все файлы заново,
   целиком, и включает новую версию разом — старые и новые файлы никогда не смешиваются.
   ВАЖНО: при любом изменении приложения увеличивайте VERSION. */
const VERSION = 'slovarik-v29';
const FILES = ['./', 'index.html', 'app.js', 'words.js', 'defs.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Удаляем только старые кэши словарика: на том же адресе могут жить другие приложения.
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('slovarik') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    return hit || fetch(req);
  }));
});

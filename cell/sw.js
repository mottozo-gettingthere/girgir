/* Girgir 5G service worker. Its own scope (/cell/), its own cache name, and
   it only ever reads and deletes its own cache - Girgir (Wi-Fi) shares this
   origin and keeps its caches to itself the same way. The shared fonts and
   QR code library are fetched from Girgir's vendor folder. */
const PREFIX = 'girgir5g-';
const CACHE = PREFIX + 'v1';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'cell.css',
  'app.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  '../vendor/qrcode.js',
  '../vendor/plex-mono-400.woff2',
  '../vendor/plex-mono-600.woff2',
  '../vendor/harmattan-ar-400.woff2',
  '../vendor/harmattan-ar-700.woff2'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith(PREFIX) && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/version.json')) {
    ev.respondWith(fetch(req, { cache: 'no-store' }).catch(
      () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  /* Own cache only: a match across every cache could hand back Girgir's copy
     of a file, from a different version. */
  ev.respondWith(
    caches.open(CACHE).then(c => c.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => {
      if (hit) return hit;
      return fetch(req)
        .then(res => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return c.match('index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    }))
  );
});

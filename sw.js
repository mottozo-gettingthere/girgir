/* Girgir service worker: cache the app shell on first load so it runs with no
   network. vendor/jsQR.min.js is deliberately NOT precached — phones whose browser
   decodes QR codes natively never download it, and those that need it fetch it on
   first run and get it cached by the runtime handler below. */
const CACHE = 'girgir-v1';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'diag.html',
  'icon-192.png',
  'icon-512.png',
  'vendor/qrcode.js',
  'vendor/plex-mono-400.woff2',
  'vendor/plex-mono-600.woff2'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});

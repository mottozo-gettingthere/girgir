/* Girgir service worker: cache the app shell on first load so it runs with no
   network.

   vendor/jsQR.min.js used to be left out of this list, on the reasoning that a
   phone with native QR decoding would never need it. Two things were wrong with
   that. The app asks for it at boot on every phone anyway, so the download was
   not being saved; and the phones that need it are exactly the ones whose native
   decoder silently returns nothing, which is not known until long after install,
   possibly with no network left to fetch it. 128 KB once, for a scanner that
   works on every phone offline. */
const CACHE = 'girgir-v30';
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
  'vendor/jsQR.min.js',
  'vendor/plex-mono-400.woff2',
  'vendor/plex-mono-600.woff2'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      /* Each file is fetched past the browser's own HTTP cache. GitHub Pages
         serves everything with max-age=600, and addAll would happily precache
         the ten-minute-old copies of the build being replaced - which is how
         an update can appear to install and change nothing. */
      .then(c => Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })))))
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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  /* version.json is how the app learns a newer build exists, so it must never
     be answered from the cache - that would only ever report itself. */
  if (url.pathname.endsWith('/version.json')) {
    ev.respondWith(fetch(req, { cache: 'no-store' }).catch(
      () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

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

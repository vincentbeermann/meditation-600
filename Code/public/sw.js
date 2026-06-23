// 600 -- Service Worker. Stale-while-revalidate for the app shell + network-
// first for navigation, so deployed updates reach installed devices on the
// next launch without a manual cache bump. Precache uses {cache:'reload'} so a
// new version never caches a stale (max-age) copy.

const CACHE_VERSION = 'meditation-600-firebase-v20';
const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'storage.js',
  'firebase-config.js',
  'firebase-init.js',
  'settings.js',
  'messaging.js',
  'vendor/firebase-app-compat.js',
  'vendor/firebase-auth-compat.js',
  'vendor/firebase-firestore-compat.js',
  'vendor/firebase-messaging-compat.js',
  'modules/timer.js',
  'modules/log.js',
  'modules/history.js',
  'modules/dashboard.js',
  'modules/plan.js',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // {cache:'reload'} bypasses the HTTP cache (Firebase serves max-age=3600),
      // so a new SW version never precaches a stale copy after a deploy.
      cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))).catch(err => {
        console.warn('SW install: some assets failed to cache:', err);
      })),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for navigation so updates show up
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('index.html')),
    );
    return;
  }

  // Stale-while-revalidate for everything else: serve cache fast, refresh in
  // the background so the next launch picks up a new deploy automatically.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.ok && (req.url.startsWith(self.location.origin) || req.url.includes('fonts.g'))) {
          cache.put(req, res.clone());
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});

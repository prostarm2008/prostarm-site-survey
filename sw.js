/* ------------------------------------------------------------------
   Service worker — makes the survey app work with no signal.
   Everything is cached on first load and served cache-first, because
   the masters and the code only change when a new version is pushed.
   Bump CACHE_VERSION whenever you deploy, or phones keep the old copy.
------------------------------------------------------------------ */
const CACHE_VERSION = 'prostarm-site-survey-v8';
const ASSETS = [
  './', './index.html',
  './css/style.css',
  './js/app.js',
  './data/app-config.js',
  './data/brand-assets.js',
  './data/i18n-hi.js',
  './data/user-master.js',
  './data/load-master.js',
  './data/site-list.js',
  './data/line-diagram.js',
  './manifest.webmanifest',
  './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never cache the flow POST
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // leave Power Automate alone
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

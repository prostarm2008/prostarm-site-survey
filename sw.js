/* ------------------------------------------------------------------
   Service worker — makes the survey app work with no signal.

   Network-first for the app's own files, cache as the fallback. A
   cache-first worker keeps serving an old build after a deployment,
   which is how a phone ends up running yesterday's index.html against
   today's app.js — the app then looks broken for no visible reason.
   Network-first costs one conditional request on a live connection and
   still works fully offline.

   Bump CACHE_VERSION on every deployment.
------------------------------------------------------------------ */
const CACHE_VERSION = 'prostarm-site-survey-v11';
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

self.addEventListener('message', e => {
  // The app sends this from "Reload the app" in Diagnostics.
  if (e.data === 'flush') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister());
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch the flow POST
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // leave Power Automate alone

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

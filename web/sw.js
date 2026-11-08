// Offline shell: cache the app files, always go to the network for data (GitHub API is cross-origin and not intercepted).
const VERSION = 'pc-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/util.js', 'js/store.js', 'js/charts.js', 'js/demo.js', 'js/training.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  // cache: 'reload' – never fill the offline cache from a stale HTTP cache
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first with revalidation (cache: 'no-cache'): unchanged files come back as a cheap 304, changed files
// immediately – so HTML, CSS and JS never mix versions after a deploy. Offline, the cached shell is used.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))),
  );
});

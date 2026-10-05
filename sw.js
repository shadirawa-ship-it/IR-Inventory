/* © 2026 Shadi Al Rawashdeh. Offline cache: all files are same-origin and relative, so it works under any GitHub Pages sub-path. */
const VERSION = 'v1.0.0';
const CACHE = 'ir-count-' + VERSION;
const FILES = ['./','index.html','app.css','app.js','manifest.webmanifest','vendor/xlsx.min.js','data/register.json','data/devices.json','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ir-count-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : undefined)));
});

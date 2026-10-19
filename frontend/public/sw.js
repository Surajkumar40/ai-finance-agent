// Finance AI service worker.
// What it does:  keeps the app's own files (JS, CSS, icons) so the app opens fast, and shows a friendly page when you are offline.
// What it never does:  store your data. Requests to the API (any other website) go straight to the network and are never kept.
// To ship a new version of this file, change VERSION. Old caches are removed automatically.
const VERSION = 'v1';
const CACHE = 'finance-ai-' + VERSION;
const PRECACHE = ['/offline.html', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  // No skipWaiting here: the page asks the user ("Update available") and then sends SKIP_WAITING.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('finance-ai-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // API and other sites: untouched
  if (url.pathname.startsWith('/api/')) return;

  // Opening a page: always try the network (so you get the newest version), fall back to the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }

  // Built files have a hash in their name and never change, so they are safe to keep and reuse.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })());
  }
});
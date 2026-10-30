// Offline-Unterstützung: eigene Dateien zuerst aus dem Netz (damit Updates sofort ankommen),
// ohne Netz aus dem Cache. Schriften kommen direkt aus dem Cache.
const CACHE = 'learning-king-v4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !fonts) return;
  // Server-Anfragen (Konto, Online-Partien) nie zwischenspeichern.
  if (sameOrigin && url.pathname.includes('/api/')) return;
  // Videos (Teil-Anfragen beim Abspielen) direkt aus dem Netz – iPhones spielen sie sonst nicht zuverlässig ab.
  if (req.headers.has('range') || /\.(mp4|webm)$/i.test(url.pathname)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (fonts) {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.status === 200 || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
        return res;
      }
      try {
        const res = await fetch(req);
        if (res.status === 200) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw err;
      }
    }),
  );
});

const cacheName = 'msk-web-development';
const staticAssets = [
  './',
  './index.html',
  './css/style.css',
  './css/responsive.css',
  './lib/bootstrap/css/bootstrap.min.css',
  './lib/jquery/jquery.min.js',
  './lib/jquery/jquery-migrate.min.js',
  './lib/bootstrap/js/bootstrap.bundle.min.js',
  './lib/typed/typed.js',
  './js/main.js',
  './components/testimony.html'
];

self.addEventListener('install', async e => {
  const cache = await caches.open(cacheName);
  await cache.addAll(staticAssets);
  return self.skipWaiting();
});

self.addEventListener('activate', e => {
  self.clients.claim();
});

self.addEventListener('fetch', async e => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(cacheFirst(req));
  } else {
    e.respondWith(networkAndCache(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  return cached || fetch(req);
}

async function networkAndCache(req) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    await cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    return cached;
  }
}
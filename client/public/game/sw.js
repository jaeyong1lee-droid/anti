const CACHE_NAME = 'soyun-obby-racer-pwa-v12';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css?v=20261022_12',
  './js/config.js?v=20261022_12',
  './js/storage.js?v=20261022_12',
  './js/questionEngine.js?v=20261022_12',
  './js/sound.js?v=20261022_12',
  './js/engine3d.js?v=20261022_12',
  './js/ui.js?v=20261022_12',
  './js/game.js?v=20261022_12',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Network-first strategy with cache: 'no-cache' so mobile browsers always get the latest push immediately
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then(function (networkRes) {
        if (networkRes && networkRes.status === 200 && url.origin === self.location.origin) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone).catch(function () {});
          });
        }
        return networkRes;
      })
      .catch(function () {
        return caches.match(event.request).then(function (cachedRes) {
          return cachedRes || caches.match('/index.html');
        });
      })
  );
});

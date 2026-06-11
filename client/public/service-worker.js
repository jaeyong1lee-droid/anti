const CACHE_NAME = 'anti-pe-cache-v1';

// We skip precaching static assets to prevent caching conflicts and updates latency.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Automatically clean up any legacy caches on activation to free device storage and force fresh fetches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          return caches.delete(cache);
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// We do NOT intercept fetch events. This lets the browser load all assets directly from the network,
// leveraging Vite's filename hashes for perfect and immediate cache-busting on reload.

const CACHE_NAME = "version-1";
const RUNTIME = 'runtime';
const PRECACHE_URLS = ['index.html'];

const self = this;

// The install handler takes care of precaching the resources we always need.
self.addEventListener('install', function (event) {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(self.skipWaiting())
  );
});

// The fetch handler serves responses for same-origin resources from a cache.
// If no response is found, it populates the runtime cache with the response
// from the network before returning it to the page.
self.addEventListener('fetch', function (event) {
  // Skip cross-origin requests, like those for Google Analytics.
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches
        .match(event.request)
        .then(function (cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches
            .open(RUNTIME)
            .then(function (cache) {
              return fetch(event.request).then(function (response) {
                // Put a copy of the response in the runtime cache.
                return cache
                  .put(event.request, response.clone())
                  .then(function () {
                    return response;
                  });
              });
            });
        })
    );
  }
});

// The activate handler takes care of cleaning up old caches.
self.addEventListener('activate', function (event) {
  console.log('[ServiceWorker] Activate');
  const currentCaches = [PRECACHE, RUNTIME];
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return cacheNames.filter(function (cacheName) {
          return !currentCaches.includes(cacheName);
        });
      })
      .then(function (cachesToDelete) {
        return Promise.all(cachesToDelete.map(function (cacheToDelete) {
          return caches.delete(cacheToDelete);
        }));
      })
      .then(function () {
        self.clients.claim();
      })
  );
});
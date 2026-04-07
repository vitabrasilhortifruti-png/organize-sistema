// Service Worker — Organize PWA
var CACHE = 'organize-v1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

// Network first - always fresh data, fallback to cache for HTML
self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  
  // For API calls: always network
  if (url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  
  // For HTML: network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      })
      .catch(function() {
        return caches.match(e.request);
      })
  );
});

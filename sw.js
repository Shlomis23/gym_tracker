const CACHE_NAME = 'gymbuddy-cache-v4';

const urlsToCache = [
  './manifest.json',
  './index.html'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // בקשות ל-Supabase — תמיד מהרשת, אף פעם לא מהcache
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isAppShellAsset = isSameOrigin && (
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  );

  // App shell assets — Network First (עדיפות לגרסה עדכנית)
  if (isAppShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // שאר הקבצים — Cache First + fill
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).then(networkResponse => {
        if (!isSameOrigin || !networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return networkResponse;
      });
    })
  );
});

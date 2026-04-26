const CACHE_NAME = 'gymbuddy-cache-v11';

const APP_SHELL_URLS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './config.js',
  './state.js',
  './utils.js',
  './library.js',
  './dashboard.js',
  './api.js',
  './sync-status.js',
  './workouts-domain.js',
  './workouts-data.js',
  './weight-domain.js',
  './weight-data.js',
  './share.js',
  './workout-sync.js',
  './weight-ui.js',
  './home-ui.js',
  './history-ui.js',
  './manage-ui.js',
  './render.js',
  './init.js',
  './icon-192x192.png',
  './icon-512x512.png'
];

self.addEventListener('install', event => {
  // Do NOT call skipWaiting() here — let the user choose when to update
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_URLS))
  );
});

// Allow the page to trigger update on user consent
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // בקשות ל-Supabase — תמיד מהרשת, אף פעם לא מהcache
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  const isAppShellAsset = isSameOrigin && APP_SHELL_URLS.some(path => url.pathname.endsWith(path.replace('./', '/')));

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          return caches.match('./index.html');
        })
    );
    return;
  }

  // App shell assets — Cache First (offline-first boot reliability)
  if (isAppShellAsset) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
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

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch (_) {
      payload = {};
    }

    const title = payload.title || 'GymBuddy';
    const body = payload.body || 'יש לך עדכון חדש באפליקציה';
    const url = payload.url || '/';

    await self.registration.showNotification(title, {
      body,
      data: { url },
      icon: './icon-192x192.png',
      badge: './icon-192x192.png'
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }
    if (clients.openWindow) {
      await clients.openWindow(targetUrl);
    }
  })());
});

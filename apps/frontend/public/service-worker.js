// Runtime-caching service worker (no fixed precache list) — Next.js emits
// content-hashed build filenames that change every build, so a static
// precache manifest would go stale immediately. Caching what actually gets
// requested at runtime avoids that problem entirely.
const CACHE_VERSION = 'v1';
const RUNTIME_CACHE = `absensiku-runtime-${CACHE_VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== RUNTIME_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API calls always need fresh data — never intercept them. If the network
  // is down the request just fails normally and the page's own error
  // handling (axios catch blocks) takes over.
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: try the network first (so users always see current
  // content when online), fall back to a cached copy, then the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/offline.html')))
    );
    return;
  }

  // Static assets (_next/static/*, icons, fonts): serve from cache
  // immediately if we have it, refresh in the background either way.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// --- Web Push ---------------------------------------------------------
// Fires even when no tab is open, which is the whole point: this is what
// actually puts a notification in the phone's system tray, unlike the
// in-app NotificationBell (which only works while a tab is open and polling).

self.addEventListener('push', (event) => {
  let data = { title: 'Absensiku', body: 'Anda memiliki notifikasi baru.' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

// Clicking the system notification focuses an existing tab if one is open,
// otherwise opens a new one at the relevant page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

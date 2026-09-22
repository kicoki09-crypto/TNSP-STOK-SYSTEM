// Service Worker for TNSP SYSTEM (PWA)
const CACHE_NAME = 'tnsp-system-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-caching assets skipped in development:', err);
      });
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch Event (Network-first fallback to cache)
self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Ignore non-GET requests or APIs/Supabase/etc.
  if (request.method !== 'GET' || request.url.includes('/api/') || request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Fallback if both fail
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// Push Notification listener (like WhatsApp / custom push)
self.addEventListener('push', (event) => {
  let data = { title: 'Notifikasi TNSP', body: 'Ada aktivitas baru di sistem gudang.' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
    badge: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Focus or open application window
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Background Notification Scheduler (Allows simulating push notifications after closing tab)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, delay } = event.data;
    
    // Set background timeout
    setTimeout(() => {
      self.registration.showNotification(title, {
        body: body,
        icon: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
        badge: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
        vibrate: [200, 100, 200],
        tag: 'background-alert-' + Date.now(),
        data: {
          url: '/'
        }
      });
    }, delay || 5000);
  }
});


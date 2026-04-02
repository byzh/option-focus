// Service Worker: handles background push notifications (no Firebase SDK, no keys)
self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {};
  const title = payload.notification?.title ?? payload.data?.title ?? 'Option Focus';
  const body = payload.notification?.body ?? payload.data?.body ?? '';
  event.waitUntil(
    self.registration.showNotification(title, { body, icon: '/favicon.ico' })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

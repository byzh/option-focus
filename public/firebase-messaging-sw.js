// Service Worker: handles background push notifications (no Firebase SDK, no keys)
self.addEventListener('push', (event) => {
  const { title = 'Option Focus', body = '' } = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(title, { body, icon: '/favicon.ico' })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

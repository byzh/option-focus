// Service Worker: handles background push notifications (no Firebase SDK, no keys)

// Holds full notification content until the app window picks it up.
let pendingNotification = null;

self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {};
  const title = payload.notification?.title ?? payload.data?.title ?? 'Option Focus';
  const summary = payload.notification?.body ?? payload.data?.body ?? '';
  const fullBody = payload.data?.body ?? summary;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: summary,
      icon: '/favicon.ico',
      data: { title, body: fullBody },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // App already open in background — focus it and deliver content directly
      const existing = clientList.find((c) => 'focus' in c);
      if (existing) {
        existing.postMessage({ type: 'notification-click', ...data });
        return existing.focus();
      }
      // App not open — store content for the new window to pick up on load
      pendingNotification = data;
      return clients.openWindow('/');
    })
  );
});

// App sends 'get-pending-notification' on startup to retrieve stored content.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'get-pending-notification') {
    if (pendingNotification) {
      event.source.postMessage({ type: 'notification-click', ...pendingNotification });
      pendingNotification = null;
    }
  }
});

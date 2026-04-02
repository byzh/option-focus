import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Register Service Worker and obtain FCM token.
 * Stores the token in Firestore under users/{uid}/config/fcm.
 * Returns the token string, or null if permission denied / unsupported.
 *
 * @param {object} app - Firebase app instance
 * @param {object} db  - Firestore instance
 * @param {string} uid - authenticated user ID
 */
export async function registerFcm(app, db, uid) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
  if (!VAPID_KEY) {
    console.warn('FCM: VITE_FIREBASE_VAPID_KEY not set');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return null;

  await setDoc(
    doc(db, 'artifacts', 'option-focus-v2', 'users', uid, 'config', 'fcm'),
    { token, updatedAt: serverTimestamp() }
  );

  return token;
}

/**
 * Handle foreground messages (app is open and in foreground).
 * Returns an unsubscribe function.
 *
 * @param {object} app - Firebase app instance
 * @param {function} onReceive - callback({ title, body })
 */
export function onForegroundMessage(app, onReceive) {
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    const title = payload.data?.title ?? payload.notification?.title ?? 'Option Focus';
    const body = payload.data?.body ?? payload.notification?.body ?? '';
    onReceive({ title, body });
  });
}

/**
 * Handle notification clicks that open or focus the app from background.
 * Listens for postMessage from the Service Worker, and on setup queries
 * the SW for any pending notification stored before the window opened.
 * Returns an unsubscribe function.
 *
 * @param {function} onReceive - callback({ title, body })
 */
export function onNotificationMessage(onReceive) {
  if (!('serviceWorker' in navigator)) return () => {};

  const handler = (event) => {
    if (event.data?.type === 'notification-click') {
      onReceive({ title: event.data.title ?? '', body: event.data.body ?? '' });
    }
  };
  navigator.serviceWorker.addEventListener('message', handler);

  // Query SW for content stored before this window was open
  // (covers the case where the app was launched by clicking the notification)
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: 'get-pending-notification' });
  });

  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

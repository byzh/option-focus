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
 * Handle foreground messages (app is open).
 * Returns an unsubscribe function.
 *
 * @param {object} app - Firebase app instance
 * @param {function} onReceive - callback({ title, body })
 */
export function onForegroundMessage(app, onReceive) {
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    const { title = 'Option Focus', body = '' } = payload.notification ?? {};
    onReceive({ title, body });
  });
}

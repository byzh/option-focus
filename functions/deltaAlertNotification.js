'use strict';

const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { isMarketClosed } = require('./marketHolidays');
const { fetchDeltasForPositions, fetchVixValue } = require('./fetchDeltasServer');
const { getValidAccessToken } = require('./tokenHelper');
const {
  collectPutWarnings,
  collectLeapsWarnings,
  collectCCWarnings,
  collectPMCCWarnings,
  buildNotificationBody,
  buildNotificationSummary,
  calculateDTE,
} = require('./alertHelpers');

const APP_ID = 'option-focus-v2';

/**
 * Send an FCM message to a single device token.
 * - notification.body: short summary shown in system notification banner
 * - data.body: full content shown in-app via MessageModal
 */
async function sendNotification(fcmToken, title, summary, fullBody) {
  await getMessaging().send({
    token: fcmToken,
    notification: { title, body: summary },
    data: { title, body: fullBody },
  });
}

/**
 * Process one user: fetch positions, compute all warnings, send notification.
 * Always sends a notification — success recap or error message.
 */
async function processUser(uid, fcmToken, accessToken) {
  const db = getFirestore();
  const posSnap = await db
    .collection('artifacts').doc(APP_ID)
    .collection('users').doc(uid)
    .collection('positions')
    .where('status', '==', 'OPEN')
    .get();

  const today = new Date().toISOString().slice(0, 10);
  const allPositions = posSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Positions needing delta fetch: PUTs + LEAPS
  const putPositions = allPositions.filter(p =>
    p.assetType !== 'STOCK' && p.type === 'PUT' && p.expiration >= today
  );
  const leapsPositions = allPositions.filter(p =>
    p.assetType !== 'STOCK' && p.type === 'CALL' && p.direction === 'BUY' &&
    p.status !== 'CLOSED' && (calculateDTE(p.expiration) ?? 0) > 90
  );

  // Fetch deltas for PUTs and LEAPS in one batch (deduplicated by id)
  const deltaTargets = [...new Map([...leapsPositions, ...putPositions].map(p => [p.id, p])).values()];
  const deltaMap = deltaTargets.length ? await fetchDeltasForPositions(accessToken, deltaTargets) : new Map();

  // Fetch VIX (non-blocking)
  const vix = await fetchVixValue(accessToken);

  // Collect all warnings
  const warnings = [
    ...collectPutWarnings(putPositions, deltaMap),
    ...collectLeapsWarnings(leapsPositions, deltaMap),
    ...collectCCWarnings(allPositions),
    ...collectPMCCWarnings(allPositions),
  ];

  const title = warnings.length ? `⚠️ 每日持仓简报 (${warnings.length} 项警告)` : '每日持仓简报';
  const summary = buildNotificationSummary(warnings, vix);
  const fullBody = buildNotificationBody(warnings, vix);
  await sendNotification(fcmToken, title, summary, fullBody);
}

/**
 * Main entry point — called by the Cloud Scheduler.
 * Iterates all users with FCM tokens and sends daily recap.
 */
async function runDeltaAlertNotification(clientId, clientSecret) {
  if (isMarketClosed()) {
    console.log('Market closed today, skipping delta alert.');
    return;
  }

  const db = getFirestore();
  const usersSnap = await db.collection('artifacts').doc(APP_ID).collection('users').listDocuments();

  await Promise.allSettled(usersSnap.map(async (userRef) => {
    const uid = userRef.id;
    let fcmToken = null;
    try {
      const fcmSnap = await userRef.collection('config').doc('fcm').get();
      fcmToken = fcmSnap.exists ? fcmSnap.data()?.token : null;
      if (!fcmToken) return;

      const accessToken = await getValidAccessToken(uid, clientId, clientSecret);
      await processUser(uid, fcmToken, accessToken);
    } catch (err) {
      console.error(`Delta alert failed for uid=${uid}:`, err.message);
      if (fcmToken) {
        await sendNotification(fcmToken, '简报发送失败', `错误: ${err.message}`).catch(() => {});
      }
    }
  }));
}

module.exports = { runDeltaAlertNotification };

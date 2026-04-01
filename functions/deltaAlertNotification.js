'use strict';

const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { isMarketClosed } = require('./marketHolidays');
const { fetchDeltasForPositions } = require('./fetchDeltasServer');

const APP_ID = 'option-focus-v2';
const DELTA_WARN_THRESHOLD = 0.5;

/**
 * Send an FCM data-only message to a single device token.
 * Uses data payload so the SW's raw push handler works without Firebase in SW.
 */
async function sendNotification(fcmToken, title, body) {
  await getMessaging().send({
    token: fcmToken,
    notification: { title, body },
    // Also include data for foreground handler
    data: { title, body },
  });
}

/**
 * Build notification body from positions with high delta.
 * @param {Array<{ ticker, strike, expiration, delta }>} alerts
 */
function buildAlertBody(alerts) {
  if (!alerts.length) return '所有 PUT 持仓 Delta 正常';
  const lines = alerts.map(a =>
    `${a.ticker} $${a.strike} (${a.expiration}) Δ${a.delta.toFixed(2)}`
  );
  return lines.join('\n');
}

/**
 * Process one user: fetch positions, get deltas, send notification.
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

  const putPositions = posSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.assetType !== 'STOCK' && p.type === 'PUT' && p.expiration >= new Date().toISOString().slice(0, 10));

  if (!putPositions.length) {
    await sendNotification(fcmToken, '每日持仓简报', '暂无开仓 PUT 持仓');
    return;
  }

  const deltaMap = await fetchDeltasForPositions(accessToken, putPositions);

  const alerts = putPositions
    .filter(p => {
      const delta = deltaMap.get(p.id);
      return delta != null && Math.abs(delta) > DELTA_WARN_THRESHOLD;
    })
    .map(p => ({ ticker: p.ticker, strike: p.strike, expiration: p.expiration, delta: deltaMap.get(p.id) }));

  const title = alerts.length ? `⚠️ Delta 警告 (${alerts.length} 个持仓)` : '每日持仓简报';
  const body = buildAlertBody(alerts);
  await sendNotification(fcmToken, title, body);
}

/**
 * Main entry point — called by the Cloud Scheduler.
 * Iterates all users with FCM tokens and sends daily recap.
 */
async function runDeltaAlertNotification() {
  if (isMarketClosed()) {
    console.log('Market closed today, skipping delta alert.');
    return;
  }

  const db = getFirestore();

  // Collect all users who have FCM tokens stored
  const usersSnap = await db.collection('artifacts').doc(APP_ID).collection('users').listDocuments();

  await Promise.allSettled(usersSnap.map(async (userRef) => {
    const uid = userRef.id;
    let fcmToken = null;
    try {
      const fcmSnap = await userRef.collection('config').doc('fcm').get();
      fcmToken = fcmSnap.exists ? fcmSnap.data()?.token : null;
      if (!fcmToken) return; // user hasn't enabled notifications

      // Get valid TastyTrade access token from server-side cache
      const tokenRef = db.collection('artifacts').doc(APP_ID)
        .collection('_server').doc('tokens')
        .collection('users').doc(uid);
      const tokenSnap = await tokenRef.get();
      if (!tokenSnap.exists) {
        await sendNotification(fcmToken, '简报发送失败', '未连接 TastyTrade，请打开 app 重新连接');
        return;
      }
      const { accessToken, accessTokenExpiry } = tokenSnap.data();
      if (!accessToken || new Date(accessTokenExpiry) < new Date()) {
        await sendNotification(fcmToken, '简报发送失败', 'TastyTrade 会话已过期，请打开 app 重新连接');
        return;
      }

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

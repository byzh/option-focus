'use strict';

const { getFirestore } = require('firebase-admin/firestore');

const APP_ID = 'option-focus-v2';
const TASTYTRADE_API = 'https://api.tastytrade.com';

function getUserRefs(uid) {
  const db = getFirestore();
  const configRef = db.collection('artifacts').doc(APP_ID)
    .collection('users').doc(uid)
    .collection('config').doc('tastytrade');
  const tokenRef = db.collection('artifacts').doc(APP_ID)
    .collection('_server').doc('tokens')
    .collection('users').doc(uid);
  return { configRef, tokenRef };
}

/**
 * Call TastyTrade OAuth to exchange a refresh token for a new access token.
 * @param {string} refreshToken
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<{ access_token: string, expires_in: number }>}
 */
async function fetchAccessToken(refreshToken, clientId, clientSecret) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken.trim(),
    client_id: clientId.trim(),
    client_secret: clientSecret.trim(),
  });

  const oauthRes = await fetch(`${TASTYTRADE_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'OptionFocus/1.0',
    },
    body: params.toString(),
  });

  const responseText = await oauthRes.text();
  let tokenData;
  try {
    tokenData = JSON.parse(responseText);
  } catch {
    throw new Error(`Tastytrade API error: HTTP ${oauthRes.status}`);
  }

  if (!oauthRes.ok) {
    throw new Error(tokenData?.error_description || tokenData?.error || `HTTP ${oauthRes.status}`);
  }

  if (!tokenData.access_token || !tokenData.expires_in) {
    throw new Error('Tastytrade response missing access_token or expires_in');
  }

  return tokenData;
}

/**
 * Get a valid TastyTrade access token for a user.
 * Uses cached token if still valid (2-min buffer), otherwise refreshes via OAuth.
 * Secrets must be passed in from the Cloud Function context where they are accessible.
 *
 * @param {string} uid
 * @param {string} clientId  - value of TASTYTRADE_CLIENT_ID secret
 * @param {string} clientSecret - value of TASTYTRADE_CLIENT_SECRET secret
 * @returns {Promise<string>} valid access token
 */
async function getValidAccessToken(uid, clientId, clientSecret) {
  const { configRef, tokenRef } = getUserRefs(uid);

  // Check cached token
  const tokenSnap = await tokenRef.get();
  if (tokenSnap.exists) {
    const cached = tokenSnap.data();
    const expiresAt = new Date(cached.accessTokenExpiry);
    if (expiresAt - new Date() > 2 * 60 * 1000) {
      return cached.accessToken;
    }
  }

  // Token expired or missing — refresh via OAuth
  const configSnap = await configRef.get();
  if (!configSnap.exists || !configSnap.data()?.refreshToken) {
    throw new Error('未连接 TastyTrade，请打开 app 重新连接');
  }

  const refreshToken = configSnap.data().refreshToken;
  const tokenData = await fetchAccessToken(refreshToken, clientId, clientSecret);

  // Cache server-side only
  const expiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  await tokenRef.set({
    accessToken: tokenData.access_token,
    accessTokenExpiry: expiry,
    lastRefresh: Date.now(),
  });

  return tokenData.access_token;
}

module.exports = { fetchAccessToken, getValidAccessToken, getUserRefs };

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize admin SDK once (singleton)
initializeApp();
const db = getFirestore();

const APP_ID = 'option-focus-v2';

exports.tastytradeRefreshToken = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: false,
  },
  async (request) => {
    // 1. Verify authenticated caller
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Must be logged in to refresh Tastytrade token.'
      );
    }

    const uid = request.auth.uid;
    const { clientId, refreshToken } = request.data;

    // 2. Validate required inputs from client
    if (!clientId || !refreshToken) {
      throw new HttpsError(
        'invalid-argument',
        'clientId and refreshToken are required.'
      );
    }

    // 3. Read clientSecret from Firestore server-side
    let clientSecret;
    try {
      const ref = db
        .collection('artifacts')
        .doc(APP_ID)
        .collection('users')
        .doc(uid)
        .collection('config')
        .doc('tastytrade');

      const snap = await ref.get();

      if (!snap.exists) {
        throw new HttpsError(
          'not-found',
          'No Tastytrade credentials found. Please reconnect.'
        );
      }

      const data = snap.data();

      if (!data.clientSecret) {
        throw new HttpsError(
          'not-found',
          'clientSecret not found in stored credentials.'
        );
      }

      clientSecret = data.clientSecret;
    } catch (e) {
      // Re-throw HttpsErrors unchanged; wrap unexpected Firestore errors
      if (e instanceof HttpsError) throw e;
      throw new HttpsError(
        'internal',
        `Failed to read credentials from Firestore: ${e.message}`
      );
    }

    // 4. Call Tastytrade OAuth token endpoint
    let tokenData;
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);

      const res = await fetch('https://api.tastytrade.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      tokenData = await res.json();

      if (!res.ok) {
        const errorMsg =
          tokenData?.error_description ||
          tokenData?.error ||
          `HTTP ${res.status}`;
        throw new HttpsError(
          'internal',
          `Tastytrade OAuth failed: ${errorMsg}`
        );
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError(
        'internal',
        `Network error calling Tastytrade: ${e.message}`
      );
    }

    // 5. Validate the response shape
    if (!tokenData.access_token || !tokenData.expires_in) {
      throw new HttpsError(
        'internal',
        'Tastytrade response missing access_token or expires_in.'
      );
    }

    // 6. Return only what the client needs — never echo clientSecret
    return {
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
    };
  }
);

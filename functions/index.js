const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize admin SDK once (singleton)
initializeApp();
const db = getFirestore();

const APP_ID = 'option-focus-v2';

// Define OAuth parameters (new Firebase params API, replaces deprecated functions.config())
const clientId = defineString('TASTYTRADE_CLIENT_ID', {
  description: 'Tastytrade OAuth Client ID',
});
const clientSecret = defineString('TASTYTRADE_CLIENT_SECRET', {
  description: 'Tastytrade OAuth Client Secret',
});

// Callable function for OAuth token refresh
// Client sends only: { refreshToken }
// Cloud Function handles: clientId (from params) + clientSecret (from params) + refreshToken (from client)
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

    // 2. Validate client input
    const { refreshToken } = request.data;
    if (!refreshToken) {
      throw new HttpsError(
        'invalid-argument',
        'refreshToken is required.'
      );
    }

    // 3. Get OAuth credentials from params (will fail gracefully if not set)
    const cid = clientId.value();
    const csecret = clientSecret.value();

    if (!cid || !csecret) {
      throw new HttpsError(
        'failed-precondition',
        'OAuth credentials not configured. Admin must set TASTYTRADE_CLIENT_ID and TASTYTRADE_CLIENT_SECRET parameters.'
      );
    }

    // 4. Call Tastytrade OAuth token endpoint (server-side, clientSecret never sent to client)
    let tokenData;
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', cid);
      params.append('client_secret', csecret);

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

    // 6. Return only what the client needs
    return {
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
    };
  }
);

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');

// Initialize admin SDK once (singleton)
initializeApp();
const db = getFirestore();

const APP_ID = 'option-focus-v2';

// Define secrets using Firebase Secret Manager
// These are injected securely at runtime, never exposed in code
const clientId = defineSecret('TASTYTRADE_CLIENT_ID');
const clientSecret = defineSecret('TASTYTRADE_CLIENT_SECRET');

// Callable function for OAuth token refresh
// Client sends only: { refreshToken }
// Cloud Function handles: clientId (from Secret Manager) + clientSecret (from Secret Manager) + refreshToken (from client)
exports.tastytradeRefreshToken = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: false,
    secrets: [clientId, clientSecret], // ⚠️ Declare secrets needed by this function
  },
  async (request) => {
    // Secrets are automatically injected and available via context
    const CLIENT_ID = clientId.value();
    const CLIENT_SECRET = clientSecret.value();
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

    // 3. Validate OAuth credentials are configured
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new HttpsError(
        'failed-precondition',
        'OAuth credentials not configured. Admin must set TASTYTRADE_CLIENT_ID and TASTYTRADE_CLIENT_SECRET environment variables.'
      );
    }

    // 4. Call Tastytrade OAuth token endpoint (server-side, clientSecret never sent to client)
    let tokenData;
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', CLIENT_ID);
      params.append('client_secret', CLIENT_SECRET);

      const res = await fetch('https://api.tastytrade.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const responseText = await res.text();

      let tokenData;
      try {
        tokenData = JSON.parse(responseText);
      } catch (e) {
        console.error('Tastytrade API returned non-JSON:', {
          status: res.status,
          contentType: res.headers.get('content-type'),
          bodyPreview: responseText.substring(0, 200),
        });
        throw new HttpsError(
          'internal',
          `Tastytrade API error: HTTP ${res.status}. Check Refresh Token validity.`
        );
      }

      if (!res.ok) {
        const errorMsg =
          tokenData?.error_description ||
          tokenData?.error ||
          `HTTP ${res.status}`;

        // Log full error details for debugging
        console.error('Tastytrade OAuth error details:', {
          status: res.status,
          error: tokenData?.error,
          errorDescription: tokenData?.error_description,
          fullResponse: tokenData,
        });

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

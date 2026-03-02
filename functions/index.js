// Updated: 2026-03-02 Force redeploy
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
    cors: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'], // Allow localhost for dev
    secrets: [clientId, clientSecret], // ⚠️ Declare secrets needed by this function
  },
  async (request) => {
    // Secrets are automatically injected and available via context
    const CLIENT_ID = clientId.value();
    const CLIENT_SECRET = clientSecret.value();

    // Debug: Log secret injection (without exposing actual values)
    console.log('Secret injection debug:', {
      clientIdLength: CLIENT_ID?.length || 0,
      clientSecretLength: CLIENT_SECRET?.length || 0,
      clientIdSet: !!CLIENT_ID,
      clientSecretSet: !!CLIENT_SECRET,
    });

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

    // Trim whitespace from inputs (same as UI implementation)
    const trimmedRefreshToken = refreshToken.trim();
    const trimmedClientId = CLIENT_ID.trim();
    const trimmedClientSecret = CLIENT_SECRET.trim();

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
      const requestBody = {
        grant_type: 'refresh_token',
        refresh_token: trimmedRefreshToken,
        client_id: trimmedClientId,
        client_secret: trimmedClientSecret,
      };

      console.log('Calling Tastytrade OAuth with request:', {
        url: 'https://api.tastytrade.com/oauth/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          grant_type: requestBody.grant_type,
          refresh_token: `***${trimmedRefreshToken.slice(-10)}`,
          client_id: `***${trimmedClientId.slice(-5)}`,
          client_secret: `***${trimmedClientSecret.slice(-5)}`,
        },
      });

      const res = await fetch('https://api.tastytrade.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const responseText = await res.text();

      console.log('Tastytrade response:', {
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get('content-type'),
        bodyPreview: responseText.substring(0, 300),
      });

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

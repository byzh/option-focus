// Updated: 2026-03-02 CORS Fix - Switch to onRequest with manual CORS handling
// Force redeploy to reload secrets from Secret Manager
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { defineSecret } = require('firebase-functions/params');
const cors = require('cors')({ origin: true });

// Initialize admin SDK once (singleton)
initializeApp();
const auth = getAuth();

// Define secrets using Firebase Secret Manager
const clientId = defineSecret('TASTYTRADE_CLIENT_ID');
const clientSecret = defineSecret('TASTYTRADE_CLIENT_SECRET');

// HTTP Cloud Function for OAuth token refresh
// Uses onRequest instead of onCall for better CORS control
exports.tastytradeRefreshToken = onRequest(
  {
    region: 'us-central1',
    secrets: [clientId, clientSecret],
  },
  async (req, res) => {
    // Wrap with CORS middleware
    cors(req, res, async () => {
      try {
        // 1. Verify Firebase Authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthenticated',
            message: 'Missing or invalid authorization header',
          });
        }

        const token = authHeader.substring('Bearer '.length);
        let decodedToken;
        try {
          decodedToken = await auth.verifyIdToken(token);
        } catch (err) {
          return res.status(401).json({
            error: 'unauthenticated',
            message: 'Invalid authentication token',
          });
        }

        // 2. Validate request body
        const { refreshToken } = req.body || {};
        if (!refreshToken || typeof refreshToken !== 'string') {
          return res.status(400).json({
            error: 'invalid-argument',
            message: 'refreshToken is required and must be a string',
          });
        }

        // 3. Get secrets (injected at runtime)
        const CLIENT_ID = clientId.value();
        const CLIENT_SECRET = clientSecret.value();

        console.log('Secret values loaded:', {
          clientIdExists: !!CLIENT_ID,
          clientIdLength: CLIENT_ID?.length || 0,
          clientSecretExists: !!CLIENT_SECRET,
          clientSecretLength: CLIENT_SECRET?.length || 0,
        });

        if (!CLIENT_ID || !CLIENT_SECRET) {
          console.error('Secrets not configured');
          return res.status(500).json({
            error: 'failed-precondition',
            message: 'OAuth credentials not configured',
          });
        }

        // 4. Call Tastytrade OAuth endpoint
        console.log('=== Tastytrade OAuth Request Debug ===');
        console.log('User UID:', decodedToken.uid);
        console.log('CLIENT_ID length:', CLIENT_ID.length);
        console.log('CLIENT_SECRET length:', CLIENT_SECRET.length);
        console.log('Refresh Token length:', refreshToken.trim().length);

        const params = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken.trim(),
          client_id: CLIENT_ID.trim(),
          client_secret: CLIENT_SECRET.trim(),
        });

        const bodyString = params.toString();
        console.log('URLSearchParams body (first 100 chars):', bodyString.substring(0, 100));
        console.log('URLSearchParams body length:', bodyString.length);
        console.log('Request headers:', { 'Content-Type': 'application/x-www-form-urlencoded' });

        const oauthRes = await fetch('https://api.tastytrade.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'OptionFocus/1.0',
          },
          body: bodyString,
        });

        console.log('Tastytrade response status:', oauthRes.status);
        console.log('Tastytrade response headers:', Object.fromEntries(oauthRes.headers));

        const responseText = await oauthRes.text();
        console.log('Tastytrade response body (first 500 chars):', responseText.substring(0, 500));
        let tokenData;

        try {
          tokenData = JSON.parse(responseText);
        } catch (e) {
          console.error('Tastytrade API returned non-JSON:', {
            status: oauthRes.status,
            body: responseText.substring(0, 200),
          });
          return res.status(500).json({
            error: 'internal',
            message: `Tastytrade API error: HTTP ${oauthRes.status}`,
          });
        }

        // 5. Check Tastytrade response
        if (!oauthRes.ok) {
          const errorMsg = tokenData?.error_description || tokenData?.error || `HTTP ${oauthRes.status}`;
          console.error('Tastytrade OAuth error:', errorMsg);
          return res.status(500).json({
            error: 'internal',
            message: `Tastytrade OAuth failed: ${errorMsg}`,
          });
        }

        // 6. Validate response contains required fields
        if (!tokenData.access_token || !tokenData.expires_in) {
          console.error('Tastytrade response missing required fields');
          return res.status(500).json({
            error: 'internal',
            message: 'Tastytrade response missing access_token or expires_in',
          });
        }

        // 7. Return success
        res.status(200).json({
          access_token: tokenData.access_token,
          expires_in: tokenData.expires_in,
        });

      } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).json({
          error: 'internal',
          message: error.message || 'Internal server error',
        });
      }
    });
  }
);

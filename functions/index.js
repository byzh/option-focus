// Firebase Cloud Functions for Tastytrade OAuth + API Proxy
// access_token never leaves the server - all API calls go through proxy
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { defineSecret } = require('firebase-functions/params');
const { fetchAccessToken, getValidAccessToken, getUserRefs } = require('./tokenHelper');
const cors = require('cors')({
  origin: (origin, callback) => {
    // Allow same-origin / server-to-server calls (no Origin header)
    if (!origin) return callback(null, true);

    const allowed = [
      'https://option-focus.web.app',
      'https://option-focus.firebaseapp.com',
      'https://option-focus-test.web.app',
      'https://option-focus-test.firebaseapp.com',
    ];

    if (
      allowed.includes(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https:\/\/option-focus[\w-]*\.vercel\.app$/.test(origin)
    ) {
      return callback(null, true);
    }

    console.warn('CORS blocked origin:', origin);
    return callback(new Error(`Origin ${origin} not allowed`));
  },
});

// Initialize admin SDK once (singleton)
initializeApp();
const auth = getAuth();

// Define secrets using Firebase Secret Manager
const clientId = defineSecret('TASTYTRADE_CLIENT_ID');
const clientSecret = defineSecret('TASTYTRADE_CLIENT_SECRET');

const TASTYTRADE_API = 'https://api.tastytrade.com';

// Whitelist of allowed API paths (security: prevent access to sensitive endpoints)
const ALLOWED_PATHS = [
  '/market-data/by-type',
  '/instruments/equities',
  '/option-chains/',
  '/market-metrics',
  '/api-quote-tokens',
];

// Helper: verify Firebase Auth from request
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  try {
    return await auth.verifyIdToken(authHeader.substring('Bearer '.length));
  } catch {
    return null;
  }
}


// ============================================================
// Cloud Function 1: OAuth Token Refresh (connect/reconnect)
// Returns only { connected: true }, NOT the access_token
// ============================================================
exports.tastytradeRefreshToken = onRequest(
  {
    region: 'us-central1',
    secrets: [clientId, clientSecret],
  },
  async (req, res) => {
    cors(req, res, async () => {
      try {
        // 1. Verify Firebase Authentication
        const decodedToken = await verifyAuth(req);
        if (!decodedToken) {
          return res.status(401).json({
            error: 'unauthenticated',
            message: 'Missing or invalid authorization',
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

        // 3. Get secrets
        const CLIENT_ID = clientId.value();
        const CLIENT_SECRET = clientSecret.value();
        if (!CLIENT_ID || !CLIENT_SECRET) {
          return res.status(500).json({
            error: 'failed-precondition',
            message: 'OAuth credentials not configured',
          });
        }

        // 4. Call Tastytrade OAuth
        console.log('Calling Tastytrade OAuth for user:', decodedToken.uid);
        const tokenData = await fetchAccessToken(refreshToken, CLIENT_ID, CLIENT_SECRET);

        // 5. Cache access_token SERVER-SIDE ONLY (never sent to client)
        const { tokenRef } = getUserRefs(decodedToken.uid);
        const expiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
        await tokenRef.set({
          accessToken: tokenData.access_token,
          accessTokenExpiry: expiry,
          lastRefresh: Date.now(),
        });

        // 6. Return success WITHOUT access_token
        res.status(200).json({
          connected: true,
          expiresIn: tokenData.expires_in,
        });

      } catch (error) {
        console.error('Token refresh error:', error.message);
        res.status(500).json({
          error: 'internal',
          message: error.message || 'Internal server error',
        });
      }
    });
  }
);

// ============================================================
// Cloud Function 2: API Proxy (all Tastytrade API calls go here)
// Client never sees access_token - proxy handles auth server-side
// ============================================================
exports.tastytradeApiProxy = onRequest(
  {
    region: 'us-central1',
    secrets: [clientId, clientSecret],
  },
  async (req, res) => {
    cors(req, res, async () => {
      try {
        // 1. Verify Firebase Authentication
        const decodedToken = await verifyAuth(req);
        if (!decodedToken) {
          return res.status(401).json({
            error: 'unauthenticated',
            message: 'Missing or invalid authorization',
          });
        }

        // 2. Validate request
        const { path, query } = req.body || {};
        if (!path || typeof path !== 'string') {
          return res.status(400).json({
            error: 'invalid-argument',
            message: 'path is required',
          });
        }

        // 3. Security: reject path traversal, then check whitelist
        if (path.includes('..') || path.includes('//')) {
          return res.status(403).json({
            error: 'permission-denied',
            message: 'Invalid path',
          });
        }
        const isAllowed = ALLOWED_PATHS.some(allowed => path.startsWith(allowed));
        if (!isAllowed) {
          return res.status(403).json({
            error: 'permission-denied',
            message: `Path "${path}" is not allowed`,
          });
        }

        // 4. Get valid access_token (auto-refreshes if expired)
        const accessToken = await getValidAccessToken(decodedToken.uid, clientId.value(), clientSecret.value());

        // 5. Build Tastytrade API URL
        const url = new URL(`${TASTYTRADE_API}${path}`);
        if (query && typeof query === 'object') {
          Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
        }

        // 6. Call Tastytrade API
        const apiRes = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'OptionFocus/1.0',
          },
        });

        const apiText = await apiRes.text();
        let apiData;
        try {
          apiData = JSON.parse(apiText);
        } catch {
          return res.status(502).json({
            error: 'bad-gateway',
            message: `Tastytrade returned non-JSON: HTTP ${apiRes.status}`,
          });
        }

        if (!apiRes.ok) {
          return res.status(apiRes.status).json({
            error: 'upstream-error',
            message: apiData?.error || `HTTP ${apiRes.status}`,
            data: apiData,
          });
        }

        // 7. Return API data (no token exposed)
        res.status(200).json(apiData);

      } catch (error) {
        console.error('API proxy error:', error.message);
        res.status(500).json({
          error: 'internal',
          message: error.message || 'Internal server error',
        });
      }
    });
  }
);

// ============================================================
// Cloud Function 3: Daily delta alert — 9:30 AM ET on weekdays
// ============================================================
exports.dailyDeltaAlert = onSchedule(
  {
    schedule: '30 9 * * 1-5',
    timeZone: 'America/New_York',
    region: 'us-central1',
    secrets: [clientId, clientSecret],
  },
  async () => {
    const { runDeltaAlertNotification } = require('./deltaAlertNotification');
    await runDeltaAlertNotification(clientId.value(), clientSecret.value());
  }
);

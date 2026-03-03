const CLOUD_FN_BASE = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

/**
 * Call Tastytrade API through the Cloud Function proxy.
 * @param {object} user - Firebase auth user (for getIdToken)
 * @param {string} path - API path, e.g. '/market-metrics'
 * @param {object} query - Query params object
 * @returns {Promise<object>} parsed JSON response
 */
export async function callTastytradeApi(user, path, query = {}) {
  const idToken = await user.getIdToken();
  const response = await fetch(`${CLOUD_FN_BASE}/tastytradeApiProxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ path, query }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API error: HTTP ${response.status}`);
  }

  return response.json();
}

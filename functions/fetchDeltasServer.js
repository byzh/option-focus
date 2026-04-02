'use strict';

const WebSocket = require('ws');
const TASTYTRADE_API = 'https://api.tastytrade.com';

/**
 * Fetch dxFeed quote token for a given TastyTrade access token.
 * @returns {{ token: string, wsUrl: string }}
 */
async function getDxFeedToken(accessToken) {
  const res = await fetch(`${TASTYTRADE_API}/api-quote-tokens`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'OptionFocus/1.0' },
  });
  if (!res.ok) throw new Error(`dxFeed token fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  const payload = data.data ?? data;
  if (!payload.token) throw new Error('dxFeed token missing in response');
  return {
    token: payload.token,
    wsUrl: payload['dxlink-url'] ?? 'wss://tasty-openapi-ws.dxfeed.com/realtime',
  };
}

/**
 * Resolve dxFeed streamer symbol for a position from the option chain API.
 * @param {string} accessToken
 * @param {Array<{ id, ticker, expiration, strike, type }>} positions
 * @returns {Promise<Map<string, string>>} Map<positionId, streamerSymbol>
 */
async function resolveStreamerSymbols(accessToken, positions) {
  const symbolMap = new Map(); // positionId → streamerSymbol
  const byTicker = {};
  positions.forEach(p => {
    if (!byTicker[p.ticker]) byTicker[p.ticker] = [];
    byTicker[p.ticker].push(p);
  });

  await Promise.all(Object.entries(byTicker).map(async ([ticker, tickerPositions]) => {
    try {
      const res = await fetch(`${TASTYTRADE_API}/option-chains/${encodeURIComponent(ticker)}/nested`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'OptionFocus/1.0' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const expirations = data?.data?.items?.[0]?.expirations ?? [];

      tickerPositions.forEach(pos => {
        const expObj = expirations.find(e => e['expiration-date'] === pos.expiration);
        if (!expObj) return;
        const strikeNum = parseFloat(pos.strike);
        if (isNaN(strikeNum)) return;
        const strikeObj = expObj.strikes?.find(s => Math.abs(parseFloat(s['strike-price']) - strikeNum) < 0.001);
        if (!strikeObj) return;
        const sym = pos.type === 'PUT' ? strikeObj['put-streamer-symbol'] : strikeObj['call-streamer-symbol'];
        if (sym) symbolMap.set(pos.id, sym);
      });
    } catch {
      // Skip this ticker on error
    }
  }));

  return symbolMap;
}

/**
 * Connect to dxFeed WebSocket and fetch Greeks (delta) for given subscriptions.
 * @param {{ token: string, wsUrl: string }} dxFeedAuth
 * @param {Array<{ type: 'Greeks', symbol: string }>} subscriptions
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<Map<string, number>>} Map<streamerSymbol, delta>
 */
function fetchDeltasViaWebSocket(dxFeedAuth, subscriptions, timeoutMs = 15000) {
  const { token, wsUrl } = dxFeedAuth;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const collected = new Map(); // streamerSymbol → delta
    let collectTimer = null;
    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(hardTimer);
      clearTimeout(collectTimer);
      if (ws.readyState === WebSocket.OPEN) ws.close();
      resolve(collected);
    };

    const hardTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (ws.readyState === WebSocket.OPEN) ws.close();
        collected.size > 0 ? resolve(collected) : reject(new Error('dxFeed timeout: no data received'));
      }
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'SETUP', channel: 0, version: '0.1', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'SETUP':
          ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token }));
          break;
        case 'AUTH_STATE':
          if (msg.state === 'AUTHORIZED') {
            ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
          }
          break;
        case 'CHANNEL_OPENED':
          if (msg.channel === 1) {
            ws.send(JSON.stringify({
              type: 'FEED_SETUP', channel: 1,
              acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
              acceptEventFields: { Greeks: ['eventSymbol', 'delta'] },
            }));
            ws.send(JSON.stringify({ type: 'FEED_SUBSCRIPTION', channel: 1, reset: true, add: subscriptions }));
            collectTimer = setTimeout(done, 8000);
          }
          break;
        case 'FEED_DATA': {
          if (msg.channel !== 1) break;
          const data = msg.data;
          if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) break;
          const values = data[1];
          for (let i = 0; i + 1 < values.length; i += 2) {
            const sym = values[i];
            const delta = Number(values[i + 1]);
            if (sym && isFinite(delta)) collected.set(sym, delta);
          }
          if (collected.size >= subscriptions.length) done();
          break;
        }
        case 'KEEPALIVE':
          ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel }));
          break;
      }
    });

    ws.on('error', (err) => {
      clearTimeout(hardTimer);
      clearTimeout(collectTimer);
      if (!resolved) { resolved = true; reject(new Error(`dxFeed WebSocket error: ${err.message}`)); }
    });

    ws.on('close', () => {
      if (!resolved) done();
    });
  });
}

/**
 * Fetch delta values for a list of open PUT/LEAPS positions.
 * @param {string} accessToken - valid TastyTrade access token
 * @param {Array<{ id, ticker, expiration, strike, type }>} positions
 * @returns {Promise<Map<string, number>>} Map<positionId, delta>
 */
async function fetchDeltasForPositions(accessToken, positions) {
  if (!positions.length) return new Map();

  const [dxFeedAuth, symbolMap] = await Promise.all([
    getDxFeedToken(accessToken),
    resolveStreamerSymbols(accessToken, positions),
  ]);

  if (!symbolMap.size) return new Map();

  const subscriptions = [...symbolMap.values()].map(sym => ({ type: 'Greeks', symbol: sym }));
  const rawDeltas = await fetchDeltasViaWebSocket(dxFeedAuth, subscriptions);

  // Remap streamerSymbol → positionId
  const result = new Map();
  symbolMap.forEach((streamerSym, posId) => {
    if (rawDeltas.has(streamerSym)) result.set(posId, rawDeltas.get(streamerSym));
  });
  return result;
}

/**
 * Fetch VIX mid-price via dxFeed Quote event.
 * @param {string} accessToken - valid TastyTrade access token
 * @returns {Promise<number|null>} VIX value or null on failure
 */
async function fetchVixValue(accessToken) {
  try {
    const instRes = await fetch(`${TASTYTRADE_API}/instruments/equities/VIX`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'OptionFocus/1.0' },
    });
    const instData = await instRes.json();
    const streamerSymbol = instData?.data?.['streamer-symbol'] ?? '$VIX.X';

    const dxFeedAuth = await getDxFeedToken(accessToken);
    const subscriptions = [{ type: 'Quote', symbol: streamerSymbol }];

    return await new Promise((resolve) => {
      const ws = new WebSocket(dxFeedAuth.wsUrl);
      let resolved = false;

      const done = (value) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(hardTimer);
        if (ws.readyState === WebSocket.OPEN) ws.close();
        resolve(value);
      };

      const hardTimer = setTimeout(() => done(null), 10000);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'SETUP', channel: 0, version: '0.1', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }));
      });

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        switch (msg.type) {
          case 'SETUP':
            ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: dxFeedAuth.token }));
            break;
          case 'AUTH_STATE':
            if (msg.state === 'AUTHORIZED') {
              ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
            }
            break;
          case 'CHANNEL_OPENED':
            if (msg.channel === 1) {
              ws.send(JSON.stringify({
                type: 'FEED_SETUP', channel: 1,
                acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
                acceptEventFields: { Quote: ['eventSymbol', 'bidPrice', 'askPrice'] },
              }));
              ws.send(JSON.stringify({ type: 'FEED_SUBSCRIPTION', channel: 1, reset: true, add: subscriptions }));
            }
            break;
          case 'FEED_DATA': {
            if (msg.channel !== 1) break;
            const data = msg.data;
            if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) break;
            const values = data[1];
            for (let i = 0; i + 2 < values.length; i += 3) {
              const bid = Number(values[i + 1]);
              const ask = Number(values[i + 2]);
              const mid = (bid + ask) / 2;
              if (isFinite(mid) && mid > 0) { done(mid); return; }
            }
            break;
          }
          case 'KEEPALIVE':
            ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel }));
            break;
        }
      });

      ws.on('error', () => done(null));
      ws.on('close', () => done(null));
    });
  } catch {
    return null;
  }
}

module.exports = { fetchDeltasForPositions, fetchVixValue };

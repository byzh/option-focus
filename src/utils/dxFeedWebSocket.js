import { callTastytradeApi } from './apiClient';

// Module-level token cache — avoids a REST round-trip on every connectDxFeed call
let _tokenCache = null; // { uid, token, wsUrl, expiresAt }
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

async function getQuoteToken(user) {
  const now = Date.now();
  if (_tokenCache && _tokenCache.uid === user.uid && now < _tokenCache.expiresAt) return _tokenCache;
  const resp = await callTastytradeApi(user, '/api-quote-tokens');
  const data = resp.data || resp;
  _tokenCache = {
    uid: user.uid,
    token: data.token,
    wsUrl: data['dxlink-url'] || 'wss://tasty-openapi-ws.dxfeed.com/realtime',
    expiresAt: now + TOKEN_TTL_MS,
  };
  return _tokenCache;
}

// Module-level persistent connection — reused across connectDxFeed calls to avoid re-handshaking
let _conn = null; // { ws: WebSocket, uid, authorized: bool, channelOpen: bool }

const EVENT_CONFIGS = {
  Summary: {
    fields: ['eventSymbol', 'openInterest'],
    stride: 2,
    parseRow: (values, i) => ({ sym: values[i], data: Number(values[i + 1]) || 0 }),
  },
  Greeks: {
    fields: ['eventSymbol', 'delta', 'volatility'],
    stride: 3,
    parseRow: (values, i) => ({
      sym: values[i],
      data: { delta: Number(values[i + 1]), vol: Number(values[i + 2]) },
    }),
  },
  Quote: {
    fields: ['eventSymbol', 'bidPrice', 'askPrice'],
    stride: 3,
    parseRow: (values, i) => {
      const bid = Number(values[i + 1]);
      const ask = Number(values[i + 2]);
      const mid = (bid + ask) / 2;
      return { sym: values[i], data: isFinite(mid) && mid > 0 ? mid : null };
    },
  },
  Trade: {
    fields: ['eventSymbol', 'price'],
    stride: 2,
    parseRow: (values, i) => {
      const v = Number(values[i + 1]);
      return { sym: values[i], data: isFinite(v) && v > 0 ? v : null };
    },
  },
};

/**
 * Connect to dxFeed WebSocket, subscribe to events, and collect data.
 * Reuses a persistent module-level connection when available to skip TCP+auth handshake.
 *
 * @param {object} user - authenticated user (for token fetch)
 * @param {Array<{type: string, symbol: string}>} subscriptions
 * @param {'Summary'|'Greeks'|'Quote'|'Trade'} eventType
 * @param {object} [opts]
 * @param {React.MutableRefObject} [opts.wsRef]         - stores WS instance for external cancellation
 * @param {React.MutableRefObject} [opts.timeoutRef]    - stores collect timer for external cancellation
 * @param {number} [opts.hardTimeoutMs=20000]
 * @param {number} [opts.collectTimeoutMs=8000]
 * @param {number} [opts.expectedCount]           - resolve immediately once this many symbols are collected
 * @returns {Promise<Map<string, any>>}
 *   Summary: Map<streamerSym, openInterest: number>
 *   Greeks:  Map<streamerSym, { delta: number, vol: number }>
 *   Resolves with empty Map if WS closes before any data arrives.
 *   Rejects on onerror or hard-timeout with no data.
 */
export function connectDxFeed(user, subscriptions, eventType, opts = {}) {
  const { wsRef, timeoutRef, hardTimeoutMs = 20000, collectTimeoutMs = 8000, expectedCount } = opts;
  const config = EVENT_CONFIGS[eventType];
  if (!config) return Promise.reject(new Error(`Unknown eventType: ${eventType}`));

  return new Promise(async (resolve, reject) => {
    try {
      const { token, wsUrl } = await getQuoteToken(user);
      if (!token) throw new Error('未获取到 dxFeed token');

      const collected = new Map();
      let collectTimer = null;

      const hardTimeout = setTimeout(() => {
        if (_conn?.ws.readyState === WebSocket.OPEN) {
          _conn.ws.close();
          _conn = null;
        }
        if (collected.size > 0) resolve(collected);
        else reject(new Error('连接超时，未收到数据'));
      }, hardTimeoutMs);

      const finalize = () => {
        clearTimeout(hardTimeout);
        clearTimeout(collectTimer);
        if (timeoutRef?.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (wsRef) wsRef.current = null;
        // Keep WS alive — install a minimal idle handler (KEEPALIVE only)
        if (_conn?.ws.readyState === WebSocket.OPEN) {
          const ws = _conn.ws;
          ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg.type === 'KEEPALIVE') {
              ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel }));
            }
          };
        }
        resolve(collected);
      };

      const sendSubscription = (ws) => {
        ws.send(JSON.stringify({
          type: 'FEED_SETUP', channel: 1,
          acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
          acceptEventFields: { [eventType]: config.fields },
        }));
        ws.send(JSON.stringify({
          type: 'FEED_SUBSCRIPTION', channel: 1,
          reset: true, add: subscriptions,
        }));
        collectTimer = setTimeout(finalize, collectTimeoutMs);
        if (timeoutRef) timeoutRef.current = collectTimer;
      };

      // Shared message handler — covers both fresh and reused connection paths
      // isReuse=true skips AUTH_STATE handling (already authorized, unexpected state = ignore)
      const makeMessageHandler = (ws, isReuse = false) => (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        switch (msg.type) {
          case 'SETUP':
            ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token }));
            break;

          case 'AUTH_STATE':
            if (isReuse) break; // already authorized — ignore unexpected AUTH_STATE on reused conn
            if (msg.state === 'AUTHORIZED') {
              _conn.authorized = true;
              ws.send(JSON.stringify({
                type: 'CHANNEL_REQUEST', channel: 1,
                service: 'FEED', parameters: { contract: 'AUTO' },
              }));
            } else {
              // Auth failed — clear caches and reject so caller can retry with fresh token
              clearTimeout(hardTimeout);
              _tokenCache = null;
              _conn = null;
              reject(new Error('dxFeed 认证失败'));
            }
            break;

          case 'CHANNEL_OPENED':
            if (msg.channel === 1) {
              _conn.channelOpen = true;
              sendSubscription(ws);
            }
            break;

          case 'FEED_DATA': {
            if (msg.channel !== 1) break;
            const data = msg.data;
            if (!Array.isArray(data) || data.length < 2) break;
            const values = data[1];
            if (!Array.isArray(values)) break;
            for (let i = 0; i + config.stride - 1 < values.length; i += config.stride) {
              const { sym, data: rowData } = config.parseRow(values, i);
              if (sym) collected.set(sym, rowData);
            }
            if (expectedCount != null && collected.size >= expectedCount) finalize();
            break;
          }

          case 'KEEPALIVE':
            ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel }));
            break;

          default: break;
        }
      };

      const onError = () => {
        clearTimeout(hardTimeout);
        _conn = null;
        reject(new Error('dxFeed WebSocket 连接错误'));
      };

      const onClose = () => {
        clearTimeout(hardTimeout);
        if (timeoutRef?.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        _conn = null;
        resolve(collected);
      };

      // ── Reuse existing authorized connection ──────────────────────────────
      if (_conn?.ws.readyState === WebSocket.OPEN && _conn.authorized) {
        const ws = _conn.ws;
        if (wsRef) wsRef.current = ws;
        ws.onmessage = makeMessageHandler(ws, true); // isReuse=true
        ws.onerror = onError;
        ws.onclose = onClose;

        if (_conn.channelOpen) {
          // Best case: skip everything up to subscription (saves 4 RTTs on mobile)
          sendSubscription(ws);
        } else {
          ws.send(JSON.stringify({
            type: 'CHANNEL_REQUEST', channel: 1,
            service: 'FEED', parameters: { contract: 'AUTO' },
          }));
        }
        return;
      }

      // ── Fresh connection ──────────────────────────────────────────────────
      _conn = { ws: null, uid: user.uid, authorized: false, channelOpen: false };
      const ws = new WebSocket(wsUrl);
      _conn.ws = ws;
      if (wsRef) wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'SETUP', channel: 0, version: '0.1',
          keepaliveTimeout: 60, acceptKeepaliveTimeout: 60,
        }));
      };

      ws.onmessage = makeMessageHandler(ws);
      ws.onerror = onError;
      ws.onclose = onClose;

    } catch (e) {
      reject(e);
    }
  });
}

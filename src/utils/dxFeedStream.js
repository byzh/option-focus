import { getQuoteToken } from './dxFeedWebSocket';

/**
 * Event field layout requested from DXLink (COMPACT format).
 * parseRow returns a sanitized partial update, or null to drop the row.
 */
export const STREAM_EVENTS = {
  Quote: {
    fields: ['eventSymbol', 'bidPrice', 'askPrice'],
    parseRow: (values, i) => ({
      sym: values[i],
      update: { bid: toPrice(values[i + 1]), ask: toPrice(values[i + 2]) },
    }),
  },
  Greeks: {
    fields: ['eventSymbol', 'delta', 'volatility'],
    parseRow: (values, i) => ({
      sym: values[i],
      update: { delta: toFinite(values[i + 1]), iv: toFinite(values[i + 2]) },
    }),
  },
};

function toFinite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPrice(v) {
  const n = toFinite(v);
  return n != null && n >= 0 ? n : null;
}

/**
 * Parse a COMPACT FEED_DATA payload: [eventType, values, eventType, values, ...].
 * Unknown event types and malformed rows are skipped.
 * @returns {Array<{ sym: string, update: object }>}
 */
export function parseFeedData(data) {
  const rows = [];
  if (!Array.isArray(data)) return rows;
  for (let p = 0; p + 1 < data.length; p += 2) {
    const config = STREAM_EVENTS[data[p]];
    const values = data[p + 1];
    if (!config || !Array.isArray(values)) continue;
    const stride = config.fields.length;
    for (let i = 0; i + stride - 1 < values.length; i += stride) {
      const row = config.parseRow(values, i);
      if (typeof row.sym === 'string' && row.sym) rows.push(row);
    }
  }
  return rows;
}

/**
 * Long-lived DXLink session with dynamic subscribe/unsubscribe.
 * Updates are merged per symbol and delivered in batches every `flushMs`
 * so callers can update React state at a bounded rate.
 *
 * @param {object} user - Firebase user (for quote token)
 * @param {object} handlers
 * @param {(batch: Map<string, object>) => void} handlers.onData
 * @param {(status: 'connecting'|'live'|'closed'|'error', message?: string) => void} [handlers.onStatus]
 * @param {number} [flushMs=500]
 * @returns {{ setSymbols: (symbols: string[]) => void, close: () => void }}
 */
export function createDxFeedStream(user, { onData, onStatus = () => {} }, flushMs = 500) {
  const eventTypes = Object.keys(STREAM_EVENTS);
  let ws = null;
  let channelOpen = false;
  let closedByCaller = false;
  let current = new Set(); // symbols currently wanted
  let pending = new Map(); // sym → merged update awaiting flush

  const toSubs = (symbols) => symbols.flatMap(symbol => eventTypes.map(type => ({ type, symbol })));
  const send = (msg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

  const flushTimer = setInterval(() => {
    if (pending.size === 0) return;
    const batch = pending;
    pending = new Map();
    onData(batch);
  }, flushMs);

  const shutdown = () => {
    clearInterval(flushTimer);
    channelOpen = false;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    ws = null;
  };

  (async () => {
    try {
      onStatus('connecting');
      const { token, wsUrl } = await getQuoteToken(user);
      if (!token) throw new Error('未获取到 dxFeed token');
      if (closedByCaller) return;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => send({
        type: 'SETUP', channel: 0, version: '0.1',
        keepaliveTimeout: 60, acceptKeepaliveTimeout: 60,
      });

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
          case 'SETUP':
            send({ type: 'AUTH', channel: 0, token });
            break;
          case 'AUTH_STATE':
            if (msg.state === 'AUTHORIZED') {
              send({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } });
            }
            break;
          case 'CHANNEL_OPENED':
            if (msg.channel !== 1) break;
            send({
              type: 'FEED_SETUP', channel: 1,
              acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
              acceptEventFields: Object.fromEntries(eventTypes.map(t => [t, STREAM_EVENTS[t].fields])),
            });
            channelOpen = true;
            if (current.size > 0) {
              send({ type: 'FEED_SUBSCRIPTION', channel: 1, reset: true, add: toSubs([...current]) });
            }
            onStatus('live');
            break;
          case 'FEED_DATA':
            if (msg.channel !== 1) break;
            for (const { sym, update } of parseFeedData(msg.data)) {
              if (!current.has(sym)) continue;
              pending.set(sym, { ...pending.get(sym), ...update });
            }
            break;
          case 'KEEPALIVE':
            send({ type: 'KEEPALIVE', channel: msg.channel });
            break;
          case 'ERROR':
            onStatus('error', typeof msg.message === 'string' ? msg.message : 'dxFeed 错误');
            break;
          default:
            break;
        }
      };

      ws.onerror = () => { if (!closedByCaller) onStatus('error', 'dxFeed WebSocket 连接错误'); };
      ws.onclose = () => {
        channelOpen = false;
        if (!closedByCaller) onStatus('closed');
      };
    } catch (e) {
      if (!closedByCaller) onStatus('error', e.message);
    }
  })();

  return {
    /** Replace the subscribed symbol set; only the diff is sent. */
    setSymbols(symbols) {
      const next = new Set(symbols.filter(s => typeof s === 'string' && s));
      const added = [...next].filter(s => !current.has(s));
      const removed = [...current].filter(s => !next.has(s));
      current = next;
      for (const s of removed) pending.delete(s);
      if (!channelOpen) return; // sent on CHANNEL_OPENED
      if (removed.length) send({ type: 'FEED_SUBSCRIPTION', channel: 1, remove: toSubs(removed) });
      if (added.length) send({ type: 'FEED_SUBSCRIPTION', channel: 1, add: toSubs(added) });
    },
    close() {
      closedByCaller = true;
      shutdown();
    },
  };
}

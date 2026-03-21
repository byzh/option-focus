import { callTastytradeApi } from './apiClient';

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
};

/**
 * Connect to dxFeed WebSocket, subscribe to events, and collect data.
 *
 * @param {object} user - authenticated user (for token fetch)
 * @param {Array<{type: string, symbol: string}>} subscriptions
 * @param {'Summary'|'Greeks'} eventType
 * @param {object} [opts]
 * @param {React.MutableRefObject} [opts.wsRef]         - stores WS instance for external cancellation
 * @param {React.MutableRefObject} [opts.timeoutRef]    - stores collect timer for external cancellation
 * @param {number} [opts.hardTimeoutMs=20000]
 * @param {number} [opts.collectTimeoutMs=8000]
 * @returns {Promise<Map<string, any>>}
 *   Summary: Map<streamerSym, openInterest: number>
 *   Greeks:  Map<streamerSym, { delta: number, vol: number }>
 *   Resolves with empty Map if WS closes before any data arrives.
 *   Rejects on onerror or hard-timeout with no data.
 */
export function connectDxFeed(user, subscriptions, eventType, opts = {}) {
  const { wsRef, timeoutRef, hardTimeoutMs = 20000, collectTimeoutMs = 8000 } = opts;
  const config = EVENT_CONFIGS[eventType];
  if (!config) return Promise.reject(new Error(`Unknown eventType: ${eventType}`));

  return new Promise(async (resolve, reject) => {
    try {
      const tokenResponse = await callTastytradeApi(user, '/api-quote-tokens');
      const tokenData = tokenResponse.data || tokenResponse;
      const token = tokenData.token;
      const wsUrl = tokenData['dxlink-url'] || 'wss://tasty-openapi-ws.dxfeed.com/realtime';
      if (!token) throw new Error('未获取到 dxFeed token');

      const ws = new WebSocket(wsUrl);
      if (wsRef) wsRef.current = ws;
      const collected = new Map();

      const hardTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
        if (collected.size > 0) resolve(collected);
        else reject(new Error('连接超时，未收到数据'));
      }, hardTimeoutMs);

      const finalize = () => {
        clearTimeout(hardTimeout);
        if (timeoutRef?.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (ws.readyState === WebSocket.OPEN) ws.close();
        if (wsRef) wsRef.current = null;
        resolve(collected);
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'SETUP', channel: 0, version: '0.1',
          keepaliveTimeout: 60, acceptKeepaliveTimeout: 60,
        }));
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        switch (msg.type) {
          case 'SETUP':
            ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token }));
            break;

          case 'AUTH_STATE':
            if (msg.state === 'AUTHORIZED') {
              ws.send(JSON.stringify({
                type: 'CHANNEL_REQUEST', channel: 1,
                service: 'FEED', parameters: { contract: 'AUTO' },
              }));
            }
            break;

          case 'CHANNEL_OPENED':
            if (msg.channel === 1) {
              ws.send(JSON.stringify({
                type: 'FEED_SETUP', channel: 1,
                acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
                acceptEventFields: { [eventType]: config.fields },
              }));
              ws.send(JSON.stringify({
                type: 'FEED_SUBSCRIPTION', channel: 1,
                reset: true, add: subscriptions,
              }));
              const collectTimer = setTimeout(finalize, collectTimeoutMs);
              if (timeoutRef) timeoutRef.current = collectTimer;
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
            break;
          }

          case 'KEEPALIVE':
            ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel }));
            break;

          default: break;
        }
      };

      ws.onerror = () => {
        clearTimeout(hardTimeout);
        if (wsRef) wsRef.current = null;
        reject(new Error('dxFeed WebSocket 连接错误'));
      };

      ws.onclose = () => {
        clearTimeout(hardTimeout);
        if (timeoutRef?.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (wsRef) wsRef.current = null;
        resolve(collected);
      };

    } catch (e) {
      reject(e);
    }
  });
}

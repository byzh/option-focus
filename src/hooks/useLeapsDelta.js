import { useState, useCallback, useRef } from 'react';
import { callTastytradeApi } from '../utils/apiClient';

/**
 * Fetches current delta for a list of open LEAPS (BUY CALL, DTE > 90).
 * Returns a map: { positionId: delta }
 *
 * Delta is fetched once per call via dxFeed WebSocket; results are cached
 * in component state and can be refreshed manually.
 */
export function useLeapsDelta({ user }) {
  const [deltaMap, setDeltaMap] = useState({}); // { positionId: delta }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  const fetchDeltas = useCallback(async (leapsPositions) => {
    if (!user || !leapsPositions || leapsPositions.length === 0) return;

    // Close any previous WS
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    setLoading(true);
    setError(null);

    try {
      const tokenResponse = await callTastytradeApi(user, '/api-quote-tokens');
      const tokenData = tokenResponse.data || tokenResponse;
      const token = tokenData.token;
      const wsUrl = tokenData['dxlink-url'] || 'wss://tasty-openapi-ws.dxfeed.com/realtime';
      if (!token) throw new Error('未获取到 dxFeed token');

      // Fetch actual call-streamer-symbol from option chain API for each position.
      // buildOCCSymbol locally was unreliable — dxFeed may not recognize the format.
      const symbolMap = {}; // streamerSym → positionId
      const subscriptions = [];

      // Group positions by ticker to minimize API calls
      const byTicker = {};
      leapsPositions.forEach(pos => {
        if (!byTicker[pos.ticker]) byTicker[pos.ticker] = [];
        byTicker[pos.ticker].push(pos);
      });

      await Promise.all(Object.entries(byTicker).map(async ([ticker, positions]) => {
        try {
          const chainResp = await callTastytradeApi(user, `/option-chains/${ticker}/nested`);
          const expirations = chainResp?.data?.items?.[0]?.expirations ?? [];

          positions.forEach(pos => {
            const streamerSym = resolveStreamerSymbol(expirations, pos);
            if (!streamerSym) return;
            symbolMap[streamerSym] = pos.id;
            subscriptions.push({ type: 'Greeks', symbol: streamerSym });
          });
        } catch {
          // If option chain fetch fails for this ticker, skip those positions
        }
      }));

      if (subscriptions.length === 0) {
        setLoading(false);
        return;
      }

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        const collected = {}; // positionId → delta

        const hardTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.close();
          setDeltaMap(prev => ({ ...prev, ...collected }));
          resolve();
        }, 15000);

        const finalize = () => {
          clearTimeout(hardTimeout);
          if (ws.readyState === WebSocket.OPEN) ws.close();
          wsRef.current = null;
          setDeltaMap(prev => ({ ...prev, ...collected }));
          resolve();
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
                  acceptEventFields: { Greeks: ['eventSymbol', 'delta', 'volatility'] },
                }));
                ws.send(JSON.stringify({
                  type: 'FEED_SUBSCRIPTION', channel: 1,
                  reset: true, add: subscriptions,
                }));
                // Collect for 8 seconds then finalize
                setTimeout(finalize, 8000);
              }
              break;

            case 'FEED_DATA': {
              if (msg.channel !== 1) break;
              const data = msg.data;
              if (!Array.isArray(data) || data.length < 2) break;
              const values = data[1];
              if (!Array.isArray(values)) break;
              for (let i = 0; i + 2 < values.length; i += 3) {
                const sym = values[i];
                const delta = Number(values[i + 1]);
                const posId = symbolMap[sym];
                if (posId != null && !isNaN(delta)) {
                  collected[posId] = delta;
                }
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
          wsRef.current = null;
          reject(new Error('Delta WebSocket 连接错误'));
        };

        ws.onclose = () => {
          clearTimeout(hardTimeout);
          wsRef.current = null;
          setDeltaMap(prev => ({ ...prev, ...collected }));
          resolve();
        };
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  return { deltaMap, loading, error, fetchDeltas };
}

/**
 * Find the dxFeed streamer symbol for a position from an option chain expirations array.
 * @param {Array} expirations - items[0].expirations from /option-chains/{ticker}/nested
 * @param {object} pos - position with { expiration, strike, type }
 * @returns {string|null}
 */
export function resolveStreamerSymbol(expirations, pos) {
  if (!Array.isArray(expirations) || !pos) return null;
  const expObj = expirations.find(e => e['expiration-date'] === pos.expiration);
  if (!expObj) return null;
  const strikeNum = parseFloat(pos.strike);
  if (isNaN(strikeNum)) return null;
  const strikeObj = expObj.strikes?.find(
    s => Math.abs(parseFloat(s['strike-price']) - strikeNum) < 0.001
  );
  if (!strikeObj) return null;
  return pos.type === 'PUT'
    ? (strikeObj['put-streamer-symbol'] ?? null)
    : (strikeObj['call-streamer-symbol'] ?? null);
}


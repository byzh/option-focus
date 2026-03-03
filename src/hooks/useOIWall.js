import { useState, useCallback, useRef } from 'react';
import { callTastytradeApi } from '../utils/apiClient';
import { getCachedOrFetch, recordCacheDate } from '../utils/cacheUtils';
import { getLocalTodayString } from '../utils/dateUtils';

/**
 * useOIWall
 * Fetches OI data for all strikes in a given expiration via dxFeed WebSocket.
 * Caches results in Firestore (keyed by symbol + expiration date + today).
 * OI is an EOD metric — same-day cache hit avoids repeated WebSocket connections.
 *
 * Usage: fetchOI(symbol, expiration)
 */
export function useOIWall({ user, db }) {
  const [oiData, setOiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const timeoutRef = useRef(null);
  // Incremented on every fetchOI call; stale calls bail out before touching state
  const fetchIdRef = useRef(0);

  const clearOI = useCallback(() => {
    fetchIdRef.current += 1; // invalidate any in-flight fetchOI
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOiData(null);
    setError(null);
    setLoading(false);
  }, []);

  const fetchOI = useCallback(async (symbol, expiration) => {
    if (!user || !expiration) return;

    // Claim a unique ID for this invocation
    const myId = ++fetchIdRef.current;

    // Close any previous WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setLoading(true);
    setError(null);
    setOiData(null);

    const expirationDate = expiration['expiration-date'] || expiration.expirationDate || 'unknown';
    const today = getLocalTodayString();
    const cacheKey = `${symbol}-${expirationDate}`;

    // Helper: only settle state if this call is still the latest
    const isStale = () => fetchIdRef.current !== myId;

    try {
      const strikeList = Array.isArray(expiration.strikes) ? expiration.strikes : [];
      if (strikeList.length === 0) {
        if (isStale()) return;
        setError('该到期日无行权价数据');
        setLoading(false);
        return;
      }

      // Only cache when at least one strike has non-zero OI
      const hasOIData = (data) => {
        const { fetchedAt: _, ...strikes } = data;
        return Object.values(strikes).some(s => (s.callOI || 0) + (s.putOI || 0) > 0);
      };

      if (db) {
        const cached = await getCachedOrFetch(
          db, 'oi-cache', today, cacheKey,
          () => fetchOIFromWebSocket(user, expiration, wsRef, timeoutRef),
          false,
          hasOIData,
        );

        if (isStale()) return; // a newer fetchOI was called while we were awaiting

        const { fetchedAt: _, ...oiResult } = cached;
        if (!hasOIData(cached)) {
          setError('未收到有效 OI 数据，请重试');
          setLoading(false);
          return;
        }
        await recordCacheDate(db, 'oi-cache', today);
        if (isStale()) return;
        setOiData(oiResult);
        setLoading(false);
      } else {
        const result = await fetchOIFromWebSocket(user, expiration, wsRef, timeoutRef);
        if (isStale()) return;
        setOiData(result);
        setLoading(false);
      }
    } catch (e) {
      if (isStale()) return;
      setError(e.message);
      setLoading(false);
    }
  }, [user, db]);

  return { oiData, loading, error, fetchOI, clearOI };
}

/**
 * Connects to dxFeed WebSocket and collects OI data for all strikes.
 * Returns a Promise that resolves with { [strikePrice]: { callOI, putOI } }
 */
function fetchOIFromWebSocket(user, expiration, wsRef, timeoutRef) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Get dxFeed quote token
      const tokenResponse = await callTastytradeApi(user, '/api-quote-tokens');
      const tokenData = tokenResponse.data || tokenResponse;
      const token = tokenData.token;
      const wsUrl = tokenData['dxlink-url'] || 'wss://tasty-openapi-ws.dxfeed.com/realtime';

      if (!token) throw new Error('未获取到 dxFeed token');

      // 2. Build symbol map: streamerSymbol → { price, side }
      const strikeList = Array.isArray(expiration.strikes) ? expiration.strikes : [];
      const subscriptions = [];
      const symbolMap = {};

      strikeList.forEach(strike => {
        const price = String(strike['strike-price']);
        if (strike['call-streamer-symbol']) {
          subscriptions.push({ type: 'Summary', symbol: strike['call-streamer-symbol'] });
          symbolMap[strike['call-streamer-symbol']] = { price, side: 'call' };
        }
        if (strike['put-streamer-symbol']) {
          subscriptions.push({ type: 'Summary', symbol: strike['put-streamer-symbol'] });
          symbolMap[strike['put-streamer-symbol']] = { price, side: 'put' };
        }
      });

      if (subscriptions.length === 0) {
        return reject(new Error('该到期日无可用期权合约符号'));
      }

      // 3. Connect
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      const collected = {};

      const hardTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
        if (Object.keys(collected).length > 0) resolve({ ...collected });
        else reject(new Error('连接超时，未收到数据'));
      }, 20000);

      const finalize = () => {
        clearTimeout(hardTimeout);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (ws.readyState === WebSocket.OPEN) ws.close();
        wsRef.current = null;
        if (Object.keys(collected).length > 0) resolve({ ...collected });
        else reject(new Error('未收到 OI 数据'));
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
                acceptEventFields: { Summary: ['eventSymbol', 'openInterest'] },
              }));
              ws.send(JSON.stringify({
                type: 'FEED_SUBSCRIPTION', channel: 1,
                reset: true, add: subscriptions,
              }));
              timeoutRef.current = setTimeout(finalize, 6000);
            }
            break;

          case 'FEED_DATA': {
            if (msg.channel !== 1) break;
            // Format: ["Summary", [sym1, oi1, sym2, oi2, ...]]
            const data = msg.data;
            if (!Array.isArray(data) || data.length < 2) break;
            const values = data[1];
            if (!Array.isArray(values)) break;
            for (let i = 0; i + 1 < values.length; i += 2) {
              const sym = values[i];
              const oi = Number(values[i + 1]) || 0;
              const info = symbolMap[sym];
              if (!info) continue;
              if (!collected[info.price]) collected[info.price] = { callOI: 0, putOI: 0 };
              if (info.side === 'call') collected[info.price].callOI = oi;
              else collected[info.price].putOI = oi;
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
        reject(new Error('dxFeed WebSocket 连接错误'));
      };

      ws.onclose = () => {
        clearTimeout(hardTimeout);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        wsRef.current = null;
        if (Object.keys(collected).length > 0) {
          resolve({ ...collected });
        } else {
          // Always reject so the awaiting fetchOI call fails fast (no hung Promise)
          reject(new Error('连接已中断'));
        }
      };

    } catch (e) {
      reject(e);
    }
  });
}

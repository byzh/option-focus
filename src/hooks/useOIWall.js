import { useState, useCallback, useRef } from 'react';
import { getCachedOrFetch } from '../utils/cacheUtils';
import { getLocalTodayString } from '../utils/dateUtils';
import { connectDxFeed } from '../utils/dxFeedWebSocket';

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

  const fetchOI = useCallback(async (symbol, expiration, forceRefresh = false) => {
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
          forceRefresh,
          hasOIData,
        );

        if (isStale()) return; // a newer fetchOI was called while we were awaiting

        const { fetchedAt: _, ...oiResult } = cached;
        if (!hasOIData(cached)) {
          setError('未收到有效 OI 数据，请重试');
          setLoading(false);
          return;
        }
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
async function fetchOIFromWebSocket(user, expiration, wsRef, timeoutRef) {
  const strikeList = Array.isArray(expiration.strikes) ? expiration.strikes : [];
  const subscriptions = [];
  const symbolMap = {};

  strikeList.forEach(strike => {
    const price = String(parseFloat(strike['strike-price']));
    if (strike['call-streamer-symbol']) {
      subscriptions.push({ type: 'Summary', symbol: strike['call-streamer-symbol'] });
      symbolMap[strike['call-streamer-symbol']] = { price, side: 'call' };
    }
    if (strike['put-streamer-symbol']) {
      subscriptions.push({ type: 'Summary', symbol: strike['put-streamer-symbol'] });
      symbolMap[strike['put-streamer-symbol']] = { price, side: 'put' };
    }
  });

  if (subscriptions.length === 0) throw new Error('该到期日无可用期权合约符号');

  const rawMap = await connectDxFeed(user, subscriptions, 'Summary', {
    wsRef, timeoutRef, hardTimeoutMs: 20000, collectTimeoutMs: 6000,
  });

  const result = {};
  for (const [sym, oi] of rawMap) {
    const info = symbolMap[sym];
    if (!info) continue;
    if (!result[info.price]) result[info.price] = { callOI: 0, putOI: 0 };
    if (info.side === 'call') result[info.price].callOI = oi;
    else result[info.price].putOI = oi;
  }
  return result;
}

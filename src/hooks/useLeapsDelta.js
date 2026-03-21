import { useState, useCallback, useRef } from 'react';
import { callTastytradeApi } from '../utils/apiClient';
import { connectDxFeed } from '../utils/dxFeedWebSocket';

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

      const rawMap = await connectDxFeed(user, subscriptions, 'Greeks', {
        wsRef, hardTimeoutMs: 15000, collectTimeoutMs: 8000,
      });

      const newDeltas = {};
      for (const [sym, { delta }] of rawMap) {
        const posId = symbolMap[sym];
        if (posId != null && !isNaN(delta)) newDeltas[posId] = delta;
      }
      setDeltaMap(prev => ({ ...prev, ...newDeltas }));
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


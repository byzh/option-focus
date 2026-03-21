import { useState, useCallback, useRef } from 'react';
import { doc, setDoc, deleteDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { getETDateString } from '../utils/dateUtils';
import { connectDxFeed } from '../utils/dxFeedWebSocket';

const APP_ID = 'option-focus-v2';

export function useSkewHistory({ user, db }) {
  const [skewHistory, setSkewHistory] = useState(null); // [{ date, fetchedAt, exps: { expDate: rr } }]
  const [skewLoading, setSkewLoading] = useState(false);
  const [skewError, setSkewError] = useState(null);
  const wsRef = useRef(null);
  const timeoutRef = useRef(null);

  const clearSkew = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setSkewHistory(null);
    setSkewError(null);
    setSkewLoading(false);
  }, []);

  const loadSkewHistory = useCallback(async (symbol) => {
    if (!db || !symbol) return;
    try {
      const histRef = collection(db, 'artifacts', APP_ID, 'skew', symbol, 'history');
      const snap = await getDocs(histRef);
      const entries = [];
      snap.forEach(d => entries.push({ date: d.id, ...d.data() }));
      entries.sort((a, b) => a.date.localeCompare(b.date));
      setSkewHistory(entries);
    } catch (e) {
      // Non-fatal: silently ignore
    }
  }, [db]);

  const fetchAndStoreSkew = useCallback(async (symbol, expiration) => {
    if (!user || !db || !expiration) return;

    // Close previous WebSocket
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

    setSkewLoading(true);
    setSkewError(null);

    try {
      const strikeList = Array.isArray(expiration.strikes) ? expiration.strikes : [];
      if (strikeList.length === 0) {
        setSkewError('无行权价数据');
        setSkewLoading(false);
        return;
      }

      const rr = await fetchGreeksFromWebSocket(user, expiration, wsRef, timeoutRef);

      const expDate = expiration['expiration-date'];
      const today = getETDateString();
      const fetchedAt = new Date().toISOString();

      // Merge this expiration's RR into today's doc (preserves other expirations)
      const histRef = doc(db, 'artifacts', APP_ID, 'skew', symbol, 'history', today);
      try {
        await updateDoc(histRef, { [`exps.${expDate}`]: rr, fetchedAt });
      } catch {
        // Document doesn't exist yet — create it
        await setDoc(histRef, { exps: { [expDate]: rr }, fetchedAt });
      }

      // Cleanup day-10 (fire-and-forget)
      const d10 = new Date();
      d10.setDate(d10.getDate() - 10);
      const d10str = `${d10.getFullYear()}-${String(d10.getMonth() + 1).padStart(2, '0')}-${String(d10.getDate()).padStart(2, '0')}`;
      deleteDoc(doc(db, 'artifacts', APP_ID, 'skew', symbol, 'history', d10str)).catch(() => {});

      // Update local state — merge into today's entry
      setSkewHistory(prev => {
        const list = prev || [];
        const todayEntry = list.find(e => e.date === today) || { date: today, exps: {} };
        const updated = { ...todayEntry, fetchedAt, exps: { ...(todayEntry.exps || {}), [expDate]: rr } };
        const filtered = list.filter(e => e.date !== today && e.date !== d10str);
        return [...filtered, updated].sort((a, b) => a.date.localeCompare(b.date));
      });
    } catch (e) {
      setSkewError(e.message);
    } finally {
      setSkewLoading(false);
    }
  }, [user, db]);

  return { skewHistory, skewLoading, skewError, fetchAndStoreSkew, loadSkewHistory, clearSkew };
}

/**
 * Connects to dxFeed WebSocket and collects Greeks (delta, volatility) for all strikes.
 * Returns a Promise that resolves with the 25-delta risk reversal value (put25dIV - call25dIV).
 */
async function fetchGreeksFromWebSocket(user, expiration, wsRef, timeoutRef) {
  const strikeList = Array.isArray(expiration.strikes) ? expiration.strikes : [];
  const subscriptions = [];
  const symbolMap = {};

  strikeList.forEach(strike => {
    const price = String(parseFloat(strike['strike-price']));
    if (strike['call-streamer-symbol']) {
      subscriptions.push({ type: 'Greeks', symbol: strike['call-streamer-symbol'] });
      symbolMap[strike['call-streamer-symbol']] = { price, side: 'call' };
    }
    if (strike['put-streamer-symbol']) {
      subscriptions.push({ type: 'Greeks', symbol: strike['put-streamer-symbol'] });
      symbolMap[strike['put-streamer-symbol']] = { price, side: 'put' };
    }
  });

  if (subscriptions.length === 0) throw new Error('无可用期权合约符号');

  const rawMap = await connectDxFeed(user, subscriptions, 'Greeks', {
    wsRef, timeoutRef, hardTimeoutMs: 20000, collectTimeoutMs: 8000,
  });

  const collected = {};
  for (const [sym, { delta, vol }] of rawMap) {
    const info = symbolMap[sym];
    if (!info) continue;
    if (!collected[info.price]) collected[info.price] = {};
    if (info.side === 'call') { collected[info.price].callDelta = delta; collected[info.price].callIV = vol; }
    else { collected[info.price].putDelta = delta; collected[info.price].putIV = vol; }
  }

  const rr = computeRR(collected);
  if (rr === null) throw new Error('未收到有效 Greeks 数据');
  return rr;
}

/**
 * Find 25-delta call (delta ≈ +0.25) and 25-delta put (delta ≈ -0.25),
 * return put25dIV - call25dIV (risk reversal).
 */
function computeRR(collected) {
  const prices = Object.keys(collected);
  if (prices.length === 0) return null;

  let bestCallIV = null, bestCallDist = Infinity;
  let bestPutIV = null, bestPutDist = Infinity;

  prices.forEach(p => {
    const { callDelta, callIV, putDelta, putIV } = collected[p];
    if (callDelta != null && callIV != null && callIV > 0) {
      const d = Math.abs(callDelta - 0.25);
      if (d < bestCallDist) { bestCallDist = d; bestCallIV = callIV; }
    }
    if (putDelta != null && putIV != null && putIV > 0) {
      const d = Math.abs(putDelta - (-0.25));
      if (d < bestPutDist) { bestPutDist = d; bestPutIV = putIV; }
    }
  });

  if (bestCallIV == null || bestPutIV == null) return null;
  return parseFloat((bestPutIV - bestCallIV).toFixed(4));
}

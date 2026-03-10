import { useState, useCallback, useRef } from 'react';
import { doc, setDoc, deleteDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { callTastytradeApi } from '../utils/apiClient';
import { getLocalTodayString } from '../utils/dateUtils';

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
      const today = getLocalTodayString();
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
function fetchGreeksFromWebSocket(user, expiration, wsRef, timeoutRef) {
  return new Promise(async (resolve, reject) => {
    try {
      const tokenResponse = await callTastytradeApi(user, '/api-quote-tokens');
      const tokenData = tokenResponse.data || tokenResponse;
      const token = tokenData.token;
      const wsUrl = tokenData['dxlink-url'] || 'wss://tasty-openapi-ws.dxfeed.com/realtime';
      if (!token) throw new Error('未获取到 dxFeed token');

      const strikeList = Array.isArray(expiration.strikes) ? expiration.strikes : [];
      const subscriptions = [];
      const symbolMap = {}; // streamerSymbol → { price, side }

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

      if (subscriptions.length === 0) return reject(new Error('无可用期权合约符号'));

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      const collected = {}; // price → { callDelta, callIV, putDelta, putIV }

      const hardTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
        const rr = computeRR(collected);
        if (rr !== null) resolve(rr);
        else reject(new Error('连接超时，未收到 Greeks 数据'));
      }, 20000);

      const finalize = () => {
        clearTimeout(hardTimeout);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (ws.readyState === WebSocket.OPEN) ws.close();
        wsRef.current = null;
        const rr = computeRR(collected);
        if (rr !== null) resolve(rr);
        else reject(new Error('未收到有效 Greeks 数据'));
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
              timeoutRef.current = setTimeout(finalize, 8000);
            }
            break;

          case 'FEED_DATA': {
            if (msg.channel !== 1) break;
            // COMPACT format: ["Greeks", [sym1, delta1, vol1, sym2, delta2, vol2, ...]]
            const data = msg.data;
            if (!Array.isArray(data) || data.length < 2) break;
            const values = data[1];
            if (!Array.isArray(values)) break;
            for (let i = 0; i + 2 < values.length; i += 3) {
              const sym = values[i];
              const delta = Number(values[i + 1]);
              const vol = Number(values[i + 2]);
              const info = symbolMap[sym];
              if (!info) continue;
              if (!collected[info.price]) collected[info.price] = {};
              if (info.side === 'call') {
                collected[info.price].callDelta = delta;
                collected[info.price].callIV = vol;
              } else {
                collected[info.price].putDelta = delta;
                collected[info.price].putIV = vol;
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
        reject(new Error('Greeks WebSocket 连接错误'));
      };

      ws.onclose = () => {
        clearTimeout(hardTimeout);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        wsRef.current = null;
        const rr = computeRR(collected);
        if (rr !== null) resolve(rr);
        else reject(new Error('连接已中断，未收到 Greeks 数据'));
      };

    } catch (e) {
      reject(e);
    }
  });
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

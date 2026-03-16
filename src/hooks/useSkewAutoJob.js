import { useState, useCallback, useEffect, useRef } from 'react';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { callTastytradeApi } from '../utils/apiClient';
import { getETDateString } from '../utils/dateUtils';

const APP_ID = 'option-focus-v2';
const CHAIN_DELAY_MS = 350; // ~2.8 req/s, well within TastyTrade rate limits

/** Check if it's after 9:45 AM ET on a weekday */
function isAfterMarketOpen() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false; // weekend
  const h = et.getHours(), m = et.getMinutes();
  return h > 9 || (h === 9 && m >= 45);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function useSkewAutoJob({ user, db, symbols }) {
  const [jobStatus, setJobStatus] = useState('idle'); // idle | running | done | error
  const [jobProgress, setJobProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef(false);
  const runningRef = useRef(false);

  const runJob = useCallback(async () => {
    if (!user || !db || !symbols?.length) return;
    if (runningRef.current) return;

    runningRef.current = true;
    abortRef.current = false;
    setJobStatus('running');
    setJobProgress({ done: 0, total: symbols.length });

    try {
      const today = getETDateString();

      // Step 1: Fetch option chains, collect all strike subscriptions
      const allSubs = []; // { streamerSymbol, ticker, expDate, price, side }
      const now = new Date();

      for (let i = 0; i < symbols.length; i++) {
        if (abortRef.current) break;
        const symbol = symbols[i];

        try {
          const resp = await callTastytradeApi(user, `/option-chains/${symbol}/nested`);
          const expirations = resp?.data?.items?.[0]?.expirations ?? [];

          expirations.forEach(exp => {
            const expDate = exp['expiration-date'];
            if (!expDate) return;
            const dte = Math.ceil((new Date(expDate) - now) / 86400000);
            if (dte < 0 || dte > 45) return;

            (exp.strikes || []).forEach(strike => {
              const price = String(parseFloat(strike['strike-price']));
              if (strike['call-streamer-symbol']) {
                allSubs.push({ streamerSymbol: strike['call-streamer-symbol'], ticker: symbol, expDate, price, side: 'call' });
              }
              if (strike['put-streamer-symbol']) {
                allSubs.push({ streamerSymbol: strike['put-streamer-symbol'], ticker: symbol, expDate, price, side: 'put' });
              }
            });
          });
        } catch (e) {
          console.warn(`[SkewJob] chain failed for ${symbol}:`, e.message);
        }

        setJobProgress({ done: i + 1, total: symbols.length });
        if (i < symbols.length - 1) await sleep(CHAIN_DELAY_MS);
      }

      if (abortRef.current || allSubs.length === 0) {
        setJobStatus('done');
        return;
      }

      // Step 2: Single WebSocket — subscribe all strikes, collect Greeks
      const rrMap = await fetchAllGreeksBulk(user, allSubs);

      // Step 3: Store to Firestore (merge per expDate)
      const fetchedAt = new Date().toISOString();
      const byTicker = {};
      for (const [key, rr] of Object.entries(rrMap)) {
        const [ticker, expDate] = key.split('|');
        if (!byTicker[ticker]) byTicker[ticker] = {};
        byTicker[ticker][expDate] = rr;
      }

      for (const [ticker, exps] of Object.entries(byTicker)) {
        const histRef = doc(db, 'artifacts', APP_ID, 'skew', ticker, 'history', today);
        const updates = { fetchedAt };
        for (const [expDate, rr] of Object.entries(exps)) {
          updates[`exps.${expDate}`] = rr;
        }
        try {
          await updateDoc(histRef, updates);
        } catch {
          // Document doesn't exist yet — create it
          const expsObj = {};
          for (const [expDate, rr] of Object.entries(exps)) expsObj[expDate] = rr;
          await setDoc(histRef, { exps: expsObj, fetchedAt });
        }
      }

      setJobStatus('done');
    } catch (e) {
      console.error('[SkewJob] failed:', e);
      setJobStatus('error');
    } finally {
      runningRef.current = false;
    }
  }, [user, db, symbols]);

  // Auto-trigger once per day after 9:45 AM ET
  useEffect(() => {
    if (!user || !db || !symbols?.length) return;
    if (!isAfterMarketOpen()) return;
    const today = getETDateString();
    // Check Firestore (shared across all devices) instead of localStorage
    const probe = symbols[Math.floor(symbols.length / 2)]; // pick a middle symbol as probe
    getDoc(doc(db, 'artifacts', APP_ID, 'skew', probe, 'history', today))
      .then(snap => { if (!snap.exists()) runJob(); })
      .catch(() => runJob()); // on error, run anyway
  }, [user?.uid, db]); // eslint-disable-line react-hooks/exhaustive-deps

  return { jobStatus, jobProgress, runSkewJob: runJob };
}

/**
 * Opens one dxFeed WebSocket, subscribes to ALL option strikes at once,
 * waits 45s for Greeks data, then computes 25Δ RR per ticker+expDate.
 * Returns { "ticker|expDate": rr }
 */
function fetchAllGreeksBulk(user, allSubs) {
  return new Promise(async (resolve, reject) => {
    try {
      const tokenResp = await callTastytradeApi(user, '/api-quote-tokens');
      const tokenData = tokenResp.data || tokenResp;
      const token = tokenData.token;
      const wsUrl = tokenData['dxlink-url'] || 'wss://tasty-openapi-ws.dxfeed.com/realtime';
      if (!token) throw new Error('no dxFeed token');

      // streamerSymbol → { ticker, expDate, price, side }
      const symbolMap = {};
      const subscriptions = [];
      allSubs.forEach(({ streamerSymbol, ticker, expDate, price, side }) => {
        symbolMap[streamerSymbol] = { ticker, expDate, price, side };
        subscriptions.push({ type: 'Greeks', symbol: streamerSymbol });
      });

      // "ticker|expDate|price" → { callDelta, callIV, putDelta, putIV }
      const collected = {};
      const ws = new WebSocket(wsUrl);
      let resolved = false;

      const finalize = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(hardTimeout);
        if (ws.readyState === WebSocket.OPEN) ws.close();
        resolve(computeAllRR(collected));
      };

      const hardTimeout = setTimeout(finalize, 90000); // 90s absolute cap

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
              // Batch subscriptions in chunks of 500 to avoid message size limits
              for (let i = 0; i < subscriptions.length; i += 500) {
                ws.send(JSON.stringify({
                  type: 'FEED_SUBSCRIPTION', channel: 1,
                  reset: i === 0,
                  add: subscriptions.slice(i, i + 500),
                }));
              }
              // Allow 45s for data collection after subscribing
              setTimeout(finalize, 45000);
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
              const vol = Number(values[i + 2]);
              const info = symbolMap[sym];
              if (!info) continue;
              const key = `${info.ticker}|${info.expDate}|${info.price}`;
              if (!collected[key]) collected[key] = {};
              if (info.side === 'call') {
                collected[key].callDelta = delta;
                collected[key].callIV = vol;
              } else {
                collected[key].putDelta = delta;
                collected[key].putIV = vol;
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

      ws.onerror = () => { clearTimeout(hardTimeout); reject(new Error('WebSocket error')); };
      ws.onclose = () => finalize();

    } catch (e) {
      reject(e);
    }
  });
}

/**
 * From collected Greeks, compute 25Δ RR per ticker+expDate.
 */
function computeAllRR(collected) {
  // Group by "ticker|expDate"
  const byExp = {};
  for (const [key, data] of Object.entries(collected)) {
    const lastPipe = key.lastIndexOf('|');
    const expKey = key.slice(0, lastPipe); // "ticker|expDate"
    if (!byExp[expKey]) byExp[expKey] = [];
    byExp[expKey].push(data);
  }

  const result = {};
  for (const [expKey, strikes] of Object.entries(byExp)) {
    let bestCallIV = null, bestCallDist = Infinity;
    let bestPutIV = null, bestPutDist = Infinity;

    strikes.forEach(({ callDelta, callIV, putDelta, putIV }) => {
      if (callDelta != null && callIV != null && callIV > 0) {
        const d = Math.abs(callDelta - 0.25);
        if (d < bestCallDist) { bestCallDist = d; bestCallIV = callIV; }
      }
      if (putDelta != null && putIV != null && putIV > 0) {
        const d = Math.abs(putDelta + 0.25);
        if (d < bestPutDist) { bestPutDist = d; bestPutIV = putIV; }
      }
    });

    if (bestCallIV != null && bestPutIV != null) {
      result[expKey] = parseFloat((bestPutIV - bestCallIV).toFixed(4));
    }
  }

  return result;
}

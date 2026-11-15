import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createDxFeedStream } from '../utils/dxFeedStream';

/**
 * Map option-chain strike objects to streamer symbols.
 * @param {Array} strikes - items from /option-chains/{T}/nested expirations[].strikes
 * @returns {Map<string, { price: string, side: 'call'|'put' }>}
 */
export function buildSymbolMap(strikes) {
  const map = new Map();
  (Array.isArray(strikes) ? strikes : []).forEach(strike => {
    const price = String(parseFloat(strike?.['strike-price']));
    if (price === 'NaN') return;
    const call = strike['call-streamer-symbol'];
    const put = strike['put-streamer-symbol'];
    if (typeof call === 'string' && call) map.set(call, { price, side: 'call' });
    if (typeof put === 'string' && put) map.set(put, { price, side: 'put' });
  });
  return map;
}

/**
 * Merge a batch of per-symbol updates into the { [price]: { call, put } } quote table.
 * Symbols not in symbolMap are ignored. Returns the same object when nothing changed.
 */
export function mergeQuoteBatch(prev, batch, symbolMap) {
  let next = prev;
  for (const [sym, update] of batch) {
    const info = symbolMap.get(sym);
    if (!info) continue;
    if (next === prev) next = { ...prev };
    const row = next[info.price] || {};
    next[info.price] = { ...row, [info.side]: { ...row[info.side], ...update } };
  }
  return next;
}

/**
 * Live bid/ask + delta/IV for the given strikes via a persistent dxFeed stream.
 * The stream lives as long as the component; changing `strikes` only diffs subscriptions.
 *
 * @param {object} params
 * @param {object} params.user
 * @param {Array}  params.strikes - strike objects to subscribe (already range-filtered by caller)
 * @returns {{ quotes: object, status: string, error: string|null, updatedAt: Date|null, reconnect: () => void }}
 */
export function useOptionQuotes({ user, strikes }) {
  const [quotes, setQuotes] = useState({});
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [session, setSession] = useState(0); // bump to reconnect
  const streamRef = useRef(null);

  const symbolMap = useMemo(() => buildSymbolMap(strikes), [strikes]);
  const symbolMapRef = useRef(symbolMap);

  // One stream per mount/session
  useEffect(() => {
    if (!user) return undefined;
    const stream = createDxFeedStream(user, {
      onData: (batch) => {
        setQuotes(prev => mergeQuoteBatch(prev, batch, symbolMapRef.current));
        setUpdatedAt(new Date());
      },
      onStatus: (s, message) => {
        setStatus(s);
        if (s === 'error') setError(message || '连接错误');
        else if (s === 'closed') setError('连接已断开');
        else setError(null);
      },
    });
    streamRef.current = stream;
    stream.setSymbols([...symbolMapRef.current.keys()]);
    return () => { stream.close(); streamRef.current = null; };
  }, [user, session]);

  // Diff subscriptions when strikes change. Rows for strikes no longer shown stay in
  // state but are never rendered (callers look up by visible strike only).
  useEffect(() => {
    symbolMapRef.current = symbolMap;
    streamRef.current?.setSymbols([...symbolMap.keys()]);
  }, [symbolMap]);

  const reconnect = useCallback(() => setSession(s => s + 1), []);

  return { quotes, status, error, updatedAt, reconnect };
}

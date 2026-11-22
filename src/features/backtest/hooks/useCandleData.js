import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchDailyCandles } from '../data/dxFeedCandles';

const INITIAL = {
  status: 'idle',
  progress: { phase: 'fetch', done: 0, total: 0 },
  error: null,
  data: null,
  failed: [],
  snipped: [],
  diagnostics: [],
  fromDate: null,
};

/**
 * Loads daily candles into memory for the lifetime of the panel.
 * Nothing is written to Firestore or browser storage.
 */
export function useCandleData({ user }) {
  const [state, setState] = useState(INITIAL);
  const abortRef = useRef(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => abort, [abort]);

  const load = useCallback(async (symbols, fromDate) => {
    abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...INITIAL, status: 'loading', progress: { phase: 'fetch', done: 0, total: symbols.length } });

    try {
      const res = await fetchDailyCandles(user, symbols, {
        fromDate,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setState(s => ({ ...s, progress }));
        },
      });
      if (controller.signal.aborted) return;
      if (res.data.size === 0) {
        setState({ ...INITIAL, ...res, data: null, status: 'error', error: '没有取到任何日线数据，请查看下方诊断信息', fromDate });
        return;
      }
      setState({ ...INITIAL, ...res, status: 'ready', fromDate });
    } catch (e) {
      if (e?.name === 'AbortError') {
        setState(s => ({ ...s, status: 'idle', error: '已中止' }));
      } else {
        setState(s => ({ ...s, status: 'error', error: e?.message || '拉取失败' }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [user, abort]);

  return { ...state, load, abort };
}

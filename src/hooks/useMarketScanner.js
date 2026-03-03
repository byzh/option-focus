import { useState, useCallback, useRef } from 'react';
import { callTastytradeApi } from '../utils/apiClient';
import { getCachedOrFetch, cleanupOldCache, recordCacheDate } from '../utils/cacheUtils';
import { getLocalTodayString } from '../utils/dateUtils';
import { BATCH_SIZE, BATCH_DELAY_MS } from '../data/defaultSymbols';

export function useMarketScanner({ user, db }) {
  const [scanState, setScanState] = useState('idle'); // idle | scanning | done | error
  const [progress, setProgress] = useState({ current: 0, total: 0, batch: 0, totalBatches: 0 });
  const [results, setResults] = useState([]); // filtered results
  const [allMetrics, setAllMetrics] = useState([]); // unfiltered results (for re-filtering)
  const [scanError, setScanError] = useState(null);
  const abortRef = useRef(false);

  const scan = useCallback(async (symbols, filters, forceRefresh = false) => {
    if (!user || !db || symbols.length === 0) return;

    abortRef.current = false;
    setScanState('scanning');
    setScanError(null);
    setResults([]);
    setAllMetrics([]);

    const today = getLocalTodayString();
    const batches = [];
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      batches.push(symbols.slice(i, i + BATCH_SIZE));
    }

    setProgress({ current: 0, total: symbols.length, batch: 0, totalBatches: batches.length });

    const collected = [];

    try {
      // Fire-and-forget cleanup
      cleanupOldCache(db, 'market-metrics').catch(e => console.warn('Cache cleanup:', e));

      for (let i = 0; i < batches.length; i++) {
        if (abortRef.current) break;

        const batch = batches[i];

        const data = await getCachedOrFetch(
          db,
          'market-metrics',
          today,
          `${user.uid}-batch-${i}`,
          async () => {
            const response = await callTastytradeApi(user, '/market-metrics', {
              symbols: batch.join(','),
            });
            return { items: response.data?.items || response.items || [] };
          },
          forceRefresh
        );

        await recordCacheDate(db, 'market-metrics', today);

        const items = Array.isArray(data.items) ? data.items : [];
        collected.push(...items);

        setProgress({
          current: Math.min((i + 1) * BATCH_SIZE, symbols.length),
          total: symbols.length,
          batch: i + 1,
          totalBatches: batches.length,
        });

        if (i < batches.length - 1 && !abortRef.current) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      setAllMetrics(collected);

      // Apply filters
      const filtered = applyFilters(collected, filters);
      setResults(filtered);
      setScanState('done');
    } catch (e) {
      setScanError(e.message);
      setScanState('error');
    }
  }, [user, db]);

  const refilter = useCallback((filters) => {
    const filtered = applyFilters(allMetrics, filters);
    setResults(filtered);
  }, [allMetrics]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    setScanState('idle');
    setResults([]);
    setAllMetrics([]);
    setScanError(null);
    setProgress({ current: 0, total: 0, batch: 0, totalBatches: 0 });
  }, []);

  return { scanState, progress, results, allMetrics, scanError, scan, refilter, abort, reset };
}

function applyFilters(metrics, filters) {
  const filtered = metrics.filter(item => {
    // API returns decimal values (0.36 = 36%), filter uses percentage (30 = 30%)
    const ivr = parseFloat(item['implied-volatility-index-rank']) || 0;
    const ivx = parseFloat(item['implied-volatility-index']) || 0;
    const liqRating = parseInt(item['liquidity-rating']) || 0;

    // Filter: if BOTH IVR and IVX are below thresholds, exclude
    const ivrLow = filters.minIVR != null && ivr * 100 < filters.minIVR;
    const ivxLow = filters.minIVX != null && ivx * 100 < filters.minIVX;
    if (ivrLow && ivxLow) return false;
    if (filters.minLiquidity != null && liqRating < filters.minLiquidity) return false;
    return true;
  });

  // Sort by IVR descending
  filtered.sort((a, b) =>
    (parseFloat(b['implied-volatility-index-rank']) || 0) - (parseFloat(a['implied-volatility-index-rank']) || 0)
  );

  return filtered;
}

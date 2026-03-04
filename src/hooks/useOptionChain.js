import { useState, useCallback } from 'react';
import { callTastytradeApi } from '../utils/apiClient';
import { getCachedOrFetch } from '../utils/cacheUtils';
import { getLocalTodayString } from '../utils/dateUtils';

export function useOptionChain({ user, db }) {
  const [chainData, setChainData] = useState(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState(null);

  const fetchChain = useCallback(async (symbol, { minDTE = 7, maxDTE = 45 } = {}, forceRefresh = false) => {
    if (!user || !db) return;

    setChainLoading(true);
    setChainError(null);

    const today = getLocalTodayString();

    try {
      const data = await getCachedOrFetch(
        db,
        'option-chains',
        today,
        symbol,
        async () => {
          const response = await callTastytradeApi(user, `/option-chains/${symbol}/nested`);
          // response.data.items is an array of chain objects; expirations are inside the first item
          const chainItems = response.data?.items || response.items || [];
          const expirations = chainItems[0]?.expirations || [];
          return { expirations };
        },
        forceRefresh
      );

      // Filter expirations by DTE
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const rawExpirations = Array.isArray(data.expirations) ? data.expirations : [];

      const filtered = rawExpirations
        .filter(exp => {
          const dte = exp['days-to-expiration'] ?? calculateDTE(exp['expiration-date'], now);
          return dte >= minDTE && dte <= maxDTE;
        })
        .map(exp => ({
          ...exp,
          dte: exp['days-to-expiration'] ?? calculateDTE(exp['expiration-date'], now),
        }));

      setChainData({ symbol, expirations: filtered });
    } catch (e) {
      setChainError(e.message);
    } finally {
      setChainLoading(false);
    }
  }, [user, db]);

  const clearChain = useCallback(() => {
    setChainData(null);
    setChainError(null);
  }, []);

  return { chainData, chainLoading, chainError, fetchChain, clearChain };
}

function calculateDTE(expirationDate, now) {
  if (!expirationDate) return 0;
  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - now) / 86400000);
}

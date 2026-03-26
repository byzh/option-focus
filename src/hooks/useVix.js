import { useState, useEffect, useRef } from 'react';
import { connectDxFeed } from '../utils/dxFeedWebSocket';
import { callTastytradeApi } from '../utils/apiClient';

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function useVix({ user }) {
  const [vix, setVix] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const streamerSymbolRef = useRef(null);

  const fetchVix = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Resolve streamer symbol once and cache it
      if (!streamerSymbolRef.current) {
        const instResp = await callTastytradeApi(user, '/instruments/equities/VIX');
        streamerSymbolRef.current = instResp?.data?.['streamer-symbol'] ?? '$VIX.X';
      }
      const streamerSymbol = streamerSymbolRef.current;

      // Try Quote (mid-price) first, fall back to Trade (last price)
      for (const eventType of ['Quote', 'Trade']) {
        const result = await connectDxFeed(
          user,
          [{ type: eventType, symbol: streamerSymbol }],
          eventType,
          { hardTimeoutMs: 10000, collectTimeoutMs: 5000 },
        );
        const value = result.get(streamerSymbol);
        if (value != null && value > 0) {
          setVix(value);
          return;
        }
      }
      setError('无法获取 VIX 数据');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchVix();
    timerRef.current = setInterval(fetchVix, REFRESH_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [user]);

  return { vix, loading, error };
}

import { useState, useEffect, useRef } from 'react';
import { connectDxFeed } from '../utils/dxFeedWebSocket';
import { callTastytradeApi } from '../utils/apiClient';

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Module-level caches — survive remounts, reset only on page reload
let _streamerSymbol = null;
let _workingEventType = null; // 'Quote' or 'Trade', set after first successful fetch

export function useVix({ user }) {
  const [vix, setVix] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchVix = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (!_streamerSymbol) {
        const instResp = await callTastytradeApi(user, '/instruments/equities/VIX');
        _streamerSymbol = instResp?.data?.['streamer-symbol'] ?? '$VIX.X';
      }

      // Once we know which event type works, skip the other one
      const eventTypes = _workingEventType ? [_workingEventType] : ['Quote', 'Trade'];
      for (const eventType of eventTypes) {
        const result = await connectDxFeed(
          user,
          [{ type: eventType, symbol: _streamerSymbol }],
          eventType,
          { hardTimeoutMs: 10000, collectTimeoutMs: 5000, expectedCount: 1 },
        );
        const value = result.get(_streamerSymbol);
        if (value != null && value > 0) {
          _workingEventType = eventType;
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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  ScanSearch, Filter, RefreshCw, Loader2, ChevronDown,
  Square, Settings2, RotateCcw, TrendingUp, ChevronRight, ArrowUp, ArrowDown, RotateCw,
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useMarketScanner } from '../hooks/useMarketScanner';
import { useOptionChain } from '../hooks/useOptionChain';
import { useOIWall } from '../hooks/useOIWall';
import { useSkewHistory } from '../hooks/useSkewHistory';
import { useSkewAutoJob } from '../hooks/useSkewAutoJob';
import { useVix } from '../hooks/useVix';
import { DEFAULT_SYMBOLS } from '../data/defaultSymbols';
import { callTastytradeApi } from '../utils/apiClient';

const APP_ID = 'option-focus-v2';

const VIX_ZONES = [
  { label: '< 15',  max: 15,       valueColor: 'text-green-700 dark:text-green-400' },
  { label: '15–20', max: 20,       valueColor: 'text-green-500' },
  { label: '20–30', max: 30,       valueColor: 'text-yellow-500' },
  { label: '30–40', max: 40,       valueColor: 'text-red-500' },
  { label: '> 40',  max: Infinity, valueColor: 'text-red-700 dark:text-red-400' },
];

function getVixZoneIndex(v) {
  return VIX_ZONES.findIndex(z => v < z.max);
}

/** Returns true if dateStr (YYYY-MM-DD) is the 3rd Friday of its month */
function isMonthlyExpiration(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T12:00:00');
  if (d.getDay() !== 5) return false; // not a Friday
  const day = d.getDate();
  return day >= 15 && day <= 21;
}

export default function MarketScanner({ user, db }) {
  // Symbol pool
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [symbolInput, setSymbolInput] = useState('');
  const [showSymbolConfig, setShowSymbolConfig] = useState(false);

  // Filters
  const [filters, setFilters] = useState({ minIVR: 50, minIVX: 50, minLiquidity: null });
  const [showFilters, setShowFilters] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  // Scanner hook
  const { scanState, progress, results, allMetrics, scanError, scan, refilter, abort } = useMarketScanner({ user, db });

  // Option chain hook
  const { chainData, chainLoading, chainError, fetchChain, clearChain } = useOptionChain({ user, db });

  // OI wall hook
  const { oiData, loading: oiLoading, error: oiError, fetchOI, clearOI } = useOIWall({ user, db });

  // Skew history hook
  const { skewHistory, skewLoading, skewError, fetchAndStoreSkew, loadSkewHistory, clearSkew } = useSkewHistory({ user, db });

  // Skew auto job — runs once per day after 9:45 AM ET
  const { jobStatus, jobProgress, runSkewJob } = useSkewAutoJob({ user, db, symbols });

  // VIX
  const { vix, loading: vixLoading, error: vixError } = useVix({ user });

  // Sorting
  const [sortKey, setSortKey] = useState('implied-volatility-index-rank');
  const [sortAsc, setSortAsc] = useState(false); // default descending

  // Expanded row + selected expiration + underlying price
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  const [selectedExpIdx, setSelectedExpIdx] = useState(0);
  const [underlyingPrice, setUnderlyingPrice] = useState(null);

  // Load saved watchlist
  useEffect(() => {
    if (!user || !db) return;
    const loadWatchlist = async () => {
      try {
        const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'watchlist');
        const snap = await getDoc(ref);
        if (snap.exists() && Array.isArray(snap.data().symbols)) {
          setSymbols(snap.data().symbols);
        }
      } catch (e) {
        console.warn('Failed to load watchlist:', e);
      }
    };
    loadWatchlist();
  }, [user, db]);

  // Save watchlist
  const saveWatchlist = useCallback(async (newSymbols) => {
    if (!user || !db) return;
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'watchlist');
      await setDoc(ref, { symbols: newSymbols });
    } catch (e) {
      console.warn('Failed to save watchlist:', e);
    }
  }, [user, db]);

  // Handle symbol config save
  const handleSaveSymbols = () => {
    const parsed = symbolInput
      .toUpperCase()
      .split(/[\s,;\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && /^[A-Z]+$/.test(s));
    const unique = [...new Set(parsed)];
    if (unique.length > 0) {
      setSymbols(unique);
      saveWatchlist(unique);
      setShowSymbolConfig(false);
    }
  };

  const handleResetSymbols = () => {
    setSymbols(DEFAULT_SYMBOLS);
    saveWatchlist(DEFAULT_SYMBOLS);
    setSymbolInput('');
  };

  // Start scan
  const handleScan = () => {
    scan(symbols, filters, forceRefresh);
  };

  // Re-filter when filter values change (without re-fetching)
  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value === '' ? null : Number(value) };
    setFilters(newFilters);
    if (scanState === 'done') {
      refilter(newFilters);
    }
  };

  // Fetch underlying equity price
  const fetchUnderlyingPrice = useCallback(async (symbol) => {
    try {
      const response = await callTastytradeApi(user, '/market-data/by-type', { equity: symbol });
      const items = response.data?.items || [];
      const equity = items.find(i => i.symbol === symbol);
      if (equity) {
        setUnderlyingPrice(parseFloat(equity.mark || equity.last || equity.close) || null);
      }
    } catch (e) {
      console.warn('Failed to fetch underlying price:', e);
    }
  }, [user]);

  // Row click → load option chain
  const handleRowClick = (symbol) => {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null);
      clearChain();
      clearOI();
      clearSkew();
      setSelectedExpIdx(0);
      setUnderlyingPrice(null);
    } else {
      setExpandedSymbol(symbol);
      setSelectedExpIdx(0);
      clearOI();
      clearSkew();
      setUnderlyingPrice(null);
      fetchChain(symbol);
      fetchUnderlyingPrice(symbol);
      loadSkewHistory(symbol);
    }
  };

  // Sort handler
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'symbol'); // alpha ascending by default, numbers descending
    }
  };

  // Sorted results
  const sortedResults = [...results].sort((a, b) => {
    if (sortKey === 'symbol') {
      return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
    }
    if (sortKey === 'earnings-date') {
      const da = a.earnings?.['expected-report-date'] || '';
      const db_ = b.earnings?.['expected-report-date'] || '';
      // Empty dates go to end regardless of sort direction
      if (!da && !db_) return 0;
      if (!da) return 1;
      if (!db_) return -1;
      return sortAsc ? da.localeCompare(db_) : db_.localeCompare(da);
    }
    const va = parseFloat(a[sortKey]) || 0;
    const vb = parseFloat(b[sortKey]) || 0;
    return sortAsc ? va - vb : vb - va;
  });

  // Sort indicator
  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return null;
    return sortAsc ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
  };

  // Format percentage
  const fmtPct = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    return (n * 100).toFixed(1) + '%';
  };

  // Format earnings date from nested earnings object
  // Returns { label, daysAway, isPast, timeOfDay, estimated } or null
  const fmtEarnings = (item) => {
    const raw = item.earnings?.['expected-report-date'];
    if (!raw) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(raw);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d - today) / 86400000);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const tod = item.earnings?.['time-of-day'] || null;
    return {
      label: `${dd}/${mm}/${yyyy}`,
      daysAway: diffDays,
      isPast: diffDays < 0,
      timeOfDay: tod,
      estimated: item.earnings?.estimated !== false,
    };
  };

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanSearch size={18} className="text-blue-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">IVR/IVX 扫描</h3>
          <span className="text-xs text-slate-400">({symbols.length} 标的)</span>
          {jobStatus === 'running' ? (
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              Skew {jobProgress.done}/{jobProgress.total}
            </span>
          ) : (
            <button
              onClick={runSkewJob}
              className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
              title="手动触发 Skew 全量更新"
            >
              <RotateCw size={11} />
            </button>
          )}
          <VixBar vix={vix} loading={vixLoading} error={vixError} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
            title="筛选条件"
          >
            <Filter size={16} />
          </button>
          <button
            onClick={() => {
              setShowSymbolConfig(!showSymbolConfig);
              if (!showSymbolConfig) setSymbolInput(symbols.join(', '));
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
            title="标的池配置"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      {/* Symbol Config */}
      {showSymbolConfig && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">标的池（逗号或换行分隔）</p>
          <textarea
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            placeholder="AAPL, MSFT, GOOGL..."
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleSaveSymbols} className="text-xs py-1.5">
              保存
            </Button>
            <Button variant="secondary" onClick={handleResetSymbols} className="text-xs py-1.5">
              <RotateCcw size={12} /> 恢复默认
            </Button>
          </div>
        </div>
      )}

      {/* Filter Controls */}
      {showFilters && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">筛选条件</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase">IVR 最低 (%)</label>
              <input
                type="number"
                value={filters.minIVR ?? ''}
                onChange={(e) => handleFilterChange('minIVR', e.target.value)}
                placeholder="50"
                className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase">IVX 最低 (%)</label>
              <input
                type="number"
                value={filters.minIVX ?? ''}
                onChange={(e) => handleFilterChange('minIVX', e.target.value)}
                placeholder="50"
                className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase">
                Liquidity 最低{filters.minLiquidity ? ` (≥${filters.minLiquidity})` : ''}
              </label>
              <div className="flex gap-1 items-center h-[30px]">
                {[1, 2, 3, 4, 5].map(n => {
                  const active = filters.minLiquidity && n <= filters.minLiquidity;
                  const selected = filters.minLiquidity === n;
                  return (
                    <button
                      key={n}
                      onClick={() => handleFilterChange('minLiquidity', selected ? '' : n)}
                      title={`Liquidity ≥ ${n}`}
                      className={`w-5 h-5 rounded-full transition-colors border ${
                        active
                          ? 'bg-blue-500 border-blue-500'
                          : 'bg-transparent border-slate-400 dark:border-slate-500 hover:border-blue-400'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        {scanState === 'scanning' ? (
          <Button variant="danger" onClick={abort} className="text-xs py-1.5">
            <Square size={14} /> 停止
          </Button>
        ) : (
          <Button variant="primary" onClick={handleScan} className="text-xs py-1.5">
            <ScanSearch size={14} /> 开始扫描
          </Button>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="rounded border-slate-300"
          />
          <RefreshCw size={12} /> 强制刷新
        </label>
        {scanState === 'done' && (
          <span className="text-xs text-slate-400 ml-auto">
            {results.length} / {allMetrics.length} 标的通过筛选
          </span>
        )}
      </div>

      {/* Progress Bar */}
      {scanState === 'scanning' && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>批次 {progress.batch}/{progress.totalBatches}</span>
            <span>{progress.current}/{progress.total} 标的</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {scanError && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs p-3 rounded-lg">
          {scanError}
        </div>
      )}

      {/* Results Table */}
      {scanState === 'done' && results.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                <th className="text-left px-3 py-2 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none" onClick={() => handleSort('symbol')}>
                  <span className="inline-flex items-center gap-1">Ticker <SortIcon colKey="symbol" /></span>
                </th>
                <th className="text-right px-3 py-2 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none" onClick={() => handleSort('implied-volatility-index-rank')}>
                  <span className="inline-flex items-center gap-1 justify-end">IVR <SortIcon colKey="implied-volatility-index-rank" /></span>
                </th>
                <th className="text-right px-3 py-2 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none" onClick={() => handleSort('implied-volatility-index')}>
                  <span className="inline-flex items-center gap-1 justify-end">IVX <SortIcon colKey="implied-volatility-index" /></span>
                </th>
                <th className="text-right px-3 py-2 font-semibold hidden sm:table-cell cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none" onClick={() => handleSort('implied-volatility-percentile')}>
                  <span className="inline-flex items-center gap-1 justify-end">IV百分位 <SortIcon colKey="implied-volatility-percentile" /></span>
                </th>
                <th className="text-right px-3 py-2 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none" onClick={() => handleSort('liquidity-rating')}>
                  <span className="inline-flex items-center gap-1 justify-end">Liquidity <SortIcon colKey="liquidity-rating" /></span>
                </th>
                <th className="text-right px-3 py-2 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none" onClick={() => handleSort('earnings-date')}>
                  <span className="inline-flex items-center gap-1 justify-end">财报 <SortIcon colKey="earnings-date" /></span>
                </th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((item) => {
                const sym = item.symbol;
                const isExpanded = expandedSymbol === sym;
                return (
                  <React.Fragment key={sym}>
                    <tr
                      onClick={() => handleRowClick(sym)}
                      className={`border-t border-slate-100 dark:border-slate-700 cursor-pointer transition-colors hover:bg-white/5 border-l-2 ${isExpanded ? 'bg-blue-50/50 dark:bg-blue-900/10 border-l-blue-400' : 'border-l-transparent hover:border-l-blue-400/60'}`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp size={12} className="text-blue-400" />
                          {sym}
                        </div>
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                        {fmtPct(item['implied-volatility-index-rank'])}
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                        {fmtPct(item['implied-volatility-index'])}
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-slate-700 dark:text-slate-300 hidden sm:table-cell">
                        {fmtPct(item['implied-volatility-percentile'])}
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                        {item['liquidity-rating'] ?? '—'}
                      </td>
                      <td className="text-right px-3 py-2">
                        {(() => {
                          const e = fmtEarnings(item);
                          if (!e) return <span className="text-slate-400">—</span>;
                          const tod = e.timeOfDay?.toUpperCase();
                          const todLabel = (tod === 'BTO' || tod === 'BMO') ? '盘前' : tod === 'AMC' ? '盘后' : null;
                          if (e.isPast) {
                            return (
                              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500" title={`上次财报（${Math.abs(e.daysAway)}天前）`}>
                                ~{e.label}{todLabel && <span className="ml-1 text-[9px] opacity-70">{todLabel}</span>}
                              </span>
                            );
                          }
                          // Upcoming earnings date
                          const soon = e.daysAway <= 14;
                          const est = e.estimated ? '（预估）' : '';
                          return (
                            <span className={`font-mono text-[11px] ${soon ? 'text-amber-500 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`} title={`下次财报${est}（${e.daysAway}天后）`}>
                              {e.label}
                              {todLabel && <span className={`ml-1 text-[9px] px-0.5 rounded ${soon ? 'opacity-80' : 'text-slate-400 dark:text-slate-500'}`}>{todLabel}</span>}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2 text-slate-400">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                    </tr>
                    {/* Expanded: Option Chain + OI Wall */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50/50 dark:bg-slate-900/50 px-3 py-3">
                          <OptionChainDetail
                            symbol={sym}
                            chainData={chainData}
                            chainLoading={chainLoading}
                            chainError={chainError}
                            selectedExpIdx={selectedExpIdx}
                            onSelectExp={(idx, exp) => {
                              setSelectedExpIdx(idx);
                              fetchOI(sym, exp);
                              fetchAndStoreSkew(sym, exp);
                            }}
                            onRefreshOI={(exp) => fetchOI(sym, exp, true)}
                            oiData={oiData}
                            oiLoading={oiLoading}
                            oiError={oiError}
                            underlyingPrice={underlyingPrice}
                            skewHistory={skewHistory}
                            skewLoading={skewLoading}
                            skewError={skewError}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {scanState === 'done' && results.length === 0 && (
        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">
          无符合筛选条件的标的。尝试降低 IVR/IVX 阈值。
        </div>
      )}
    </Card>
  );
}

function VixBar({ vix, loading, error }) {
  // Map VIX 0–50 to 0–100% position, clamped
  const pct = vix != null ? Math.min(Math.max((vix / 50) * 100, 0), 100) : null;
  const activeIdx = vix != null ? getVixZoneIndex(vix) : -1;
  const valueColor = VIX_ZONES[activeIdx]?.valueColor ?? 'text-slate-400';

  return (
    <div className="flex items-center gap-1.5" title={error ? `VIX error: ${error}` : vix != null ? `VIX: ${vix.toFixed(2)}` : 'VIX 加载中'}>
      <span className="text-[10px] text-slate-400 shrink-0">VIX</span>
      <div className="relative w-20 h-1.5 rounded-full overflow-visible"
        style={{ background: 'linear-gradient(to right, #166534, #22c55e, #facc15, #ef4444, #7f1d1d)' }}
      >
        {pct != null && !loading && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border-2 shadow"
            style={{
              left: `${pct}%`,
              transform: 'translate(-50%, -50%)',
              borderColor: activeIdx <= 1 ? '#22c55e' : activeIdx === 2 ? '#facc15' : '#ef4444',
            }}
          />
        )}
      </div>
      <span className={`text-[10px] font-semibold tabular-nums ${loading ? 'text-slate-400' : error ? 'text-red-400' : valueColor}`}>
        {loading ? '…' : error ? 'err' : vix != null ? vix.toFixed(1) : '--'}
      </span>
    </div>
  );
}

// Option chain detail sub-component
function OptionChainDetail({
  symbol, chainData, chainLoading, chainError,
  selectedExpIdx, onSelectExp, onRefreshOI,
  skewHistory, skewLoading, skewError,
  oiData, oiLoading, oiError,
  underlyingPrice,
}) {
  if (chainLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
        <Loader2 size={14} className="animate-spin" /> 加载 {symbol} 期权链...
      </div>
    );
  }
  if (chainError) return <div className="text-xs text-red-500 py-2">{chainError}</div>;
  if (!chainData || chainData.symbol !== symbol) return <div className="text-xs text-slate-400 py-2">加载中...</div>;
  if (chainData.expirations.length === 0) return <div className="text-xs text-slate-400 py-2">无 7-45 DTE 到期日</div>;

  const exps = chainData.expirations;
  const selExp = exps[selectedExpIdx];

  return (
    <div className="space-y-3">
      {/* Expiration tabs */}
      <div className="flex flex-wrap gap-1.5">
        {exps.map((exp, i) => {
          const date = exp['expiration-date'] || exp.expirationDate || '';
          const dte = exp.dte;
          const active = i === selectedExpIdx;
          const monthly = isMonthlyExpiration(date);
          return (
            <button
              key={i}
              onClick={() => onSelectExp(i, exp)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                active
                  ? 'bg-blue-500 text-white'
                  : monthly
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {date} <span className={active ? 'text-blue-200' : monthly ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400'}>({dte}d)</span>
            </button>
          );
        })}
      </div>

      {/* OI Wall for selected expiration */}
      {selExp && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">OI Wall</span>
            <button
              onClick={() => onRefreshOI(selExp)}
              disabled={oiLoading}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="强制重新拉取 OI 数据（跳过缓存）"
            >
              <RotateCw size={11} className={oiLoading ? 'animate-spin' : ''} />
              刷新
            </button>
          </div>
          <OIWallChart
            oiData={oiData}
            loading={oiLoading}
            error={oiError}
            underlyingPrice={underlyingPrice}
          />
        </div>
      )}

      {/* 25-delta Risk Reversal (Put Skew) history chart */}
      <SkewChart
        history={skewHistory}
        loading={skewLoading}
        error={skewError}
        expDate={selExp?.['expiration-date']}
      />
    </div>
  );
}

// OI Wall bar chart (pure CSS, no library)
// Layout: [Call OI ←] [strike] [→ Put OI]
function OIWallChart({ oiData, loading, error, underlyingPrice }) {
  const scrollRef = useRef(null);
  const atmRef = useRef(null);

  // Auto-scroll so ATM strike is centered when data loads
  useEffect(() => {
    if (!scrollRef.current || !atmRef.current) return;
    const container = scrollRef.current;
    const atm = atmRef.current;
    container.scrollTop = atm.offsetTop - container.clientHeight / 2 + atm.clientHeight / 2;
  }, [oiData, underlyingPrice]);

  if (!oiData && !loading && !error) {
    return <div className="text-[10px] text-slate-400 italic">点击上方到期日加载 OI 数据</div>;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
        <Loader2 size={12} className="animate-spin" /> 订阅 OI 数据...
      </div>
    );
  }
  if (error) return <div className="text-xs text-red-500">{error}</div>;
  if (!oiData || Object.keys(oiData).length === 0) return <div className="text-xs text-slate-400">暂无 OI 数据</div>;

  const strikes = Object.keys(oiData).map(Number).sort((a, b) => a - b);
  const maxOI = Math.max(...strikes.flatMap(s => [oiData[s]?.callOI || 0, oiData[s]?.putOI || 0]), 1);

  const callWallStrike = strikes.reduce((best, s) =>
    (oiData[s]?.callOI || 0) > (oiData[best]?.callOI || 0) ? s : best, strikes[0]);
  const putWallStrike = strikes.reduce((best, s) =>
    (oiData[s]?.putOI || 0) > (oiData[best]?.putOI || 0) ? s : best, strikes[0]);

  // Find ATM strike (closest to current price)
  const atmStrike = underlyingPrice != null
    ? strikes.reduce((best, s) => Math.abs(s - underlyingPrice) < Math.abs(best - underlyingPrice) ? s : best, strikes[0])
    : null;

  const fmtOI = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  return (
    <div className="space-y-1.5">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm bg-blue-400" /> Call OI
          <span className="ml-1 font-semibold text-blue-600 dark:text-blue-400">Call Wall: {callWallStrike}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm bg-red-400" /> Put OI
          <span className="ml-1 font-semibold text-red-600 dark:text-red-400">Put Wall: {putWallStrike}</span>
        </span>
        {underlyingPrice != null && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm bg-amber-400" /> 现价 {underlyingPrice.toFixed(2)}
          </span>
        )}
      </div>

      {/* Bars — Call left, Put right */}
      <div ref={scrollRef} className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
        {strikes.map(strike => {
          const { callOI = 0, putOI = 0 } = oiData[strike] || {};
          const callW = (callOI / maxOI) * 100;
          const putW = (putOI / maxOI) * 100;
          const isCallWall = strike === callWallStrike && callOI > 0;
          const isPutWall = strike === putWallStrike && putOI > 0;
          const isATM = strike === atmStrike;

          return (
            <div key={strike} ref={isATM ? atmRef : null}>
              {/* Current price marker: thin amber line above ATM strike */}
              {isATM && underlyingPrice != null && (
                <div className="flex items-center gap-1 my-0.5">
                  <div className="flex-1 h-px bg-amber-400" />
                  <span className="text-[9px] font-bold text-amber-500 shrink-0">
                    ▼ {underlyingPrice.toFixed(2)}
                  </span>
                  <div className="flex-1 h-px bg-amber-400" />
                </div>
              )}
              <div
                className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${
                  isATM ? 'bg-amber-50 dark:bg-amber-900/20' :
                  (isCallWall || isPutWall) ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                }`}
              >
                {/* Call bar — left side, grows leftward from center */}
                <div className="flex-1 flex justify-end">
                  <div className="w-full max-w-[120px] flex justify-end items-center gap-1">
                    {callOI > 0 && <span className="text-[9px] text-blue-400 shrink-0">{fmtOI(callOI)}</span>}
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-l overflow-hidden w-full">
                      <div
                        className={`h-full rounded-l ${isCallWall ? 'bg-blue-500' : 'bg-blue-300'} transition-all duration-300`}
                        style={{ width: `${callW}%`, marginLeft: 'auto' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Strike label */}
                <span className={`w-14 text-center text-[10px] font-mono shrink-0 ${
                  isATM ? 'font-bold text-amber-600 dark:text-amber-400' :
                  (isCallWall || isPutWall) ? 'font-bold text-yellow-600 dark:text-yellow-400' : 'text-slate-500'
                }`}>
                  {strike}
                </span>

                {/* Put bar — right side, grows rightward from center */}
                <div className="flex-1 flex justify-start">
                  <div className="w-full max-w-[120px] flex items-center gap-1">
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-r overflow-hidden w-full">
                      <div
                        className={`h-full rounded-r ${isPutWall ? 'bg-red-500' : 'bg-red-300'} transition-all duration-300`}
                        style={{ width: `${putW}%` }}
                      />
                    </div>
                    {putOI > 0 && <span className="text-[9px] text-red-400 shrink-0">{fmtOI(putOI)}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 25-delta Risk Reversal history chart (pure SVG)
// Displays put25dIV - call25dIV over the past 10 days
function SkewChart({ history, loading, error, expDate }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-1 mt-2">
        <Loader2 size={12} className="animate-spin" /> 计算 Put Skew...
      </div>
    );
  }

  // Filter history to only entries that have data for the selected expiration
  const filtered = expDate && Array.isArray(history)
    ? history
        .map(e => ({ date: e.date, rr: e.exps?.[expDate], fetchedAt: e.fetchedAt }))
        .filter(e => e.rr != null)
    : [];

  const hasData = filtered.length > 0;

  const latestFetchedAt = hasData
    ? (() => {
        const ts = filtered[filtered.length - 1]?.fetchedAt;
        if (!ts) return null;
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          25Δ Risk Reversal (Put − Call IV)
        </span>
        {latestFetchedAt && (
          <span className="text-[9px] text-slate-400">更新于 {latestFetchedAt}</span>
        )}
      </div>
      {error && <div className="text-[10px] text-amber-500">{error}</div>}
      {!hasData && !error && (
        <div className="text-[10px] text-slate-400 italic">
          {expDate ? '暂无历史数据，选择到期日后自动记录' : '选择到期日后自动计算并记录'}
        </div>
      )}
      {hasData && (() => {
        const W = 280, H = 56, PAD_L = 32, PAD_R = 8, PAD_T = 6, PAD_B = 16;
        const plotW = W - PAD_L - PAD_R;
        const plotH = H - PAD_T - PAD_B;

        const values = filtered.map(e => e.rr);
        const minV = Math.min(...values);
        const maxV = Math.max(...values);
        const range = maxV - minV || 0.01;

        const toX = (i) => PAD_L + (i / (filtered.length - 1 || 1)) * plotW;
        const toY = (v) => PAD_T + plotH - ((v - minV) / range) * plotH;

        const points = filtered.map((e, i) => `${toX(i).toFixed(1)},${toY(e.rr).toFixed(1)}`).join(' ');
        const zeroY = toY(0);
        const showZero = 0 >= minV && 0 <= maxV;

        // Color: positive skew (puts more expensive) = red, negative = green
        const latestRR = values[values.length - 1];
        const lineColor = latestRR >= 0 ? '#ef4444' : '#22c55e';

        return (
          <svg width={W} height={H} className="overflow-visible">
            {/* Zero line */}
            {showZero && (
              <line
                x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
                stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="3,3"
              />
            )}
            {/* Polyline */}
            <polyline
              points={points}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dots + date labels */}
            {filtered.map((e, i) => {
              const x = toX(i);
              const y = toY(e.rr);
              const label = e.date.slice(5); // MM-DD
              return (
                <g key={e.date}>
                  <circle cx={x} cy={y} r="2" fill={lineColor} />
                  {(i === 0 || i === filtered.length - 1) && (
                    <text
                      x={x} y={H - 2}
                      textAnchor={i === 0 ? 'start' : 'end'}
                      fontSize="7" fill="#94a3b8"
                    >{label}</text>
                  )}
                </g>
              );
            })}
            {/* Y-axis labels */}
            <text x={PAD_L - 2} y={PAD_T + 3} textAnchor="end" fontSize="7" fill="#94a3b8">
              {(maxV * 100).toFixed(1)}
            </text>
            <text x={PAD_L - 2} y={PAD_T + plotH + 3} textAnchor="end" fontSize="7" fill="#94a3b8">
              {(minV * 100).toFixed(1)}
            </text>
            {/* Latest value label */}
            <text
              x={toX(filtered.length - 1) + 4} y={toY(latestRR) + 3}
              fontSize="8" fill={lineColor} fontWeight="bold"
            >
              {latestRR >= 0 ? '+' : ''}{(latestRR * 100).toFixed(2)}
            </text>
          </svg>
        );
      })()}
    </div>
  );
}

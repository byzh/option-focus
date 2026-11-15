import { useState, useRef } from 'react';
import { Search, Loader2, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import Card from './ui/Card';
import { useOptionChain } from '../hooks/useOptionChain';
import { fetchUnderlyingPrice, normalizeTicker } from '../utils/marketData';
import { isMonthlyExpiration } from '../utils/dateUtils';
import OptionQuoteTable from './OptionQuoteTable';

/**
 * Look up any ticker and browse live quotes across all of its expirations.
 * Only the expanded expiration is streamed, keeping subscriptions small.
 */
export default function OptionChainLookup({ user, db }) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState(null);
  const [symbol, setSymbol] = useState(null);
  const [underlyingPrice, setUnderlyingPrice] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);
  const priceReqRef = useRef(0); // ignore stale price responses after a newer lookup
  const { chainData, chainLoading, chainError, fetchChain } = useOptionChain({ user, db });

  const handleSubmit = (e) => {
    e.preventDefault();
    const ticker = normalizeTicker(input);
    if (!ticker) {
      setInputError('请输入有效的股票代码（字母，最多 10 位）');
      return;
    }
    setInputError(null);
    setSymbol(ticker);
    setExpandedDate(null);
    setUnderlyingPrice(null);
    fetchChain(ticker, { minDTE: 0, maxDTE: Infinity });
    const reqId = ++priceReqRef.current;
    fetchUnderlyingPrice(user, ticker)
      .then(price => { if (reqId === priceReqRef.current) setUnderlyingPrice(price); })
      .catch(() => {});
  };

  const exps = chainData?.symbol === symbol ? chainData.expirations : [];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Layers size={18} className="text-blue-500" />
        <h3 className="font-semibold text-slate-800 dark:text-slate-200">期权报价查询</h3>
        {symbol && underlyingPrice != null && (
          <span className="text-xs text-slate-400 font-mono">{symbol} ${underlyingPrice.toFixed(2)}</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="输入 ticker，如 AAPL"
            maxLength={10}
            autoCapitalize="characters"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 uppercase placeholder:normal-case"
          />
        </div>
        <button
          type="submit"
          disabled={chainLoading}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {chainLoading ? <Loader2 size={14} className="animate-spin" /> : '查询'}
        </button>
      </form>
      {inputError && <div className="text-xs text-red-500">{inputError}</div>}
      {chainError && <div className="text-xs text-red-500">{chainError}</div>}

      {symbol && !chainLoading && !chainError && chainData?.symbol === symbol && exps.length === 0 && (
        <div className="text-xs text-slate-400">{symbol} 没有可交易的期权到期日</div>
      )}

      {exps.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
          {exps.map(exp => {
            const date = exp['expiration-date'];
            const open = expandedDate === date;
            const monthly = isMonthlyExpiration(date);
            const strikeCount = Array.isArray(exp.strikes) ? exp.strikes.length : 0;
            return (
              <div key={date}>
                <button
                  onClick={() => setExpandedDate(open ? null : date)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${open ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                >
                  <span className="flex items-center gap-2">
                    {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{date}</span>
                    <span className="text-slate-400">{exp.dte}d</span>
                    {monthly && <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">月度</span>}
                  </span>
                  <span className="text-slate-400">{strikeCount} 个行权价</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 pt-1">
                    <OptionQuoteTable key={date} user={user} expiration={exp} underlyingPrice={underlyingPrice} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

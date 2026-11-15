import { useState, useMemo, useRef, useEffect } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { useOptionQuotes } from '../hooks/useOptionQuotes';
import { selectVisibleStrikes, DEFAULT_STRIKE_RANGE as DEFAULT_RANGE } from '../utils/optionStrikes';

const fmt = (n, digits = 2) => (n == null ? '—' : n.toFixed(digits));
const midOf = (q) => (q?.bid != null && q?.ask != null && q.ask > 0 ? (q.bid + q.ask) / 2 : null);

const STATUS_LABEL = {
  idle: { text: '未连接', cls: 'bg-slate-400' },
  connecting: { text: '连接中', cls: 'bg-amber-400 animate-pulse' },
  live: { text: '实时', cls: 'bg-emerald-500' },
  closed: { text: '已断开', cls: 'bg-slate-400' },
  error: { text: '错误', cls: 'bg-red-500' },
};

/**
 * T-shaped live option quote table for one expiration.
 * Parent should pass key={expirationDate} so switching dates starts a clean stream.
 */
export default function OptionQuoteTable({ user, expiration, underlyingPrice }) {
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef(null);
  const atmRef = useRef(null);

  const { visible, atmPrice } = useMemo(
    () => selectVisibleStrikes(expiration?.strikes, underlyingPrice, showAll),
    [expiration, underlyingPrice, showAll],
  );
  const { quotes, status, error, updatedAt, reconnect } = useOptionQuotes({ user, strikes: visible });

  // Center the ATM row when the strike set changes
  useEffect(() => {
    const container = scrollRef.current;
    const row = atmRef.current;
    if (!container || !row) return;
    container.scrollTop = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
  }, [visible]);

  if (visible.length === 0) {
    return <div className="text-xs text-slate-400 py-2">该到期日无行权价数据</div>;
  }

  const st = STATUS_LABEL[status] || STATUS_LABEL.idle;
  const hasPrice = Number.isFinite(underlyingPrice);
  const totalStrikes = Array.isArray(expiration?.strikes) ? expiration.strikes.length : 0;

  // Columns mirror around the strike: CALL reads right-to-left, PUT left-to-right
  const cells = (q, side, itmCls) => {
    const vals = [
      { key: 'bid', cls: '', text: fmt(q?.bid) },
      { key: 'ask', cls: '', text: fmt(q?.ask) },
      { key: 'mid', cls: 'font-semibold text-slate-800 dark:text-slate-100', text: fmt(midOf(q)) },
      { key: 'delta', cls: 'text-slate-400', text: fmt(q?.delta) },
      { key: 'iv', cls: 'text-slate-400 hidden sm:table-cell', text: q?.iv == null ? '—' : `${(q.iv * 100).toFixed(1)}%` },
    ];
    const ordered = side === 'call' ? [...vals].reverse() : vals;
    return ordered.map(c => (
      <td key={`${side}-${c.key}`} className={`px-1.5 py-1 text-right ${c.cls} ${itmCls}`}>{c.text}</td>
    ));
  };

  const headers = ['Bid', 'Ask', 'Mid', 'Δ', 'IV'];
  const headCells = (side) => {
    const hs = headers.map(h => (
      <th key={h} className={`px-1.5 py-1 text-right font-semibold ${h === 'IV' ? 'hidden sm:table-cell' : ''}`}>{h}</th>
    ));
    return side === 'call' ? [...hs].reverse() : hs;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className="font-semibold uppercase tracking-wide">报价</span>
          <span className="inline-flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${st.cls}`} />
            {st.text}
          </span>
          {updatedAt && <span className="font-mono">更新于 {updatedAt.toLocaleTimeString()}</span>}
          {status === 'connecting' && <Loader2 size={11} className="animate-spin" />}
          {(status === 'error' || status === 'closed') && (
            <button onClick={reconnect} className="inline-flex items-center gap-1 hover:text-blue-500 transition-colors">
              <RotateCw size={11} /> 重连
            </button>
          )}
          {error && status === 'error' && <span className="text-red-400">{error}</span>}
        </div>
        <button
          onClick={() => setShowAll(v => !v)}
          className="text-[10px] text-slate-400 hover:text-blue-500 transition-colors"
        >
          {showAll ? `仅 ATM ±${DEFAULT_RANGE}` : `显示全部 (${totalStrikes})`}
        </button>
      </div>

      <div ref={scrollRef} className="max-h-96 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 z-10">
            <tr className="font-sans">
              <th colSpan={5} className="px-1.5 py-1 text-center font-semibold text-sky-600 dark:text-sky-400 hidden sm:table-cell">CALL</th>
              <th colSpan={4} className="px-1.5 py-1 text-center font-semibold text-sky-600 dark:text-sky-400 sm:hidden">CALL</th>
              <th className="px-1.5 py-1" />
              <th colSpan={5} className="px-1.5 py-1 text-center font-semibold text-purple-600 dark:text-purple-400 hidden sm:table-cell">PUT</th>
              <th colSpan={4} className="px-1.5 py-1 text-center font-semibold text-purple-600 dark:text-purple-400 sm:hidden">PUT</th>
            </tr>
            <tr className="font-sans">
              {headCells('call')}
              <th className="px-2 py-1 text-center font-semibold">Strike</th>
              {headCells('put')}
            </tr>
          </thead>
          <tbody>
            {visible.map(strike => {
              const price = String(parseFloat(strike['strike-price']));
              const p = parseFloat(price);
              const row = quotes[price] || {};
              const isAtm = price === atmPrice;
              const callItm = hasPrice && p < underlyingPrice;
              const putItm = hasPrice && p > underlyingPrice;
              return (
                <tr
                  key={price}
                  ref={isAtm ? atmRef : null}
                  className={`border-t border-slate-100 dark:border-slate-800 ${isAtm ? 'outline outline-1 outline-blue-400/60' : ''}`}
                >
                  {cells(row.call, 'call', callItm ? 'bg-sky-50 dark:bg-sky-900/20' : '')}
                  <td className={`px-2 py-1 text-center font-semibold ${isAtm ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'} bg-slate-50 dark:bg-slate-900`}>
                    {price}
                  </td>
                  {cells(row.put, 'put', putItm ? 'bg-purple-50 dark:bg-purple-900/20' : '')}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

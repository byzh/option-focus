import React from 'react';

function pts(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const x = v * 100;
  return `${x > 0 ? '+' : ''}${x.toFixed(1)}`;
}

function pct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const x = v * 100;
  return `${x > 0 ? '+' : ''}${x.toFixed(2)}%`;
}

function tone(v) {
  if (v == null || !Number.isFinite(v)) return 'text-slate-400';
  return v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-500' : 'text-slate-500';
}

const th = 'px-2 py-1.5 font-semibold text-right whitespace-nowrap';
const td = 'px-2 py-1.5 text-right tabular-nums whitespace-nowrap align-top';

/** Side-by-side comparison of recent runs: win-rate edge vs baseline and mean excess vs SPY. */
export default function RunHistory({ runs, onRestore, onClear }) {
  if (!runs.length) return null;
  const horizons = [...new Set(runs.flatMap(r => r.horizons))].sort((a, b) => a - b);
  const anyTrade = runs.some(r => r.trade);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">参数对比</h4>
          <span className="text-[10px] text-slate-400">持有期每格：胜率差（百分点）/ 平均超额 SPY；最新在上</span>
        </div>
        <button onClick={onClear} className="text-[10px] text-slate-400 hover:text-red-500">清空</button>
      </div>
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400">
            <tr>
              <th className={`${th} text-left`}>#</th>
              <th className={`${th} text-left`}>参数（相对默认值的改动）</th>
              <th className={th}>信号</th>
              {anyTrade && <th className={th}>交易（胜率 / 差 / 平均）</th>}
              {horizons.map(h => <th key={h} className={th}>{h} 日</th>)}
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
                <td className={`${td} text-left text-slate-400`}>
                  {r.id}
                  <div className="text-[10px]">{r.at}</div>
                </td>
                <td className={`${td} text-left whitespace-normal min-w-[180px]`}>
                  <div className="text-[10px] text-slate-400">{r.strategyName}</div>
                  {r.changes.length ? r.changes.join('，') : <span className="text-slate-400">默认参数</span>}
                </td>
                <td className={td}>{r.totalSignals}</td>
                {anyTrade && (
                  <td className={td}>
                    {r.trade ? (
                      <>
                        <span className="font-semibold">{r.trade.winRate == null ? '—' : `${(r.trade.winRate * 100).toFixed(1)}%`}</span>
                        <span className={`ml-1 ${tone(r.trade.winEdge)}`}>{pts(r.trade.winEdge)}</span>
                        <div className={`text-[10px] ${tone(r.trade.mean)}`}>{pct(r.trade.mean)} · {r.trade.n} 笔</div>
                      </>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                )}
                {horizons.map(h => {
                  const e = r.edges[h];
                  if (!e) return <td key={h} className={`${td} text-slate-400`}>—</td>;
                  return (
                    <td key={h} className={td}>
                      <span className={`font-semibold ${tone(e.winEdge)}`}>{pts(e.winEdge)}</span>
                      <div className={`text-[10px] ${tone(e.excessMean)}`}>{pct(e.excessMean)}</div>
                    </td>
                  );
                })}
                <td className={td}>
                  <button onClick={() => onRestore(r)} className="text-[10px] text-blue-500 hover:underline">载入参数</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

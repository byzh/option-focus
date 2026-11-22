import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

function fmtPct(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function tone(v) {
  if (v == null || !Number.isFinite(v)) return 'text-slate-400';
  return v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-500' : 'text-slate-500';
}

const th = 'px-2 py-1.5 font-semibold text-right whitespace-nowrap';
const td = 'px-2 py-1.5 text-right tabular-nums whitespace-nowrap';
const tableWrap = 'border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto';
const headRow = 'bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400';
const bodyRow = 'border-t border-slate-100 dark:border-slate-700/60 text-slate-700 dark:text-slate-300';

function Section({ title, note, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</h4>
        {note && <span className="text-[10px] text-slate-400">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function HorizonTable({ report }) {
  const baseBy = Object.fromEntries(report.baseline.map(b => [b.horizon, b]));
  return (
    <div className={tableWrap}>
      <table className="w-full text-xs min-w-[640px]">
        <thead className={headRow}>
          <tr>
            <th className={`${th} text-left`}>持有期</th>
            <th className={th}>样本</th>
            <th className={th}>胜率</th>
            <th className={th}>基准胜率</th>
            <th className={th}>平均收益</th>
            <th className={th}>基准平均</th>
            <th className={th}>中位数</th>
            <th className={th}>25% / 75%</th>
            {report.hasBenchmark && <th className={th}>跑赢 SPY</th>}
            {report.hasBenchmark && <th className={th}>平均超额</th>}
          </tr>
        </thead>
        <tbody>
          {report.summary.map(s => {
            const b = baseBy[s.horizon];
            const edge = s.winRate != null && b?.winRate != null ? s.winRate - b.winRate : null;
            return (
              <tr key={s.horizon} className={bodyRow}>
                <td className={`${td} text-left font-medium`}>{s.horizon} 日</td>
                <td className={td}>{s.n}</td>
                <td className={`${td} font-semibold`}>
                  {fmtPct(s.winRate, 1)}
                  {edge != null && <span className={`ml-1 text-[10px] ${tone(edge)}`}>({edge > 0 ? '+' : ''}{(edge * 100).toFixed(1)})</span>}
                </td>
                <td className={`${td} text-slate-400`}>{fmtPct(b?.winRate, 1)}</td>
                <td className={`${td} ${tone(s.mean)}`}>{fmtPct(s.mean)}</td>
                <td className={`${td} text-slate-400`}>{fmtPct(b?.mean)}</td>
                <td className={`${td} ${tone(s.median)}`}>{fmtPct(s.median)}</td>
                <td className={`${td} text-slate-500`}>{fmtPct(s.p25, 1)} / {fmtPct(s.p75, 1)}</td>
                {report.hasBenchmark && <td className={td}>{fmtPct(s.beatRate, 1)}</td>}
                {report.hasBenchmark && <td className={`${td} ${tone(s.excessMean)}`}>{fmtPct(s.excessMean)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PullbackStats({ report }) {
  const p = report.pullback;
  const items = [
    ['样本', p.n],
    ['回踩信号日低点', fmtPct(p.retestRate, 1)],
    ['未回踩', fmtPct(p.noRetestRate, 1)],
    ['回踩后窗口末收复入场价', fmtPct(p.recoveredRate, 1)],
    ['平均最大浮亏 (MAE)', fmtPct(p.maeMean)],
    ['MAE 中位数', fmtPct(p.maeMedian)],
    ['平均最大浮盈 (MFE)', fmtPct(p.mfeMean)],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map(([k, v]) => (
        <div key={k} className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
          <div className="text-[10px] text-slate-400">{k}</div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}

function SymbolTable({ report }) {
  const [horizon, setHorizon] = useState(report.horizons.includes(20) ? 20 : report.horizons[0]);
  const [sort, setSort] = useState({ key: 'nSignals', dir: -1 });

  const rows = useMemo(() => {
    const val = (r) => {
      if (sort.key === 'symbol') return r.symbol;
      if (sort.key === 'nSignals') return r.nSignals;
      if (sort.key === 'lastSignalDate') return r.lastSignalDate ?? '';
      if (sort.key === 'tradeN') return r.trade?.n ?? -Infinity;
      if (sort.key === 'tradeWin') return r.trade?.winRate ?? -Infinity;
      if (sort.key === 'tradeMean') return r.trade?.mean ?? -Infinity;
      const s = r.byHorizon[horizon];
      return s?.[sort.key] ?? -Infinity;
    };
    return [...report.bySymbol].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [report, horizon, sort]);

  const header = (key, label, left) => (
    <th
      className={`${th} ${left ? 'text-left' : ''} cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200`}
      onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : -1 }))}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sort.key === key && (sort.dir > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </span>
    </th>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>按持有期</span>
        <select
          value={horizon}
          onChange={e => setHorizon(Number(e.target.value))}
          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
        >
          {report.horizons.map(h => <option key={h} value={h}>{h} 日</option>)}
        </select>
      </div>
      <div className={`${tableWrap} max-h-[420px] overflow-y-auto`}>
        <table className={`w-full text-xs ${report.trades ? 'min-w-[760px]' : 'min-w-[560px]'}`}>
          <thead className={`${headRow} sticky top-0`}>
            <tr>
              {header('symbol', '标的', true)}
              {header('nSignals', '信号数')}
              {header('winRate', '胜率')}
              {header('mean', '平均收益')}
              {header('median', '中位数')}
              {header('lastSignalDate', '最近信号')}
              {report.trades && header('tradeN', '交易数')}
              {report.trades && header('tradeWin', '交易胜率')}
              {report.trades && header('tradeMean', '交易平均')}
              <th className={th}>数据区间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const s = r.byHorizon[horizon];
              return (
                <tr key={r.symbol} className={bodyRow}>
                  <td className={`${td} text-left font-medium`}>{r.symbol}</td>
                  <td className={td}>{r.nSignals}</td>
                  <td className={td}>{fmtPct(s?.winRate, 1)}</td>
                  <td className={`${td} ${tone(s?.mean)}`}>{fmtPct(s?.mean)}</td>
                  <td className={`${td} ${tone(s?.median)}`}>{fmtPct(s?.median)}</td>
                  <td className={td}>{r.lastSignalDate ?? '—'}</td>
                  {report.trades && <td className={td}>{r.trade?.n ?? 0}</td>}
                  {report.trades && <td className={td}>{fmtPct(r.trade?.winRate, 1)}</td>}
                  {report.trades && <td className={`${td} ${tone(r.trade?.mean)}`}>{fmtPct(r.trade?.mean)}</td>}
                  <td className={`${td} text-slate-400`}>{r.firstDate} ~ {r.lastDate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentSignals({ report }) {
  return (
    <div className={`${tableWrap} max-h-[360px] overflow-y-auto`}>
      <table className="w-full text-xs min-w-[560px]">
        <thead className={`${headRow} sticky top-0`}>
          <tr>
            <th className={`${th} text-left`}>日期</th>
            <th className={`${th} text-left`}>标的</th>
            <th className={th}>信号收盘</th>
            {report.horizons.map(h => <th key={h} className={th}>{h} 日</th>)}
            <th className={th}>回踩</th>
          </tr>
        </thead>
        <tbody>
          {report.recent.map(e => (
            <tr key={`${e.symbol}-${e.date}`} className={bodyRow}>
              <td className={`${td} text-left`}>{e.date}</td>
              <td className={`${td} text-left font-medium`}>{e.symbol}</td>
              <td className={td}>{e.close.toFixed(2)}</td>
              {report.horizons.map(h => (
                <td key={h} className={`${td} ${tone(e.returns[h])}`}>{fmtPct(e.returns[h], 1)}</td>
              ))}
              <td className={td}>{e.pullback ? (e.pullback.retest ? '是' : '否') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, sub, valueClass = '' }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 tabular-nums">{sub}</div>}
    </div>
  );
}

function TradeStats({ trades }) {
  const s = trades.summary;
  const edge = s.winRate != null && s.baseWinRate != null ? s.winRate - s.baseWinRate : null;
  const num = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="交易数" value={s.n} />
        <StatCard
          label="胜率"
          value={fmtPct(s.winRate, 1)}
          sub={`基准 ${fmtPct(s.baseWinRate, 1)}，差 ${edge == null ? '—' : `${edge > 0 ? '+' : ''}${(edge * 100).toFixed(1)}`}`}
        />
        <StatCard label="平均收益 / 笔" value={fmtPct(s.mean)} valueClass={tone(s.mean)} sub={`基准 ${fmtPct(s.baseMean)}`} />
        <StatCard label="中位数" value={fmtPct(s.median)} valueClass={tone(s.median)} />
        <StatCard label="平均盈利 / 平均亏损" value={`${fmtPct(s.avgWin)} / ${fmtPct(s.avgLoss)}`} />
        <StatCard label="盈亏比 / 利润因子" value={`${num(s.payoff)} / ${num(s.profitFactor)}`} sub="利润因子 = 总盈利 ÷ 总亏损，>1 才赚钱" />
        <StatCard label="平均持有" value={`${num(s.avgHold, 1)} 日`} />
        <StatCard label="跑赢 SPY / 平均超额" value={`${fmtPct(s.beatRate, 1)} / ${fmtPct(s.excessMean)}`} valueClass={tone(s.excessMean)} />
      </div>
      <div className="text-[10px] text-slate-400">
        基准 = 在任意一天按同样入场方式买入、持有与每笔交易相同天数的结果（逐笔匹配后平均）。
        {trades.excluded > 0 && ` ${trades.excluded} 笔因疑似拆股被剔除。`}
        {trades.open > 0 && ` ${trades.open} 笔尚未离场，未计入。`}
      </div>
    </div>
  );
}

function RecentTrades({ trades }) {
  return (
    <div className={`${tableWrap} max-h-[360px] overflow-y-auto`}>
      <table className="w-full text-xs min-w-[520px]">
        <thead className={`${headRow} sticky top-0`}>
          <tr>
            <th className={`${th} text-left`}>信号日</th>
            <th className={`${th} text-left`}>标的</th>
            <th className={th}>入场</th>
            <th className={th}>离场日</th>
            <th className={th}>离场</th>
            <th className={th}>持有</th>
            <th className={th}>收益</th>
          </tr>
        </thead>
        <tbody>
          {trades.recent.map(t => (
            <tr key={`${t.symbol}-${t.date}`} className={bodyRow}>
              <td className={`${td} text-left`}>{t.date}</td>
              <td className={`${td} text-left font-medium`}>{t.symbol}</td>
              <td className={td}>{t.entryPrice.toFixed(2)}</td>
              <td className={td}>{t.exitDate}</td>
              <td className={td}>{t.exitPrice.toFixed(2)}</td>
              <td className={td}>{t.holdBars} 日</td>
              <td className={`${td} ${tone(t.ret)}`}>{fmtPct(t.ret)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BacktestResults({ report }) {
  return (
    <div className="space-y-5">
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {report.strategyName}：测试 {report.symbolsTested} 个标的，共 {report.totalSignals} 个信号
        {report.excluded > 0 && `，另有 ${report.excluded} 个因疑似拆股跳变被剔除`}
        {!report.hasBenchmark && '（未取到 SPY，无法计算超额收益）'}
      </div>

      {report.trades && (
        <Section title="交易模拟（按策略离场规则）" note="每个标的同一时间只持有一笔">
          <TradeStats trades={report.trades} />
        </Section>
      )}

      <Section title={report.trades ? '固定持有期收益（不使用离场规则）' : '持有期收益'} note="基准 = 同样入场规则下所有交易日的无条件结果；胜率括号内为相对基准的百分点差">
        <HorizonTable report={report} />
      </Section>

      <Section title="回踩统计" note={`信号后 ${report.pullbackWindow} 个交易日内`}>
        <PullbackStats report={report} />
      </Section>

      <Section title="分标的" note="点击表头排序">
        <SymbolTable report={report} />
      </Section>

      {report.trades && (
        <Section title="最近交易" note="最多 100 笔">
          <RecentTrades trades={report.trades} />
        </Section>
      )}

      <Section title="最近信号" note="最多 100 条；近期信号的远期收益尚未发生，显示为 —">
        <RecentSignals report={report} />
      </Section>
    </div>
  );
}

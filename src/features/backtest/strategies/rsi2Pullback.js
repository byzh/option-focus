import { sma, rsi } from '../engine/indicators';
import { defaultsFromSchema } from '../engine/params';

/**
 * Connors RSI(2) pullback.
 * Entry: in a long-term uptrend (close > 200-day MA), the 2-period RSI drops
 * below a low threshold (short-term oversold).
 * Exit: first close above the short MA (5-day), or after a maximum holding time.
 */
const paramSchema = [
  { key: 'rsiPeriod', label: 'RSI 周期', type: 'int', min: 2, max: 30, default: 2 },
  { key: 'entryThreshold', label: 'RSI 入场阈值', type: 'number', min: 1, max: 50, default: 10,
    help: 'RSI 低于此值视为短线超卖；常见取值 5 或 10' },
  { key: 'useTrendFilter', label: '启用趋势过滤', type: 'bool', default: true,
    help: '只在收盘价高于长期均线时入场（各家回测中最关键的条件）' },
  { key: 'trendMaPeriod', label: '趋势均线周期', type: 'int', min: 20, max: 400, default: 200 },
  { key: 'exitMaPeriod', label: '离场均线周期', type: 'int', min: 2, max: 50, default: 5,
    help: '收盘价首次站上此均线即离场' },
  { key: 'maxHoldDays', label: '最长持有 (交易日)', type: 'int', min: 1, max: 60, default: 10,
    help: '未触发离场条件时，持有满此天数按收盘离场' },
  { key: 'cooldownDays', label: '信号冷却天数', type: 'int', min: 0, max: 60, default: 0,
    help: '只影响固定持有期统计；交易模拟本身不会在持仓期间重复入场' },
];

function detect(candles, p) {
  const closes = candles.map(c => c.close);
  const r = rsi(closes, p.rsiPeriod);
  const trend = p.useTrendFilter ? sma(closes, p.trendMaPeriod) : null;

  const signals = [];
  let last = -Infinity;
  for (let i = 1; i < candles.length; i++) {
    if (i - last <= p.cooldownDays) continue;
    if (r[i] == null || !(r[i] < p.entryThreshold)) continue;
    if (trend && (trend[i] == null || closes[i] <= trend[i])) continue;
    signals.push(i);
    last = i;
  }
  return signals;
}

/**
 * Returns a function mapping a signal bar index to the exit bar index
 * (exit at that bar's close), or null when the data ends before an exit.
 */
function makeExitRule(candles, p) {
  const closes = candles.map(c => c.close);
  const exitMa = sma(closes, p.exitMaPeriod);
  return (signalIdx) => {
    for (let k = signalIdx + 1; k < candles.length; k++) {
      if (exitMa[k] != null && closes[k] > exitMa[k]) return k;
      if (k - signalIdx >= p.maxHoldDays) return k;
    }
    return null;
  };
}

export const rsi2Pullback = {
  id: 'rsi2-pullback',
  name: 'RSI(2) 回调',
  description: '长期上升趋势中出现 2 日 RSI 超卖时买入，收盘站上 5 日均线离场（Larry Connors）。',
  help: [
    '入场：收盘价高于趋势均线（默认 200 日），且 RSI(周期) 低于入场阈值（默认 RSI(2) < 10）。',
    '离场：之后某天收盘价首次高于离场均线（默认 5 日）即按收盘离场；持有满最长天数仍未触发则强制离场。不设止损。',
    '公开回测中胜率普遍在 70%~75%，但单笔平均盈利小、亏损可能是盈利的两倍，看胜率的同时要看盈亏比和平均收益。',
    '这是"上升趋势中的短线回调"，与"好标的大跌时买入 / 卖 put"的思路一致。',
  ],
  paramSchema,
  defaultParams: defaultsFromSchema(paramSchema),
  warmupBars: p => Math.max(p.useTrendFilter ? p.trendMaPeriod : 0, p.rsiPeriod + 1, p.exitMaPeriod),
  /** Max bars a trade can last; used for the matched baseline. */
  maxHoldBars: p => p.maxHoldDays,
  detect,
  makeExitRule,
};

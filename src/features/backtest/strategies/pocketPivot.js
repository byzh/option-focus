import { sma } from '../engine/indicators';
import { defaultsFromSchema } from '../engine/params';

/**
 * Pocket Pivot (Morales & Kacher).
 * Signal day: close up vs prior close, and volume above the largest down-day
 * volume of the preceding N sessions. Optional location filters.
 */
const paramSchema = [
  { key: 'downVolLookback', label: '下跌日回看天数', type: 'int', min: 2, max: 60, default: 10,
    help: '在信号日之前多少个交易日里找"最大下跌日成交量"' },
  { key: 'volMultiplier', label: '量能倍数', type: 'number', min: 0.5, max: 10, default: 1,
    help: '信号日成交量需 > 最大下跌日成交量 × 此倍数' },
  { key: 'minChangePct', label: '最小涨幅 (%)', type: 'number', min: -5, max: 30, default: 0,
    help: '信号日收盘相对前一日收盘的涨幅需大于此值' },
  { key: 'useTrendFilter', label: '启用趋势过滤', type: 'bool', default: true,
    help: '要求收盘价在趋势均线之上' },
  { key: 'trendMaPeriod', label: '趋势均线周期', type: 'int', min: 2, max: 300, default: 50 },
  { key: 'useExtensionFilter', label: '启用追高过滤', type: 'bool', default: true,
    help: '要求收盘价不高于短均线一定比例（未过度拉伸）' },
  { key: 'extMaPeriod', label: '短均线周期', type: 'int', min: 2, max: 100, default: 10 },
  { key: 'maxExtensionPct', label: '最大偏离短均线 (%)', type: 'number', min: 0, max: 100, default: 5 },
  { key: 'cooldownDays', label: '信号冷却天数', type: 'int', min: 0, max: 120, default: 5,
    help: '同一标的两次信号之间至少间隔的交易日，避免连续信号重复计数' },
];

function detect(candles, p) {
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const trend = p.useTrendFilter ? sma(closes, p.trendMaPeriod) : null;
  const ext = p.useExtensionFilter ? sma(closes, p.extMaPeriod) : null;

  const signals = [];
  let last = -Infinity;

  for (let i = p.downVolLookback + 1; i < n; i++) {
    if (i - last <= p.cooldownDays) continue;

    const prev = closes[i - 1];
    const changePct = (closes[i] / prev - 1) * 100;
    if (!(changePct > p.minChangePct)) continue;

    let maxDownVol = 0;
    for (let j = i - p.downVolLookback; j < i; j++) {
      if (closes[j] < closes[j - 1] && candles[j].volume > maxDownVol) maxDownVol = candles[j].volume;
    }
    // No down day in the window: there is no seller reference to beat.
    if (maxDownVol <= 0) continue;
    if (!(candles[i].volume > maxDownVol * p.volMultiplier)) continue;

    if (trend && (trend[i] == null || closes[i] <= trend[i])) continue;
    if (ext) {
      if (ext[i] == null) continue;
      if ((closes[i] / ext[i] - 1) * 100 > p.maxExtensionPct) continue;
    }

    signals.push(i);
    last = i;
  }
  return signals;
}

export const pocketPivot = {
  id: 'pocket-pivot',
  name: 'Pocket Pivot',
  description: '收涨日成交量超过前 N 日最大下跌日成交量，可叠加趋势与追高过滤。',
  help: [
    '1. 当日收涨，且涨幅大于"最小涨幅"。',
    '2. 当日成交量 > 前 N 日（下跌日回看天数）里所有下跌日中最大的成交量 × 量能倍数。含义：今天买方的力量超过了最近卖方最用力的一天。',
    '3. 可选：收盘在趋势均线之上（处于上升趋势）。',
    '4. 可选：收盘不高于短均线一定比例（不是已经涨飞了才追）。',
    '5. 同一标的在冷却天数内只算一次。',
    '该策略没有离场规则，只看固定持有期结果。',
  ],
  paramSchema,
  defaultParams: defaultsFromSchema(paramSchema),
  /** Bars before the signal that the rule depends on (used by the split guard). */
  warmupBars: p => Math.max(p.downVolLookback + 1, p.useTrendFilter ? p.trendMaPeriod : 0, p.useExtensionFilter ? p.extMaPeriod : 0),
  detect,
};

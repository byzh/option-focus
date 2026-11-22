// Trade simulation for strategies that define their own exit rule.
// One position per symbol at a time: signals during an open trade are skipped.
import { jumpPrefix, hasJump, inDateRange, entryOf, benchmarkReturn } from './eventStudy';

/**
 * @param {object} args
 * @param {Array} args.candles
 * @param {number[]} args.signals - ascending signal indices
 * @param {Function} args.exitRule - (signalIdx) => exitIdx | null
 * @param {object|null} args.benchmark
 * @param {number} args.warmupBars
 * @param {object} args.params - validated EVAL params (entryMode, splitJumpPct, startDate, endDate)
 * @returns {{ trades: Array, excluded: number, open: number }}
 */
export function simulateTrades({ candles, signals, exitRule, benchmark, warmupBars = 0, params }) {
  const prefix = jumpPrefix(candles, params.splitJumpPct);
  const trades = [];
  let busyUntil = -1;
  let excluded = 0;
  let open = 0;

  for (const i of signals) {
    if (i <= busyUntil) continue;
    const sig = candles[i];
    if (!sig || !inDateRange(sig.date, params)) continue;

    const entry = entryOf(candles, i, params.entryMode);
    if (!entry) { open++; continue; }
    const exitIdx = exitRule(i);
    if (exitIdx == null) { open++; continue; }
    busyUntil = exitIdx;

    if (hasJump(prefix, i - warmupBars, exitIdx)) { excluded++; continue; }

    const exit = candles[exitIdx];
    const ret = exit.close / entry.price - 1;
    const br = benchmarkReturn(benchmark, entry.date, entry.field, exit.date);
    trades.push({
      date: sig.date,
      exitDate: exit.date,
      entryPrice: entry.price,
      exitPrice: exit.close,
      holdBars: exitIdx - i,
      ret,
      excess: br == null ? null : ret - br,
    });
  }
  return { trades, excluded, open };
}

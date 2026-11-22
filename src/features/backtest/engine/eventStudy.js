// Strategy-agnostic event study: given bars and signal indices, measure what happened next.

/** prefix[k] = number of bars in [1, k] whose close-to-close move exceeds the threshold. */
export function jumpPrefix(candles, thresholdPct) {
  const prefix = new Array(candles.length).fill(0);
  for (let k = 1; k < candles.length; k++) {
    const move = Math.abs(candles[k].close / candles[k - 1].close - 1) * 100;
    prefix[k] = prefix[k - 1] + (move > thresholdPct ? 1 : 0);
  }
  return prefix;
}

export function hasJump(prefix, from, to) {
  const a = Math.max(1, from);
  const b = Math.min(prefix.length - 1, to);
  if (b < a) return false;
  return prefix[b] - prefix[a - 1] > 0;
}

export function inDateRange(date, { startDate, endDate }) {
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

export function entryOf(candles, i, nextOpen) {
  if (nextOpen) {
    const bar = candles[i + 1];
    return bar ? { price: bar.open, date: bar.date, field: 'open' } : null;
  }
  return { price: candles[i].close, date: candles[i].date, field: 'close' };
}

/** Benchmark lookup: { byDate: Map<date, index>, candles } or null. */
export function buildBenchmark(candles) {
  if (!candles?.length) return null;
  return { candles, byDate: new Map(candles.map((c, i) => [c.date, i])) };
}

export function benchmarkReturn(bench, entryDate, entryField, exitDate) {
  if (!bench) return null;
  const a = bench.byDate.get(entryDate);
  const b = bench.byDate.get(exitDate);
  if (a == null || b == null) return null;
  const entry = bench.candles[a][entryField];
  return bench.candles[b].close / entry - 1;
}

/**
 * @param {object} args
 * @param {Array} args.candles - sorted daily bars
 * @param {number[]} args.signals - signal bar indices
 * @param {object|null} args.benchmark - from buildBenchmark
 * @param {number} args.warmupBars - bars before the signal covered by the split guard
 * @param {object} args.params - validated EVAL params
 * @returns {{ events: Array, excluded: number }}
 */
export function runEventStudy({ candles, signals, benchmark, warmupBars = 0, params }) {
  const { entryMode, horizons, pullbackWindow, splitJumpPct } = params;
  const maxH = Math.max(...horizons, pullbackWindow);
  const prefix = jumpPrefix(candles, splitJumpPct);
  const events = [];
  let excluded = 0;

  for (const i of signals) {
    const sig = candles[i];
    if (!sig || !inDateRange(sig.date, params)) continue;
    if (hasJump(prefix, i - warmupBars, i + maxH)) { excluded++; continue; }

    const entry = entryOf(candles, i, entryMode);
    const returns = {};
    const excess = {};
    for (const h of horizons) {
      const exit = candles[i + h];
      if (!entry || !exit) { returns[h] = null; excess[h] = null; continue; }
      const r = exit.close / entry.price - 1;
      returns[h] = r;
      const br = benchmarkReturn(benchmark, entry.date, entry.field, exit.date);
      excess[h] = br == null ? null : r - br;
    }

    let pullback = null;
    const endIdx = i + pullbackWindow;
    if (entry && candles[endIdx]) {
      let minLow = Infinity;
      let maxHigh = -Infinity;
      for (let k = i + 1; k <= endIdx; k++) {
        if (candles[k].low < minLow) minLow = candles[k].low;
        if (candles[k].high > maxHigh) maxHigh = candles[k].high;
      }
      const retest = minLow <= sig.low;
      pullback = {
        retest,
        recovered: retest && candles[endIdx].close > entry.price,
        mae: minLow / entry.price - 1,
        mfe: maxHigh / entry.price - 1,
      };
    }

    events.push({ date: sig.date, index: i, close: sig.close, entryPrice: entry?.price ?? null, returns, excess, pullback });
  }
  return { events, excluded };
}

/**
 * Unconditional base rate: same entry/exit rules applied to every bar in range.
 * Returns additive accumulators so results can be merged across symbols.
 */
export function baselineAccumulator(candles, params) {
  const { entryMode, horizons, splitJumpPct } = params;
  const prefix = jumpPrefix(candles, splitJumpPct);
  const acc = Object.fromEntries(horizons.map(h => [h, { n: 0, wins: 0, sum: 0 }]));

  for (let i = 1; i < candles.length; i++) {
    if (!inDateRange(candles[i].date, params)) continue;
    const entry = entryOf(candles, i, entryMode);
    if (!entry) continue;
    for (const h of horizons) {
      const exit = candles[i + h];
      if (!exit || hasJump(prefix, i, i + h)) continue;
      const r = exit.close / entry.price - 1;
      const a = acc[h];
      a.n++;
      a.sum += r;
      if (r > 0) a.wins++;
    }
  }
  return acc;
}

export function mergeAccumulators(target, source) {
  for (const [h, s] of Object.entries(source)) {
    const t = target[h] ?? (target[h] = { n: 0, wins: 0, sum: 0 });
    t.n += s.n;
    t.wins += s.wins;
    t.sum += s.sum;
  }
  return target;
}

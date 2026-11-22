import { runEventStudy, baselineAccumulator, mergeAccumulators, buildBenchmark } from './eventStudy';
import { summarizeByHorizon, summarizePullback, summarizeBaseline, summarizeReturns } from './aggregate';

export const BENCHMARK_SYMBOL = 'SPY';
const RECENT_LIMIT = 100;

/**
 * Pure orchestration: strategy x data x evaluation params -> report.
 * @param {object} args
 * @param {object} args.strategy - registry entry
 * @param {object} args.strategyParams - validated
 * @param {object} args.evalParams - validated
 * @param {Map<string, Array>} args.data - symbol -> sorted daily bars
 * @param {string[]} args.symbols - symbols to test (benchmark excluded unless listed)
 */
export function runBacktest({ strategy, strategyParams, evalParams, data, symbols }) {
  const bench = buildBenchmark(data.get(BENCHMARK_SYMBOL));
  const warmupBars = strategy.warmupBars(strategyParams);
  const { horizons } = evalParams;

  const allEvents = [];
  const bySymbol = [];
  const baseAcc = {};
  let excluded = 0;

  for (const symbol of symbols) {
    const candles = data.get(symbol);
    if (!candles?.length) continue;

    const signals = strategy.detect(candles, strategyParams);
    const res = runEventStudy({ candles, signals, benchmark: bench, warmupBars, params: evalParams });
    excluded += res.excluded;
    mergeAccumulators(baseAcc, baselineAccumulator(candles, evalParams));

    const events = res.events.map(e => ({ ...e, symbol }));
    allEvents.push(...events);
    bySymbol.push({
      symbol,
      bars: candles.length,
      firstDate: candles[0].date,
      lastDate: candles[candles.length - 1].date,
      nSignals: events.length,
      lastSignalDate: events.length ? events[events.length - 1].date : null,
      byHorizon: Object.fromEntries(horizons.map(h => [h, summarizeReturns(events.map(e => e.returns[h]))])),
    });
  }

  const recent = [...allEvents].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, RECENT_LIMIT);

  return {
    horizons,
    totalSignals: allEvents.length,
    excluded,
    symbolsTested: bySymbol.length,
    hasBenchmark: Boolean(bench),
    summary: summarizeByHorizon(allEvents, horizons),
    baseline: summarizeBaseline(baseAcc, horizons),
    pullback: summarizePullback(allEvents),
    pullbackWindow: evalParams.pullbackWindow,
    bySymbol,
    recent,
  };
}

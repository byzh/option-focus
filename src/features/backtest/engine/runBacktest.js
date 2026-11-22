import { runEventStudy, baselineAccumulator, mergeAccumulators, buildBenchmark } from './eventStudy';
import { simulateTrades } from './tradeSim';
import { summarizeByHorizon, summarizePullback, summarizeBaseline, summarizeReturns, summarizeTrades } from './aggregate';

export const BENCHMARK_SYMBOL = 'SPY';
const RECENT_LIMIT = 100;

function range(n) {
  return Array.from({ length: n }, (_, k) => k + 1);
}

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
  const hasExit = typeof strategy.makeExitRule === 'function';
  const holdHorizons = hasExit ? range(strategy.maxHoldBars(strategyParams)) : null;

  const allEvents = [];
  const allTrades = [];
  const bySymbol = [];
  const baseAcc = {};
  const holdAcc = {};
  let excluded = 0;
  let tradeExcluded = 0;
  let openTrades = 0;

  for (const symbol of symbols) {
    const candles = data.get(symbol);
    if (!candles?.length) continue;

    const signals = strategy.detect(candles, strategyParams);
    const res = runEventStudy({ candles, signals, benchmark: bench, warmupBars, params: evalParams });
    excluded += res.excluded;
    mergeAccumulators(baseAcc, baselineAccumulator(candles, evalParams));

    let trades = [];
    if (hasExit) {
      const sim = simulateTrades({
        candles, signals, exitRule: strategy.makeExitRule(candles, strategyParams),
        benchmark: bench, warmupBars, params: evalParams,
      });
      trades = sim.trades.map(t => ({ ...t, symbol }));
      tradeExcluded += sim.excluded;
      openTrades += sim.open;
      allTrades.push(...trades);
      mergeAccumulators(holdAcc, baselineAccumulator(candles, { ...evalParams, horizons: holdHorizons }));
    }

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
      trade: hasExit ? summarizeReturns(trades.map(t => t.ret)) : null,
    });
  }

  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  return {
    strategyName: strategy.name,
    horizons,
    totalSignals: allEvents.length,
    excluded,
    symbolsTested: bySymbol.length,
    hasBenchmark: Boolean(bench),
    summary: summarizeByHorizon(allEvents, horizons),
    baseline: summarizeBaseline(baseAcc, horizons),
    pullback: summarizePullback(allEvents),
    pullbackWindow: evalParams.pullbackWindow,
    trades: hasExit
      ? {
        summary: summarizeTrades(allTrades, holdAcc),
        excluded: tradeExcluded,
        open: openTrades,
        recent: [...allTrades].sort(byDateDesc).slice(0, RECENT_LIMIT),
      }
      : null,
    bySymbol,
    recent: [...allEvents].sort(byDateDesc).slice(0, RECENT_LIMIT),
  };
}

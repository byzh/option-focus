import { describe, it, expect } from 'vitest';
import { sma } from './engine/indicators';
import { validateParams, toFormValues } from './engine/params';
import { pocketPivot } from './strategies/pocketPivot';
import { runEventStudy, buildBenchmark, baselineAccumulator } from './engine/eventStudy';
import { summarizeReturns, summarizePullback } from './engine/aggregate';
import { runBacktest } from './engine/runBacktest';
import { EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS } from './engine/evalParams';
import { parseCandleValues, baseSymbol, dropIncompleteBar, CANDLE_FIELDS } from './data/dxFeedCandles';

function bars(rows, start = Date.UTC(2024, 0, 1)) {
  return rows.map(([close, volume, low, high, open], i) => {
    const time = start + i * 86400000;
    return {
      date: new Date(time).toISOString().slice(0, 10),
      time,
      open: open ?? close,
      high: high ?? close,
      low: low ?? close,
      close,
      volume,
    };
  });
}

const NO_FILTERS = { ...pocketPivot.defaultParams, useTrendFilter: false, useExtensionFilter: false, cooldownDays: 0 };

describe('sma', () => {
  it('returns null until the window is full', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });
});

describe('validateParams', () => {
  it('parses and range-checks values', () => {
    const { values, errors } = validateParams(EVAL_PARAM_SCHEMA, toFormValues(EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS));
    expect(errors).toEqual({});
    expect(values.horizons).toEqual([1, 5, 10, 20, 60]);
  });

  it('reports invalid input', () => {
    const raw = { ...toFormValues(EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS), pullbackWindow: '1.5', horizons: '5,abc', startDate: '2024/01/01' };
    const { errors } = validateParams(EVAL_PARAM_SCHEMA, raw);
    expect(Object.keys(errors).sort()).toEqual(['horizons', 'pullbackWindow', 'startDate']);
  });
});

describe('pocketPivot.detect', () => {
  // closes alternate so there are down days; day 11 is up on volume above every down-day volume
  const base = [
    [10, 100], [9.9, 300], [10, 100], [9.8, 250], [9.9, 100], [9.7, 280],
    [9.8, 100], [9.6, 200], [9.7, 100], [9.5, 290], [9.6, 100],
  ];

  it('fires when up-day volume beats the max down-day volume', () => {
    const c = bars([...base, [9.9, 301]]);
    expect(pocketPivot.detect(c, NO_FILTERS)).toEqual([11]);
  });

  it('does not fire when volume does not exceed the max down-day volume', () => {
    const c = bars([...base, [9.9, 290]]);
    expect(pocketPivot.detect(c, NO_FILTERS)).toEqual([]);
  });

  it('does not fire on a down close', () => {
    const c = bars([...base, [9.5, 1000]]);
    expect(pocketPivot.detect(c, NO_FILTERS)).toEqual([]);
  });

  it('respects volume multiplier', () => {
    const c = bars([...base, [9.9, 400]]);
    expect(pocketPivot.detect(c, { ...NO_FILTERS, volMultiplier: 1.5 })).toEqual([]);
    expect(pocketPivot.detect(c, { ...NO_FILTERS, volMultiplier: 1.3 })).toEqual([11]);
  });

  it('applies the trend filter', () => {
    const c = bars([...base, [9.9, 301]]);
    // 50-day MA not available on 12 bars -> filtered out
    expect(pocketPivot.detect(c, { ...NO_FILTERS, useTrendFilter: true, trendMaPeriod: 50 })).toEqual([]);
    // 5-day MA of the last closes is below 9.9 -> passes
    expect(pocketPivot.detect(c, { ...NO_FILTERS, useTrendFilter: true, trendMaPeriod: 5 })).toEqual([11]);
  });

  it('applies the extension filter', () => {
    const c = bars([...base, [11, 301]]);
    expect(pocketPivot.detect(c, { ...NO_FILTERS, useExtensionFilter: true, extMaPeriod: 5, maxExtensionPct: 5 })).toEqual([]);
    expect(pocketPivot.detect(c, { ...NO_FILTERS, useExtensionFilter: true, extMaPeriod: 5, maxExtensionPct: 20 })).toEqual([11]);
  });

  it('applies the cooldown', () => {
    const c = bars([...base, [9.9, 301], [10.0, 50], [9.9, 60], [10.1, 400]]);
    expect(pocketPivot.detect(c, { ...NO_FILTERS, cooldownDays: 0 })).toEqual([11, 14]);
    expect(pocketPivot.detect(c, { ...NO_FILTERS, cooldownDays: 5 })).toEqual([11]);
  });
});

describe('runEventStudy', () => {
  const params = { ...DEFAULT_EVAL_PARAMS, horizons: [1, 2], pullbackWindow: 2, startDate: '', endDate: '' };
  // [close, volume, low, high, open]
  const c = bars([[10, 1, 9.5, 10], [11, 1, 10, 11.2], [12, 1, 11, 12, 10.5], [9.8, 1, 9.0, 12.5, 11]]);

  it('uses next-day open as entry and computes forward returns', () => {
    const { events } = runEventStudy({ candles: c, signals: [1], benchmark: null, params });
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.entryPrice).toBe(10.5);
    expect(e.returns[1]).toBeCloseTo(12 / 10.5 - 1);
    expect(e.returns[2]).toBeCloseTo(9.8 / 10.5 - 1);
    expect(e.excess[1]).toBeNull();
  });

  it('flags a retest of the signal-day low', () => {
    const { events } = runEventStudy({ candles: c, signals: [1], benchmark: null, params });
    expect(events[0].pullback.retest).toBe(true);
    expect(events[0].pullback.recovered).toBe(false);
    expect(events[0].pullback.mae).toBeCloseTo(9.0 / 10.5 - 1);
    expect(events[0].pullback.mfe).toBeCloseTo(12.5 / 10.5 - 1);
  });

  it('uses signal close when next-open entry is off', () => {
    const { events } = runEventStudy({ candles: c, signals: [1], benchmark: null, params: { ...params, entryMode: false } });
    expect(events[0].entryPrice).toBe(11);
  });

  it('leaves horizons beyond the data as null', () => {
    const { events } = runEventStudy({ candles: c, signals: [2], benchmark: null, params });
    expect(events[0].returns[1]).toBeCloseTo(9.8 / 11 - 1);
    expect(events[0].returns[2]).toBeNull();
    expect(events[0].pullback).toBeNull();
  });

  it('excludes samples around suspected splits', () => {
    const split = bars([[100, 1], [101, 1], [102, 1], [25, 1], [26, 1]]);
    const { events, excluded } = runEventStudy({ candles: split, signals: [1], benchmark: null, params });
    expect(events).toHaveLength(0);
    expect(excluded).toBe(1);
  });

  it('computes excess return against the benchmark on matching dates', () => {
    const bench = buildBenchmark(bars([[100, 1], [100, 1], [101, 1, 100, 101, 100], [102, 1]]));
    const { events } = runEventStudy({ candles: c, signals: [1], benchmark: bench, params });
    expect(events[0].excess[1]).toBeCloseTo((12 / 10.5 - 1) - (101 / 100 - 1));
  });

  it('filters signals by date range', () => {
    const { events } = runEventStudy({ candles: c, signals: [1], benchmark: null, params: { ...params, startDate: '2024-01-03' } });
    expect(events).toHaveLength(0);
  });
});

describe('baselineAccumulator', () => {
  it('counts every bar with a complete forward window', () => {
    const c = bars([[10, 1], [11, 1, 11, 11, 10], [12, 1, 12, 12, 11], [11, 1, 11, 11, 12]]);
    const acc = baselineAccumulator(c, { ...DEFAULT_EVAL_PARAMS, horizons: [1], startDate: '', endDate: '' });
    // entries at i=1 (open 11 -> close 12) and i=2 (open 12 -> close 11)
    expect(acc[1].n).toBe(2);
    expect(acc[1].wins).toBe(1);
  });
});

describe('aggregate', () => {
  it('summarizes returns ignoring nulls', () => {
    const s = summarizeReturns([0.1, -0.05, null, 0.02]);
    expect(s.n).toBe(3);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.median).toBeCloseTo(0.02);
  });

  it('summarizes pullbacks', () => {
    const p = summarizePullback([
      { pullback: { retest: true, recovered: true, mae: -0.05, mfe: 0.1 } },
      { pullback: { retest: false, recovered: false, mae: -0.01, mfe: 0.2 } },
      { pullback: null },
    ]);
    expect(p.n).toBe(2);
    expect(p.retestRate).toBe(0.5);
    expect(p.recoveredRate).toBe(1);
  });
});

describe('runBacktest', () => {
  it('produces a report for the selected symbols only', () => {
    const rows = [];
    for (let i = 0; i < 120; i++) rows.push([100 + i * 0.5 + (i % 2 ? -1 : 1), i % 14 === 0 ? 5000 : 1000]); // even i = up day
    const data = new Map([['AAA', bars(rows)], ['SPY', bars(rows)]]);
    const { values: evalParams } = validateParams(EVAL_PARAM_SCHEMA, toFormValues(EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS));
    const report = runBacktest({ strategy: pocketPivot, strategyParams: pocketPivot.defaultParams, evalParams, data, symbols: ['AAA'] });
    expect(report.symbolsTested).toBe(1);
    expect(report.hasBenchmark).toBe(true);
    expect(report.summary.map(s => s.horizon)).toEqual([1, 5, 10, 20, 60]);
    expect(report.totalSignals).toBeGreaterThan(0);
  });
});

describe('dxFeedCandles parsing', () => {
  it('normalizes candle symbols', () => {
    expect(baseSymbol('AAPL{=1d}')).toBe('AAPL');
    expect(baseSymbol('BRK.B{=d}')).toBe('BRK.B');
    expect(baseSymbol('<script>')).toBeNull();
    expect(baseSymbol(42)).toBeNull();
  });

  it('parses valid rows and rejects malformed ones', () => {
    const t = Date.UTC(2024, 4, 1);
    const values = [
      'AAPL{=1d}', 0, t, 1, 2, 0.5, 1.5, 1000,
      'AAPL{=1d}', 0, t, 'NaN', 2, 0.5, 1.5, 1000,
      'AAPL{=1d}', 2, t, 1, 2, 0.5, 1.5, 1000, // REMOVE flag
      'AAPL{=1d}', 8, t, 1, 0.4, 0.5, 1.5, 1000, // high < low, SNAPSHOT_END
    ];
    const rows = parseCandleValues(values, CANDLE_FIELDS);
    expect(rows).toHaveLength(4);
    expect(rows[0].candle).toMatchObject({ date: '2024-05-01', close: 1.5, volume: 1000 });
    expect(rows[1].candle).toBeNull();
    expect(rows[2].candle).toBeNull();
    expect(rows[3].candle).toBeNull();
    expect(rows[3].flags).toBe(8);
  });

  it('honours server field order', () => {
    const t = Date.UTC(2024, 4, 1);
    const order = ['eventSymbol', 'time', 'close', 'open', 'high', 'low', 'volume', 'eventFlags'];
    const rows = parseCandleValues(['MSFT{=1d}', t, 3, 2, 4, 1, 10, 0], order);
    expect(rows[0].candle).toMatchObject({ open: 2, high: 4, low: 1, close: 3 });
  });

  it('drops today\'s bar during the session only', () => {
    const c = bars([[1, 1], [2, 1]], Date.UTC(2024, 4, 1));
    const midSession = Date.UTC(2024, 4, 2, 15, 0); // 11:00 ET
    const afterClose = Date.UTC(2024, 4, 2, 21, 0); // 17:00 ET
    expect(dropIncompleteBar(c, midSession)).toHaveLength(1);
    expect(dropIncompleteBar(c, afterClose)).toHaveLength(2);
  });
});

describe('runHistory', () => {
  it('lists only parameters that differ from defaults', async () => {
    const { diffFromDefaults } = await import('./engine/runHistory');
    const changed = { ...pocketPivot.defaultParams, volMultiplier: 1.5, useTrendFilter: false };
    expect(diffFromDefaults(pocketPivot.paramSchema, changed, pocketPivot.defaultParams))
      .toEqual(['量能倍数=1.5', '启用趋势过滤=关']);
    expect(diffFromDefaults(pocketPivot.paramSchema, pocketPivot.defaultParams, pocketPivot.defaultParams)).toEqual([]);
  });

  it('records win-rate edge vs baseline per horizon', async () => {
    const { makeRunRecord } = await import('./engine/runHistory');
    const report = {
      totalSignals: 10,
      horizons: [5],
      summary: [{ horizon: 5, n: 10, winRate: 0.6, excessMean: 0.01 }],
      baseline: [{ horizon: 5, winRate: 0.55 }],
    };
    const r = makeRunRecord({
      id: 1, at: '12:00:00', strategy: pocketPivot,
      strategyParams: pocketPivot.defaultParams, evalParams: DEFAULT_EVAL_PARAMS,
      evalSchema: EVAL_PARAM_SCHEMA, evalDefaults: DEFAULT_EVAL_PARAMS, report,
    });
    expect(r.edges[5].winEdge).toBeCloseTo(0.05);
    expect(r.changes).toEqual([]);
  });
});

describe('describeServerError', () => {
  it('keeps only short server text', async () => {
    const { describeServerError } = await import('./data/dxFeedCandles');
    expect(describeServerError({ error: 'INVALID_MESSAGE', message: 'bad symbol' })).toBe('INVALID_MESSAGE: bad symbol');
    expect(describeServerError({})).toBe('未知错误');
    expect(describeServerError({ message: 'x'.repeat(500) })).toHaveLength(200);
  });
});

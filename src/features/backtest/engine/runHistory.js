// Pure helpers for the "compare runs" table.

function same(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function show(field, v) {
  if (field.type === 'bool') return v ? '开' : '关';
  if (Array.isArray(v)) return v.join(',');
  if (v === '' || v == null) return '不限';
  return String(v);
}

/** Human-readable list of parameters that differ from the defaults. */
export function diffFromDefaults(schema, values, defaults) {
  return schema
    .filter(f => !same(values[f.key], defaults[f.key]))
    .map(f => `${f.label}=${show(f, values[f.key])}`);
}

/**
 * Compact record of one backtest run.
 * edges[h] = { winEdge, excessMean } where winEdge = win rate minus baseline win rate.
 */
export function makeRunRecord({ id, at, strategy, strategyParams, evalParams, evalSchema, evalDefaults, report }) {
  const baseBy = Object.fromEntries(report.baseline.map(b => [b.horizon, b]));
  const edges = {};
  for (const s of report.summary) {
    const b = baseBy[s.horizon];
    edges[s.horizon] = {
      n: s.n,
      winEdge: s.winRate != null && b?.winRate != null ? s.winRate - b.winRate : null,
      excessMean: s.excessMean,
    };
  }
  return {
    id,
    at,
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategyParams,
    evalParams,
    changes: [
      ...diffFromDefaults(strategy.paramSchema, strategyParams, strategy.defaultParams),
      ...diffFromDefaults(evalSchema, evalParams, evalDefaults),
    ],
    totalSignals: report.totalSignals,
    horizons: report.horizons,
    edges,
  };
}

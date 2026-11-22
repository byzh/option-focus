// Turn per-event results into summary statistics.

function median(sorted) {
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function summarizeReturns(values) {
  const xs = values.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  return {
    n: xs.length,
    mean: mean(xs),
    median: median(xs),
    winRate: xs.length ? xs.filter(v => v > 0).length / xs.length : null,
    p25: xs.length ? xs[Math.floor((xs.length - 1) * 0.25)] : null,
    p75: xs.length ? xs[Math.floor((xs.length - 1) * 0.75)] : null,
  };
}

export function summarizeByHorizon(events, horizons) {
  return horizons.map(h => {
    const ret = summarizeReturns(events.map(e => e.returns[h]));
    const exc = summarizeReturns(events.map(e => e.excess[h]));
    return { horizon: h, ...ret, excessMean: exc.mean, beatRate: exc.winRate, nExcess: exc.n };
  });
}

export function summarizePullback(events) {
  const ps = events.map(e => e.pullback).filter(Boolean);
  const retests = ps.filter(p => p.retest);
  return {
    n: ps.length,
    retestRate: ps.length ? retests.length / ps.length : null,
    recoveredRate: retests.length ? retests.filter(p => p.recovered).length / retests.length : null,
    noRetestRate: ps.length ? 1 - retests.length / ps.length : null,
    maeMean: mean(ps.map(p => p.mae)),
    maeMedian: median(ps.map(p => p.mae).sort((a, b) => a - b)),
    mfeMean: mean(ps.map(p => p.mfe)),
  };
}

/**
 * Trade-level statistics. `baseAcc` holds unconditional results per holding
 * length, so the baseline is matched to the trades' own holding periods.
 */
export function summarizeTrades(trades, baseAcc) {
  const rets = trades.map(t => t.ret);
  const wins = rets.filter(r => r > 0);
  const losses = rets.filter(r => r <= 0);
  const sumWin = wins.reduce((a, b) => a + b, 0);
  const sumLoss = losses.reduce((a, b) => a + b, 0);
  const avgWin = mean(wins);
  const avgLoss = mean(losses);
  const exc = summarizeReturns(trades.map(t => t.excess));
  const ret = summarizeReturns(rets);

  let baseWin = 0;
  let baseMean = 0;
  let matched = 0;
  for (const t of trades) {
    const a = baseAcc?.[t.holdBars];
    if (!a?.n) continue;
    baseWin += a.wins / a.n;
    baseMean += a.sum / a.n;
    matched++;
  }

  return {
    n: trades.length,
    winRate: ret.winRate,
    mean: ret.mean,
    median: ret.median,
    avgWin,
    avgLoss,
    payoff: avgWin != null && avgLoss != null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null,
    profitFactor: sumLoss < 0 ? sumWin / Math.abs(sumLoss) : null,
    avgHold: mean(trades.map(t => t.holdBars)),
    excessMean: exc.mean,
    beatRate: exc.winRate,
    baseWinRate: matched ? baseWin / matched : null,
    baseMean: matched ? baseMean / matched : null,
  };
}

export function summarizeBaseline(acc, horizons) {
  return horizons.map(h => {
    const a = acc[h] ?? { n: 0, wins: 0, sum: 0 };
    return { horizon: h, n: a.n, mean: a.n ? a.sum / a.n : null, winRate: a.n ? a.wins / a.n : null };
  });
}

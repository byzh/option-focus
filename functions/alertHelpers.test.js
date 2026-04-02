'use strict';

const {
  assessLeapsHealth,
  calculateDTE,
  collectPutWarnings,
  collectLeapsWarnings,
  collectCCWarnings,
  collectPMCCWarnings,
  buildNotificationBody,
} = require('./alertHelpers');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ─── assessLeapsHealth ────────────────────────────────────────────────────────

describe('assessLeapsHealth', () => {
  it('returns unknown when delta or dte is null', () => {
    expect(assessLeapsHealth(null, 0.8).level).toBe('unknown');
    expect(assessLeapsHealth(200, null).level).toBe('unknown');
  });

  it('returns danger when |delta| < 0.60', () => {
    expect(assessLeapsHealth(200, 0.55).level).toBe('danger');
  });

  it('returns roll when dte < 90 and delta >= 0.60', () => {
    expect(assessLeapsHealth(60, 0.80).level).toBe('roll');
  });

  it('returns ok when dte > 365 and delta >= 0.75', () => {
    expect(assessLeapsHealth(400, 0.76).level).toBe('ok');
  });

  it('returns warn when dte > 365 and delta < 0.75', () => {
    expect(assessLeapsHealth(400, 0.72).level).toBe('warn');
  });

  it('returns ok when dte 180-365 and delta >= 0.80', () => {
    expect(assessLeapsHealth(200, 0.82).level).toBe('ok');
  });

  it('returns warn when dte 180-365 and delta < 0.80', () => {
    expect(assessLeapsHealth(200, 0.78).level).toBe('warn');
  });

  it('returns ok when dte 90-180 and delta >= 0.85', () => {
    expect(assessLeapsHealth(120, 0.86).level).toBe('ok');
  });

  it('returns warn when dte 90-180 and delta < 0.85', () => {
    expect(assessLeapsHealth(120, 0.82).level).toBe('warn');
  });
});

// ─── collectPutWarnings ───────────────────────────────────────────────────────

describe('collectPutWarnings', () => {
  it('returns empty when no positions', () => {
    expect(collectPutWarnings([], new Map())).toHaveLength(0);
  });

  it('includes PUT when |delta| > 0.5', () => {
    const pos = [{ id: 'p1', ticker: 'SPY', strike: '500', expiration: daysFromNow(30) }];
    const deltaMap = new Map([['p1', -0.62]]);
    const result = collectPutWarnings(pos, deltaMap);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('PUT');
    expect(result[0].ticker).toBe('SPY');
  });

  it('excludes PUT when |delta| <= 0.5', () => {
    const pos = [{ id: 'p1', ticker: 'SPY', strike: '500', expiration: daysFromNow(30) }];
    const deltaMap = new Map([['p1', -0.45]]);
    expect(collectPutWarnings(pos, deltaMap)).toHaveLength(0);
  });

  it('excludes PUT when delta is missing from map', () => {
    const pos = [{ id: 'p1', ticker: 'SPY', strike: '500', expiration: daysFromNow(30) }];
    expect(collectPutWarnings(pos, new Map())).toHaveLength(0);
  });
});

// ─── collectLeapsWarnings ─────────────────────────────────────────────────────

describe('collectLeapsWarnings', () => {
  it('returns empty when no positions', () => {
    expect(collectLeapsWarnings([], new Map())).toHaveLength(0);
  });

  it('includes LEAPS when health is warn', () => {
    const pos = [{ id: 'l1', ticker: 'AAPL', expiration: daysFromNow(200) }];
    const deltaMap = new Map([['l1', 0.75]]); // DTE 200, need >= 0.80 → warn
    const result = collectLeapsWarnings(pos, deltaMap);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('LEAPS');
  });

  it('excludes LEAPS when health is ok', () => {
    const pos = [{ id: 'l1', ticker: 'AAPL', expiration: daysFromNow(200) }];
    const deltaMap = new Map([['l1', 0.82]]); // DTE 200, >= 0.80 → ok
    expect(collectLeapsWarnings(pos, deltaMap)).toHaveLength(0);
  });

  it('includes LEAPS when health is danger', () => {
    const pos = [{ id: 'l1', ticker: 'AAPL', expiration: daysFromNow(200) }];
    const deltaMap = new Map([['l1', 0.55]]); // < 0.60 → danger
    expect(collectLeapsWarnings(pos, deltaMap)).toHaveLength(1);
  });

  it('includes LEAPS when health is roll (DTE < 90)', () => {
    const pos = [{ id: 'l1', ticker: 'AAPL', expiration: daysFromNow(60) }];
    const deltaMap = new Map([['l1', 0.82]]);
    expect(collectLeapsWarnings(pos, deltaMap)).toHaveLength(1);
  });
});

// ─── collectCCWarnings ────────────────────────────────────────────────────────

describe('collectCCWarnings', () => {
  it('returns empty when no stocks', () => {
    expect(collectCCWarnings([])).toHaveLength(0);
  });

  it('warns when stock has no covered calls', () => {
    const positions = [
      { id: 's1', ticker: 'AAPL', assetType: 'STOCK', status: 'OPEN', contracts: 100 },
    ];
    const result = collectCCWarnings(positions);
    expect(result).toHaveLength(1);
    expect(result[0].uncoveredShares).toBe(100);
  });

  it('warns when stock is partially covered', () => {
    const positions = [
      { id: 's1', ticker: 'AAPL', assetType: 'STOCK', status: 'OPEN', contracts: 200 },
      { id: 'c1', ticker: 'AAPL', assetType: 'OPTION', type: 'CALL', direction: 'SELL', status: 'OPEN', contracts: 1, leapsId: null },
    ];
    const result = collectCCWarnings(positions);
    expect(result).toHaveLength(1);
    expect(result[0].uncoveredShares).toBe(100);
  });

  it('no warning when fully covered', () => {
    const positions = [
      { id: 's1', ticker: 'AAPL', assetType: 'STOCK', status: 'OPEN', contracts: 100 },
      { id: 'c1', ticker: 'AAPL', assetType: 'OPTION', type: 'CALL', direction: 'SELL', status: 'OPEN', contracts: 1, leapsId: null },
    ];
    expect(collectCCWarnings(positions)).toHaveLength(0);
  });
});

// ─── collectPMCCWarnings ──────────────────────────────────────────────────────

describe('collectPMCCWarnings', () => {
  it('returns empty when no LEAPS', () => {
    expect(collectPMCCWarnings([])).toHaveLength(0);
  });

  it('warns when LEAPS has no linked short call', () => {
    const positions = [
      { id: 'l1', ticker: 'SPY', assetType: 'OPTION', type: 'CALL', direction: 'BUY', status: 'OPEN', contracts: 1, expiration: daysFromNow(120) },
    ];
    const result = collectPMCCWarnings(positions);
    expect(result).toHaveLength(1);
    expect(result[0].uncoveredContracts).toBe(1);
  });

  it('no warning when LEAPS is fully covered', () => {
    const positions = [
      { id: 'l1', ticker: 'SPY', assetType: 'OPTION', type: 'CALL', direction: 'BUY', status: 'OPEN', contracts: 1, expiration: daysFromNow(120) },
      { id: 'c1', ticker: 'SPY', assetType: 'OPTION', type: 'CALL', direction: 'SELL', status: 'OPEN', contracts: 1, leapsId: 'l1' },
    ];
    expect(collectPMCCWarnings(positions)).toHaveLength(0);
  });

  it('excludes LEAPS with DTE <= 90', () => {
    const positions = [
      { id: 'l1', ticker: 'SPY', assetType: 'OPTION', type: 'CALL', direction: 'BUY', status: 'OPEN', contracts: 1, expiration: daysFromNow(60) },
    ];
    expect(collectPMCCWarnings(positions)).toHaveLength(0);
  });
});

// ─── buildNotificationBody ────────────────────────────────────────────────────

describe('buildNotificationBody', () => {
  it('returns normal message with VIX when no warnings', () => {
    const body = buildNotificationBody([], 14.5);
    expect(body).toBe('所有持仓状态正常 · VIX: 14.5');
  });

  it('returns normal message without VIX when vix is null', () => {
    const body = buildNotificationBody([], null);
    expect(body).toBe('所有持仓状态正常');
  });

  it('includes PUT warning line', () => {
    const warnings = [{ type: 'PUT', ticker: 'SPY', strike: '500', expiration: '2026-05-16', message: 'Δ-0.62 偏高' }];
    const body = buildNotificationBody(warnings, null);
    expect(body).toContain('[PUT] SPY $500 (2026-05-16) Δ-0.62 偏高');
  });

  it('includes LEAPS warning line', () => {
    const warnings = [{ type: 'LEAPS', ticker: 'AAPL', expiration: '2027-01-15', message: 'Δ0.75 偏低 (建议 ≥0.80)' }];
    const body = buildNotificationBody(warnings, null);
    expect(body).toContain('[LEAPS] AAPL (2027-01-15)');
  });

  it('includes CC warning line', () => {
    const warnings = [{ type: 'CC', ticker: 'AAPL', uncoveredShares: 100 }];
    const body = buildNotificationBody(warnings, null);
    expect(body).toContain('[CC未覆盖] AAPL 100股');
  });

  it('includes PMCC warning line', () => {
    const warnings = [{ type: 'PMCC', ticker: 'SPY', uncoveredContracts: 2 }];
    const body = buildNotificationBody(warnings, null);
    expect(body).toContain('[PMCC未覆盖] SPY 2张');
  });

  it('appends VIX at end when warnings exist', () => {
    const warnings = [{ type: 'CC', ticker: 'AAPL', uncoveredShares: 100 }];
    const body = buildNotificationBody(warnings, 18.3);
    const lines = body.split('\n');
    expect(lines[lines.length - 1]).toBe('VIX: 18.3');
  });
});

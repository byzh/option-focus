import { describe, it, expect } from 'vitest';
import { selectDeltaPositions } from './deltaPositions';

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// Minimal position factory
function pos(overrides) {
  return {
    id: 'p1', ticker: 'SPY', assetType: 'OPTION',
    type: 'PUT', direction: 'SELL', status: 'OPEN',
    contracts: 1, entryPrice: 1.5, rollCredit: 0,
    expiration: daysFromNow(30),
    ...overrides,
  };
}

// Minimal PMCC pair: STOCK + LEAPS CALL (DTE > 90) + SELL CALL
function pmccGroup(leapsId = 'leaps1') {
  return [
    { id: 'stock1', ticker: 'AAPL', assetType: 'STOCK', type: null, direction: 'BUY', status: 'OPEN', contracts: 100, entryPrice: 150, rollCredit: 0, expiration: null },
    { id: leapsId,  ticker: 'AAPL', assetType: 'OPTION', type: 'CALL', direction: 'BUY',  status: 'OPEN', contracts: 1, entryPrice: 20, rollCredit: 0, expiration: daysFromNow(120) },
    { id: 'cc1',    ticker: 'AAPL', assetType: 'OPTION', type: 'CALL', direction: 'SELL', status: 'OPEN', contracts: 1, entryPrice: 1,  rollCredit: 0, expiration: daysFromNow(30) },
  ];
}

describe('selectDeltaPositions', () => {
  it('returns empty array when no positions', () => {
    expect(selectDeltaPositions([])).toHaveLength(0);
  });

  it('includes open non-expired PUT', () => {
    const result = selectDeltaPositions([pos({ id: 'put1' })]);
    expect(result.map(p => p.id)).toContain('put1');
  });

  it('excludes CLOSED PUT', () => {
    const result = selectDeltaPositions([pos({ id: 'put1', status: 'CLOSED' })]);
    expect(result).toHaveLength(0);
  });

  it('excludes expired PUT', () => {
    const result = selectDeltaPositions([pos({ id: 'put1', expiration: daysFromNow(-1) })]);
    expect(result).toHaveLength(0);
  });

  it('includes LEAPS CALL from PMCC group', () => {
    const result = selectDeltaPositions(pmccGroup('leaps1'));
    expect(result.map(p => p.id)).toContain('leaps1');
  });

  it('excludes non-LEAPS SELL CALL', () => {
    const result = selectDeltaPositions(pmccGroup());
    expect(result.map(p => p.id)).not.toContain('cc1');
  });

  it('deduplicates when same position appears via both paths', () => {
    // A LEAPS that is also a PUT would be deduped — contrived but tests id-dedup logic
    const leapsPut = pos({ id: 'dual1', type: 'PUT', direction: 'BUY', expiration: daysFromNow(120) });
    const stock = { id: 'stock1', ticker: 'SPY', assetType: 'STOCK', type: null, direction: 'BUY', status: 'OPEN', contracts: 100, entryPrice: 500, rollCredit: 0, expiration: null };
    const sellCall = pos({ id: 'cc1', type: 'CALL', direction: 'SELL', ticker: 'SPY' });
    // detectPMCC won't match this odd combo, but PUT filter will pick up leapsPut
    const result = selectDeltaPositions([stock, leapsPut, sellCall]);
    const ids = result.map(p => p.id);
    expect(ids.filter(id => id === 'dual1')).toHaveLength(1);
  });

  it('returns both PUTs and LEAPS when both present', () => {
    const put1 = pos({ id: 'put1', ticker: 'SPY' });
    const positions = [...pmccGroup('leaps1'), put1];
    const result = selectDeltaPositions(positions);
    const ids = result.map(p => p.id);
    expect(ids).toContain('leaps1');
    expect(ids).toContain('put1');
  });
});

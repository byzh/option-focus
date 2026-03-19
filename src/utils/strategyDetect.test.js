import { describe, it, expect } from 'vitest';
import { detectCC, detectPMCC } from './strategyDetect';

// Helper: build a date string N days from today
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ─── detectCC ─────────────────────────────────────────────────────────────────

describe('detectCC', () => {
  it('returns empty when no STOCK positions exist', () => {
    const positions = [
      { id: '1', ticker: 'AMD', assetType: 'OPTION', type: 'CALL', direction: 'SELL', status: 'OPEN', contracts: 1, entryPrice: 2, rollCredit: 0, expiration: daysFromNow(30) },
    ];
    expect(detectCC(positions)).toHaveLength(0);
  });

  it('returns empty when STOCK position is CLOSED', () => {
    const positions = [
      { id: '1', ticker: 'AMD', assetType: 'STOCK', contracts: 100, entryPrice: 235, status: 'CLOSED' },
    ];
    expect(detectCC(positions)).toHaveLength(0);
  });

  it('returns one group per open STOCK position', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 100, entryPrice: 235, status: 'OPEN' },
      { id: 's2', ticker: 'TSLA', assetType: 'STOCK', contracts: 100, entryPrice: 300, status: 'OPEN' },
    ];
    const result = detectCC(positions);
    expect(result).toHaveLength(2);
    expect(result.map(g => g.ticker).sort()).toEqual(['AMD', 'TSLA']);
  });

  it('no calls present: coveredLots=0, uncoveredShares=shares', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 200, entryPrice: 235, status: 'OPEN' },
    ];
    const [group] = detectCC(positions);
    expect(group.coveredLots).toBe(0);
    expect(group.uncoveredShares).toBe(200);
    expect(group.openCalls).toHaveLength(0);
    expect(group.closedCalls).toHaveLength(0);
  });

  it('open SELL CALL counted in coveredLots', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 200, entryPrice: 235, status: 'OPEN' },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 2, rollCredit: 0, status: 'OPEN', expiration: daysFromNow(30) },
    ];
    const [group] = detectCC(positions);
    expect(group.coveredLots).toBe(1);
    expect(group.uncoveredShares).toBe(100); // 200 - 1×100
    expect(group.openCalls).toHaveLength(1);
  });

  it('closed SELL CALL is in closedCalls, not openCalls', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 100, entryPrice: 235, status: 'OPEN' },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 2, rollCredit: 0, status: 'CLOSED', closePrice: 0, expiration: daysFromNow(-5) },
    ];
    const [group] = detectCC(positions);
    expect(group.coveredLots).toBe(0); // closed call does NOT cover current lots
    expect(group.closedCalls).toHaveLength(1);
    expect(group.openCalls).toHaveLength(0);
  });

  it('BUY CALL on same ticker is ignored (not a short call)', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 100, entryPrice: 235, status: 'OPEN' },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 5, rollCredit: 0, status: 'OPEN', expiration: daysFromNow(30) },
    ];
    const [group] = detectCC(positions);
    expect(group.coveredLots).toBe(0);
  });

  it('break-even equals entry price when no closed calls', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 100, entryPrice: 235, status: 'OPEN' },
    ];
    const [group] = detectCC(positions);
    expect(group.breakEven).toBeCloseTo(235);
  });

  it('break-even reduced by closed call premium ($2.00 expired worthless → $232)', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 100, entryPrice: 234, status: 'OPEN' },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 2, rollCredit: 0, status: 'CLOSED', closePrice: 0, expiration: daysFromNow(-5) },
    ];
    const [group] = detectCC(positions);
    // (234×100 - 200) / 100 = 232
    expect(group.breakEven).toBeCloseTo(232);
  });

  it('calls from a different ticker are not included', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 100, entryPrice: 235, status: 'OPEN' },
      { id: 'c1', ticker: 'TSLA', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 2, rollCredit: 0, status: 'OPEN', expiration: daysFromNow(30) },
    ];
    const [group] = detectCC(positions);
    expect(group.openCalls).toHaveLength(0);
    expect(group.coveredLots).toBe(0);
  });

  it('multiple contracts on a single SELL CALL record counted correctly', () => {
    const positions = [
      { id: 's1', ticker: 'AMD', assetType: 'STOCK', contracts: 300, entryPrice: 235, status: 'OPEN' },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 2, entryPrice: 2, rollCredit: 0, status: 'OPEN', expiration: daysFromNow(30) },
    ];
    const [group] = detectCC(positions);
    expect(group.coveredLots).toBe(2);
    expect(group.uncoveredShares).toBe(100); // 300 - 2×100
  });
});

// ─── detectPMCC ───────────────────────────────────────────────────────────────

describe('detectPMCC', () => {
  it('returns empty when no BUY CALL positions exist', () => {
    const positions = [
      { id: '1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 2, rollCredit: 0, status: 'OPEN', expiration: daysFromNow(30) },
    ];
    expect(detectPMCC(positions)).toHaveLength(0);
  });

  it('returns empty when BUY CALL has DTE ≤ 90', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(90) },
    ];
    expect(detectPMCC(positions)).toHaveLength(0);
  });

  it('returns empty when BUY CALL is CLOSED', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'CLOSED', expiration: daysFromNow(200) },
    ];
    expect(detectPMCC(positions)).toHaveLength(0);
  });

  it('returns one group for valid LEAPS (BUY CALL, DTE > 90)', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
    ];
    const result = detectPMCC(positions);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('AMD');
    expect(result[0].leapsId).toBe('l1');
  });

  it('linked SELL CALL (via leapsId) counted in coveredContracts', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 3, rollCredit: 0, strike: 240, leapsId: 'l1', status: 'OPEN', expiration: daysFromNow(30) },
    ];
    const [group] = detectPMCC(positions);
    expect(group.coveredContracts).toBe(1);
    expect(group.uncoveredContracts).toBe(0);
    expect(group.openLinkedCalls).toHaveLength(1);
  });

  it('unlinked SELL CALL (no leapsId) is not counted', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 3, rollCredit: 0, strike: 240, status: 'OPEN', expiration: daysFromNow(30) },
    ];
    const [group] = detectPMCC(positions);
    expect(group.coveredContracts).toBe(0);
    expect(group.uncoveredContracts).toBe(1);
    expect(group.openLinkedCalls).toHaveLength(0);
  });

  it('closed linked call is in closedLinkedCalls, not openLinkedCalls', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 2, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 3, rollCredit: 0, strike: 240, leapsId: 'l1', status: 'CLOSED', closePrice: 0, expiration: daysFromNow(-5) },
    ];
    const [group] = detectPMCC(positions);
    expect(group.closedLinkedCalls).toHaveLength(1);
    expect(group.openLinkedCalls).toHaveLength(0);
    expect(group.coveredContracts).toBe(0); // closed call doesn't cover current lots
    expect(group.uncoveredContracts).toBe(2);
  });

  it('break-even = strike + entryPrice when no closed calls', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
    ];
    const [group] = detectPMCC(positions);
    // 200 + (40×100 - 0)/100 = 200 + 40 = 240
    expect(group.breakEven).toBeCloseTo(240);
  });

  it('break-even reduced by closed call credit ($3.00 expired worthless → 237)', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 3, rollCredit: 0, leapsId: 'l1', status: 'CLOSED', closePrice: 0, expiration: daysFromNow(-5) },
    ];
    const [group] = detectPMCC(positions);
    // 200 + (4000 - 300)/100 = 237
    expect(group.breakEven).toBeCloseTo(237);
  });

  it('two separate LEAPS generate two independent groups', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
      { id: 'l2', ticker: 'TSLA', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 50, rollCredit: 0, strike: 300, status: 'OPEN', expiration: daysFromNow(300) },
    ];
    const result = detectPMCC(positions);
    expect(result).toHaveLength(2);
    expect(result.map(g => g.ticker).sort()).toEqual(['AMD', 'TSLA']);
  });

  it('SELL CALL linked to one LEAPS is not counted for the other', () => {
    const positions = [
      { id: 'l1', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 40, rollCredit: 0, strike: 200, status: 'OPEN', expiration: daysFromNow(200) },
      { id: 'l2', ticker: 'AMD', type: 'CALL', direction: 'BUY', contracts: 1, entryPrice: 42, rollCredit: 0, strike: 210, status: 'OPEN', expiration: daysFromNow(250) },
      { id: 'c1', ticker: 'AMD', type: 'CALL', direction: 'SELL', contracts: 1, entryPrice: 3, rollCredit: 0, leapsId: 'l1', status: 'OPEN', expiration: daysFromNow(30) },
    ];
    const result = detectPMCC(positions);
    expect(result).toHaveLength(2);
    const g1 = result.find(g => g.leapsId === 'l1');
    const g2 = result.find(g => g.leapsId === 'l2');
    expect(g1.coveredContracts).toBe(1);
    expect(g2.coveredContracts).toBe(0);
  });
});

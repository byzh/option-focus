import { describe, it, expect } from 'vitest';
import { calcNetBasis, calcFinalPnL, calcBreakEven } from './calc';

// ─── calcNetBasis ────────────────────────────────────────────────────────────
// Formula: (entryPrice + rollCredit) × 100 × contracts
// Both prices are per-share; ×100 converts to per-contract dollar value.

describe('calcNetBasis', () => {
  it('single contract, no roll', () => {
    expect(calcNetBasis(1.60, 0, 1)).toBeCloseTo(160);
  });

  it('single contract with roll credit reduces basis', () => {
    // Sold at $1.60, rolled for $0.50 credit → net $1.10/share → $110/contract
    expect(calcNetBasis(1.60, -0.50, 1)).toBeCloseTo(110);
  });

  it('single contract with roll debit increases basis', () => {
    expect(calcNetBasis(1.60, 0.20, 1)).toBeCloseTo(180);
  });

  it('two contracts, no roll', () => {
    expect(calcNetBasis(1.60, 0, 2)).toBeCloseTo(320);
  });

  it('two contracts with roll credit', () => {
    // Net $1.10/share × 100 × 2 contracts = $220
    expect(calcNetBasis(1.60, -0.50, 2)).toBeCloseTo(220);
  });

  it('defaults contracts to 1 when undefined', () => {
    expect(calcNetBasis(1.60, 0, undefined)).toBeCloseTo(160);
  });

  it('defaults rollCredit to 0 when null', () => {
    expect(calcNetBasis(1.60, null, 1)).toBeCloseTo(160);
  });

  it('defaults entryPrice to 0 when falsy', () => {
    expect(calcNetBasis(null, 0, 1)).toBe(0);
  });

  it('string inputs are coerced correctly', () => {
    expect(calcNetBasis('1.60', '-0.50', '2')).toBeCloseTo(220);
  });
});

// ─── calcFinalPnL ────────────────────────────────────────────────────────────
// SELL: premium collected upfront → profit when close is low
//   pnl = netBasis - closePrice × 100 × contracts
// BUY:  premium paid upfront → profit when close is high
//   pnl = closePrice × 100 × contracts - netBasis

describe('calcFinalPnL', () => {
  // --- SELL (short option) ---

  it('SELL: expired worthless → full premium kept', () => {
    const nb = calcNetBasis(1.60, 0, 1); // 160
    expect(calcFinalPnL('SELL', nb, 0, 1)).toBeCloseTo(160);
  });

  it('SELL: profitable close (closePrice < entryPrice)', () => {
    const nb = calcNetBasis(1.60, 0, 1); // 160
    // Close at $0.50 → pay $50 to close → profit $110
    expect(calcFinalPnL('SELL', nb, 0.50, 1)).toBeCloseTo(110);
  });

  it('SELL: loss on close (closePrice > entryPrice)', () => {
    const nb = calcNetBasis(1.60, 0, 1); // 160
    // Close at $2.00 → pay $200 to close → loss $40
    expect(calcFinalPnL('SELL', nb, 2.00, 1)).toBeCloseTo(-40);
  });

  it('SELL 2 contracts: expired worthless', () => {
    const nb = calcNetBasis(1.60, 0, 2); // 320
    expect(calcFinalPnL('SELL', nb, 0, 2)).toBeCloseTo(320);
  });

  it('SELL 2 contracts with roll credit: expired worthless', () => {
    const nb = calcNetBasis(1.60, -0.50, 2); // 220
    expect(calcFinalPnL('SELL', nb, 0, 2)).toBeCloseTo(220);
  });

  it('SELL 2 contracts: profitable close', () => {
    const nb = calcNetBasis(1.60, 0, 2); // 320
    // Close at $0.50 → pay $100 → profit $220
    expect(calcFinalPnL('SELL', nb, 0.50, 2)).toBeCloseTo(220);
  });

  // --- BUY (long option) ---

  it('BUY: profitable close (closePrice > entryPrice)', () => {
    const nb = calcNetBasis(1.60, 0, 1); // 160
    // Close at $3.00 → receive $300 → profit $140
    expect(calcFinalPnL('BUY', nb, 3.00, 1)).toBeCloseTo(140);
  });

  it('BUY: loss on close (closePrice < entryPrice)', () => {
    const nb = calcNetBasis(1.60, 0, 1); // 160
    // Close at $0.50 → receive $50 → loss $110
    expect(calcFinalPnL('BUY', nb, 0.50, 1)).toBeCloseTo(-110);
  });

  it('BUY: expired worthless → full premium lost', () => {
    const nb = calcNetBasis(1.60, 0, 1); // 160
    expect(calcFinalPnL('BUY', nb, 0, 1)).toBeCloseTo(-160);
  });
});

// ─── Regression: v3 bug ─────────────────────────────────────────────────────
// Before v3: (entryPrice + rollCredit) * 100
// v3 bug:    entryPrice * 100 * contracts + rollCredit  ← rollCredit not ×100
// Correct:   (entryPrice + rollCredit) * 100 * contracts

describe('regression: rollCredit must be treated as per-share (×100)', () => {
  it('rollCredit of -0.50 should reduce basis by $50, not $0.50', () => {
    const basis = calcNetBasis(1.60, -0.50, 1);
    // Bug would give: 1.60*100 - 0.50 = 159.50
    // Correct:        (1.60 - 0.50)*100 = 110
    expect(basis).toBeCloseTo(110);
    expect(basis).not.toBeCloseTo(159.50);
  });

  it('with 2 contracts, rollCredit scales with contracts', () => {
    const basis = calcNetBasis(1.60, -0.50, 2);
    // Bug would give: 1.60*100*2 - 0.50 = 319.50
    // Correct:        (1.60-0.50)*100*2 = 220
    expect(basis).toBeCloseTo(220);
    expect(basis).not.toBeCloseTo(319.50);
  });
});

// ─── calcBreakEven ────────────────────────────────────────────────────────────
// PUT:  strike - entryPrice - rollCredit
// CALL: strike + entryPrice + rollCredit

describe('calcBreakEven', () => {
  it('short put, no roll: strike=50, entry=2.50 → 47.50', () => {
    expect(calcBreakEven('PUT', 50, 2.50, 0)).toBeCloseTo(47.50);
  });

  it('short put with roll credit: strike=50, entry=2.50, rollCredit=-0.50 → 47.00', () => {
    // received additional $0.50 credit on roll, so breakEven improves
    expect(calcBreakEven('PUT', 50, 2.50, -0.50)).toBeCloseTo(47.00);
  });

  it('short call, no roll: strike=150, entry=3.00 → 153.00', () => {
    expect(calcBreakEven('CALL', 150, 3.00, 0)).toBeCloseTo(153.00);
  });

  it('long put, no roll: strike=50, entry=2.50 → 47.50', () => {
    expect(calcBreakEven('PUT', 50, 2.50, 0)).toBeCloseTo(47.50);
  });
});

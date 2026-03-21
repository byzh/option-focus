import { describe, it, expect } from 'vitest';
import { calcNetBasis, calcFinalPnL, calcBreakEven, calcCCBreakEven, calcPMCCBreakEven, calcPMCCNetCost, calcRealizedCredits, calcStockNetBasis, calcStockPnL } from './calc';

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

  it('short put with roll credit: strike=50, entry=2.50, rollCredit=+0.50 → 47.00', () => {
    // received additional $0.50 credit on roll (positive), so breakEven improves
    expect(calcBreakEven('PUT', 50, 2.50, 0.50)).toBeCloseTo(47.00);
  });

  it('short call, no roll: strike=150, entry=3.00 → 153.00', () => {
    expect(calcBreakEven('CALL', 150, 3.00, 0)).toBeCloseTo(153.00);
  });

  it('long put, no roll: strike=50, entry=2.50 → 47.50', () => {
    expect(calcBreakEven('PUT', 50, 2.50, 0)).toBeCloseTo(47.50);
  });
});

// ─── calcCCBreakEven ──────────────────────────────────────────────────────────
// Formula: (entryPrice × shares - realizedCredits) / shares
// Only CLOSED short call P&L counts as realized credits.

describe('calcCCBreakEven', () => {
  const stockPos = { entryPrice: 235, contracts: 100 }; // 100 shares at $235

  it('no closed calls: break-even equals entry price', () => {
    expect(calcCCBreakEven(stockPos, [])).toBeCloseTo(235);
  });

  it('one closed call expired worthless ($2.00 entry, 1 contract): reduces break-even by $2', () => {
    // SELL 1 contract at $2.00, expired worthless (closePrice=0) → pnl = +$200
    // realizedCredits = 200, breakEven = (235×100 - 200)/100 = 233
    const closedCall = { direction: 'SELL', entryPrice: 2.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcCCBreakEven(stockPos, [closedCall])).toBeCloseTo(233);
  });

  it('two closed calls: cumulative credits reduce break-even', () => {
    // Two $2.00 calls expired worthless → $400 total credits
    // breakEven = (235×100 - 400)/100 = 231
    const call = { direction: 'SELL', entryPrice: 2.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcCCBreakEven(stockPos, [call, call])).toBeCloseTo(231);
  });

  it('closed call bought back at loss does not reduce break-even below entry', () => {
    // SELL at $1.00, buy back at $3.00 → pnl = -$200
    const losingCall = { direction: 'SELL', entryPrice: 1.00, rollCredit: 0, contracts: 1, closePrice: 3.00 };
    // breakEven = (235×100 - (-200))/100 = 237
    expect(calcCCBreakEven(stockPos, [losingCall])).toBeCloseTo(237);
  });

  it('string inputs are coerced', () => {
    const s = { entryPrice: '235', contracts: '100' };
    const call = { direction: 'SELL', entryPrice: '2.00', rollCredit: '0', contracts: '1', closePrice: '0' };
    expect(calcCCBreakEven(s, [call])).toBeCloseTo(233);
  });

  it('null closedCalls defaults to empty', () => {
    expect(calcCCBreakEven(stockPos, null)).toBeCloseTo(235);
  });
});

// ─── calcRealizedCredits ──────────────────────────────────────────────────────
// Sum of actual P&L from closed SELL CALL positions.

describe('calcRealizedCredits', () => {
  it('empty array returns 0', () => {
    expect(calcRealizedCredits([])).toBe(0);
  });

  it('null returns 0', () => {
    expect(calcRealizedCredits(null)).toBe(0);
  });

  it('one expired worthless call: full premium returned', () => {
    const call = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcRealizedCredits([call])).toBeCloseTo(300);
  });

  it('one call closed at profit: actual net returned', () => {
    // SELL at $3.00, closed at $1.00 → pnl = 300 - 100 = 200
    const call = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 1.00 };
    expect(calcRealizedCredits([call])).toBeCloseTo(200);
  });

  it('multiple calls accumulate correctly', () => {
    const c1 = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 0 };   // +300
    const c2 = { direction: 'SELL', entryPrice: 2.00, rollCredit: 0, contracts: 1, closePrice: 0.50 }; // +150
    expect(calcRealizedCredits([c1, c2])).toBeCloseTo(450);
  });
});

// ─── calcPMCCNetCost ──────────────────────────────────────────────────────────
// Formula: leaps.entryPrice × 100 × contracts - realizedCredits

describe('calcPMCCNetCost', () => {
  const leapsPos = { strike: 200, entryPrice: 40.00, contracts: 1 }; // raw cost = $4000

  it('no closed calls: returns raw LEAPS cost', () => {
    expect(calcPMCCNetCost(leapsPos, [])).toBeCloseTo(4000);
  });

  it('one expired call reduces net cost', () => {
    const call = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcPMCCNetCost(leapsPos, [call])).toBeCloseTo(3700);
  });

  it('multiple calls accumulate', () => {
    const call = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcPMCCNetCost(leapsPos, [call, call, call])).toBeCloseTo(3100);
  });

  it('2 LEAPS contracts: raw cost $8000, one closed call reduces it', () => {
    const leaps2 = { strike: 200, entryPrice: 40.00, contracts: 2 };
    const call = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcPMCCNetCost(leaps2, [call])).toBeCloseTo(7700);
  });

  it('null closedCalls defaults to 0 credits', () => {
    expect(calcPMCCNetCost(leapsPos, null)).toBeCloseTo(4000);
  });
});

// ─── calcPMCCBreakEven ────────────────────────────────────────────────────────
// Formula: leaps.strike + (leaps.entryPrice×100×contracts - realizedCredits) / (100×contracts)

describe('calcPMCCBreakEven', () => {
  // LEAPS: $200 strike, bought at $40.00 (per share), 1 contract
  // Net LEAPS cost = $40 × 100 = $4000
  // Initial break-even = 200 + 4000/100 = $240
  const leapsPos = { strike: 200, entryPrice: 40.00, contracts: 1 };

  it('no closed calls: break-even = strike + entryPrice', () => {
    expect(calcPMCCBreakEven(leapsPos, [])).toBeCloseTo(240);
  });

  it('one closed call expired worthless ($3.00 entry): reduces break-even by $3', () => {
    // pnl = $300, breakEven = 200 + (4000 - 300)/100 = 237
    const closedCall = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcPMCCBreakEven(leapsPos, [closedCall])).toBeCloseTo(237);
  });

  it('three closed calls accumulate correctly', () => {
    // 3 × $3.00 calls expired worthless → $900 credits
    // breakEven = 200 + (4000 - 900)/100 = 231
    const call = { direction: 'SELL', entryPrice: 3.00, rollCredit: 0, contracts: 1, closePrice: 0 };
    expect(calcPMCCBreakEven(leapsPos, [call, call, call])).toBeCloseTo(231);
  });

  it('two LEAPS contracts: break-even divides over total 200 shares', () => {
    // LEAPS: 2 contracts → net cost $8000, breakEven = 200 + 8000/200 = 240
    const leaps2 = { strike: 200, entryPrice: 40.00, contracts: 2 };
    expect(calcPMCCBreakEven(leaps2, [])).toBeCloseTo(240);
  });

  it('with roll credit on closed call', () => {
    // SELL at $3.00, rolled for -$0.50 (debit), then expired: netBasis = (3.00 - 0.50)×100 = 250
    // close at 0 → pnl = 250
    // breakEven = 200 + (4000 - 250)/100 = 237.50
    const closedCall = { direction: 'SELL', entryPrice: 3.00, rollCredit: -0.50, contracts: 1, closePrice: 0 };
    expect(calcPMCCBreakEven(leapsPos, [closedCall])).toBeCloseTo(237.50);
  });

  it('null closedCalls defaults to empty', () => {
    expect(calcPMCCBreakEven(leapsPos, null)).toBeCloseTo(240);
  });
});

// ─── calcStockNetBasis ────────────────────────────────────────────────────────
// Formula: entryPrice × shares  (no ×100 options multiplier)

describe('calcStockNetBasis', () => {
  it('100 shares at $200 = $20,000', () => {
    expect(calcStockNetBasis(200, 100)).toBeCloseTo(20000);
  });

  it('1 share at $585.54 = $585.54', () => {
    expect(calcStockNetBasis(585.54, 1)).toBeCloseTo(585.54);
  });

  it('defaults shares to 1 when undefined', () => {
    expect(calcStockNetBasis(100, undefined)).toBeCloseTo(100);
  });

  it('defaults entryPrice to 0 when falsy', () => {
    expect(calcStockNetBasis(null, 100)).toBe(0);
  });

  it('is NOT the same as calcNetBasis — no ×100 multiplier', () => {
    // calcNetBasis(200, 0, 100) = 200 × 100 × 100 = 2,000,000 (wrong for stocks)
    // calcStockNetBasis(200, 100)  = 200 × 100     =    20,000 (correct)
    expect(calcStockNetBasis(200, 100)).not.toBeCloseTo(calcNetBasis(200, 0, 100));
  });
});

// ─── calcStockPnL ─────────────────────────────────────────────────────────────
// Formula: (closePrice - entryPrice) × shares

describe('calcStockPnL', () => {
  it('profit: bought at $200, sold at $220, 100 shares → +$2,000', () => {
    expect(calcStockPnL(200, 220, 100)).toBeCloseTo(2000);
  });

  it('loss: bought at $200, sold at $180, 100 shares → -$2,000', () => {
    expect(calcStockPnL(200, 180, 100)).toBeCloseTo(-2000);
  });

  it('flat: closePrice equals entryPrice → $0', () => {
    expect(calcStockPnL(200, 200, 100)).toBe(0);
  });

  it('defaults shares to 1 when undefined', () => {
    expect(calcStockPnL(100, 150, undefined)).toBeCloseTo(50);
  });

  it('expired worthless (closePrice=0): loss = -entryPrice × shares', () => {
    // A stock closing at $0 (e.g. bankruptcy) is a total loss
    expect(calcStockPnL(585, 0, 100)).toBeCloseTo(-58500);
  });

  it('is NOT the same as calcFinalPnL — no ×100 multiplier applied', () => {
    // calcFinalPnL('BUY', calcNetBasis(200,0,100), 220, 100) uses ×100 internally
    // calcStockPnL(200, 220, 100) = (220-200)*100 = 2,000 (correct)
    const stockPnL = calcStockPnL(200, 220, 100);
    expect(stockPnL).toBeCloseTo(2000);
    // Options formula would give (220×100×100) - (200×100×100) = 200,000 (wrong for stocks)
    const wrongPnL = calcFinalPnL('BUY', calcNetBasis(200, 0, 100), 220, 100);
    expect(wrongPnL).not.toBeCloseTo(stockPnL);
  });
});

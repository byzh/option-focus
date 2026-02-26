/**
 * Pure calculation functions for option position P&L.
 *
 * Units:
 *   entryPrice  — option price per share (e.g. 1.60 means $1.60/share → $160/contract)
 *   rollCredit  — per-share credit (positive) or debit (negative) from rolling; same unit as entryPrice
 *   contracts   — number of option contracts (1 contract = 100 shares)
 *   closePrice  — per-share closing price; same unit as entryPrice
 */

/**
 * Net cost basis of a position in dollars.
 *   netBasis = (entryPrice + rollCredit) × 100 × contracts
 */
export function calcNetBasis(entryPrice, rollCredit, contracts) {
  const ep = parseFloat(entryPrice) || 0;
  const rc = parseFloat(rollCredit) || 0;
  const ct = parseInt(contracts) || 1;
  return (ep + rc) * 100 * ct;
}

/**
 * Final realised P&L in dollars.
 *   SELL: collected premium upfront → profit when close price is low
 *         pnl = netBasis - closePrice × 100 × contracts
 *   BUY:  paid premium upfront → profit when close price is high
 *         pnl = closePrice × 100 × contracts - netBasis
 */
/**
 * Break-even stock price at expiration (per-share).
 *   PUT:  strike - (entryPrice + rollCredit)
 *   CALL: strike + (entryPrice + rollCredit)
 */
export function calcBreakEven(type, strike, entryPrice, rollCredit) {
  const s = parseFloat(strike) || 0;
  const ep = parseFloat(entryPrice) || 0;
  const rc = parseFloat(rollCredit) || 0;
  return type === 'PUT' ? s - ep - rc : s + ep + rc;
}

export function calcFinalPnL(direction, netBasis, closePrice, contracts) {
  const cp = parseFloat(closePrice) || 0;
  const ct = parseInt(contracts) || 1;
  const closingValue = cp * 100 * ct;
  return direction === 'SELL' ? netBasis - closingValue : closingValue - netBasis;
}

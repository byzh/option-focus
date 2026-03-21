/**
 * Pure calculation functions for option and stock position P&L.
 *
 * Units:
 *   entryPrice  — option price per share (e.g. 1.60 means $1.60/share → $160/contract)
 *   rollCredit  — per-share credit (positive) or debit (negative) from rolling; same unit as entryPrice
 *   contracts   — number of option contracts (1 contract = 100 shares)
 *   closePrice  — per-share closing price; same unit as entryPrice
 */

/**
 * Cost basis of a STOCK position in dollars.
 *   totalCost = entryPrice × shares
 * No options multiplier — shares already represent the full quantity.
 */
export function calcStockNetBasis(entryPrice, shares) {
  return (parseFloat(entryPrice) || 0) * (parseInt(shares) || 1);
}

/**
 * Realized P&L for a STOCK position in dollars.
 *   pnl = (closePrice - entryPrice) × shares
 */
export function calcStockPnL(entryPrice, closePrice, shares) {
  const ep = parseFloat(entryPrice) || 0;
  const cp = parseFloat(closePrice) || 0;
  const n = parseInt(shares) || 1;
  return (cp - ep) * n;
}

/**
 * Net cost basis of an OPTION position in dollars.
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

/**
 * Sum of realized P&L from a list of closed SELL CALL positions.
 * Used to reduce cost basis in CC/PMCC break-even and net cost calculations.
 *
 * @param {Array} closedCalls — CLOSED SELL CALL positions
 * @returns {number} total realized credits in dollars
 */
export function calcRealizedCredits(closedCalls) {
  return (closedCalls || []).reduce((sum, p) => {
    const netBasis = calcNetBasis(p.entryPrice, p.rollCredit, p.contracts);
    const closePrice = parseFloat(p.closePrice) || 0;
    const pnl = calcFinalPnL(p.direction, netBasis, closePrice, p.contracts);
    return sum + pnl;
  }, 0);
}

/**
 * CC (Covered Call) break-even per share.
 *   (stock.entryPrice × shares - realizedShortCallCredits) / shares
 *
 * @param {object} stockPos  — STOCK position: { entryPrice, contracts (shares) }
 * @param {Array}  closedCalls — CLOSED SELL CALL positions linked to this stock
 */
export function calcCCBreakEven(stockPos, closedCalls) {
  const entryPrice = parseFloat(stockPos.entryPrice) || 0;
  const shares = parseInt(stockPos.contracts) || 1;
  const totalCost = entryPrice * shares;
  return (totalCost - calcRealizedCredits(closedCalls)) / shares;
}

/**
 * PMCC adjusted net cost in dollars.
 *   leaps.entryPrice × 100 × contracts - realizedShortCallCredits
 *
 * @param {object} leapsPos   — BUY CALL LEAPS position: { entryPrice, contracts }
 * @param {Array}  closedCalls — CLOSED SELL CALL positions linked to this LEAPS
 */
export function calcPMCCNetCost(leapsPos, closedCalls) {
  const entryPrice = parseFloat(leapsPos.entryPrice) || 0;
  const contracts = parseInt(leapsPos.contracts) || 1;
  return entryPrice * 100 * contracts - calcRealizedCredits(closedCalls);
}

/**
 * PMCC (Poor Man's Covered Call) break-even per share.
 *   leaps.strike + calcPMCCNetCost / (100 × contracts)
 *
 * @param {object} leapsPos   — BUY CALL LEAPS position: { strike, entryPrice, contracts }
 * @param {Array}  closedCalls — CLOSED SELL CALL positions linked to this LEAPS
 */
export function calcPMCCBreakEven(leapsPos, closedCalls) {
  const strike = parseFloat(leapsPos.strike) || 0;
  const contracts = parseInt(leapsPos.contracts) || 1;
  return strike + calcPMCCNetCost(leapsPos, closedCalls) / (100 * contracts);
}

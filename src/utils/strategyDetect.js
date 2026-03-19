import { calcCCBreakEven, calcPMCCBreakEven, calcPMCCNetCost } from '../calc';

/**
 * Detect CC (Covered Call) opportunities from a positions array.
 *
 * A CC group = one STOCK position + zero or more SELL CALL positions
 * (matched by ticker). Returns one entry per STOCK position.
 *
 * @param {Array} positions
 * @returns {Array} [{ stockId, ticker, stockPos, openCalls, closedCalls, coveredLots, uncoveredShares, breakEven }]
 */
export function detectCC(positions) {
  const stocks = positions.filter(p => p.assetType === 'STOCK' && p.status !== 'CLOSED');
  if (stocks.length === 0) return [];

  return stocks.map(stockPos => {
    const ticker = stockPos.ticker;
    const shares = parseInt(stockPos.contracts) || 0;

    // All SELL CALL on same ticker (open or closed)
    const allCalls = positions.filter(p =>
      p.ticker === ticker &&
      p.assetType !== 'STOCK' &&
      p.type === 'CALL' &&
      p.direction === 'SELL'
    );
    const openCalls = allCalls.filter(p => p.status !== 'CLOSED');
    const closedCalls = allCalls.filter(p => p.status === 'CLOSED');

    const coveredContracts = openCalls.reduce((sum, p) => sum + (parseInt(p.contracts) || 0), 0);
    const uncoveredShares = Math.max(0, shares - coveredContracts * 100);
    const breakEven = calcCCBreakEven(stockPos, closedCalls);

    return { stockId: stockPos.id, ticker, stockPos, openCalls, closedCalls, coveredLots: coveredContracts, uncoveredShares, breakEven };
  });
}

/**
 * Detect PMCC (Poor Man's Covered Call) opportunities.
 *
 * A PMCC group = one open BUY CALL with DTE > 90 (LEAPS) + SELL CALLs linked via leapsId.
 * leapsId is manually set on SELL CALL positions.
 *
 * @param {Array} positions
 * @returns {Array} [{ leapsId, ticker, leapsPos, openLinkedCalls, closedLinkedCalls, coveredContracts, uncoveredContracts, breakEven }]
 */
export function detectPMCC(positions) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const leapsPositions = positions.filter(p => {
    if (p.status === 'CLOSED') return false;
    if (p.assetType === 'STOCK') return false;
    if (p.type !== 'CALL' || p.direction !== 'BUY') return false;
    if (!p.expiration) return false;
    const exp = new Date(p.expiration);
    exp.setHours(0, 0, 0, 0);
    const dte = Math.ceil((exp - now) / 86400000);
    return dte > 90;
  });

  if (leapsPositions.length === 0) return [];

  return leapsPositions.map(leapsPos => {
    const ticker = leapsPos.ticker;

    // SELL CALLs explicitly linked to this LEAPS by leapsId
    const allLinked = positions.filter(p =>
      p.leapsId === leapsPos.id &&
      p.type === 'CALL' &&
      p.direction === 'SELL'
    );
    const openLinkedCalls = allLinked.filter(p => p.status !== 'CLOSED');
    const closedLinkedCalls = allLinked.filter(p => p.status === 'CLOSED');

    const leapsContracts = parseInt(leapsPos.contracts) || 1;
    const coveredContracts = openLinkedCalls.reduce((sum, p) => sum + (parseInt(p.contracts) || 0), 0);
    const uncoveredContracts = Math.max(0, leapsContracts - coveredContracts);
    const breakEven = calcPMCCBreakEven(leapsPos, closedLinkedCalls);
    const adjustedNetCost = calcPMCCNetCost(leapsPos, closedLinkedCalls);

    return { leapsId: leapsPos.id, ticker, leapsPos, openLinkedCalls, closedLinkedCalls, coveredContracts, uncoveredContracts, breakEven, adjustedNetCost };
  });
}

'use strict';

const DELTA_PUT_WARN_THRESHOLD = 0.5;

/**
 * Assess LEAPS health — mirrors src/utils/leapsHealth.js assessLeapsHealth().
 * Returns { level, message } where level is 'ok'|'warn'|'danger'|'roll'|'unknown'.
 */
function assessLeapsHealth(dte, delta) {
  if (delta == null || dte == null) return { level: 'unknown', message: 'Delta 未获取' };
  const d = Math.abs(delta);
  if (d < 0.60) return { level: 'danger', message: `Δ${d.toFixed(2)} 过低，建议换仓` };
  if (dte < 90)  return { level: 'roll',   message: `DTE ${dte}d < 90，建议 Roll` };
  if (dte > 365) return d >= 0.75 ? { level: 'ok', message: `Δ${d.toFixed(2)}` } : { level: 'warn', message: `Δ${d.toFixed(2)} 偏低 (建议 ≥0.75)` };
  if (dte > 180) return d >= 0.80 ? { level: 'ok', message: `Δ${d.toFixed(2)}` } : { level: 'warn', message: `Δ${d.toFixed(2)} 偏低 (建议 ≥0.80)` };
  return d >= 0.85 ? { level: 'ok', message: `Δ${d.toFixed(2)}` } : { level: 'warn', message: `Δ${d.toFixed(2)} 偏低 (建议 ≥0.85)` };
}

/**
 * Calculate DTE from an expiration date string (YYYY-MM-DD).
 */
function calculateDTE(expiration) {
  if (!expiration) return null;
  const exp = new Date(expiration + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}

/**
 * Collect PUT delta warnings from positions + deltaMap.
 * @param {Array} positions - open PUT positions
 * @param {Map<string, number>} deltaMap - positionId → delta
 * @returns {Array<{ type, ticker, strike, expiration, message }>}
 */
function collectPutWarnings(positions, deltaMap) {
  return positions
    .filter(p => {
      const delta = deltaMap.get(p.id);
      return delta != null && Math.abs(delta) > DELTA_PUT_WARN_THRESHOLD;
    })
    .map(p => {
      const delta = deltaMap.get(p.id);
      return { type: 'PUT', ticker: p.ticker, strike: p.strike, expiration: p.expiration, message: `Δ${delta.toFixed(2)} 偏高` };
    });
}

/**
 * Collect LEAPS delta warnings from positions + deltaMap.
 * @param {Array} positions - open LEAPS positions (BUY CALL DTE > 90)
 * @param {Map<string, number>} deltaMap - positionId → delta
 * @returns {Array<{ type, ticker, expiration, message }>}
 */
function collectLeapsWarnings(positions, deltaMap) {
  return positions
    .filter(p => {
      const delta = deltaMap.get(p.id);
      const dte = calculateDTE(p.expiration);
      const health = assessLeapsHealth(dte, delta);
      return health.level !== 'ok' && health.level !== 'unknown';
    })
    .map(p => {
      const delta = deltaMap.get(p.id);
      const dte = calculateDTE(p.expiration);
      const health = assessLeapsHealth(dte, delta);
      return { type: 'LEAPS', ticker: p.ticker, expiration: p.expiration, message: health.message };
    });
}

/**
 * Detect CC groups with uncovered shares — mirrors detectCC() in strategyDetect.js.
 * @param {Array} positions
 * @returns {Array<{ type, ticker, uncoveredShares }>}
 */
function collectCCWarnings(positions) {
  const stocks = positions.filter(p => p.assetType === 'STOCK' && p.status !== 'CLOSED');
  return stocks
    .map(stockPos => {
      const ticker = stockPos.ticker;
      const shares = parseInt(stockPos.contracts) || 0;
      const maxLots = Math.floor(shares / 100);
      const openCalls = positions.filter(p =>
        p.ticker === ticker &&
        p.assetType !== 'STOCK' &&
        p.type === 'CALL' &&
        p.direction === 'SELL' &&
        p.status !== 'CLOSED' &&
        !p.leapsId &&
        (parseInt(p.contracts) || 1) <= maxLots
      );
      const coveredContracts = openCalls.reduce((sum, p) => sum + (parseInt(p.contracts) || 0), 0);
      const uncoveredShares = Math.max(0, shares - coveredContracts * 100);
      return { type: 'CC', ticker, uncoveredShares };
    })
    .filter(g => g.uncoveredShares > 0);
}

/**
 * Detect PMCC groups with uncovered contracts — mirrors detectPMCC() in strategyDetect.js.
 * @param {Array} positions
 * @returns {Array<{ type, ticker, uncoveredContracts }>}
 */
function collectPMCCWarnings(positions) {
  const leapsPositions = positions.filter(p => {
    if (p.status === 'CLOSED') return false;
    if (p.assetType === 'STOCK') return false;
    if (p.type !== 'CALL' || p.direction !== 'BUY') return false;
    const dte = calculateDTE(p.expiration);
    return dte != null && dte > 90;
  });

  return leapsPositions
    .map(leapsPos => {
      const openLinkedCalls = positions.filter(p =>
        p.leapsId === leapsPos.id &&
        p.type === 'CALL' &&
        p.direction === 'SELL' &&
        p.status !== 'CLOSED'
      );
      const leapsContracts = parseInt(leapsPos.contracts) || 1;
      const coveredContracts = openLinkedCalls.reduce((sum, p) => sum + (parseInt(p.contracts) || 0), 0);
      const uncoveredContracts = Math.max(0, leapsContracts - coveredContracts);
      return { type: 'PMCC', ticker: leapsPos.ticker, uncoveredContracts };
    })
    .filter(g => g.uncoveredContracts > 0);
}

/**
 * Build notification body from all warnings + VIX.
 * @param {Array} warnings - combined array of all warning objects
 * @param {number|null} vix
 */
function buildNotificationBody(warnings, vix) {
  const vixLine = vix != null ? `VIX: ${vix.toFixed(1)}` : null;
  if (!warnings.length) {
    return ['所有持仓状态正常', vixLine].filter(Boolean).join(' · ');
  }
  const lines = warnings.map(w => {
    if (w.type === 'PUT')  return `[PUT] ${w.ticker} $${w.strike} (${w.expiration}) ${w.message}`;
    if (w.type === 'LEAPS') return `[LEAPS] ${w.ticker} (${w.expiration}) ${w.message}`;
    if (w.type === 'CC')   return `[CC未覆盖] ${w.ticker} ${w.uncoveredShares}股`;
    if (w.type === 'PMCC') return `[PMCC未覆盖] ${w.ticker} ${w.uncoveredContracts}张`;
    return '';
  });
  if (vixLine) lines.push(vixLine);
  return lines.join('\n');
}

module.exports = {
  assessLeapsHealth,
  calculateDTE,
  collectPutWarnings,
  collectLeapsWarnings,
  collectCCWarnings,
  collectPMCCWarnings,
  buildNotificationBody,
};

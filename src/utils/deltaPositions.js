import { detectPMCC } from './strategyDetect';
import { isExpired } from './dateUtils';

/**
 * Select positions that need delta fetching:
 * - All open, non-expired PUT options
 * - LEAPS CALL positions (BUY CALL, DTE > 90, part of PMCC)
 * Deduplicates by position id.
 *
 * @param {Array} positions
 * @returns {Array}
 */
export function selectDeltaPositions(positions) {
  const leaps = detectPMCC(positions).map(g => g.leapsPos);
  const puts = positions.filter(p => p.status === 'OPEN' && p.type === 'PUT' && !isExpired(p.expiration));
  return [...new Map([...leaps, ...puts].map(p => [p.id, p])).values()];
}

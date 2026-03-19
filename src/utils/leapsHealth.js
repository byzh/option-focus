/**
 * Assess LEAPS health based on the delta × DTE matrix.
 *
 * Priority order:
 *   1. delta < 0.60  → danger  (any DTE)
 *   2. DTE < 90      → roll    (any delta ≥ 0.60)
 *   3. DTE > 365     → ok if delta ≥ 0.75, else warn
 *   4. DTE 180–365   → ok if delta ≥ 0.80, else warn
 *   5. DTE 90–180    → ok if delta ≥ 0.85, else warn
 *
 * @param {number|null} dte   Days to expiration (integer)
 * @param {number|null} delta Option delta (positive for calls, e.g. 0.82)
 * @returns {{ level: 'ok'|'warn'|'danger'|'roll'|'unknown', message: string }}
 */
export function assessLeapsHealth(dte, delta) {
  if (delta == null || dte == null) return { level: 'unknown', message: 'Delta 未获取' };

  const d = Math.abs(delta);

  if (d < 0.60) return { level: 'danger', message: `Δ${d.toFixed(2)} 过低，建议换仓` };
  if (dte < 90)  return { level: 'roll',   message: `DTE ${dte}d < 90，建议 Roll` };
  if (dte > 365) return d >= 0.75 ? { level: 'ok', message: `Δ${d.toFixed(2)}` } : { level: 'warn', message: `Δ${d.toFixed(2)} 偏低 (建议 ≥0.75)` };
  if (dte > 180) return d >= 0.80 ? { level: 'ok', message: `Δ${d.toFixed(2)}` } : { level: 'warn', message: `Δ${d.toFixed(2)} 偏低 (建议 ≥0.80)` };
  return d >= 0.85 ? { level: 'ok', message: `Δ${d.toFixed(2)}` } : { level: 'warn', message: `Δ${d.toFixed(2)} 偏低 (建议 ≥0.85)` };
}

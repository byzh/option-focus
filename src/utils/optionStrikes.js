export const DEFAULT_STRIKE_RANGE = 15;

/**
 * Pick the strikes to display: ATM ± range (or all), sorted by strike price.
 * ATM is the strike nearest the underlying; falls back to the middle strike.
 * @returns {{ visible: Array, atmPrice: string|null }}
 */
export function selectVisibleStrikes(strikes, underlyingPrice, showAll, range = DEFAULT_STRIKE_RANGE) {
  const sorted = (Array.isArray(strikes) ? strikes : [])
    .filter(s => Number.isFinite(parseFloat(s?.['strike-price'])))
    .sort((a, b) => parseFloat(a['strike-price']) - parseFloat(b['strike-price']));
  if (sorted.length === 0) return { visible: [], atmPrice: null };

  let atmIdx = Math.floor(sorted.length / 2);
  if (Number.isFinite(underlyingPrice)) {
    let best = Infinity;
    sorted.forEach((s, i) => {
      const d = Math.abs(parseFloat(s['strike-price']) - underlyingPrice);
      if (d < best) { best = d; atmIdx = i; }
    });
  }
  const atmPrice = String(parseFloat(sorted[atmIdx]['strike-price']));
  const visible = showAll ? sorted : sorted.slice(Math.max(0, atmIdx - range), atmIdx + range + 1);
  return { visible, atmPrice };
}

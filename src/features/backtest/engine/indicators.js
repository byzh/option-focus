/** Simple moving average; entries before the first full window are null. */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

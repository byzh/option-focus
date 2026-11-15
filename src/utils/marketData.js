import { callTastytradeApi } from './apiClient';

/** Allowed ticker format for user-entered symbols (letters, optional class suffix like BRK.B). */
export const TICKER_PATTERN = /^[A-Z][A-Z.]{0,9}$/;

/**
 * Normalize and validate a user-entered ticker.
 * @returns {string|null} upper-cased ticker, or null if invalid
 */
export function normalizeTicker(input) {
  const t = String(input ?? '').trim().toUpperCase();
  return TICKER_PATTERN.test(t) ? t : null;
}

/**
 * Fetch the underlying equity price (mark → last → close).
 * @returns {Promise<number|null>}
 */
export async function fetchUnderlyingPrice(user, symbol) {
  const response = await callTastytradeApi(user, '/market-data/by-type', { equity: symbol });
  const items = Array.isArray(response?.data?.items) ? response.data.items : [];
  const equity = items.find(i => i?.symbol === symbol);
  if (!equity) return null;
  const price = parseFloat(equity.mark || equity.last || equity.close);
  return Number.isFinite(price) && price > 0 ? price : null;
}

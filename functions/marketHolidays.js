'use strict';

// US stock market holidays (NYSE/NASDAQ) for 2025–2026
// Dates in ET local date format: YYYY-MM-DD
const HOLIDAYS = new Set([
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

/**
 * Returns true if the US stock market is closed today.
 * Checks weekends and known holidays.
 * @param {Date} [now] - optional date (defaults to current time in ET)
 */
function isMarketClosed(now = new Date()) {
  // Convert to ET date string
  const etDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) return true; // weekend
  return HOLIDAYS.has(etDateStr);
}

module.exports = { isMarketClosed };

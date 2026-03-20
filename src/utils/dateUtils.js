export const getLocalTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Returns today's date in ET timezone (America/New_York) as YYYY-MM-DD.
 *  Used for skew history keys so that data is always keyed by US trading day,
 *  not local time — prevents double-scanning when local midnight crosses
 *  while ET market is still open. */
export const getETDateString = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
};

export const isExpiredByTwoDays = (expirationDate) => {
  if (!expirationDate) return false;
  const exp = new Date(expirationDate);
  const now = new Date();
  exp.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = now - exp;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 2;
};

export const isExpired = (expirationDate) => {
  if (!expirationDate) return false;
  const exp = new Date(expirationDate);
  const now = new Date();
  exp.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return now > exp;
};

/**
 * Days to expiration from today (local midnight). Returns null for empty input.
 * Positive = future, 0 = today, negative = past.
 */
export const calculateDTE = (expirationDate) => {
  if (!expirationDate) return null;
  const exp = new Date(expirationDate);
  const now = new Date();
  exp.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((exp - now) / 86400000);
};

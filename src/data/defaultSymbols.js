// High-liquidity S&P 500 components + popular ETFs for IV scanning
export const DEFAULT_SYMBOLS = [
  // ── Semiconductors (comprehensive) ─────────────────────────────────────
  'NVDA', 'AMD', 'AVGO', 'INTC', 'QCOM', 'AMAT', 'MU', 'TXN', 'LRCX', 'KLAC',
  'MRVL', 'ARM', 'ASML', 'SMCI', 'TSM', 'ADI', 'MCHP', 'ON', 'NXPI', 'SWKS',
  'MPWR', 'ENTG', 'TER', 'AMKR', 'COHR', 'WOLF',

  // ── Mega-cap Tech ──────────────────────────────────────────────────────
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',

  // ── Enterprise Software / Cloud ────────────────────────────────────────
  'CRM', 'ORCL', 'ADBE', 'NOW', 'INTU', 'IBM', 'DELL', 'HPQ', 'ACN', 'CSCO',
  'ANET', 'FTNT',

  // ── Cybersecurity ──────────────────────────────────────────────────────
  'PANW', 'CRWD', 'NET', 'ZS', 'OKTA', 'S',

  // ── SaaS / Data / AI ──────────────────────────────────────────────────
  'DDOG', 'SNOW', 'PLTR', 'MDB', 'TWLO', 'HUBS', 'TTD',

  // ── Consumer Internet / Fintech ────────────────────────────────────────
  'UBER', 'SHOP', 'COIN', 'HOOD', 'RBLX', 'ROKU',

  // ── Finance ────────────────────────────────────────────────────────────
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'BLK', 'SCHW', 'AXP', 'V', 'MA',
  'COF', 'PNC', 'USB', 'CME', 'ICE', 'SPGI', 'MCO',

  // ── Healthcare ─────────────────────────────────────────────────────────
  'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'BMY', 'AMGN',
  'GILD', 'REGN', 'VRTX', 'ISRG', 'MDT', 'MRNA', 'CVS', 'CI',

  // ── Consumer Discretionary ─────────────────────────────────────────────
  'DIS', 'NKE', 'SBUX', 'MCD', 'WMT', 'COST', 'HD', 'LOW', 'TGT',
  'BKNG', 'ABNB', 'MAR', 'GM', 'F', 'LULU', 'TJX',

  // ── Consumer Staples ───────────────────────────────────────────────────
  'KO', 'PEP', 'PM', 'MO', 'CL', 'PG',

  // ── Industrial / Aerospace / Defense ──────────────────────────────────
  'BA', 'CAT', 'DE', 'GE', 'UPS', 'RTX', 'LMT', 'NOC', 'HON', 'FDX',

  // ── Energy ─────────────────────────────────────────────────────────────
  'XOM', 'CVX', 'COP', 'OXY', 'MPC', 'SLB',

  // ── Utilities / Clean Energy ───────────────────────────────────────────
  'NEE', 'LIN',

  // ── Communication & Media ──────────────────────────────────────────────
  'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS', 'SPOT', 'SNAP',

  // ── ETFs ───────────────────────────────────────────────────────────────
  'SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'SLV', 'USO', 'GDX',
  'XLF', 'XLE', 'XLK', 'XLV', 'XLY', 'XBI', 'SOXX', 'ARKK', 'EEM',
];

// Max symbols per /market-metrics API call
export const BATCH_SIZE = 20;

// Delay between batches (ms)
export const BATCH_DELAY_MS = 200;

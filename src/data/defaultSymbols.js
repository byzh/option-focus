// High-liquidity S&P 500 components + popular ETFs for IV scanning
// All symbols must be from S&P 500 index constituents (except ETFs)
export const DEFAULT_SYMBOLS = [
  // Mega-cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AVGO', 'AMD', 'CRM',
  'ORCL', 'ADBE', 'CSCO', 'INTC', 'QCOM', 'AMAT', 'MU', 'PANW', 'NOW', 'INTU',
  // Finance
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'BLK', 'SCHW', 'AXP', 'V', 'MA',
  // Healthcare
  'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'BMY', 'AMGN',
  // Consumer
  'DIS', 'NKE', 'SBUX', 'MCD', 'KO', 'PEP', 'WMT', 'COST', 'HD', 'LOW',
  'TGT', 'AMZN',
  // Industrial / Energy
  'XOM', 'CVX', 'COP', 'SLB', 'BA', 'CAT', 'DE', 'GE', 'UPS', 'RTX',
  // Communication
  'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS',
  // ETFs (not S&P 500 components, but essential for options trading)
  'SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'XLF', 'XLE', 'XLK', 'XBI', 'EEM',
];

// Max symbols per /market-metrics API call
export const BATCH_SIZE = 20;

// Delay between batches (ms)
export const BATCH_DELAY_MS = 200;

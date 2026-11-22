// Daily candle history via dxFeed DXLink (Candle event).
// Isolated from src/utils/dxFeedWebSocket.js: opens its own WebSocket connections
// and only reuses the read-only quote-token helper.
import { getQuoteToken } from '../../../utils/dxFeedWebSocket';

export const CANDLE_FIELDS = ['eventSymbol', 'eventFlags', 'time', 'open', 'high', 'low', 'close', 'volume'];

const FLAG_REMOVE = 0x02;
const FLAG_SNAPSHOT_END = 0x08;
const FLAG_SNAPSHOT_SNIP = 0x10;

const SYMBOL_PATTERN = /^[A-Z][A-Z./]{0,9}$/;
const MIN_TIME_MS = Date.UTC(1970, 0, 1);

/** "AAPL{=1d}" -> "AAPL"; returns null for anything that does not look like a ticker. */
export function baseSymbol(eventSymbol) {
  if (typeof eventSymbol !== 'string') return null;
  const brace = eventSymbol.indexOf('{');
  const sym = brace >= 0 ? eventSymbol.slice(0, brace) : eventSymbol;
  return SYMBOL_PATTERN.test(sym) ? sym : null;
}

export function toDateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Parse one COMPACT values array into rows. Pure and side-effect free.
 * @returns {Array<{symbol: string, flags: number, candle: object|null}>}
 *   candle is null for rows that carry no usable bar (removed / NaN / malformed).
 */
export function parseCandleValues(values, fieldOrder = CANDLE_FIELDS) {
  if (!Array.isArray(values) || !Array.isArray(fieldOrder) || fieldOrder.length === 0) return [];
  const stride = fieldOrder.length;
  const pos = Object.fromEntries(fieldOrder.map((f, i) => [f, i]));
  if (pos.eventSymbol == null || pos.time == null) return [];

  const rows = [];
  for (let i = 0; i + stride - 1 < values.length; i += stride) {
    const symbol = baseSymbol(values[i + pos.eventSymbol]);
    if (!symbol) continue;
    const flagsRaw = pos.eventFlags != null ? Number(values[i + pos.eventFlags]) : 0;
    const flags = Number.isInteger(flagsRaw) && flagsRaw >= 0 ? flagsRaw : 0;

    const time = Number(values[i + pos.time]);
    const open = Number(values[i + pos.open]);
    const high = Number(values[i + pos.high]);
    const low = Number(values[i + pos.low]);
    const close = Number(values[i + pos.close]);
    const volume = Number(values[i + pos.volume]);

    const valid =
      (flags & FLAG_REMOVE) === 0 &&
      Number.isFinite(time) && time > MIN_TIME_MS && time < Date.now() + 86400000 &&
      [open, high, low, close].every(v => Number.isFinite(v) && v > 0) &&
      high >= low &&
      Number.isFinite(volume) && volume >= 0;

    rows.push({
      symbol,
      flags,
      candle: valid ? { date: toDateKey(time), time, open, high, low, close, volume } : null,
    });
  }
  return rows;
}

/** New York calendar date and minutes-since-midnight for a timestamp. */
function nyClock(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = t => parts.find(p => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Drop today's bar while the regular session is still open (its volume is partial). */
export function dropIncompleteBar(candles, now = Date.now()) {
  if (!candles.length) return candles;
  const { date, minutes } = nyClock(now);
  const last = candles[candles.length - 1];
  if (last.date === date && minutes < 16 * 60 + 15) return candles.slice(0, -1);
  return candles;
}

function abortError() {
  const e = new Error('已中止');
  e.name = 'AbortError';
  return e;
}

/**
 * One WebSocket connection for one batch of symbols.
 * Resolves when every symbol reported SNAPSHOT_END/SNIP, or after an idle gap.
 */
function fetchBatch({ token, wsUrl, symbols, fromTime, signal, idleMs, hardMs }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }

    const wanted = new Set(symbols);
    const bars = new Map(symbols.map(s => [s, new Map()]));
    const done = new Set();
    const snipped = new Set();
    let fieldOrder = CANDLE_FIELDS;
    let idleTimer = null;
    let hardTimer = null;
    let settled = false;

    const ws = new WebSocket(wsUrl);

    const cleanup = () => {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      signal?.removeEventListener('abort', onAbort);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ bars, snipped });
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const onAbort = () => fail(abortError());
    signal?.addEventListener('abort', onAbort);

    hardTimer = setTimeout(finish, hardMs);
    const bumpIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, idleMs);
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'SETUP', channel: 0, version: '0.1', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'SETUP':
          ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token }));
          break;
        case 'AUTH_STATE':
          if (msg.state === 'AUTHORIZED') {
            ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
          }
          break;
        case 'CHANNEL_OPENED':
          if (msg.channel !== 1) break;
          ws.send(JSON.stringify({
            type: 'FEED_SETUP', channel: 1,
            acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
            acceptEventFields: { Candle: CANDLE_FIELDS },
          }));
          ws.send(JSON.stringify({
            type: 'FEED_SUBSCRIPTION', channel: 1, reset: true,
            add: symbols.map(s => ({ type: 'Candle', symbol: `${s}{=1d}`, fromTime })),
          }));
          bumpIdle();
          break;
        case 'FEED_CONFIG': {
          const f = msg.eventFields?.Candle;
          if (Array.isArray(f) && f.every(x => typeof x === 'string') && f.includes('eventSymbol') && f.includes('time')) {
            fieldOrder = f;
          }
          break;
        }
        case 'FEED_DATA': {
          if (msg.channel !== 1 || !Array.isArray(msg.data)) break;
          // COMPACT: [eventType, values, eventType, values, ...]
          for (let k = 0; k + 1 < msg.data.length; k += 2) {
            if (msg.data[k] !== 'Candle') continue;
            for (const row of parseCandleValues(msg.data[k + 1], fieldOrder)) {
              if (!wanted.has(row.symbol)) continue;
              if (row.candle) bars.get(row.symbol).set(row.candle.date, row.candle);
              if (row.flags & FLAG_SNAPSHOT_SNIP) snipped.add(row.symbol);
              if (row.flags & (FLAG_SNAPSHOT_END | FLAG_SNAPSHOT_SNIP)) done.add(row.symbol);
            }
          }
          if (done.size >= wanted.size) finish();
          else bumpIdle();
          break;
        }
        case 'KEEPALIVE':
          ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel }));
          break;
        case 'ERROR':
          fail(new Error('dxFeed 返回错误'));
          break;
        default:
          break;
      }
    };

    ws.onerror = () => fail(new Error('dxFeed WebSocket 连接错误'));
    ws.onclose = () => finish();
  });
}

/**
 * Fetch daily candles for many symbols, sequentially in small batches.
 * Nothing is persisted: data lives only in the caller's memory.
 *
 * @returns {Promise<{data: Map<string, Array>, failed: string[], snipped: string[]}>}
 */
export async function fetchDailyCandles(user, symbols, {
  fromDate = '1990-01-01',
  batchSize = 10,
  idleMs = 5000,
  hardMs = 90000,
  onProgress,
  signal,
} = {}) {
  const fromTime = Date.parse(`${fromDate}T00:00:00Z`);
  if (!Number.isFinite(fromTime)) throw new Error('起始日期格式无效');

  const unique = [...new Set(symbols.filter(s => SYMBOL_PATTERN.test(s)))];
  const data = new Map();
  const failed = [];
  const snipped = [];

  for (let i = 0; i < unique.length; i += batchSize) {
    if (signal?.aborted) throw abortError();
    const batch = unique.slice(i, i + batchSize);
    const { token, wsUrl } = await getQuoteToken(user);
    if (!token) throw new Error('未获取到 dxFeed token');

    try {
      const res = await fetchBatch({ token, wsUrl, symbols: batch, fromTime, signal, idleMs, hardMs });
      for (const sym of batch) {
        const sorted = [...res.bars.get(sym).values()].sort((a, b) => a.time - b.time);
        const clean = dropIncompleteBar(sorted);
        if (clean.length) data.set(sym, clean);
        else failed.push(sym);
        if (res.snipped.has(sym)) snipped.push(sym);
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      failed.push(...batch);
    }
    onProgress?.({ done: Math.min(i + batchSize, unique.length), total: unique.length });
  }

  return { data, failed, snipped };
}

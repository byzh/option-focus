import { describe, it, expect, vi } from 'vitest';

vi.mock('./apiClient', () => ({ callTastytradeApi: vi.fn() }));

import { parseFeedData } from './dxFeedStream';
import { buildSymbolMap, mergeQuoteBatch } from '../hooks/useOptionQuotes';
import { selectVisibleStrikes } from './optionStrikes';
import { normalizeTicker } from './marketData';
import { isMonthlyExpiration } from './dateUtils';

const strike = (p) => ({
  'strike-price': String(p),
  'call-streamer-symbol': `.X${p}C`,
  'put-streamer-symbol': `.X${p}P`,
});

describe('parseFeedData', () => {
  it('parses Quote rows', () => {
    const rows = parseFeedData(['Quote', ['.A', 1.1, 1.2, '.B', '2', '2.5']]);
    expect(rows).toEqual([
      { sym: '.A', update: { bid: 1.1, ask: 1.2 } },
      { sym: '.B', update: { bid: 2, ask: 2.5 } },
    ]);
  });

  it('parses multiple event types in one payload', () => {
    const rows = parseFeedData(['Quote', ['.A', 1, 2], 'Greeks', ['.A', 0.3, 0.45]]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ sym: '.A', update: { delta: 0.3, iv: 0.45 } });
  });

  it('sanitizes NaN and negative prices to null', () => {
    const rows = parseFeedData(['Quote', ['.A', 'NaN', -1]]);
    expect(rows[0].update).toEqual({ bid: null, ask: null });
  });

  it('ignores unknown event types, malformed payloads and empty symbols', () => {
    expect(parseFeedData(null)).toEqual([]);
    expect(parseFeedData(['Trade', ['.A', 1]])).toEqual([]);
    expect(parseFeedData(['Quote', 'oops'])).toEqual([]);
    expect(parseFeedData(['Quote', ['', 1, 2]])).toEqual([]);
  });

  it('drops a trailing incomplete row', () => {
    expect(parseFeedData(['Quote', ['.A', 1, 2, '.B', 3]])).toHaveLength(1);
  });
});

describe('buildSymbolMap', () => {
  it('maps call/put streamer symbols to normalized strike price', () => {
    const map = buildSymbolMap([{ ...strike(100), 'strike-price': '100.0' }]);
    expect(map.get('.X100C')).toEqual({ price: '100', side: 'call' });
    expect(map.get('.X100P')).toEqual({ price: '100', side: 'put' });
  });

  it('skips invalid strikes and missing symbols', () => {
    const map = buildSymbolMap([{ 'strike-price': 'abc', 'call-streamer-symbol': '.Z' }, { 'strike-price': '5' }]);
    expect(map.size).toBe(0);
    expect(buildSymbolMap(null).size).toBe(0);
  });
});

describe('mergeQuoteBatch', () => {
  const map = buildSymbolMap([strike(100)]);

  it('merges partial updates per side', () => {
    let q = mergeQuoteBatch({}, new Map([['.X100C', { bid: 1, ask: 1.2 }]]), map);
    q = mergeQuoteBatch(q, new Map([['.X100C', { delta: 0.5 }], ['.X100P', { bid: 0.9 }]]), map);
    expect(q['100']).toEqual({ call: { bid: 1, ask: 1.2, delta: 0.5 }, put: { bid: 0.9 } });
  });

  it('returns the same object when no known symbols are in the batch', () => {
    const prev = {};
    expect(mergeQuoteBatch(prev, new Map([['.OTHER', { bid: 1 }]]), map)).toBe(prev);
  });
});

describe('selectVisibleStrikes', () => {
  const strikes = [110, 90, 100, 105, 95].map(strike);

  it('sorts and centers on the strike nearest the underlying', () => {
    const { visible, atmPrice } = selectVisibleStrikes(strikes, 104, false, 1);
    expect(atmPrice).toBe('105');
    expect(visible.map(s => s['strike-price'])).toEqual(['100', '105', '110']);
  });

  it('falls back to the middle strike without an underlying price', () => {
    expect(selectVisibleStrikes(strikes, null, false, 0).atmPrice).toBe('100');
  });

  it('returns all strikes when showAll is set', () => {
    expect(selectVisibleStrikes(strikes, 100, true, 1).visible).toHaveLength(5);
  });

  it('handles empty input', () => {
    expect(selectVisibleStrikes(undefined, 100, false)).toEqual({ visible: [], atmPrice: null });
  });
});

describe('normalizeTicker', () => {
  it('upper-cases and trims valid tickers', () => {
    expect(normalizeTicker(' aapl ')).toBe('AAPL');
    expect(normalizeTicker('brk.b')).toBe('BRK.B');
  });

  it('rejects invalid input', () => {
    ['', '1ABC', 'AB/C', 'A B', 'ABCDEFGHIJK', '../x', null].forEach(v => {
      expect(normalizeTicker(v)).toBeNull();
    });
  });
});

describe('isMonthlyExpiration', () => {
  it('detects the third Friday', () => {
    expect(isMonthlyExpiration('2026-11-20')).toBe(true);
    expect(isMonthlyExpiration('2026-11-13')).toBe(false);
    expect(isMonthlyExpiration('2026-11-19')).toBe(false);
    expect(isMonthlyExpiration('')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveStreamerSymbol } from './useLeapsDelta';

const EXPIRATIONS = [
  {
    'expiration-date': '2026-08-21',
    strikes: [
      {
        'strike-price': '200.0',
        'call-streamer-symbol': '.AMZN260821C00200000',
        'put-streamer-symbol': '.AMZN260821P00200000',
      },
      {
        'strike-price': '210.0',
        'call-streamer-symbol': '.AMZN260821C00210000',
        'put-streamer-symbol': '.AMZN260821P00210000',
      },
      {
        'strike-price': '197.5',
        'call-streamer-symbol': '.AMZN260821C00197500',
        'put-streamer-symbol': '.AMZN260821P00197500',
      },
    ],
  },
  {
    'expiration-date': '2027-01-15',
    strikes: [
      {
        'strike-price': '250.0',
        'call-streamer-symbol': '.AMZN270115C00250000',
        'put-streamer-symbol': '.AMZN270115P00250000',
      },
    ],
  },
];

describe('resolveStreamerSymbol', () => {

  // ── happy path ────────────────────────────────────────────────────────────

  it('returns call-streamer-symbol for a CALL position', () => {
    const pos = { expiration: '2026-08-21', strike: '200', type: 'CALL' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBe('.AMZN260821C00200000');
  });

  it('returns put-streamer-symbol for a PUT position', () => {
    const pos = { expiration: '2026-08-21', strike: '200', type: 'PUT' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBe('.AMZN260821P00200000');
  });

  it('matches strike with trailing .0 in API response', () => {
    const pos = { expiration: '2026-08-21', strike: '210', type: 'CALL' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBe('.AMZN260821C00210000');
  });

  it('matches decimal strike (197.5)', () => {
    const pos = { expiration: '2026-08-21', strike: '197.5', type: 'CALL' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBe('.AMZN260821C00197500');
  });

  it('matches second expiration correctly', () => {
    const pos = { expiration: '2027-01-15', strike: '250', type: 'PUT' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBe('.AMZN270115P00250000');
  });

  // ── not found ─────────────────────────────────────────────────────────────

  it('returns null when expiration date not in chain', () => {
    const pos = { expiration: '2025-01-01', strike: '200', type: 'CALL' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBeNull();
  });

  it('returns null when strike not in expiration', () => {
    const pos = { expiration: '2026-08-21', strike: '999', type: 'CALL' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBeNull();
  });

  // ── null / bad input ──────────────────────────────────────────────────────

  it('returns null when expirations is null', () => {
    const pos = { expiration: '2026-08-21', strike: '200', type: 'CALL' };
    expect(resolveStreamerSymbol(null, pos)).toBeNull();
  });

  it('returns null when expirations is not an array', () => {
    expect(resolveStreamerSymbol({}, { expiration: '2026-08-21', strike: '200', type: 'CALL' })).toBeNull();
  });

  it('returns null when pos is null', () => {
    expect(resolveStreamerSymbol(EXPIRATIONS, null)).toBeNull();
  });

  it('returns null when strike is not a number', () => {
    const pos = { expiration: '2026-08-21', strike: 'abc', type: 'CALL' };
    expect(resolveStreamerSymbol(EXPIRATIONS, pos)).toBeNull();
  });

  // ── missing streamer symbol field ─────────────────────────────────────────

  it('returns null when call-streamer-symbol is missing from strike', () => {
    const exps = [{
      'expiration-date': '2026-08-21',
      strikes: [{ 'strike-price': '200.0', 'put-streamer-symbol': '.X260821P00200000' }],
    }];
    const pos = { expiration: '2026-08-21', strike: '200', type: 'CALL' };
    expect(resolveStreamerSymbol(exps, pos)).toBeNull();
  });

  it('returns null when put-streamer-symbol is missing from strike', () => {
    const exps = [{
      'expiration-date': '2026-08-21',
      strikes: [{ 'strike-price': '200.0', 'call-streamer-symbol': '.X260821C00200000' }],
    }];
    const pos = { expiration: '2026-08-21', strike: '200', type: 'PUT' };
    expect(resolveStreamerSymbol(exps, pos)).toBeNull();
  });
});

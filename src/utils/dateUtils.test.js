import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLocalTodayString,
  getETDateString,
  isExpired,
  calculateDTE,
} from './dateUtils';

// Fix system time to 2026-03-20 10:00 local for all date tests
const FIXED_DATE = new Date('2026-03-20T10:00:00');

describe('getLocalTodayString', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns local date in YYYY-MM-DD format', () => {
    vi.setSystemTime(FIXED_DATE);
    const result = getLocalTodayString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns correct date for fixed time', () => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    expect(getLocalTodayString()).toBe('2026-06-15');
  });
});

describe('getETDateString', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns date in YYYY-MM-DD format', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(getETDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns ET date (UTC-4/5) — could differ from local date near midnight', () => {
    // 2026-03-20 02:00 UTC = 2026-03-19 22:00 ET (UTC-4 in EDT)
    vi.setSystemTime(new Date('2026-03-20T02:00:00Z'));
    const et = getETDateString();
    expect(et).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // ET is behind UTC, so at 02:00 UTC it's still March 19 in ET
    expect(et).toBe('2026-03-19');
  });
});

describe('isExpired', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns false for null / undefined / empty string', () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
    expect(isExpired('')).toBe(false);
  });

  it('returns false when expiration is today', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(isExpired('2026-03-20')).toBe(false);
  });

  it('returns false when expiration is in the future', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(isExpired('2026-03-21')).toBe(false);
    expect(isExpired('2027-01-01')).toBe(false);
  });

  it('returns true when expiration was yesterday', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(isExpired('2026-03-19')).toBe(true);
  });

  it('returns true when expiration was far in the past', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(isExpired('2020-01-01')).toBe(true);
  });
});


describe('calculateDTE', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns null for null / undefined / empty string', () => {
    expect(calculateDTE(null)).toBeNull();
    expect(calculateDTE(undefined)).toBeNull();
    expect(calculateDTE('')).toBeNull();
  });

  it('returns 0 for today', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(calculateDTE('2026-03-20')).toBe(0);
  });

  it('returns positive values for future dates', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(calculateDTE('2026-03-21')).toBe(1);
    expect(calculateDTE('2026-03-27')).toBe(7);
    expect(calculateDTE('2026-06-19')).toBe(91);
    expect(calculateDTE('2027-03-20')).toBe(365);
  });

  it('returns negative values for past dates', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(calculateDTE('2026-03-19')).toBe(-1);
    expect(calculateDTE('2026-03-13')).toBe(-7);
  });

  it('is consistent with isExpired: calculateDTE < 0 iff isExpired', () => {
    vi.setSystemTime(FIXED_DATE);
    expect(calculateDTE('2026-03-19')).toBeLessThan(0);
    expect(isExpired('2026-03-19')).toBe(true);
    expect(calculateDTE('2026-03-20')).toBe(0);
    expect(isExpired('2026-03-20')).toBe(false);
    expect(calculateDTE('2026-03-21')).toBeGreaterThan(0);
    expect(isExpired('2026-03-21')).toBe(false);
  });
});

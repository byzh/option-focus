import { describe, it, expect } from 'vitest';
import { assessLeapsHealth } from './leapsHealth';

describe('assessLeapsHealth', () => {

  // ── null / unknown ─────────────────────────────────────────────────────────

  it('returns unknown when delta is null', () => {
    expect(assessLeapsHealth(200, null).level).toBe('unknown');
  });

  it('returns unknown when dte is null', () => {
    expect(assessLeapsHealth(null, 0.80).level).toBe('unknown');
  });

  it('returns unknown when both are null', () => {
    expect(assessLeapsHealth(null, null).level).toBe('unknown');
  });

  // ── danger: delta < 0.60 (any DTE, highest priority) ─────────────────────

  it('danger when delta=0.59, DTE=400', () => {
    expect(assessLeapsHealth(400, 0.59).level).toBe('danger');
  });

  it('danger when delta=0.59, DTE=200', () => {
    expect(assessLeapsHealth(200, 0.59).level).toBe('danger');
  });

  it('danger when delta=0.59, DTE=50 (danger beats roll)', () => {
    // delta < 0.60 takes priority over DTE < 90
    expect(assessLeapsHealth(50, 0.59).level).toBe('danger');
  });

  it('danger boundary: delta=0.599 → danger', () => {
    expect(assessLeapsHealth(200, 0.599).level).toBe('danger');
  });

  it('not danger at delta=0.60 exactly', () => {
    expect(assessLeapsHealth(200, 0.60).level).not.toBe('danger');
  });

  // ── roll: DTE < 90, delta ≥ 0.60 ──────────────────────────────────────────

  it('roll when DTE=89, delta=0.85', () => {
    expect(assessLeapsHealth(89, 0.85).level).toBe('roll');
  });

  it('roll when DTE=1, delta=0.90', () => {
    expect(assessLeapsHealth(1, 0.90).level).toBe('roll');
  });

  it('roll when DTE=0, delta=0.95', () => {
    expect(assessLeapsHealth(0, 0.95).level).toBe('roll');
  });

  it('roll message mentions DTE', () => {
    const result = assessLeapsHealth(45, 0.80);
    expect(result.level).toBe('roll');
    expect(result.message).toContain('45');
  });

  it('not roll at DTE=90 (boundary belongs to 90–180 band)', () => {
    expect(assessLeapsHealth(90, 0.85).level).not.toBe('roll');
  });

  // ── DTE > 365 ──────────────────────────────────────────────────────────────

  it('ok when DTE=366, delta=0.75', () => {
    expect(assessLeapsHealth(366, 0.75).level).toBe('ok');
  });

  it('ok when DTE=500, delta=0.90', () => {
    expect(assessLeapsHealth(500, 0.90).level).toBe('ok');
  });

  it('warn when DTE=366, delta=0.74', () => {
    expect(assessLeapsHealth(366, 0.74).level).toBe('warn');
  });

  it('warn message mentions threshold 0.75 for DTE>365', () => {
    expect(assessLeapsHealth(400, 0.72).message).toContain('0.75');
  });

  // ── DTE 180–365 ────────────────────────────────────────────────────────────

  it('ok when DTE=181, delta=0.80', () => {
    expect(assessLeapsHealth(181, 0.80).level).toBe('ok');
  });

  it('ok when DTE=365, delta=0.85', () => {
    expect(assessLeapsHealth(365, 0.85).level).toBe('ok');
  });

  it('warn when DTE=200, delta=0.79', () => {
    expect(assessLeapsHealth(200, 0.79).level).toBe('warn');
  });

  it('warn message mentions threshold 0.80 for DTE 180-365', () => {
    expect(assessLeapsHealth(250, 0.75).message).toContain('0.80');
  });

  // ── DTE 90–180 ─────────────────────────────────────────────────────────────

  it('ok when DTE=90, delta=0.85', () => {
    expect(assessLeapsHealth(90, 0.85).level).toBe('ok');
  });

  it('ok when DTE=180, delta=0.90', () => {
    expect(assessLeapsHealth(180, 0.90).level).toBe('ok');
  });

  it('warn when DTE=120, delta=0.84', () => {
    expect(assessLeapsHealth(120, 0.84).level).toBe('warn');
  });

  it('warn message mentions threshold 0.85 for DTE 90-180', () => {
    expect(assessLeapsHealth(100, 0.82).message).toContain('0.85');
  });

  // ── negative delta (puts) treated as abs value ─────────────────────────────

  it('abs(delta) used: delta=-0.82, DTE=200 → ok', () => {
    expect(assessLeapsHealth(200, -0.82).level).toBe('ok');
  });

  it('abs(delta) used: delta=-0.55 → danger', () => {
    expect(assessLeapsHealth(200, -0.55).level).toBe('danger');
  });
});

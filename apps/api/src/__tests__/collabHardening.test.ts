import { describe, expect, it, beforeEach } from 'vitest';
import { countUpgrade, upgradeLimiter, WS_LIMITS } from '../collab/yjsServer.js';

describe('collab upgrade limiter', () => {
  beforeEach(() => {
    upgradeLimiter.clear();
  });

  it('allows the first requests within a window', () => {
    const now = 1_000;
    for (let i = 0; i < WS_LIMITS.upgradeMaxPerWindow; i++) {
      expect(countUpgrade('1.2.3.4', now)).toBe(true);
    }
  });

  it('rejects once the per-window budget is exhausted', () => {
    const now = 1_000;
    for (let i = 0; i < WS_LIMITS.upgradeMaxPerWindow; i++) countUpgrade('5.6.7.8', now);
    expect(countUpgrade('5.6.7.8', now)).toBe(false);
  });

  it('opens a fresh window after it elapses', () => {
    const start = 2_000;
    const end = start + WS_LIMITS.upgradeWindowMs;
    for (let i = 0; i < WS_LIMITS.upgradeMaxPerWindow; i++) countUpgrade('9.9.9.9', start);
    expect(countUpgrade('9.9.9.9', start + 1)).toBe(false);
    expect(countUpgrade('9.9.9.9', end)).toBe(true);
  });

  it('keeps per-IP budgets independent', () => {
    const now = 3_000;
    for (let i = 0; i < WS_LIMITS.upgradeMaxPerWindow; i++) countUpgrade('1.1.1.1', now);
    expect(countUpgrade('1.1.1.1', now)).toBe(false);
    expect(countUpgrade('2.2.2.2', now)).toBe(true);
  });

  it('replaces a window rather than summing hits across windows', () => {
    const start = 4_000;
    const later = start + WS_LIMITS.upgradeWindowMs;
    for (let i = 0; i < 20; i++) countUpgrade(`10.0.0.${i}`, start);
    expect(upgradeLimiter.size).toBe(20);

    countUpgrade('10.0.0.0', later);
    // The same IP gets a clean entry for the new window, not accumulated hits.
    expect(upgradeLimiter.get('10.0.0.0')).toEqual({ windowStart: later, hits: 1 });
    // One entry per IP is retained; nothing accumulates across windows.
    expect(upgradeLimiter.size).toBe(20);
  });
});

describe('WS limits are sane', () => {
  it('caps a frame well below the default ws limit', () => {
    // ws's default accepts ~100 MiB frames; ours must be far tighter.
    expect(WS_LIMITS.maxPayload).toBeLessThan(2 * 1024 * 1024);
  });

  it('bounds fan-out and total rooms', () => {
    expect(WS_LIMITS.maxPerRoom).toBeGreaterThan(0);
    expect(WS_LIMITS.maxRooms).toBeGreaterThan(0);
  });
});

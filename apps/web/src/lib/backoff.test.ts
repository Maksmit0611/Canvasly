import { describe, expect, it } from 'vitest';
import { backoffDelay, BACKOFF_CAP_MS } from './backoff';

describe('backoffDelay', () => {
  it('follows 1s, 2s, 4s, 8s', () => {
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(1)).toBe(2000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(3)).toBe(8000);
  });

  it('caps at 30s', () => {
    expect(backoffDelay(10)).toBe(BACKOFF_CAP_MS);
    expect(backoffDelay(100)).toBe(BACKOFF_CAP_MS);
  });
});

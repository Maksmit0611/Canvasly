/** Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s. */
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_CAP_MS = 30_000;

export function backoffDelay(attempt: number, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS): number {
  if (attempt <= 0) return base;
  return Math.min(cap, base * 2 ** attempt);
}

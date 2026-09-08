import rateLimit, { type Options } from 'express-rate-limit';
import type { ApiErrorBody } from '@canvas/shared';
import { isProduction, isTest } from '../config.js';

const body: ApiErrorBody = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
};

/**
 * Production enforces the real limits. Development and E2E runs share one
 * loopback address and would otherwise exhaust a 100-request budget within a
 * couple of test runs, making a healthy server look broken — so the ceiling is
 * raised there rather than the mechanism being switched off.
 */
const LIMIT_FACTOR = isProduction ? 1 : 50;

const make = (windowMs: number, max: number): ReturnType<typeof rateLimit> =>
  rateLimit({
    windowMs,
    limit: max * LIMIT_FACTOR,
    // Limits would make the unit suite flaky, so they are bypassed there.
    // (`limit: 0` is not the way to do this — in v8 it blocks every request.)
    skip: () => isTest,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: body,
  } satisfies Partial<Options>);

export const generalLimiter = make(15 * 60_000, 100);
export const authLimiter = make(15 * 60_000, 10);
export const uploadLimiter = make(60 * 60_000, 20);

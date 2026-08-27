import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodIssue, ZodTypeAny } from 'zod';
import { ApiError } from '../errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/** Flatten Zod issues into a details object keyed by field path. */
const toDetails = (issues: readonly ZodIssue[]): Record<string, unknown> => {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '(root)';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
};

/**
 * Parse with safeParse rather than parse + `instanceof ZodError`. The schemas
 * come from @canvas/shared, which resolves its own copy of zod's CJS build
 * while this app may load the ESM one — across that boundary the ZodError
 * classes are different identities and instanceof silently fails.
 */
const parseOrThrow = (schema: ZodTypeAny, value: unknown, source: string): unknown => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ApiError('VALIDATION_ERROR', `Invalid request ${source}`, toDetails(result.error.issues));
};

/**
 * Validate and replace `req.body` / `req.params` / `req.query` with the parsed
 * result, so downstream handlers see coerced, defaulted, typed data and never
 * the raw input.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = parseOrThrow(schemas.body, req.body, 'body');
      if (schemas.params) {
        Object.assign(req.params, parseOrThrow(schemas.params, req.params, 'parameters') as object);
      }
      if (schemas.query) {
        // req.query has only a getter on Express 5; mutate in place to stay
        // compatible with both major versions.
        const parsed = parseOrThrow(schemas.query, req.query, 'query') as Record<string, unknown>;
        for (const key of Object.keys(req.query)) delete (req.query as Record<string, unknown>)[key];
        Object.assign(req.query, parsed);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/** Flatten Zod issues into a details object keyed by field path. */
const toDetails = (err: ZodError): Record<string, unknown> => {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '(root)';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
};

/**
 * Validate and replace `req.body` / `req.params` / `req.query` with the parsed
 * result, so downstream handlers see coerced, defaulted, typed data and never
 * the raw input.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) {
        Object.assign(req.params, schemas.params.parse(req.params) as object);
      }
      if (schemas.query) {
        // req.query has only a getter on Express 5; mutate in place to stay
        // compatible with both major versions.
        const parsed = schemas.query.parse(req.query) as Record<string, unknown>;
        for (const key of Object.keys(req.query)) delete (req.query as Record<string, unknown>)[key];
        Object.assign(req.query, parsed);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ApiError('VALIDATION_ERROR', 'Request validation failed', toDetails(err)));
        return;
      }
      next(err);
    }
  };
}

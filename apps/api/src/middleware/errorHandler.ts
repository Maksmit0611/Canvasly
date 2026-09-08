import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody, ErrorCode } from '@canvas/shared';
import { ApiError } from '../errors.js';
import { logger } from '../logger.js';

const envelope = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorBody => ({
  error: details ? { code, message, details } : { code, message },
});

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(envelope('NOT_FOUND', `Cannot ${req.method} ${req.path}`));
};

/**
 * Terminal error handler. Known ApiErrors surface their message; anything else
 * is logged in full server-side and reported to the client as a bare INTERNAL,
 * so stack traces and SQL never leave the process.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err, path: req.path }, err.message);
    else logger.debug({ code: err.code, path: req.path }, err.message);
    res.status(err.status).json(envelope(err.code, err.message, err.details));
    return;
  }

  // Body parser rejections carry their own status; map the ones we care about.
  const raw = err as { type?: string; status?: number; message?: string };
  if (raw?.type === 'entity.too.large') {
    res.status(413).json(envelope('PAYLOAD_TOO_LARGE', 'Request body is too large'));
    return;
  }
  if (raw?.type === 'entity.parse.failed') {
    res.status(400).json(envelope('VALIDATION_ERROR', 'Request body is not valid JSON'));
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  res.status(500).json(envelope('INTERNAL', 'An unexpected error occurred'));
};

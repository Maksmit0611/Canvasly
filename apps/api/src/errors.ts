import { ERROR_STATUS, type ErrorCode } from '@canvas/shared';

/** An error whose code, status and message are safe to send to the client. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export const notFound = (what = 'Resource'): ApiError =>
  new ApiError('NOT_FOUND', `${what} not found`);

export const unauthenticated = (message = 'Authentication required'): ApiError =>
  new ApiError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource'): ApiError =>
  new ApiError('FORBIDDEN', message);

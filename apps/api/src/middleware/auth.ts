import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/tokens.js';
import { unauthenticated } from '../errors.js';

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const bearer = (header: string | undefined): string | null => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

/** Reject the request unless it carries a valid access token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = bearer(req.headers.authorization);
  if (!token) {
    next(unauthenticated('Authentication required'));
    return;
  }

  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, email: claims.email };
    next();
  } catch (err) {
    next(err);
  }
}

/** Populate `req.user` when a valid token is present, but never reject. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = bearer(req.headers.authorization);
  if (token) {
    try {
      const claims = verifyAccessToken(token);
      req.user = { id: claims.sub, email: claims.email };
    } catch {
      // An unusable token is treated as no token on optional routes.
    }
  }
  next();
}

/** Narrow `req.user` for handlers mounted behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthenticated('Authentication required');
  return req.user;
}

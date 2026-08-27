import jwt from 'jsonwebtoken';
import { AccessTokenClaimsSchema, RefreshTokenClaimsSchema } from '@canvas/shared';
import type { AccessTokenClaims, RefreshTokenClaims } from '@canvas/shared';
import { config, isProduction } from '../config.js';
import { unauthenticated } from '../errors.js';

const ISSUER = 'canvasly';
const ACCESS_AUD = 'canvasly:access';
const REFRESH_AUD = 'canvasly:refresh';

export const REFRESH_COOKIE = 'canvasly_rt';

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign({ email: claims.email }, config.JWT_SECRET, {
    subject: claims.sub,
    issuer: ISSUER,
    audience: ACCESS_AUD,
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(claims: RefreshTokenClaims): string {
  return jwt.sign({}, config.JWT_SECRET, {
    subject: claims.sub,
    issuer: ISSUER,
    audience: REFRESH_AUD,
    expiresIn: config.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verify an access token. The audience check is what stops a refresh token
 * from being replayed as an access token — both are signed with the same key.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      issuer: ISSUER,
      audience: ACCESS_AUD,
    });
    return AccessTokenClaimsSchema.parse(payload);
  } catch {
    throw unauthenticated('Invalid or expired token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      issuer: ISSUER,
      audience: REFRESH_AUD,
    });
    return RefreshTokenClaimsSchema.parse(payload);
  } catch {
    throw unauthenticated('Invalid or expired refresh token');
  }
}

export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
} as const;

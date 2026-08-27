import { Router } from 'express';
import { GoogleAuthRequestSchema } from '@canvas/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { verifyGoogleCredential } from '../auth/google.js';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../auth/tokens.js';
import { upsertUser, findUserById } from '../db/queries/users.js';
import { notFound, unauthenticated } from '../errors.js';

export const authRouter = Router();

authRouter.post(
  '/auth/google',
  authLimiter,
  validate({ body: GoogleAuthRequestSchema }),
  async (req, res, next) => {
    try {
      const { credential } = req.body as { credential: string };
      const identity = await verifyGoogleCredential(credential);

      const user = await upsertUser({
        email: identity.email,
        name: identity.name,
        avatarUrl: identity.avatarUrl,
        oauthProvider: 'google',
        oauthSubject: identity.subject,
      });

      res.cookie(REFRESH_COOKIE, signRefreshToken({ sub: user.id }), refreshCookieOptions);
      res.json({ token: signAccessToken({ sub: user.id, email: user.email }), user });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/auth/refresh', authLimiter, async (req, res, next) => {
  try {
    const cookie = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!cookie) throw unauthenticated('No refresh token');

    const claims = verifyRefreshToken(cookie);
    const user = await findUserById(claims.sub);
    // The account may have been deleted since the cookie was issued.
    if (!user) throw unauthenticated('Session no longer valid');

    res.json({ token: signAccessToken({ sub: user.id, email: user.email }), user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(currentUser(req).id);
    if (!user) throw notFound('User');
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

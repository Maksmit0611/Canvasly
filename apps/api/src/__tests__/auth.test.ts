import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked before the app is imported, so no test ever reaches Google's servers.
const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

import request from 'supertest';
import { app } from '../app.js';
import { closePool, query } from '../db/pool.js';
import { signAccessToken, signRefreshToken } from '../auth/tokens.js';

const SUBJECT = 'google-subject-test-1';
const EMAIL = 'phase5-test@example.com';

const googlePayload = (over: Record<string, unknown> = {}) => ({
  getPayload: () => ({
    sub: SUBJECT,
    email: EMAIL,
    email_verified: true,
    name: 'Phase Five',
    picture: 'https://example.com/avatar.png',
    ...over,
  }),
});

const cleanup = async (): Promise<void> => {
  await query(`DELETE FROM users WHERE email = $1 OR oauth_subject = $2`, [EMAIL, SUBJECT]);
};

beforeEach(async () => {
  verifyIdToken.mockReset();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('POST /api/auth/google', () => {
  it('creates the user, returns a token and sets the refresh cookie', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());

    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: EMAIL, name: 'Phase Five' });

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('canvasly_rt=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const rows = await query(`SELECT email FROM users WHERE email = $1`, [EMAIL]);
    expect(rows).toHaveLength(1);
  });

  it('signing in twice reuses the same user row', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());
    const first = await request(app).post('/api/auth/google').send({ credential: 't' });
    const second = await request(app).post('/api/auth/google').send({ credential: 't' });

    expect(second.body.user.id).toBe(first.body.user.id);
    const rows = await query(`SELECT id FROM users WHERE oauth_subject = $1`, [SUBJECT]);
    expect(rows).toHaveLength(1);
  });

  it('rejects an unverified email', async () => {
    verifyIdToken.mockResolvedValue(googlePayload({ email_verified: false }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a credential Google will not verify', async () => {
    verifyIdToken.mockRejectedValue(new Error('Invalid token signature'));
    const res = await request(app).post('/api/auth/google').send({ credential: 'forged' });

    expect(res.status).toBe(401);
    // The underlying library message must not leak to the client.
    expect(res.body.error.message).not.toContain('signature');
  });

  it('rejects a missing credential with VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('protected routes', () => {
  it('401s with no Authorization header', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  });

  it('401s on a malformed token', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('401s when the scheme is not Bearer', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('401s on a token signed with the wrong secret', async () => {
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhIiwiZW1haWwiOiJhQGIuY29tIn0.' +
      'ZmFrZS1zaWduYXR1cmU';
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects a refresh token replayed as an access token', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());
    const login = await request(app).post('/api/auth/google').send({ credential: 't' });
    const refresh = signRefreshToken({ sub: login.body.user.id });

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${refresh}`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid access token', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());
    const login = await request(app).post('/api/auth/google').send({ credential: 't' });

    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a fresh access token from the cookie', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());
    const login = await request(app).post('/api/auth/google').send({ credential: 't' });
    const cookie = login.headers['set-cookie'];

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(EMAIL);
  });

  it('401s with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('401s when the user behind the cookie is gone', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());
    const login = await request(app).post('/api/auth/google').send({ credential: 't' });
    await cleanup();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', login.headers['set-cookie']);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());
    const login = await request(app).post('/api/auth/google').send({ credential: 't' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(EMAIL);
  });
});

describe('cross-user isolation', () => {
  it('one user cannot read another user\'s project', async () => {
    verifyIdToken.mockResolvedValue(googlePayload());
    const owner = await request(app).post('/api/auth/google').send({ credential: 't' });
    const project = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.body.token}`)
      .send({ title: 'Private board' });
    expect(project.status).toBe(201);

    // A different Google identity signing in for the first time.
    verifyIdToken.mockResolvedValue(
      googlePayload({ sub: 'other-subject', email: 'other-phase5@example.com' }),
    );
    const intruder = await request(app).post('/api/auth/google').send({ credential: 't2' });

    const res = await request(app)
      .get(`/api/projects/${project.body.id}`)
      .set('Authorization', `Bearer ${intruder.body.token}`);

    expect(res.status).toBe(404);

    await query(`DELETE FROM users WHERE email = $1`, ['other-phase5@example.com']);
  });
});

describe('token expiry', () => {
  it('rejects an expired access token', async () => {
    const expired = signAccessToken({
      sub: '00000000-0000-4000-8000-000000000000',
      email: 'a@b.com',
    });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60_000);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${expired}`);
    vi.useRealTimers();

    expect(res.status).toBe(401);
  });
});

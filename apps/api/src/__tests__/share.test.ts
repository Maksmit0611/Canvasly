import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

import request from 'supertest';
import { app } from '../app.js';
import { closePool, query } from '../db/pool.js';

const EMAIL = 'share-test@example.com';
const OTHER = 'share-other@example.com';

let token = '';
let otherToken = '';
let projectId = '';

const asUser = (sub: string, email: string) => ({
  getPayload: () => ({ sub, email, email_verified: true, name: 'Share' }),
});

const cleanup = async (): Promise<void> => {
  await query(`DELETE FROM users WHERE email IN ($1, $2)`, [EMAIL, OTHER]);
};

beforeAll(async () => {
  await cleanup();

  verifyIdToken.mockResolvedValue(asUser('share-subject', EMAIL));
  token = (await request(app).post('/api/auth/google').send({ credential: 't' })).body.token;

  verifyIdToken.mockResolvedValue(asUser('share-other-subject', OTHER));
  otherToken = (await request(app).post('/api/auth/google').send({ credential: 't2' })).body.token;

  projectId = (
    await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Shared board' })
  ).body.id;
});

beforeEach(() => {
  verifyIdToken.mockResolvedValue(asUser('share-subject', EMAIL));
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

const createLink = (permission: 'view' | 'edit' = 'view', expiresAt?: string) =>
  request(app)
    .post(`/api/projects/${projectId}/share`)
    .set('Authorization', `Bearer ${token}`)
    .send(expiresAt ? { permission, expiresAt } : { permission });

describe('share links', () => {
  it('creates a link with a high-entropy token', async () => {
    const res = await createLink('view');

    expect(res.status).toBe(201);
    expect(res.body.permission).toBe('view');
    // 24 random bytes as base64url — long enough that guessing is hopeless.
    expect(res.body.token.length).toBeGreaterThanOrEqual(32);
    expect(res.body.url).toContain(`/s/${res.body.token}`);
  });

  it('never issues the same token twice', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 5; i++) tokens.add((await createLink()).body.token);
    expect(tokens.size).toBe(5);
  });

  it('resolves anonymously to a read-only board', async () => {
    const link = await createLink('view');

    // No Authorization header: this is the point of a share link.
    const res = await request(app).get(`/api/share/${link.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.permission).toBe('view');
    expect(res.body.project.id).toBe(projectId);
    expect(Array.isArray(res.body.elements)).toBe(true);
  });

  it('404s after revocation', async () => {
    const link = await createLink('view');
    expect((await request(app).get(`/api/share/${link.body.token}`)).status).toBe(200);

    const revoked = await request(app)
      .delete(`/api/share/${link.body.token}`)
      .set('Authorization', `Bearer ${token}`);
    expect(revoked.status).toBe(200);

    const after = await request(app).get(`/api/share/${link.body.token}`);
    expect(after.status).toBe(404);
  });

  it('404s once expired', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const link = await createLink('view', past);

    const res = await request(app).get(`/api/share/${link.body.token}`);
    expect(res.status).toBe(404);
  });

  it('honours a future expiry', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const link = await createLink('view', future);

    expect((await request(app).get(`/api/share/${link.body.token}`)).status).toBe(200);
  });

  it('404s for an unknown token', async () => {
    const res = await request(app).get('/api/share/definitely-not-a-real-token-value');
    expect(res.status).toBe(404);
  });

  it("does not let another user create a link for someone else's project", async () => {
    verifyIdToken.mockResolvedValue(asUser('share-other-subject', OTHER));
    const res = await request(app)
      .post(`/api/projects/${projectId}/share`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ permission: 'view' });

    expect(res.status).toBe(404);
  });

  it('does not let another user revoke a link they do not own', async () => {
    const link = await createLink('view');

    verifyIdToken.mockResolvedValue(asUser('share-other-subject', OTHER));
    const res = await request(app)
      .delete(`/api/share/${link.body.token}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
    // The link must still work for its intended audience.
    expect((await request(app).get(`/api/share/${link.body.token}`)).status).toBe(200);
  });

  it('rejects an invalid permission', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permission: 'admin' });

    expect(res.status).toBe(400);
  });

  it('requires auth to create a link', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/share`)
      .send({ permission: 'view' });
    expect(res.status).toBe(401);
  });

  it('lists a project\'s active links', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/share`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('reserved AI route', () => {
  it('is authenticated and returns 501 until the milestone lands', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/ai/command`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'draw a flowchart', selectedIds: [] });

    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('401s without a token', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/ai/command`)
      .send({ prompt: 'hello', selectedIds: [] });
    expect(res.status).toBe(401);
  });

  it('validates the prompt', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/ai/command`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: '' });
    expect(res.status).toBe(400);
  });
});

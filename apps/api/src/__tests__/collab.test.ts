import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { app } from '../app.js';
import { closePool, query } from '../db/pool.js';
import { authorizeCollab, resetCollabRooms } from '../collab/yjsServer.js';
import { signAccessToken, signRefreshToken } from '../auth/tokens.js';
import { LocalStorage } from '../storage/LocalStorage.js';
import { findLatestSnapshot, insertSnapshot, pruneSnapshots } from '../db/queries/snapshots.js';
import { createShareLink } from '../db/queries/shareLinks.js';

const EMAIL = 'collab-test@example.com';
const OTHER = 'collab-other@example.com';

let token = '';
let userId = '';
let otherId = '';
let projectId = '';

const asUser = (sub: string, email: string) => ({
  getPayload: () => ({ sub, email, email_verified: true, name: 'Collab' }),
});

const url = (params: Record<string, string>): URL => {
  const u = new URL('ws://localhost:5050/collab');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
};

const cleanup = async (): Promise<void> => {
  await query(`DELETE FROM users WHERE email IN ($1, $2)`, [EMAIL, OTHER]);
};

beforeAll(async () => {
  await cleanup();

  verifyIdToken.mockResolvedValue(asUser('collab-subject', EMAIL));
  const login = await request(app).post('/api/auth/google').send({ credential: 't' });
  token = login.body.token;
  userId = login.body.user.id;

  verifyIdToken.mockResolvedValue(asUser('collab-other-subject', OTHER));
  otherId = (await request(app).post('/api/auth/google').send({ credential: 't2' })).body.user.id;

  projectId = (
    await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Collab board' })
  ).body.id;
});

afterAll(async () => {
  resetCollabRooms();
  await cleanup();
  await closePool();
});

describe('authorizeCollab', () => {
  it('accepts the project owner with a valid access token', async () => {
    const identity = await authorizeCollab(url({ project: projectId, token }));
    expect(identity).toEqual({ projectId, userId, permission: 'edit' });
  });

  it('rejects a request with no credentials at all', async () => {
    expect(await authorizeCollab(url({ project: projectId }))).toBeNull();
  });

  it('rejects a missing project parameter', async () => {
    expect(await authorizeCollab(url({ token }))).toBeNull();
  });

  it('rejects a forged token', async () => {
    expect(await authorizeCollab(url({ project: projectId, token: 'not-a-jwt' }))).toBeNull();
  });

  it("rejects a valid token for someone else's project", async () => {
    const intruder = signAccessToken({ sub: otherId, email: OTHER });
    expect(await authorizeCollab(url({ project: projectId, token: intruder }))).toBeNull();
  });

  it('rejects a refresh token replayed as an access token', async () => {
    const refresh = signRefreshToken({ sub: userId });
    expect(await authorizeCollab(url({ project: projectId, token: refresh }))).toBeNull();
  });

  it('accepts a live share token, carrying its permission', async () => {
    const shareToken = randomBytes(24).toString('base64url');
    await createShareLink({
      projectId, token: shareToken, permission: 'view', createdBy: userId, expiresAt: null,
    });

    const identity = await authorizeCollab(url({ project: projectId, share: shareToken }));
    expect(identity).toEqual({ projectId, userId: null, permission: 'view' });
  });

  it('rejects a share token issued for a different project', async () => {
    const shareToken = randomBytes(24).toString('base64url');
    await createShareLink({
      projectId, token: shareToken, permission: 'view', createdBy: userId, expiresAt: null,
    });

    const elsewhere = await authorizeCollab(
      url({ project: '00000000-0000-4000-8000-000000000000', share: shareToken }),
    );
    expect(elsewhere).toBeNull();
  });

  it('rejects an expired share token', async () => {
    const shareToken = randomBytes(24).toString('base64url');
    await createShareLink({
      projectId,
      token: shareToken,
      permission: 'view',
      createdBy: userId,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(await authorizeCollab(url({ project: projectId, share: shareToken }))).toBeNull();
  });
});

describe('project snapshots', () => {
  it('round-trips binary state and returns the newest', async () => {
    const first = Buffer.from([1, 2, 3]);
    const second = Buffer.from([9, 8, 7, 6]);

    await insertSnapshot(projectId, first);
    await new Promise((r) => setTimeout(r, 10));
    await insertSnapshot(projectId, second);

    const latest = await findLatestSnapshot(projectId);
    expect(Buffer.from(latest!.ydoc_state)).toEqual(second);
  });

  it('prunes all but the newest few', async () => {
    for (let i = 0; i < 8; i++) {
      await insertSnapshot(projectId, Buffer.from([i]));
      await new Promise((r) => setTimeout(r, 5));
    }

    await pruneSnapshots(projectId, 3);
    const rows = await query(`SELECT id FROM project_snapshots WHERE project_id = $1`, [projectId]);
    expect(rows).toHaveLength(3);
  });

  it('returns null for a project with no snapshots', async () => {
    const empty = (
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Empty' })
    ).body.id;

    expect(await findLatestSnapshot(empty)).toBeNull();
  });
});

describe('LocalStorage adapter', () => {
  let root = '';
  let storage: LocalStorage;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'canvasly-storage-'));
    storage = new LocalStorage(root);
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips a file', async () => {
    const data = Buffer.from('hello world');
    await storage.put('project/asset.png', data, 'image/png');
    expect(await storage.get('project/asset.png')).toEqual(data);
  });

  it('streams a stored file', async () => {
    await storage.put('project/stream.bin', Buffer.from('abc'), 'application/octet-stream');
    const stream = await storage.getStream('project/stream.bin');

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('abc');
  });

  it('404s for a missing key', async () => {
    await expect(storage.get('project/nope.png')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(storage.getStream('project/nope.png')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a key that escapes the storage root', async () => {
    // Keys are server-generated today, but a traversal must never resolve.
    await expect(storage.put('../escaped.png', Buffer.from('x'), 'image/png')).rejects.toThrow(
      /escapes the upload root/,
    );
    await expect(storage.get('../../etc/passwd')).rejects.toThrow(/escapes the upload root/);
  });

  it('deletes without complaining about a missing file', async () => {
    await storage.put('project/gone.png', Buffer.from('x'), 'image/png');
    await storage.delete('project/gone.png');
    await expect(storage.get('project/gone.png')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(storage.delete('project/gone.png')).resolves.toBeUndefined();
  });

  it('builds a URL for a key', async () => {
    expect(await storage.url('abc')).toContain('/api/assets/abc/raw');
  });
});

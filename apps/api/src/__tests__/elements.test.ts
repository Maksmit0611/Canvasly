import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { CanvasElement } from '@canvas/shared';
import { app } from '../app.js';
import { closePool, query } from '../db/pool.js';

const EMAIL = 'elements-test@example.com';
const OTHER = 'elements-other@example.com';

let token = '';
let projectId = '';

const asUser = (sub: string, email: string) => ({
  getPayload: () => ({ sub, email, email_verified: true, name: 'Elements' }),
});

const element = (over: Partial<CanvasElement> = {}): CanvasElement =>
  ({
    id: randomUUID(),
    type: 'rectangle',
    x: 0, y: 0, width: 100, height: 50, angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent',
    strokeWidth: 2, strokeStyle: 'solid', fillStyle: 'solid',
    roughness: 'artist', opacity: 1, cornerRadius: 0,
    startArrowhead: 'none', endArrowhead: 'none',
    fontFamily: 'Inter', fontSize: 16, textAlign: 'left',
    verticalAlign: 'top', lineHeight: 1.4,
    zIndex: 0, locked: false, isDeleted: false, version: 1,
    updatedAt: new Date().toISOString(),
    ...over,
  }) as CanvasElement;

const cleanup = async (): Promise<void> => {
  await query(`DELETE FROM users WHERE email IN ($1, $2)`, [EMAIL, OTHER]);
};

beforeAll(async () => {
  await cleanup();
  verifyIdToken.mockResolvedValue(asUser('elements-subject', EMAIL));

  const login = await request(app).post('/api/auth/google').send({ credential: 't' });
  token = login.body.token;

  const project = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Batch board' });
  projectId = project.body.id;
});

beforeEach(async () => {
  verifyIdToken.mockResolvedValue(asUser('elements-subject', EMAIL));
  await query(`DELETE FROM elements WHERE project_id = $1`, [projectId]);
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

const post = (body: object, auth = token) =>
  request(app)
    .post(`/api/projects/${projectId}/elements/batch`)
    .set('Authorization', `Bearer ${auth}`)
    .send(body);

describe('POST /projects/:id/elements/batch', () => {
  it('upserts elements and reads them back', async () => {
    const a = element({ zIndex: 0, plainText: 'one' });
    const b = element({ zIndex: 1, plainText: 'two' });

    const res = await post({ upserts: [a, b], deletes: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, upserted: 2, deleted: 0 });

    const list = await request(app)
      .get(`/api/projects/${projectId}/elements`)
      .set('Authorization', `Bearer ${token}`);

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.map((e: CanvasElement) => e.plainText).sort()).toEqual(['one', 'two']);
  });

  it('updates an existing element in place', async () => {
    const a = element({ plainText: 'first' });
    await post({ upserts: [a], deletes: [] });
    await post({ upserts: [{ ...a, version: 2, plainText: 'second' }], deletes: [] });

    const list = await request(app)
      .get(`/api/projects/${projectId}/elements`)
      .set('Authorization', `Bearer ${token}`);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].plainText).toBe('second');
  });

  it('rejects a stale version rather than clobbering newer data', async () => {
    const a = element({ version: 5, plainText: 'v5' });
    await post({ upserts: [a], deletes: [] });

    // A client that has been offline sends an older version.
    await post({ upserts: [{ ...a, version: 2, plainText: 'v2-stale' }], deletes: [] });

    const list = await request(app)
      .get(`/api/projects/${projectId}/elements`)
      .set('Authorization', `Bearer ${token}`);

    expect(list.body[0].plainText).toBe('v5');
  });

  it('soft-deletes so a CRDT merge cannot resurrect the row', async () => {
    const a = element();
    await post({ upserts: [a], deletes: [] });

    const res = await post({ upserts: [], deletes: [a.id] });
    expect(res.body.deleted).toBe(1);

    const list = await request(app)
      .get(`/api/projects/${projectId}/elements`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);

    const rows = await query<{ is_deleted: boolean }>(
      `SELECT is_deleted FROM elements WHERE id = $1`,
      [a.id],
    );
    expect(rows[0]?.is_deleted).toBe(true);
  });

  it('applies the whole batch or none of it', async () => {
    const good = element();
    // An element failing schema validation must stop the entire batch.
    const res = await post({ upserts: [good, { ...element(), strokeWidth: 999 }], deletes: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const rows = await query(`SELECT id FROM elements WHERE project_id = $1`, [projectId]);
    expect(rows).toHaveLength(0);
  });

  it('rejects a malformed element', async () => {
    const res = await post({ upserts: [{ id: 'not-a-uuid', type: 'rectangle' }], deletes: [] });
    expect(res.status).toBe(400);
  });

  it('defaults missing arrays rather than failing', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ upserted: 0, deleted: 0 });
  });

  it('401s without a token', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/elements/batch`)
      .send({ upserts: [], deletes: [] });
    expect(res.status).toBe(401);
  });

  it("404s on another user's project", async () => {
    verifyIdToken.mockResolvedValue(asUser('elements-other-subject', OTHER));
    const other = await request(app).post('/api/auth/google').send({ credential: 't2' });

    const res = await post({ upserts: [element()], deletes: [] }, other.body.token);
    expect(res.status).toBe(404);
  });

  it('touches the project so the dashboard ordering updates', async () => {
    const before = await query<{ updated_at: Date }>(
      `SELECT updated_at FROM projects WHERE id = $1`,
      [projectId],
    );
    await new Promise((r) => setTimeout(r, 20));
    await post({ upserts: [element()], deletes: [] });

    const after = await query<{ updated_at: Date }>(
      `SELECT updated_at FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(after[0]!.updated_at.getTime()).toBeGreaterThan(before[0]!.updated_at.getTime());
  });
});

describe('PATCH /projects/:id', () => {
  it('merges appState without dropping other keys', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ appState: { zoom: 2.5 } });

    expect(res.status).toBe(200);
    expect(res.body.appState.zoom).toBe(2.5);
    expect(res.body.appState.gridSize).toBe(20);
  });

  it('stores a thumbnail', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ thumbnail: 'data:image/jpeg;base64,abc' });

    expect(res.status).toBe(200);
    expect(res.body.thumbnail).toBe('data:image/jpeg;base64,abc');
  });

  it('rejects an oversized thumbnail', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ thumbnail: 'x'.repeat(500_000) });

    expect(res.status).toBe(400);
  });
});

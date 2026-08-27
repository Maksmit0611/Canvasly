import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { app } from '../app.js';
import { closePool, query } from '../db/pool.js';
import { config } from '../config.js';

const EMAIL = 'assets-test@example.com';
const SUBJECT = 'assets-subject';

let token = '';
let projectId = '';

/** A real 1x1 PNG, so magic-byte detection sees genuine PNG bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

const cleanup = async (): Promise<void> => {
  await query(`DELETE FROM users WHERE email IN ($1, $2)`, [EMAIL, 'assets-other@example.com']);
};

beforeAll(async () => {
  await cleanup();
  verifyIdToken.mockResolvedValue({
    getPayload: () => ({ sub: SUBJECT, email: EMAIL, email_verified: true, name: 'Assets' }),
  });

  const login = await request(app).post('/api/auth/google').send({ credential: 't' });
  token = login.body.token;

  const project = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Assets board' });
  projectId = project.body.id;
});

beforeEach(() => {
  verifyIdToken.mockResolvedValue({
    getPayload: () => ({ sub: SUBJECT, email: EMAIL, email_verified: true, name: 'Assets' }),
  });
});

afterAll(async () => {
  await fs.rm(path.resolve(config.UPLOAD_DIR, projectId), { recursive: true, force: true });
  await cleanup();
  await closePool();
});

describe('POST /api/projects/:id/assets', () => {
  it('accepts a real PNG', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, 'pixel.png');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'image', mimeType: 'image/png' });
    expect(res.body.pageCount).toBeNull();
  });

  it('reads the page count from a PDF', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await makePdf(5), 'doc.pdf');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'pdf', mimeType: 'application/pdf', pageCount: 5 });
  });

  it('rejects a text file renamed to .png', async () => {
    // The security check of this phase: the extension and Content-Type both
    // claim PNG, but the bytes say otherwise.
    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), {
        filename: 'nice.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an SVG, which is a scriptable format', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.svg');

    expect(res.status).toBe(400);
  });

  it('rejects a file over the size limit', async () => {
    const oversized = Buffer.concat([PNG, Buffer.alloc(config.MAX_UPLOAD_BYTES + 1024)]);
    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', oversized, 'big.png');

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('deduplicates identical uploads and stores one file', async () => {
    const pdf = await makePdf(2);

    const first = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdf, 'dup.pdf');
    const second = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdf, 'dup-renamed.pdf');

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const rows = await query(`SELECT id FROM assets WHERE project_id = $1 AND checksum = (
      SELECT checksum FROM assets WHERE id = $2)`, [projectId, first.body.id]);
    expect(rows).toHaveLength(1);
  });

  it('401s without a token', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .attach('file', PNG, 'p.png');
    expect(res.status).toBe(401);
  });

  it("404s when uploading to someone else's project", async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'assets-other-subject',
        email: 'assets-other@example.com',
        email_verified: true,
      }),
    });
    const other = await request(app).post('/api/auth/google').send({ credential: 't2' });

    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${other.body.token}`)
      .attach('file', PNG, 'p.png');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/assets/:id/raw', () => {
  let assetId = '';

  beforeEach(async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, 'pixel.png');
    assetId = res.body.id;
  });

  it('streams the bytes with hardening headers', async () => {
    const res = await request(app)
      .get(`/api/assets/${assetId}/raw`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(Buffer.from(res.body).subarray(0, 8)).toEqual(PNG.subarray(0, 8));
  });

  it('denies an anonymous request', async () => {
    const res = await request(app).get(`/api/assets/${assetId}/raw`);
    expect([403, 404]).toContain(res.status);
  });

  it("denies another user's request", async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'assets-other-subject',
        email: 'assets-other@example.com',
        email_verified: true,
      }),
    });
    const other = await request(app).post('/api/auth/google').send({ credential: 't2' });

    const res = await request(app)
      .get(`/api/assets/${assetId}/raw`)
      .set('Authorization', `Bearer ${other.body.token}`);

    expect([403, 404]).toContain(res.status);
  });

  it('404s for an unknown asset', async () => {
    const res = await request(app)
      .get('/api/assets/00000000-0000-4000-8000-000000000000/raw')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

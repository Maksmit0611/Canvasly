import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { closePool } from '../db/pool.js';

afterAll(async () => {
  await closePool();
});

describe('GET /api/health', () => {
  it('reports the service and database as ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('sets helmet security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('unknown routes', () => {
  it('returns the standard error envelope', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Cannot GET /api/does-not-exist' },
    });
  });

  it('applies to non-/api paths too', async () => {
    const res = await request(app).post('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('body parsing', () => {
  it('rejects malformed JSON with VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an oversized body with PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(3 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

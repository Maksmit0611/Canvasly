import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

// The web package is ESM, so __dirname does not exist here.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface Session {
  userId: string;
  token: string;
  email: string;
}

/**
 * Mint a session directly rather than driving Google's consent screen.
 *
 * The auth code paths are covered by the API integration tests with
 * `verifyIdToken` mocked; hitting Google from an E2E run would be slow, flaky,
 * and would require real credentials in CI.
 */
export function createSession(email = `e2e-${Date.now()}@example.com`): Session {
  const script = `
    require('dotenv').config({ path: '${REPO_ROOT}/.env' });
    const jwt = require('${REPO_ROOT}/node_modules/jsonwebtoken');
    const { Client } = require('${REPO_ROOT}/node_modules/pg');

    (async () => {
      const client = new Client({
        connectionString: process.env.DATABASE_URL ||
          'postgres://postgres:postgres@localhost:5432/' + (process.env.DB_NAME || 'canvas'),
      });
      await client.connect();

      const result = await client.query(
        \`INSERT INTO users (email, name, oauth_provider, oauth_subject, last_login_at)
         VALUES ($1, $2, 'google', $3, now())
         ON CONFLICT (oauth_provider, oauth_subject) DO UPDATE SET last_login_at = now()
         RETURNING id, email\`,
        ['${email}', 'E2E User', 'e2e-${email}'],
      );

      const user = result.rows[0];
      const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
        subject: user.id, issuer: 'canvasly', audience: 'canvasly:access', expiresIn: '2h',
      });

      console.log(JSON.stringify({ userId: user.id, token, email: user.email }));
      await client.end();
    })();
  `;

  const output = execFileSync('node', ['-e', script], { encoding: 'utf8' });
  return JSON.parse(output.trim().split('\n').pop()!) as Session;
}

export function deleteUser(email: string): void {
  const script = `
    require('dotenv').config({ path: '${REPO_ROOT}/.env' });
    const { Client } = require('${REPO_ROOT}/node_modules/pg');
    (async () => {
      const client = new Client({
        connectionString: 'postgres://postgres:postgres@localhost:5432/' + (process.env.DB_NAME || 'canvas'),
      });
      await client.connect();
      await client.query('DELETE FROM users WHERE email = $1', ['${email}']);
      await client.end();
    })();
  `;
  execFileSync('node', ['-e', script], { encoding: 'utf8' });
}

/** Apply the session to the app's in-memory stores. */
async function applySession(page: Page, session: Session): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__CANVAS_TEST__));
  await page.evaluate((s) => {
    const hook = window.__CANVAS_TEST__!;
    hook.auth.getState().setSession(
      {
        id: s.userId,
        email: s.email,
        name: 'E2E User',
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      },
      s.token,
    );
    hook.auth.getState().setRestoring(false);
  }, session);
}

/**
 * Navigate within the running app instead of loading a fresh document.
 *
 * The access token lives in memory only (by design — it is never persisted), so
 * a full page load drops it, the first request 401s, and the response
 * interceptor clears the session before a test can re-apply it.
 */
export async function gotoInApp(page: Page, targetPath: string): Promise<void> {
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, targetPath);
}

/** Put the session into the app's stores and land on the given path. */
export async function signIn(page: Page, session: Session, targetPath = '/'): Promise<void> {
  await page.goto('/login');
  await applySession(page, session);

  if (targetPath !== '/login') await gotoInApp(page, targetPath);
}

/** Reload the document, then restore the session and return to `targetPath`. */
export async function reloadInto(page: Page, session: Session, targetPath: string): Promise<void> {
  await page.goto('/login');
  await applySession(page, session);
  await gotoInApp(page, targetPath);
}

/** Drag on the canvas in screen coordinates relative to the stage. */
export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  // Intermediate moves matter: a single jump can miss drag thresholds.
  await page.mouse.move(box.x + (from.x + to.x) / 2, box.y + (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 5 });
  await page.mouse.up();
}

export const elementCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.__CANVAS_TEST__!.canvas.getState().orderedElements().length);

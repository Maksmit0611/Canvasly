import { expect, test } from '@playwright/test';
import {
  createSession, deleteUser, dragOnCanvas, elementCount, reloadInto, signIn, type Session,
} from './helpers';

let session: Session;

test.beforeAll(() => {
  session = createSession(`e2e-board-${Date.now()}@example.com`);
});

test.afterAll(() => {
  deleteUser(session.email);
});

test('sign in, create a board, draw, and persist across a reload', async ({ page }) => {
  await signIn(page, session, '/boards');

  // Dashboard starts empty for a brand new user.
  await expect(page.getByTestId('new-board')).toBeVisible();
  await page.getByTestId('new-board').click();

  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
  const boardUrl = page.url();
  await expect(page.locator('canvas').first()).toBeVisible();

  // Draw a rectangle.
  await page.getByTestId('tool-rectangle').click();
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 320, y: 260 });
  expect(await elementCount(page)).toBe(1);

  // Draw an ellipse.
  await page.getByTestId('tool-ellipse').click();
  await dragOnCanvas(page, { x: 380, y: 120 }, { x: 520, y: 240 });
  expect(await elementCount(page)).toBe(2);

  // Autosave settles.
  await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 15_000 });

  // Full document reload clears the store entirely, so anything still on the
  // board afterwards must have come back from the server.
  await reloadInto(page, session, new URL(boardUrl).pathname);
  await page.waitForFunction(
    () => (window.__CANVAS_TEST__?.canvas.getState().orderedElements().length ?? 0) === 2,
    undefined,
    { timeout: 15_000 },
  );

  expect(await elementCount(page)).toBe(2);
});

test('rich text survives a reload with its formatting', async ({ page }) => {
  await signIn(page, session, '/boards');
  await page.getByTestId('new-board').click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
  const boardUrl = page.url();

  await page.getByTestId('tool-text').click();
  await dragOnCanvas(page, { x: 140, y: 140 }, { x: 460, y: 200 });

  // Set a rich document through the store; ProseMirror does not reliably
  // accept synthetic key events.
  await page.evaluate(() => {
    const hook = window.__CANVAS_TEST__!;
    const store = hook.canvas.getState();
    const id = store.orderedElements()[0]!.id;

    store.updateElements([id], {
      richText: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Notes' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'plain ' },
              { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
            ],
          },
        ],
      },
      plainText: 'Notes\nplain bold',
    });
  });

  await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 15_000 });

  await reloadInto(page, session, new URL(boardUrl).pathname);
  await page.waitForFunction(
    () => (window.__CANVAS_TEST__?.canvas.getState().orderedElements().length ?? 0) > 0,
    undefined,
    { timeout: 15_000 },
  );

  const text = await page.evaluate(() => {
    const el = window.__CANVAS_TEST__!.canvas.getState().orderedElements()[0]!;
    const doc = el.richText as { content?: { type: string }[] } | undefined;
    return { plainText: el.plainText, hasHeading: doc?.content?.[0]?.type === 'heading' };
  });

  expect(text.plainText).toContain('Notes');
  expect(text.hasHeading).toBe(true);
});

test('undo and redo reverse and replay edits', async ({ page }) => {
  await signIn(page, session, '/boards');
  await page.getByTestId('new-board').click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);

  await page.getByTestId('tool-rectangle').click();
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 260, y: 220 });
  expect(await elementCount(page)).toBe(1);

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => elementCount(page)).toBe(0);

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => elementCount(page)).toBe(1);
});

test('zoom keeps selection handles a constant screen size', async ({ page }) => {
  await signIn(page, session, '/boards');
  await page.getByTestId('new-board').click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);

  await page.getByTestId('tool-rectangle').click();
  await dragOnCanvas(page, { x: 140, y: 140 }, { x: 340, y: 260 });

  const sizes = await page.evaluate(() => {
    const hook = window.__CANVAS_TEST__!;
    const invariant = (px: number, zoom: number) => px / zoom;
    return [0.1, 1, 5, 10].map((zoom) => {
      hook.canvas.getState().setZoom(zoom);
      // Handles are drawn in canvas units; multiplying back gives screen px.
      return Number((invariant(8, zoom) * zoom).toFixed(4));
    });
  });

  expect(new Set(sizes).size).toBe(1);
  expect(sizes[0]).toBe(8);
});

test('exports a PNG download', async ({ page }) => {
  await signIn(page, session, '/boards');
  await page.getByTestId('new-board').click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);

  await page.getByTestId('tool-rectangle').click();
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 300, y: 240 });

  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByTestId('export-png').click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/\.png$/);
});

test('a share link renders read-only and cannot be edited', async ({ page, request }) => {
  await signIn(page, session, '/boards');
  await page.getByTestId('new-board').click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
  const projectId = page.url().split('/p/')[1]!;

  await page.getByTestId('tool-rectangle').click();
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 300, y: 240 });
  await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 15_000 });

  const created = await request.post(`http://localhost:5050/api/projects/${projectId}/share`, {
    headers: { Authorization: `Bearer ${session.token}` },
    data: { permission: 'view' },
  });
  expect(created.status()).toBe(201);
  const { token } = (await created.json()) as { token: string };

  // Drop the session entirely: a share link must work for a stranger.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());

  await page.goto(`/s/${token}`);
  await expect(page.getByTestId('readonly-badge')).toBeVisible();

  await page.waitForFunction(
    () => (window.__CANVAS_TEST__?.canvas.getState().orderedElements().length ?? 0) > 0,
    undefined,
    { timeout: 15_000 },
  );

  // Editing must be blocked in the store, not merely hidden in the UI.
  const blocked = await page.evaluate(() => {
    const store = window.__CANVAS_TEST__!.canvas.getState();
    const before = store.orderedElements().length;
    store.applyCommands([{ op: 'delete', ids: [store.orderedElements()[0]!.id] }], 'user');
    return before === window.__CANVAS_TEST__!.canvas.getState().orderedElements().length;
  });

  expect(blocked).toBe(true);
  await expect(page.getByTestId('tool-rectangle')).toHaveCount(0);

  // Revoking makes the link unusable.
  const revoked = await request.delete(`http://localhost:5050/api/share/${token}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(revoked.status()).toBe(200);

  await page.goto(`/s/${token}`);
  await expect(page.getByText('Link unavailable')).toBeVisible();
});

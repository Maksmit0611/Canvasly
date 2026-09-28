import { expect, test, type Page } from '@playwright/test';

async function readRenderedPeople(page: Page): Promise<{ genders: string[]; malePixels: number; femalePixels: number }> {
  return page.evaluate(() => {
    type Person = { type: string; characterGender?: string };
    type TestWindow = Window & {
      __CANVAS_TEST__?: { canvas: { getState: () => { elements: Record<string, Person> } } };
    };
    const state = (window as TestWindow).__CANVAS_TEST__?.canvas.getState();
    const genders = Object.values(state?.elements ?? {})
      .filter((element) => element.type === 'person')
      .map((element) => element.characterGender ?? 'male')
      .sort();
    const canvas = document.querySelector<HTMLCanvasElement>('.konvajs-content canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return { genders, malePixels: 0, femalePixels: 0 };

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let malePixels = 0;
    let femalePixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 61 && pixels[i + 1] === 122 && pixels[i + 2] === 112 && pixels[i + 3] > 0) malePixels += 1;
      if (pixels[i] === 201 && pixels[i + 1] === 104 && pixels[i + 2] === 82 && pixels[i + 3] > 0) femalePixels += 1;
    }
    return { genders, malePixels, femalePixels };
  });
}

test.describe('local-first boards', () => {
  test('persists new boards locally and inserts both people figures', async ({ page }) => {
    const onlineRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/(projects|assets)|\/collab\//.test(request.url())) onlineRequests.push(request.url());
    });

    await page.goto('/local');
    await page.getByTestId('new-local-board').click();
    await expect(page.locator('.konvajs-content')).toBeVisible();
    await expect(page.getByTestId('local-board-status')).toContainText('On this device');

    await page.getByRole('button', { name: 'insert', exact: true }).click();
    await page.getByRole('button', { name: 'Add male character' }).click();
    await page.getByRole('button', { name: 'Add female character' }).click();

    const renderedPeople = await readRenderedPeople(page);
    expect(renderedPeople.genders).toEqual(['female', 'male']);
    expect(renderedPeople.malePixels).toBeGreaterThan(0);
    expect(renderedPeople.femalePixels).toBeGreaterThan(0);
    await expect(page.locator('.konvajs-content canvas')).toHaveCount(2);
    await expect(page.locator('.konvajs-content canvas').first()).toBeVisible();

    await expect.poll(async () => page.evaluate(async () => {
      const request = indexedDB.open('canvasly-local-boards', 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const boards = await new Promise<Array<{ id: string; elements: Array<{ type: string; characterGender?: string }> }>>((resolve, reject) => {
        const get = db.transaction('boards', 'readonly').objectStore('boards').getAll();
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return boards[boards.length - 1]?.elements.filter((element) => element.type === 'person').map((element) => element.characterGender).sort() ?? [];
    })).toEqual(['female', 'male']);

    await page.reload();
    await expect(page.locator('.konvajs-content')).toBeVisible();
    await expect(page.getByTestId('local-board-status')).toContainText('On this device');
    const reloadedPeople = await readRenderedPeople(page);
    expect(reloadedPeople.genders).toEqual(['female', 'male']);
    expect(reloadedPeople.malePixels).toBeGreaterThan(0);
    expect(reloadedPeople.femalePixels).toBeGreaterThan(0);
    expect(onlineRequests).toEqual([]);
  });

  test('downloads the portable board file and imports that same file locally', async ({ page }) => {
    // Exercise the download fallback even in browsers where native save dialogs
    // are unavailable or automatically dismissed by headless Chromium.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => { throw new Error('Use the browser download fallback in this test'); },
      });
    });

    await page.goto('/local');
    await page.getByTestId('new-local-board').click();
    await expect(page.locator('.konvajs-content')).toBeVisible();
    const title = page.getByTestId('board-title');
    await title.fill('Portfolio backup board');
    await title.press('Enter');
    await page.getByRole('button', { name: 'insert', exact: true }).click();
    await page.getByRole('button', { name: 'Add male character' }).click();
    await page.getByRole('button', { name: 'Add female character' }).click();
    const placedPeople = await readRenderedPeople(page);
    expect(placedPeople.genders).toEqual(['female', 'male']);
    expect(placedPeople.malePixels).toBeGreaterThan(0);
    expect(placedPeople.femalePixels).toBeGreaterThan(0);
    await expect(page.getByTestId('save-status')).toContainText('Saved on this device');

    expect(await page.evaluate(() => typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker)).toBe('function');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('save-to-computer').click();
    const download = await downloadPromise;
    await expect(page.getByText('Board downloaded to your computer.')).toBeVisible();
    expect(download.suggestedFilename()).toBe('Portfolio-backup-board.canvas.json');
    const stream = await download.createReadStream();
    if (!stream) throw new Error('The exported board file was not available to read');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const portableFile = Buffer.concat(chunks);
    const exportedBoard = JSON.parse(portableFile.toString()) as {
      title: string;
      elements: Array<{ type: string; characterGender?: string }>;
    };
    expect(exportedBoard.title).toBe('Portfolio backup board');
    expect(exportedBoard.elements.filter((element) => element.type === 'person').map((element) => element.characterGender).sort()).toEqual(['female', 'male']);

    await page.goto('/local');
    await page.locator('input[aria-label="Open a Canvasly board file"]').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/json',
      buffer: portableFile,
    });

    await expect(page).toHaveURL(/\/local\/[0-9a-f-]+$/);
    await expect(page.getByTestId('board-title')).toHaveValue('Portfolio backup board');
    await expect(page.locator('.konvajs-content')).toBeVisible();
    const importedPeople = await readRenderedPeople(page);
    expect(importedPeople.genders).toEqual(['female', 'male']);
    expect(importedPeople.malePixels).toBeGreaterThan(0);
    expect(importedPeople.femalePixels).toBeGreaterThan(0);

    await page.goto('/local');
    await expect(page.getByTestId('local-board-list').getByText('Portfolio backup board')).toHaveCount(2);
  });
});

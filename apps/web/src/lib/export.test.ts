import { describe, expect, it } from 'vitest';
import { AppStateSchema, CANVAS_FILE_VERSION, type CanvasElement } from '@canvas/shared';
import { exportBounds, exportToJson, importFromJson, safeFilename } from './export';

const element = (over: Partial<CanvasElement> = {}): CanvasElement =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    type: 'rectangle',
    x: 0, y: 0, width: 100, height: 50, angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent',
    strokeWidth: 2, strokeStyle: 'solid', fillStyle: 'solid',
    roughness: 'artist', opacity: 1, cornerRadius: 0,
    startArrowhead: 'none', endArrowhead: 'none',
    fontFamily: 'Inter', fontSize: 16, textAlign: 'left',
    verticalAlign: 'top', lineHeight: 1.4,
    zIndex: 0, locked: false, isDeleted: false, version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as CanvasElement;

const appState = AppStateSchema.parse({});

describe('exportBounds', () => {
  it('covers the content with padding, not the viewport', () => {
    const bounds = exportBounds([element({ x: 100, y: 100 })], 10)!;
    expect(bounds).toEqual({ x: 90, y: 90, width: 120, height: 70 });
  });

  it('returns null when there is nothing to export', () => {
    expect(exportBounds([])).toBeNull();
  });
});

describe('JSON round-trip', () => {
  it('re-imports to an identical board', () => {
    const elements = [
      element({ id: '00000000-0000-4000-8000-000000000001', x: 10 }),
      element({ id: '00000000-0000-4000-8000-000000000002', type: 'ellipse', x: 200, zIndex: 1 }),
      element({
        id: '00000000-0000-4000-8000-000000000003',
        type: 'text',
        zIndex: 2,
        plainText: 'Hello',
        richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
      }),
    ];

    const file = exportToJson(elements, appState);
    const result = importFromJson(JSON.stringify(file));

    expect(result.ok).toBe(true);
    expect(result.file!.elements).toEqual(elements);
    expect(result.file!.appState).toEqual(appState);
  });

  it('stamps the current format version', () => {
    expect(exportToJson([], appState).version).toBe(CANVAS_FILE_VERSION);
  });

  it('rejects an unknown version with a clear message', () => {
    const result = importFromJson(JSON.stringify({ version: 99, elements: [], appState }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('version 99');
  });

  it('rejects malformed JSON', () => {
    const result = importFromJson('{not json');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('valid JSON');
  });

  it('rejects a structurally invalid board', () => {
    const result = importFromJson(
      JSON.stringify({ version: CANVAS_FILE_VERSION, elements: [{ id: 'nope' }], appState }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('safeFilename', () => {
  it('strips characters the filesystem dislikes', () => {
    expect(safeFilename('My Board / v2 *final*')).toBe('My-Board-v2-final');
  });

  it('falls back when the title has nothing usable', () => {
    expect(safeFilename('///')).toBe('canvasly-board');
    expect(safeFilename('   ')).toBe('canvasly-board');
  });
});

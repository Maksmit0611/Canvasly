import { describe, expect, it, vi } from 'vitest';
import type { CanvasElement } from '@canvas/shared';

// SVG export embeds assets as data URLs; stub that so the generator can be
// tested independently of the API client and file reader.
vi.mock('./assets', () => ({
  fetchAssetDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AQID'),
}));

const { exportToSvg } = await import('./export');

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

describe('exportToSvg', () => {
  it('returns null when there is nothing to export', async () => {
    expect(await exportToSvg([])).toBeNull();
  });

  it('sets a viewBox covering the content', async () => {
    const svg = (await exportToSvg([element({ x: 100, y: 100 })]))!;
    expect(svg).toContain('<svg');
    expect(svg).toMatch(/viewBox="76 76 148 98"/);
  });

  it('emits a rect, ellipse and polygon for the basic shapes', async () => {
    const svg = (await exportToSvg([
      element({ type: 'rectangle' }),
      element({ id: '00000000-0000-4000-8000-000000000002', type: 'ellipse' }),
      element({ id: '00000000-0000-4000-8000-000000000003', type: 'diamond' }),
    ]))!;

    expect(svg).toContain('<rect');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<polygon');
  });

  it('carries stroke colour, width and dash pattern', async () => {
    const svg = (await exportToSvg([
      element({ strokeColor: '#ff0000', strokeWidth: 4, strokeStyle: 'dashed' }),
    ]))!;

    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('stroke-dasharray=');
  });

  it('renders a filled shape and leaves transparent ones unfilled', async () => {
    const filled = (await exportToSvg([element({ backgroundColor: '#00ff00' })]))!;
    expect(filled).toContain('fill="#00ff00"');

    const unfilled = (await exportToSvg([element({ backgroundColor: 'transparent' })]))!;
    expect(unfilled).toContain('fill="none"');
  });

  it('marks an arrow with an arrowhead marker', async () => {
    const svg = (await exportToSvg([
      element({
        type: 'arrow',
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        endArrowhead: 'arrow',
      }),
    ]))!;

    expect(svg).toContain('<polyline');
    expect(svg).toContain('marker-end="url(#arrowhead)"');
    expect(svg).toContain('<marker id="arrowhead"');
  });

  it('converts rich text into positioned tspans with their marks', async () => {
    const svg = (await exportToSvg([
      element({
        type: 'text',
        width: 400,
        richText: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'plain ' },
                { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
              ],
            },
          ],
        },
      }),
    ]))!;

    expect(svg).toContain('<text');
    expect(svg).toContain('<tspan');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('bold</tspan>');
  });

  it('escapes text that would otherwise break the XML', async () => {
    const svg = (await exportToSvg([
      element({ type: 'text', plainText: '5 < 6 & "quoted"' }),
    ]))!;

    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('< 6 &');
  });

  it('embeds an image as a data URI so the file stands alone', async () => {
    const svg = (await exportToSvg([
      element({ type: 'image', assetId: '00000000-0000-4000-8000-0000000000aa' }),
    ]))!;

    expect(svg).toContain('<image');
    expect(svg).toContain('href="data:image/png;base64,');
  });

  it('paints a white background unless transparency is requested', async () => {
    const opaque = (await exportToSvg([element()], false))!;
    expect(opaque).toContain('fill="#ffffff"');

    const transparent = (await exportToSvg([element()], true))!;
    expect(transparent).not.toContain('fill="#ffffff"');
  });

  it('applies rotation as a transform', async () => {
    const svg = (await exportToSvg([element({ angle: Math.PI / 2 })]))!;
    expect(svg).toContain('transform="rotate(90');
  });
});

import { describe, expect, it } from 'vitest';
import { boundsTransform, resizeBounds } from './resize';

const start = { x: 100, y: 100, width: 200, height: 100 };

describe('resizeBounds', () => {
  it('grows from the south-east corner without moving the origin', () => {
    const next = resizeBounds(start, 'se', 50, 25, false);
    expect(next).toEqual({ x: 100, y: 100, width: 250, height: 125 });
  });

  it('moves the origin when dragging the north-west corner', () => {
    const next = resizeBounds(start, 'nw', 20, 10, false);
    expect(next).toEqual({ x: 120, y: 110, width: 180, height: 90 });
  });

  it('constrains a single edge to one axis', () => {
    expect(resizeBounds(start, 'e', 40, 999, false)).toEqual({
      x: 100, y: 100, width: 240, height: 100,
    });
    expect(resizeBounds(start, 's', 999, 40, false)).toEqual({
      x: 100, y: 100, width: 200, height: 140,
    });
  });

  it('preserves aspect ratio on a corner when asked', () => {
    const ratio = start.height / start.width;
    const next = resizeBounds(start, 'se', 100, 5, true);
    expect(next.height / next.width).toBeCloseTo(ratio, 6);
  });

  it('keeps the far corner anchored when resizing north-west with aspect lock', () => {
    const next = resizeBounds(start, 'nw', 40, 5, true);
    expect(next.x + next.width).toBeCloseTo(start.x + start.width, 6);
    expect(next.y + next.height).toBeCloseTo(start.y + start.height, 6);
  });

  it('does not lock aspect on an edge handle', () => {
    const next = resizeBounds(start, 'e', 100, 0, true);
    expect(next.height).toBe(start.height);
  });

  it('allows a drag past the opposite edge, producing negative extent', () => {
    const next = resizeBounds(start, 'e', -300, 0, false);
    expect(next.width).toBeLessThan(0);
  });
});

describe('boundsTransform', () => {
  it('reports the scale between two boxes', () => {
    const t = boundsTransform(start, { x: 100, y: 100, width: 400, height: 50 });
    expect(t.scaleX).toBe(2);
    expect(t.scaleY).toBe(0.5);
    expect(t.originX).toBe(100);
  });

  it('avoids dividing by zero on a degenerate box', () => {
    const t = boundsTransform({ x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 10, height: 10 });
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
  });

  it('maps a point from the old box into the new one', () => {
    const to = { x: 0, y: 0, width: 400, height: 200 };
    const t = boundsTransform(start, to);
    // The old box's centre must land on the new box's centre.
    const x = to.x + (start.x + start.width / 2 - t.originX) * t.scaleX;
    expect(x).toBeCloseTo(to.width / 2, 6);
  });
});

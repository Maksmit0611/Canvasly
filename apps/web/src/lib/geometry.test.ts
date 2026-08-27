import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@canvas/shared';
import {
  boundsIntersect, canvasToScreen, constrainToAxis, edgeAttachmentPoint,
  normalizeBounds, rayBoxIntersection, rayEllipseIntersection, rotatePoint,
  screenToCanvas, unionBounds,
} from './geometry';

const el = (over: Partial<CanvasElement>): CanvasElement =>
  ({
    id: '00000000-0000-4000-8000-000000000000', type: 'rectangle',
    x: 0, y: 0, width: 100, height: 100, angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent',
    strokeWidth: 2, strokeStyle: 'solid', fillStyle: 'solid',
    roughness: 'artist', opacity: 1, cornerRadius: 0,
    startArrowhead: 'none', endArrowhead: 'none',
    fontFamily: 'Inter', fontSize: 16, textAlign: 'left',
    verticalAlign: 'top', lineHeight: 1.4, zIndex: 0,
    locked: false, isDeleted: false, version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as CanvasElement;

describe('coordinate spaces', () => {
  const cases = [
    { zoom: 1, scrollX: 0, scrollY: 0 },
    { zoom: 0.1, scrollX: -250, scrollY: 130 },
    { zoom: 3.7, scrollX: 42, scrollY: -17 },
    { zoom: 10, scrollX: 1000, scrollY: -1000 },
  ];

  it.each(cases)('round-trips screen -> canvas -> screen at zoom $zoom', ({ zoom, scrollX, scrollY }) => {
    for (const p of [{ x: 0, y: 0 }, { x: 137, y: -42 }, { x: -900, y: 512.5 }]) {
      const canvas = screenToCanvas(p, zoom, scrollX, scrollY);
      const back = canvasToScreen(canvas, zoom, scrollX, scrollY);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('applies zoom and scroll in the expected direction', () => {
    expect(screenToCanvas({ x: 100, y: 100 }, 2, 20, 10)).toEqual({ x: 40, y: 45 });
    expect(canvasToScreen({ x: 40, y: 45 }, 2, 20, 10)).toEqual({ x: 100, y: 100 });
  });
});

describe('normalizeBounds', () => {
  it('flips negative width and height', () => {
    expect(normalizeBounds({ x: 100, y: 100, width: -40, height: -20 })).toEqual({
      x: 60, y: 80, width: 40, height: 20,
    });
  });
});

describe('unionBounds', () => {
  it('returns null for an empty list', () => {
    expect(unionBounds([])).toBeNull();
  });

  it('covers every input box', () => {
    expect(
      unionBounds([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 50, y: -20, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: -20, width: 60, height: 30 });
  });

  it('handles negative dimensions by normalising first', () => {
    expect(unionBounds([{ x: 10, y: 10, width: -10, height: -10 }])).toEqual({
      x: 0, y: 0, width: 10, height: 10,
    });
  });
});

describe('boundsIntersect', () => {
  it('detects overlap and separation', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boundsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(boundsIntersect(a, { x: 20, y: 0, width: 5, height: 5 })).toBe(false);
    // Touching edges count as intersecting.
    expect(boundsIntersect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(true);
  });
});

describe('arrow binding', () => {
  it('lands on the box edge, not the centre', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    // Directly to the right: should hit the right edge at mid-height.
    const p = rayBoxIntersection({ x: 50, y: 50 }, { x: 500, y: 50 }, box);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });

  it('hits the top edge when aimed upward', () => {
    const p = rayBoxIntersection({ x: 50, y: 50 }, { x: 50, y: -500 }, { x: 0, y: 0, width: 100, height: 100 });
    expect(p.x).toBeCloseTo(50, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('sits on the ellipse perimeter', () => {
    const box = { x: 0, y: 0, width: 100, height: 60 };
    const p = rayEllipseIntersection({ x: 50, y: 30 }, { x: 400, y: 30 }, box);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(30, 6);

    // A diagonal point must satisfy the ellipse equation.
    const d = rayEllipseIntersection({ x: 50, y: 30 }, { x: 150, y: 130 }, box);
    const norm = ((d.x - 50) / 50) ** 2 + ((d.y - 30) / 30) ** 2;
    expect(norm).toBeCloseTo(1, 6);
  });

  it('picks the ellipse solver for ellipse targets', () => {
    const ellipse = el({ type: 'ellipse', width: 100, height: 100 });
    const rect = el({ type: 'rectangle', width: 100, height: 100 });

    // Toward the corner: the ellipse point is inside the rectangle's corner.
    const onEllipse = edgeAttachmentPoint(ellipse, { x: 1000, y: 1000 });
    const onRect = edgeAttachmentPoint(rect, { x: 1000, y: 1000 });
    expect(onEllipse.x).toBeLessThan(onRect.x);
  });

  it('follows the shape when it moves', () => {
    const before = edgeAttachmentPoint(el({ x: 0, y: 0 }), { x: 500, y: 50 });
    const after = edgeAttachmentPoint(el({ x: 200, y: 0 }), { x: 700, y: 50 });
    expect(after.x - before.x).toBeCloseTo(200, 6);
  });
});

describe('rotatePoint', () => {
  it('rotates a quarter turn about the origin', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(10, 6);
  });

  it('is a no-op at zero radians', () => {
    expect(rotatePoint({ x: 3, y: 4 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 4 });
  });
});

describe('constrainToAxis', () => {
  it('locks to the dominant axis', () => {
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 100, y: 8 })).toEqual({ x: 100, y: 0 });
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 8, y: 100 })).toEqual({ x: 0, y: 100 });
  });
});

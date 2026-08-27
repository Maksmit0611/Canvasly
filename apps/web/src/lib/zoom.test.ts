import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM, MIN_VISIBLE_STROKE_PX, MIN_ZOOM,
  dashArray, fitToBounds, invariant, renderedStrokeWidth, scaleTier, zoomAtPoint,
} from './zoom';

describe('invariant', () => {
  it('keeps chrome a constant screen size across the zoom range', () => {
    // An 8px handle must occupy 8 screen pixels at every zoom level.
    for (const zoom of [0.1, 0.5, 1, 2.5, 10]) {
      const canvasUnits = invariant(8, zoom);
      expect(canvasUnits * zoom).toBeCloseTo(8, 6);
    }
  });

  it('grows in canvas units as zoom shrinks', () => {
    expect(invariant(8, 0.1)).toBeGreaterThan(invariant(8, 1));
    expect(invariant(8, 10)).toBeLessThan(invariant(8, 1));
  });
});

describe('renderedStrokeWidth', () => {
  it('never falls below the visibility floor', () => {
    for (const zoom of [0.1, 0.25, 0.5, 1, 4, 10]) {
      expect(renderedStrokeWidth(0.5, zoom)).toBeGreaterThanOrEqual(MIN_VISIBLE_STROKE_PX);
    }
  });

  it('keeps a thin line visible when zoomed all the way out', () => {
    expect(renderedStrokeWidth(1, MIN_ZOOM)).toBeGreaterThanOrEqual(1);
    expect(renderedStrokeWidth(0.5, MIN_ZOOM)).toBeGreaterThanOrEqual(MIN_VISIBLE_STROKE_PX);
  });

  it('holds a 2px stroke at exactly 2 screen pixels across the whole range', () => {
    // Requirement #2. Konva draws with strokeScaleEnabled=false, so this value
    // is in screen pixels; any zoom dependence here would break the guarantee.
    for (const zoom of [MIN_ZOOM, 0.25, 0.5, 1, 2, 5, MAX_ZOOM]) {
      expect(renderedStrokeWidth(2, zoom)).toBe(2);
    }
  });

  it('is independent of zoom for every stroke width above the floor', () => {
    for (const width of [1, 2, 4, 12, 40]) {
      const widths = [MIN_ZOOM, 0.5, 1, 3, MAX_ZOOM].map((z) => renderedStrokeWidth(width, z));
      expect(new Set(widths).size).toBe(1);
    }
  });
});

describe('zoomAtPoint', () => {
  it('holds the point under the cursor fixed', () => {
    const focal = { x: 400, y: 300 };
    const before = { zoom: 1, scrollX: 0, scrollY: 0 };

    const worldBefore = {
      x: (focal.x - before.scrollX) / before.zoom,
      y: (focal.y - before.scrollY) / before.zoom,
    };

    const after = zoomAtPoint(before.zoom, before.scrollX, before.scrollY, focal, 2);

    const screenAfter = {
      x: worldBefore.x * after.zoom + after.scrollX,
      y: worldBefore.y * after.zoom + after.scrollY,
    };

    expect(screenAfter.x).toBeCloseTo(focal.x, 6);
    expect(screenAfter.y).toBeCloseTo(focal.y, 6);
  });

  it('clamps to the zoom limits', () => {
    expect(zoomAtPoint(MAX_ZOOM, 0, 0, { x: 0, y: 0 }, 5).zoom).toBe(MAX_ZOOM);
    expect(zoomAtPoint(MIN_ZOOM, 0, 0, { x: 0, y: 0 }, 0.01).zoom).toBe(MIN_ZOOM);
  });

  it('is a no-op when already clamped', () => {
    const result = zoomAtPoint(MAX_ZOOM, 33, 44, { x: 10, y: 10 }, 2);
    expect(result).toEqual({ zoom: MAX_ZOOM, scrollX: 33, scrollY: 44 });
  });
});

describe('fitToBounds', () => {
  it('centres the content in the viewport', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const viewport = { width: 800, height: 600 };
    const { zoom, scrollX, scrollY } = fitToBounds(bounds, viewport);

    const centerScreenX = (bounds.x + bounds.width / 2) * zoom + scrollX;
    const centerScreenY = (bounds.y + bounds.height / 2) * zoom + scrollY;

    expect(centerScreenX).toBeCloseTo(viewport.width / 2, 6);
    expect(centerScreenY).toBeCloseTo(viewport.height / 2, 6);
  });

  it('fits the content inside the padded viewport', () => {
    const bounds = { x: 0, y: 0, width: 4000, height: 4000 };
    const { zoom } = fitToBounds(bounds, { width: 800, height: 600 }, 64);
    expect(bounds.width * zoom).toBeLessThanOrEqual(800 - 128 + 0.001);
  });
});

describe('dashArray', () => {
  it('returns undefined for solid and a pattern otherwise', () => {
    expect(dashArray('solid', 2)).toBeUndefined();
    expect(dashArray('dashed', 2)).toEqual([6, 4]);
    expect(dashArray('dotted', 2)?.[0]).toBeLessThan(1);
  });
});

describe('scaleTier', () => {
  it('quantises zoom into raster tiers', () => {
    expect(scaleTier(0.5)).toBe(1);
    expect(scaleTier(1)).toBe(1);
    expect(scaleTier(1.5)).toBe(2);
    expect(scaleTier(3)).toBe(3);
    expect(scaleTier(8)).toBe(4);
  });
});

import { describe, expect, it } from 'vitest';
import { CanvasElementSchema } from '@canvas/shared';
import { DEFAULTS, createElement, newId, seedFromId } from './elementFactory';

describe('newId', () => {
  it('produces a valid v4 UUID', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 200 }, newId));
    expect(ids.size).toBe(200);
  });
});

describe('createElement', () => {
  it('produces an element the shared schema accepts', () => {
    const element = createElement('rectangle', { x: 10, y: 20 });
    expect(CanvasElementSchema.safeParse(element).success).toBe(true);
  });

  it('uses the handwritten Kalam font for new elements and schema defaults', () => {
    const element = createElement('text', { x: 0, y: 0 });
    expect(element.fontFamily).toBe('Kalam');

    const { fontFamily: _fontFamily, ...withoutFont } = element;
    expect(CanvasElementSchema.parse(withoutFont).fontFamily).toBe('Kalam');
  });

  it('places the element at the origin point', () => {
    const element = createElement('ellipse', { x: 42, y: 99 });
    expect(element.x).toBe(42);
    expect(element.y).toBe(99);
    expect(element.width).toBe(0);
  });

  it('seeds point geometry only for point-based types', () => {
    for (const type of ['line', 'arrow', 'freedraw'] as const) {
      expect(createElement(type, { x: 0, y: 0 }).points).toEqual([{ x: 0, y: 0 }]);
    }
    expect(createElement('rectangle', { x: 0, y: 0 }).points).toBeUndefined();
  });

  it('gives arrows an end arrowhead and other types none', () => {
    expect(createElement('arrow', { x: 0, y: 0 }).endArrowhead).toBe('arrow');
    expect(createElement('line', { x: 0, y: 0 }).endArrowhead).toBe('none');
  });

  it('applies the supplied defaults', () => {
    const element = createElement('rectangle', { x: 0, y: 0 }, {}, {
      ...DEFAULTS,
      strokeColor: '#ff0000',
      strokeWidth: 8,
    });
    expect(element.strokeColor).toBe('#ff0000');
    expect(element.strokeWidth).toBe(8);
  });

  it('lets overrides win over defaults', () => {
    const element = createElement('rectangle', { x: 0, y: 0 }, { width: 300, locked: true });
    expect(element.width).toBe(300);
    expect(element.locked).toBe(true);
  });
});

describe('seedFromId', () => {
  it('is stable for the same id', () => {
    const id = newId();
    expect(seedFromId(id)).toBe(seedFromId(id));
  });

  it('differs between ids and is non-negative', () => {
    const a = seedFromId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const b = seedFromId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
  });
});

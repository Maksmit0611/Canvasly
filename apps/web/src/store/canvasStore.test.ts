import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './canvasStore';
import { useHistoryStore } from './historyStore';
import { createElement } from '@/lib/elementFactory';

const reset = (): void => {
  useCanvasStore.getState().loadElements([]);
  useHistoryStore.getState().clear();
};

const rect = (x = 0, y = 0) => createElement('rectangle', { x, y }, { width: 100, height: 50 });

describe('canvas store', () => {
  beforeEach(reset);

  it('adds elements and keeps paint order', () => {
    const store = useCanvasStore.getState();
    const a = rect(0, 0);
    const b = rect(200, 0);
    store.addElement(a);
    store.addElement(b);

    expect(useCanvasStore.getState().elementOrder).toEqual([a.id, b.id]);
    expect(useCanvasStore.getState().orderedElements().map((e) => e.zIndex)).toEqual([0, 1]);
  });

  it('soft-deletes rather than dropping the record', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);
    store.deleteElements([a.id]);

    const state = useCanvasStore.getState();
    expect(state.elements[a.id]?.isDeleted).toBe(true);
    expect(state.elementOrder).not.toContain(a.id);
    expect(state.orderedElements()).toHaveLength(0);
  });

  it('leaves locked elements alone', () => {
    const store = useCanvasStore.getState();
    const a = { ...rect(), locked: true };
    store.applyCommands([{ op: 'create', elements: [a] }], 'user');
    store.updateElements([a.id], { x: 999 });

    expect(useCanvasStore.getState().elements[a.id]?.x).toBe(0);
  });

  it('bumps version and timestamp on update', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);
    store.updateElements([a.id], { x: 50 });

    expect(useCanvasStore.getState().elements[a.id]?.version).toBeGreaterThan(a.version);
  });

  it('tracks dirty ids for autosave', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);
    expect(useCanvasStore.getState().dirtyIds.has(a.id)).toBe(true);

    useCanvasStore.getState().markClean();
    expect(useCanvasStore.getState().dirtyIds.size).toBe(0);
    expect(useCanvasStore.getState().isDirty).toBe(false);
  });

  it('duplicates with new ids at an offset', () => {
    const store = useCanvasStore.getState();
    const a = rect(10, 10);
    store.addElement(a);
    store.duplicate([a.id]);

    const all = useCanvasStore.getState().orderedElements();
    expect(all).toHaveLength(2);
    expect(all[1]!.id).not.toBe(a.id);
    expect(all[1]!.x).toBe(26);
  });

  it('reorders z-order without losing elements', () => {
    const store = useCanvasStore.getState();
    const a = rect(0, 0);
    const b = rect(10, 0);
    const c = rect(20, 0);
    store.addElements([a, b, c]);

    store.bringToFront([a.id]);
    expect(useCanvasStore.getState().elementOrder).toEqual([b.id, c.id, a.id]);

    store.sendToBack([a.id]);
    expect(useCanvasStore.getState().elementOrder).toEqual([a.id, b.id, c.id]);

    store.bringForward([a.id]);
    expect(useCanvasStore.getState().elementOrder).toEqual([b.id, a.id, c.id]);

    store.sendBackward([a.id]);
    expect(useCanvasStore.getState().elementOrder).toEqual([a.id, b.id, c.id]);
  });
});

describe('undo / redo', () => {
  beforeEach(reset);

  it('reverses and replays 20 edits in order', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);

    for (let i = 1; i <= 20; i++) {
      // Distinct labels so nothing coalesces; this tests ordering, not merging.
      useCanvasStore.getState().updateElements([a.id], { x: i * 10 }, { label: `move-${i}` });
    }

    expect(useCanvasStore.getState().elements[a.id]?.x).toBe(200);

    for (let i = 19; i >= 0; i--) {
      useHistoryStore.getState().undo();
      expect(useCanvasStore.getState().elements[a.id]?.x).toBe(i * 10);
    }

    for (let i = 1; i <= 20; i++) {
      useHistoryStore.getState().redo();
      expect(useCanvasStore.getState().elements[a.id]?.x).toBe(i * 10);
    }
  });

  it('restores a deleted element', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);
    store.deleteElements([a.id]);
    expect(useCanvasStore.getState().orderedElements()).toHaveLength(0);

    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().orderedElements()).toHaveLength(1);

    useHistoryStore.getState().redo();
    expect(useCanvasStore.getState().orderedElements()).toHaveLength(0);
  });

  it('undoes an add', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);
    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().orderedElements()).toHaveLength(0);
  });

  it('coalesces rapid same-label edits into one entry', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);

    const depthAfterAdd = useHistoryStore.getState().past.length;
    for (let i = 1; i <= 30; i++) {
      useCanvasStore.getState().updateElements([a.id], { x: i }, { label: 'Move', coalesce: true });
    }

    // One drag produces one entry, not thirty.
    expect(useHistoryStore.getState().past.length).toBe(depthAfterAdd + 1);

    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().elements[a.id]?.x).toBe(0);
  });

  it('caps the stack at 100 entries', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);

    for (let i = 0; i < 150; i++) {
      useCanvasStore.getState().updateElements([a.id], { x: i }, { label: `m${i}` });
    }

    expect(useHistoryStore.getState().past.length).toBe(100);
  });

  it('clears the redo stack once a new edit lands', () => {
    const store = useCanvasStore.getState();
    const a = rect();
    store.addElement(a);
    store.updateElements([a.id], { x: 10 }, { label: 'one' });
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().future.length).toBe(1);

    useCanvasStore.getState().updateElements([a.id], { x: 99 }, { label: 'two' });
    expect(useHistoryStore.getState().future.length).toBe(0);
  });
});

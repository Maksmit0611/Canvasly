import { create } from 'zustand';
import { enableMapSet, produce } from 'immer';
import type { CanvasCommand, CanvasElement, CommandOrigin, Point } from '@canvas/shared';
import { MAX_ZOOM, MIN_ZOOM, zoomAtPoint } from '@/lib/zoom';
import { boundsOfElements, clamp } from '@/lib/geometry';
import { newId } from '@/lib/elementFactory';
import { useHistoryStore } from './historyStore';

// dirtyIds / deletedIds are Sets, which immer only drafts once this is on.
enableMapSet();

export type Tool =
  | 'select' | 'pan' | 'rectangle' | 'ellipse' | 'diamond'
  | 'line' | 'arrow' | 'freedraw' | 'text' | 'image' | 'pdf' | 'frame';

interface CanvasState {
  elements: Record<string, CanvasElement>;
  elementOrder: string[];
  selectedIds: string[];
  activeTool: Tool;
  zoom: number;
  scrollX: number;
  scrollY: number;
  editingTextId: string | null;
  isDirty: boolean;
  dirtyIds: Set<string>;
  deletedIds: Set<string>;

  applyCommands: (cmds: CanvasCommand[], origin: CommandOrigin) => void;
  addElement: (element: CanvasElement, options?: { select?: boolean }) => void;
  addElements: (elements: CanvasElement[], options?: { select?: boolean }) => void;
  updateElements: (ids: string[], patch: Partial<CanvasElement>, options?: { history?: boolean; label?: string; coalesce?: boolean }) => void;
  deleteElements: (ids: string[]) => void;

  select: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setTool: (tool: Tool) => void;
  setEditingTextId: (id: string | null) => void;

  setZoom: (zoom: number, focal?: Point) => void;
  zoomBy: (factor: number, focal: Point) => void;
  resetZoom: () => void;
  pan: (dx: number, dy: number) => void;
  setScroll: (scrollX: number, scrollY: number) => void;
  setViewport: (v: { zoom: number; scrollX: number; scrollY: number }) => void;

  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  duplicate: (ids: string[]) => void;

  loadElements: (elements: CanvasElement[]) => void;
  markClean: () => void;
  orderedElements: () => CanvasElement[];
  selectedElements: () => CanvasElement[];
}

const stamp = (el: CanvasElement): CanvasElement => ({
  ...el,
  version: el.version + 1,
  updatedAt: new Date().toISOString(),
});

const reindex = (order: string[], elements: Record<string, CanvasElement>): void => {
  order.forEach((id, index) => {
    const el = elements[id];
    if (el) el.zIndex = index;
  });
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  elements: {},
  elementOrder: [],
  selectedIds: [],
  activeTool: 'select',
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  editingTextId: null,
  isDirty: false,
  dirtyIds: new Set(),
  deletedIds: new Set(),

  /**
   * The single funnel for every mutation. The UI, CRDT sync, and a future AI
   * agent all go through here, which is what keeps AI editing an addition
   * rather than a rewrite.
   */
  applyCommands: (cmds, origin) => {
    set(
      produce((draft: CanvasState) => {
        for (const cmd of cmds) {
          switch (cmd.op) {
            case 'create':
              for (const el of cmd.elements) {
                draft.elements[el.id] = el;
                if (!draft.elementOrder.includes(el.id)) draft.elementOrder.push(el.id);
                draft.dirtyIds.add(el.id);
              }
              reindex(draft.elementOrder, draft.elements);
              break;

            case 'update':
              for (const id of cmd.ids) {
                const el = draft.elements[id];
                if (!el || el.locked) continue;
                Object.assign(el, cmd.patch);
                draft.elements[id] = stamp(el);
                draft.dirtyIds.add(id);
              }
              break;

            case 'delete':
              for (const id of cmd.ids) {
                const el = draft.elements[id];
                if (!el || el.locked) continue;
                // Soft delete: a hard delete can resurrect on a CRDT merge.
                el.isDeleted = true;
                draft.elements[id] = stamp(el);
                draft.elementOrder = draft.elementOrder.filter((x) => x !== id);
                draft.selectedIds = draft.selectedIds.filter((x) => x !== id);
                draft.deletedIds.add(id);
                draft.dirtyIds.add(id);
              }
              reindex(draft.elementOrder, draft.elements);
              break;

            case 'reorder': {
              const from = draft.elementOrder.indexOf(cmd.id);
              if (from === -1) break;
              draft.elementOrder.splice(from, 1);
              draft.elementOrder.splice(clamp(cmd.toIndex, 0, draft.elementOrder.length), 0, cmd.id);
              reindex(draft.elementOrder, draft.elements);
              for (const id of draft.elementOrder) draft.dirtyIds.add(id);
              break;
            }
          }
        }

        // Remote edits are already persisted by whoever sent them.
        if (origin !== 'remote') draft.isDirty = true;
      }),
    );
  },

  addElement: (element, options) => get().addElements([element], options),

  addElements: (elements, options) => {
    if (elements.length === 0) return;
    const ids = elements.map((e) => e.id);

    get().applyCommands([{ op: 'create', elements }], 'user');
    if (options?.select !== false) set({ selectedIds: ids });

    useHistoryStore.getState().push({
      label: 'Add element',
      undo: () => get().applyCommands([{ op: 'delete', ids }], 'user'),
      redo: () => get().applyCommands([{ op: 'create', elements }], 'user'),
    });
  },

  updateElements: (ids, patch, options) => {
    if (ids.length === 0) return;

    // Capture only the fields being changed, so undo restores exactly them.
    const before = new Map<string, Partial<CanvasElement>>();
    const { elements } = get();
    for (const id of ids) {
      const el = elements[id];
      if (!el) continue;
      const snapshot: Record<string, unknown> = {};
      for (const key of Object.keys(patch)) {
        snapshot[key] = (el as unknown as Record<string, unknown>)[key];
      }
      before.set(id, snapshot as Partial<CanvasElement>);
    }

    get().applyCommands([{ op: 'update', ids, patch }], 'user');

    if (options?.history === false) return;

    useHistoryStore.getState().push(
      {
        label: options?.label ?? 'Update element',
        undo: () => {
          for (const [id, prev] of before) {
            get().applyCommands([{ op: 'update', ids: [id], patch: prev }], 'user');
          }
        },
        redo: () => get().applyCommands([{ op: 'update', ids, patch }], 'user'),
      },
      { coalesce: options?.coalesce },
    );
  },

  deleteElements: (ids) => {
    const live = ids.filter((id) => {
      const el = get().elements[id];
      return el && !el.locked && !el.isDeleted;
    });
    if (live.length === 0) return;

    const snapshots = live.map((id) => ({ ...get().elements[id]! }));

    get().applyCommands([{ op: 'delete', ids: live }], 'user');

    useHistoryStore.getState().push({
      label: 'Delete element',
      undo: () => get().applyCommands([{ op: 'create', elements: snapshots }], 'user'),
      redo: () => get().applyCommands([{ op: 'delete', ids: live }], 'user'),
    });
  },

  select: (ids) => set({ selectedIds: ids }),

  toggleSelection: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),

  clearSelection: () => set({ selectedIds: [] }),

  selectAll: () => set((s) => ({ selectedIds: s.elementOrder.filter((id) => !s.elements[id]?.locked) })),

  setTool: (activeTool) =>
    set((s) => ({
      activeTool,
      // Switching away from select drops the selection; keep it otherwise.
      selectedIds: activeTool === 'select' ? s.selectedIds : [],
    })),

  setEditingTextId: (editingTextId) => set({ editingTextId }),

  setZoom: (zoom, focal) => {
    const state = get();
    const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    if (!focal) {
      set({ zoom: next });
      return;
    }
    set(zoomAtPoint(state.zoom, state.scrollX, state.scrollY, focal, next / state.zoom));
  },

  zoomBy: (factor, focal) => {
    const { zoom, scrollX, scrollY } = get();
    set(zoomAtPoint(zoom, scrollX, scrollY, focal, factor));
  },

  resetZoom: () => set({ zoom: 1, scrollX: 0, scrollY: 0 }),

  pan: (dx, dy) => set((s) => ({ scrollX: s.scrollX + dx, scrollY: s.scrollY + dy })),

  setScroll: (scrollX, scrollY) => set({ scrollX, scrollY }),

  setViewport: ({ zoom, scrollX, scrollY }) => set({ zoom, scrollX, scrollY }),

  bringForward: (ids) => {
    const order = [...get().elementOrder];
    // Walk from the top so shapes cannot leapfrog one another.
    for (let i = order.length - 2; i >= 0; i--) {
      if (ids.includes(order[i]!) && !ids.includes(order[i + 1]!)) {
        [order[i], order[i + 1]] = [order[i + 1]!, order[i]!];
      }
    }
    get().applyCommands(order.map((id, index) => ({ op: 'reorder' as const, id, toIndex: index })), 'user');
  },

  sendBackward: (ids) => {
    const order = [...get().elementOrder];
    for (let i = 1; i < order.length; i++) {
      if (ids.includes(order[i]!) && !ids.includes(order[i - 1]!)) {
        [order[i], order[i - 1]] = [order[i - 1]!, order[i]!];
      }
    }
    get().applyCommands(order.map((id, index) => ({ op: 'reorder' as const, id, toIndex: index })), 'user');
  },

  bringToFront: (ids) => {
    const order = get().elementOrder.filter((id) => !ids.includes(id));
    const next = [...order, ...get().elementOrder.filter((id) => ids.includes(id))];
    get().applyCommands(next.map((id, index) => ({ op: 'reorder' as const, id, toIndex: index })), 'user');
  },

  sendToBack: (ids) => {
    const order = get().elementOrder.filter((id) => !ids.includes(id));
    const next = [...get().elementOrder.filter((id) => ids.includes(id)), ...order];
    get().applyCommands(next.map((id, index) => ({ op: 'reorder' as const, id, toIndex: index })), 'user');
  },

  duplicate: (ids) => {
    const { elements } = get();
    const copies = ids
      .map((id) => elements[id])
      .filter((el): el is CanvasElement => Boolean(el))
      .map((el) => ({ ...el, id: newId(), x: el.x + 16, y: el.y + 16, version: 1 }));

    if (copies.length > 0) get().addElements(copies);
  },

  loadElements: (elements) => {
    const map: Record<string, CanvasElement> = {};
    const order: string[] = [];
    for (const el of [...elements].sort((a, b) => a.zIndex - b.zIndex)) {
      map[el.id] = el;
      if (!el.isDeleted) order.push(el.id);
    }
    set({
      elements: map,
      elementOrder: order,
      selectedIds: [],
      isDirty: false,
      dirtyIds: new Set(),
      deletedIds: new Set(),
    });
    useHistoryStore.getState().clear();
  },

  markClean: () => set({ isDirty: false, dirtyIds: new Set(), deletedIds: new Set() }),

  orderedElements: () => {
    const { elements, elementOrder } = get();
    return elementOrder
      .map((id) => elements[id])
      .filter((el): el is CanvasElement => Boolean(el) && !el!.isDeleted);
  },

  selectedElements: () => {
    const { elements, selectedIds } = get();
    return selectedIds.map((id) => elements[id]).filter((el): el is CanvasElement => Boolean(el));
  },
}));

/** Content bounds of everything on the canvas — used by zoom-to-fit. */
export const contentBounds = () => boundsOfElements(useCanvasStore.getState().orderedElements());

import { create } from 'zustand';

export interface HistoryEntry {
  label: string;
  undo: () => void;
  redo: () => void;
}

const MAX_ENTRIES = 100;
/** Same-label edits closer together than this collapse into one entry. */
const COALESCE_MS = 400;

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastPushAt: number;
  lastLabel: string | null;
  /** Set while undo/redo runs, so replayed mutations don't re-enter history. */
  isApplying: boolean;

  push: (entry: HistoryEntry, options?: { coalesce?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  lastPushAt: 0,
  lastLabel: null,
  isApplying: false,

  /**
   * A command stack, not a snapshot stack. When `coalesce` is set and the
   * previous entry shares this one's label and is recent, the two merge — so
   * dragging a shape yields one undo step rather than sixty.
   */
  push: (entry, options) => {
    const { past, lastPushAt, lastLabel, isApplying } = get();
    if (isApplying) return;

    const now = Date.now();
    const shouldMerge =
      options?.coalesce === true &&
      lastLabel === entry.label &&
      now - lastPushAt < COALESCE_MS &&
      past.length > 0;

    if (shouldMerge) {
      const previous = past[past.length - 1]!;
      const merged: HistoryEntry = {
        label: entry.label,
        // Undo back to the older state, redo forward to the newer one.
        undo: previous.undo,
        redo: entry.redo,
      };
      set({
        past: [...past.slice(0, -1), merged],
        future: [],
        lastPushAt: now,
        lastLabel: entry.label,
      });
      return;
    }

    const next = [...past, entry];
    set({
      past: next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next,
      future: [],
      lastPushAt: now,
      lastLabel: entry.label,
    });
  },

  undo: () => {
    const { past, future } = get();
    const entry = past[past.length - 1];
    if (!entry) return;

    set({ isApplying: true });
    try {
      entry.undo();
    } finally {
      set({
        past: past.slice(0, -1),
        future: [entry, ...future],
        isApplying: false,
        lastLabel: null,
      });
    }
  },

  redo: () => {
    const { past, future } = get();
    const entry = future[0];
    if (!entry) return;

    set({ isApplying: true });
    try {
      entry.redo();
    } finally {
      set({
        past: [...past, entry],
        future: future.slice(1),
        isApplying: false,
        lastLabel: null,
      });
    }
  },

  clear: () => set({ past: [], future: [], lastPushAt: 0, lastLabel: null }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

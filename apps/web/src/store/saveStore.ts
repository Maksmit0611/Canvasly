import { create } from 'zustand';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'offline';

interface SaveState {
  status: SaveStatus;
  lastSavedAt: number | null;
  /** Consecutive failures; drives the backoff delay. */
  failures: number;
  error: string | null;

  setStatus: (status: SaveStatus) => void;
  markSaved: () => void;
  markFailed: (error: string) => void;
}

export const useSaveStore = create<SaveState>((set) => ({
  status: 'saved',
  lastSavedAt: null,
  failures: 0,
  error: null,

  setStatus: (status) => set({ status }),

  markSaved: () => set({ status: 'saved', lastSavedAt: Date.now(), failures: 0, error: null }),

  markFailed: (error) =>
    set((s) => ({ status: 'offline', failures: s.failures + 1, error })),
}));

export const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  dirty: 'Unsaved changes',
  offline: 'Offline — retrying',
};

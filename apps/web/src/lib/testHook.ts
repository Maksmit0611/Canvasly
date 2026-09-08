import { useCanvasStore } from '@/store/canvasStore';
import { useHistoryStore } from '@/store/historyStore';
import { useAuthStore } from '@/store/authStore';

export interface CanvasTestHook {
  canvas: typeof useCanvasStore;
  history: typeof useHistoryStore;
  auth: typeof useAuthStore;
}

declare global {
  interface Window {
    __CANVAS_TEST__?: CanvasTestHook;
  }
}

export type { CanvasTestHook as CanvasTestHookType };

/**
 * Expose the stores for E2E assertions. Registered only outside production
 * builds, so it never reaches real users.
 */
export function registerTestHook(): void {
  if (import.meta.env.PROD) return;
  window.__CANVAS_TEST__ = {
    canvas: useCanvasStore,
    history: useHistoryStore,
    auth: useAuthStore,
  };
}

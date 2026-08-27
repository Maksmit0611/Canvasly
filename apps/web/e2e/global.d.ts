import type { CanvasTestHook } from '../src/lib/testHook';

declare global {
  interface Window {
    __CANVAS_TEST__?: CanvasTestHook;
  }
}

export {};

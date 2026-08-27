import { useEffect } from 'react';
import { useCanvasStore, type Tool } from '@/store/canvasStore';
import { useHistoryStore } from '@/store/historyStore';
import { boundsOfElements, hitBounds, unionBounds } from '@/lib/geometry';
import { fitToBounds } from '@/lib/zoom';

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  r: 'rectangle',
  o: 'ellipse',
  d: 'diamond',
  l: 'line',
  a: 'arrow',
  p: 'freedraw',
  t: 'text',
  h: 'pan',
};

/**
 * True when focus is inside a text editor or form field. Shortcuts must stand
 * down there, or typing "r" in a text box silently switches tools.
 */
function isTextEntryFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

interface Options {
  viewport: { width: number; height: number };
}

export function useKeyboardShortcuts({ viewport }: Options): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const store = useCanvasStore.getState();
      const history = useHistoryStore.getState();

      // A text element being edited owns the keyboard entirely.
      if (isTextEntryFocused() || store.editingTextId) {
        if (e.key === 'Escape') store.setEditingTextId(null);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod) {
        switch (key) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) history.redo();
            else history.undo();
            return;
          case 'y':
            e.preventDefault();
            history.redo();
            return;
          case 'a':
            e.preventDefault();
            store.selectAll();
            return;
          case 'd':
            e.preventDefault();
            store.duplicate(store.selectedIds);
            return;
          case '0':
            e.preventDefault();
            store.resetZoom();
            return;
          case '1': {
            e.preventDefault();
            const bounds = boundsOfElements(store.orderedElements());
            if (bounds) store.setViewport(fitToBounds(bounds, viewport));
            return;
          }
          case '2': {
            e.preventDefault();
            const bounds = unionBounds(store.selectedElements().map(hitBounds));
            if (bounds) store.setViewport(fitToBounds(bounds, viewport));
            return;
          }
          case ']':
            e.preventDefault();
            if (e.shiftKey) store.bringToFront(store.selectedIds);
            else store.bringForward(store.selectedIds);
            return;
          case '[':
            e.preventDefault();
            if (e.shiftKey) store.sendToBack(store.selectedIds);
            else store.sendBackward(store.selectedIds);
            return;
          default:
            return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedIds.length > 0) {
          e.preventDefault();
          store.deleteElements(store.selectedIds);
        }
        return;
      }

      if (e.key === 'Escape') {
        store.clearSelection();
        store.setTool('select');
        return;
      }

      const tool = TOOL_KEYS[key];
      if (tool && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        store.setTool(tool);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewport]);
}

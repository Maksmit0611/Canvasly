import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Redo2, Undo2 } from 'lucide-react';
import Stage from '@/canvas/Stage';
import Toolbar from '@/ui/Toolbar';
import ZoomControls from '@/ui/ZoomControls';
import { useCanvasStore } from '@/store/canvasStore';
import { useHistoryStore } from '@/store/historyStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);

  useKeyboardShortcuts({ viewport });

  // Konva needs explicit pixel dimensions, so track the container's size.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Phase 10 loads real elements here; for now each board starts empty.
  useEffect(() => {
    useCanvasStore.getState().loadElements([]);
  }, [projectId]);

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex h-12 shrink-0 items-center justify-between px-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}
      >
        <div className="flex items-center gap-2">
          <Link to="/" className="flex h-8 w-8 items-center justify-center rounded" aria-label="Back to boards">
            <ChevronLeft size={17} />
          </Link>
          <span className="text-sm font-medium">Untitled board</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => useHistoryStore.getState().undo()}
            disabled={!canUndo}
            title="Undo (Cmd+Z)"
            aria-label="Undo"
            className="flex h-8 w-8 items-center justify-center rounded disabled:opacity-30"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => useHistoryStore.getState().redo()}
            disabled={!canRedo}
            title="Redo (Cmd+Shift+Z)"
            aria-label="Redo"
            className="flex h-8 w-8 items-center justify-center rounded disabled:opacity-30"
          >
            <Redo2 size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <div ref={containerRef} className="relative min-w-0 flex-1" style={{ background: 'var(--surface)' }}>
          {viewport.width > 0 && <Stage width={viewport.width} height={viewport.height} />}
          <ZoomControls viewport={viewport} />
        </div>
      </div>
    </div>
  );
}

import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCanvasStore } from '@/store/canvasStore';
import { boundsOfElements } from '@/lib/geometry';
import { fitToBounds } from '@/lib/zoom';

interface Props {
  viewport: { width: number; height: number };
}

export default function ZoomControls({ viewport }: Props) {
  const zoom = useCanvasStore((s) => s.zoom);

  const zoomAtCenter = (factor: number): void => {
    useCanvasStore.getState().zoomBy(factor, { x: viewport.width / 2, y: viewport.height / 2 });
  };

  const zoomToFit = (): void => {
    const store = useCanvasStore.getState();
    const bounds = boundsOfElements(store.orderedElements());
    if (bounds) store.setViewport(fitToBounds(bounds, viewport));
    else store.resetZoom();
  };

  return (
    <div
      className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg px-1 py-1"
      style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
    >
      <button
        type="button"
        onClick={() => zoomAtCenter(1 / 1.2)}
        aria-label="Zoom out"
        className="flex h-7 w-7 items-center justify-center rounded"
        style={{ color: 'var(--text-muted)' }}
      >
        <Minus size={15} />
      </button>

      <button
        type="button"
        onClick={() => useCanvasStore.getState().resetZoom()}
        title="Reset zoom (Cmd+0)"
        data-testid="zoom-label"
        className="min-w-[52px] rounded px-1 text-xs font-medium tabular-nums"
      >
        {Math.round(zoom * 100)}%
      </button>

      <button
        type="button"
        onClick={() => zoomAtCenter(1.2)}
        aria-label="Zoom in"
        className="flex h-7 w-7 items-center justify-center rounded"
        style={{ color: 'var(--text-muted)' }}
      >
        <Plus size={15} />
      </button>

      <button
        type="button"
        onClick={zoomToFit}
        title="Zoom to fit (Cmd+1)"
        aria-label="Zoom to fit"
        className="flex h-7 w-7 items-center justify-center rounded"
        style={{ color: 'var(--text-muted)' }}
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}

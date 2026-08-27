import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Redo2, Undo2 } from 'lucide-react';
import Stage from '@/canvas/Stage';
import Toolbar from '@/ui/Toolbar';
import Ribbon from '@/ui/Ribbon';
import RichTextOverlay from '@/canvas/overlays/RichTextOverlay';
import PdfPageControl from '@/ui/PdfPageControl';
import PropertiesPanel from '@/ui/PropertiesPanel';
import ZoomControls from '@/ui/ZoomControls';
import { useCanvasStore } from '@/store/canvasStore';
import { useHistoryStore } from '@/store/historyStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useEditorStore } from '@/store/editorStore';
import { useAssetDrop } from '@/hooks/useAssetDrop';

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [canvasHost, setCanvasHost] = useState<HTMLDivElement | null>(null);

  const { isDragging, isUploading, error: uploadError } = useAssetDrop({
    projectId,
    container: canvasHost,
  });

  const editor = useEditorStore((s) => s.editor);
  // Subscribing to revision re-renders the ribbon as the caret moves.
  useEditorStore((s) => s.revision);

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

      <Ribbon editor={editor} />

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <div
          ref={(node) => {
            containerRef.current = node;
            setCanvasHost(node);
          }}
          className="relative min-w-0 flex-1"
          style={{ background: 'var(--surface)' }}
        >
          {viewport.width > 0 && <Stage width={viewport.width} height={viewport.height} />}
          <RichTextOverlay />
          <PdfPageControl />

          {isDragging && (
            <div
              className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg text-sm"
              style={{ border: '2px dashed var(--accent)', background: 'var(--accent-soft)', opacity: 0.9 }}
            >
              Drop an image or PDF to add it
            </div>
          )}

          {isUploading && (
            <div
              className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg px-3 py-1 text-xs"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
            >
              Uploading…
            </div>
          )}

          {uploadError && (
            <div
              className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg px-3 py-1 text-xs"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--danger)', color: 'var(--danger)' }}
              role="alert"
            >
              {uploadError}
            </div>
          )}
          <ZoomControls viewport={viewport} />
        </div>

        <PropertiesPanel />
      </div>
    </div>
  );
}

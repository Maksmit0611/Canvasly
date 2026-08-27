import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Redo2, Undo2 } from 'lucide-react';
import Stage from '@/canvas/Stage';
import Toolbar from '@/ui/Toolbar';
import Ribbon from '@/ui/Ribbon';
import RichTextOverlay from '@/canvas/overlays/RichTextOverlay';
import PdfPageControl from '@/ui/PdfPageControl';
import PropertiesPanel from '@/ui/PropertiesPanel';
import ZoomControls from '@/ui/ZoomControls';
import SaveStatus from '@/ui/SaveStatus';
import { useCanvasStore } from '@/store/canvasStore';
import { useHistoryStore } from '@/store/historyStore';
import { useEditorStore } from '@/store/editorStore';
import { useSaveStore } from '@/store/saveStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAssetDrop } from '@/hooks/useAssetDrop';
import { useAutosave } from '@/hooks/useAutosave';
import { getProject, updateProject } from '@/lib/projects';

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [canvasHost, setCanvasHost] = useState<HTMLDivElement | null>(null);
  const [title, setTitle] = useState('Untitled board');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const { isDragging, isUploading, error: uploadError } = useAssetDrop({
    projectId,
    container: canvasHost,
  });

  const editor = useEditorStore((s) => s.editor);
  useEditorStore((s) => s.revision);

  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);

  useKeyboardShortcuts({ viewport });

  const captureThumbnail = useCallback((): string | null => {
    const stage = (window as { Konva?: { stages: { toDataURL(o: object): string }[] } })
      .Konva?.stages[0];
    try {
      return stage?.toDataURL({ pixelRatio: 0.25, mimeType: 'image/jpeg', quality: 0.6 }) ?? null;
    } catch {
      // A tainted canvas (cross-origin asset) makes export throw; skip it.
      return null;
    }
  }, []);

  useAutosave({ projectId, enabled: isLoaded, captureThumbnail });

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
  }, [canvasHost]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setIsLoaded(false);
    setLoadError(null);

    void getProject(projectId)
      .then(({ project, elements }) => {
        if (cancelled) return;
        setTitle(project.title);
        useCanvasStore.getState().loadElements(elements);
        useCanvasStore.getState().setViewport({
          zoom: project.appState.zoom,
          scrollX: project.appState.scrollX,
          scrollY: project.appState.scrollY,
        });
        useSaveStore.getState().markSaved();
        setIsLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not open this board');
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const commitTitle = (next: string): void => {
    const trimmed = next.trim();
    if (!projectId || !trimmed || trimmed === title) return;
    setTitle(trimmed);
    void updateProject(projectId, { title: trimmed });
  };

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="card max-w-sm px-6 py-8 text-center">
          <h1 className="text-base font-semibold">Could not open this board</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{loadError}</p>
          <Link to="/" className="btn btn-ghost mt-4">Back to your boards</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex h-12 shrink-0 items-center justify-between px-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/" className="flex h-8 w-8 items-center justify-center rounded" aria-label="Back to boards">
            <ChevronLeft size={17} />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="min-w-0 rounded bg-transparent px-1 text-sm font-medium"
            aria-label="Board title"
            data-testid="board-title"
          />
        </div>

        <div className="flex items-center gap-3">
          <SaveStatus />
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

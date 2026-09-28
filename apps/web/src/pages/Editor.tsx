import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, HardDrive, ChevronLeft, Redo2, Share2, Undo2 } from 'lucide-react';
import { AppStateSchema, type CharacterGender } from '@canvas/shared';
import Stage from '@/canvas/Stage';
import Toolbar from '@/ui/Toolbar';
import Ribbon from '@/ui/Ribbon';
import RichTextOverlay from '@/canvas/overlays/RichTextOverlay';
import PdfPageControl from '@/ui/PdfPageControl';
import PropertiesPanel from '@/ui/PropertiesPanel';
import ZoomControls from '@/ui/ZoomControls';
import SaveStatus from '@/ui/SaveStatus';
import ExportDialog from '@/ui/ExportDialog';
import { useCanvasStore } from '@/store/canvasStore';
import { useHistoryStore } from '@/store/historyStore';
import { useEditorStore } from '@/store/editorStore';
import { useSaveStore } from '@/store/saveStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAssetDrop } from '@/hooks/useAssetDrop';
import { useLocalBoardAutosave } from '@/hooks/useLocalBoardAutosave';
import { createElement } from '@/lib/elementFactory';
import { screenToCanvas } from '@/lib/geometry';
import { exportPortableJson, safeFilename, saveTextToComputer } from '@/lib/export';
import { getLocalBoard, saveLocalBoard } from '@/lib/localBoards';
import { getProject } from '@/lib/projects';

export default function Editor() {
  const { projectId, boardId } = useParams<{ projectId: string; boardId: string }>();
  const isLocalBoard = Boolean(boardId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [canvasHost, setCanvasHost] = useState<HTMLDivElement | null>(null);
  const [title, setTitle] = useState('Untitled board');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedRouteId, setLoadedRouteId] = useState<string | null>(null);
  const routeId = boardId ?? projectId ?? null;
  const isLoaded = routeId !== null && loadedRouteId === routeId;
  const [showExport, setShowExport] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [fileSaveMessage, setFileSaveMessage] = useState<string | null>(null);

  const { isDragging, isUploading, error: uploadError } = useAssetDrop({
    projectId: isLocalBoard ? undefined : projectId,
    container: canvasHost,
    localOnly: isLocalBoard,
    allowRemoteUpload: false,
  });

  const editor = useEditorStore((s) => s.editor);
  useEditorStore((s) => s.revision);

  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);

  useKeyboardShortcuts({ viewport });

  // Board content is never sent to the cloud. Local boards autosave to IndexedDB;
  // old account boards are preserved as read-only copies without Yjs connections.
  useLocalBoardAutosave({ boardId, title, enabled: isLoaded });

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
    const localId = boardId;
    const accountId = isLocalBoard ? undefined : projectId;
    if (!localId && !accountId) return;

    let cancelled = false;
    setLoadedRouteId(null);
    setLoadError(null);
    useCanvasStore.getState().setReadOnly(!localId);

    const load = localId
      ? getLocalBoard(localId).then((board) => {
          if (!board) throw new Error('This local board is no longer available in this browser. Open a saved .canvas.json file to restore it.');
          return {
            title: board.title,
            elements: board.elements,
            appState: board.appState,
          };
        })
      : getProject(accountId!).then(({ project, elements }) => ({
          title: project.title,
          elements,
          appState: project.appState,
        }));

    void load
      .then(({ title: boardTitle, elements, appState }) => {
        if (cancelled) return;
        setTitle(boardTitle);
        useCanvasStore.getState().loadElements(elements);
        useCanvasStore.getState().setEditingTextId(null);
        useCanvasStore.getState().setViewport({
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        });
        useSaveStore.getState().markSaved();
        setLoadedRouteId(localId ?? accountId!);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not open this board');
      });

    return () => {
      cancelled = true;
      useCanvasStore.getState().setReadOnly(false);
    };
  }, [boardId, isLocalBoard, projectId]);

  const commitTitle = (next: string): void => {
    const trimmed = next.trim();
    if (!isLocalBoard || !boardId || !trimmed || trimmed === title) return;
    setTitle(trimmed);
    void getLocalBoard(boardId).then((board) => {
      if (board) return saveLocalBoard({ ...board, title: trimmed });
      return undefined;
    }).catch(() => useSaveStore.getState().markFailed('Could not save the title on this device.'));
  };

  const saveBoardFile = async (): Promise<void> => {
    if (isSavingFile || !isLoaded) return;
    setIsSavingFile(true);
    setFileSaveMessage(null);
    try {
      const store = useCanvasStore.getState();
      const appState = AppStateSchema.parse({
        zoom: store.zoom,
        scrollX: store.scrollX,
        scrollY: store.scrollY,
      });
      const boardFile = await exportPortableJson(store.orderedElements(), appState, title);
      const result = await saveTextToComputer(
        JSON.stringify(boardFile, null, 2),
        `${safeFilename(title)}.canvas.json`,
        'application/json',
      );
      setFileSaveMessage(result === 'saved'
        ? 'Saved to your computer.'
        : result === 'downloaded'
          ? 'Board downloaded to your computer.'
          : 'Save cancelled.');
    } catch (err) {
      setFileSaveMessage(err instanceof Error ? err.message : 'Could not save this board file.');
    } finally {
      setIsSavingFile(false);
    }
  };

  const insertCharacter = (gender: CharacterGender): void => {
    if (!isLocalBoard) return;
    const store = useCanvasStore.getState();
    const center = screenToCanvas(
      { x: viewport.width / 2, y: viewport.height / 2 },
      store.zoom,
      store.scrollX,
      store.scrollY,
    );
    const peopleCount = store.elementOrder.filter((id) => store.elements[id]?.type === 'person').length;
    const column = peopleCount % 3;
    const row = Math.floor(peopleCount / 3);
    const character = createElement('person', {
      x: center.x - 40 + column * 100,
      y: center.y - 53 + row * 120,
    }, {
      width: 80,
      height: 106,
      characterGender: gender,
      backgroundColor: gender === 'female' ? '#c96852' : '#3d7a70',
      strokeColor: '#35424a',
      zIndex: store.elementOrder.length,
    });
    store.addElement(character);
    store.setTool('select');
  };

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="card max-w-sm px-6 py-8 text-center">
          <h1 className="text-base font-semibold">Could not open this board</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{loadError}</p>
          <Link to={isLocalBoard ? '/local' : '/account-boards'} className="btn btn-ghost mt-4">Back to your boards</Link>
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
          <Link to={isLocalBoard ? '/local' : '/account-boards'} className="flex h-8 w-8 items-center justify-center rounded" aria-label="Back to boards">
            <ChevronLeft size={17} />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            readOnly={!isLocalBoard}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="min-w-0 rounded bg-transparent px-1 text-sm font-medium"
            aria-label="Board title"
            data-testid="board-title"
          />
        </div>

        <div className="flex items-center gap-3">
          {isLocalBoard ? (
            <>
              <span className="hidden items-center gap-1 text-xs sm:flex" style={{ color: 'var(--accent)' }} title="Board content stays in this browser" data-testid="local-board-status">
                <HardDrive size={13} /> On this device
              </span>
              {fileSaveMessage && <span className="hidden text-xs sm:inline" style={{ color: 'var(--text-muted)' }} role="status">{fileSaveMessage}</span>}
              <button
                type="button"
                onClick={() => void saveBoardFile()}
                disabled={isSavingFile || !isLoaded}
                className="btn btn-primary h-8 px-2 text-xs"
                data-testid="save-to-computer"
              >
                <Download size={14} />
                {isSavingFile ? 'Saving…' : 'Save to computer'}
              </button>
            </>
          ) : (
            <span className="rounded px-2 py-1 text-xs" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} data-testid="legacy-readonly-status">
              Read-only account board
            </span>
          )}
          {isLocalBoard && <SaveStatus localOnly />}
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="btn btn-ghost h-8 px-2 text-xs"
            data-testid="open-export"
          >
            <Share2 size={14} />
            Export
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => useHistoryStore.getState().undo()}
              disabled={!isLocalBoard || !canUndo}
              title="Undo (Cmd+Z)"
              aria-label="Undo"
              className="flex h-8 w-8 items-center justify-center rounded disabled:opacity-30"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => useHistoryStore.getState().redo()}
              disabled={!isLocalBoard || !canRedo}
              title="Redo (Cmd+Shift+Z)"
              aria-label="Redo"
              className="flex h-8 w-8 items-center justify-center rounded disabled:opacity-30"
            >
              <Redo2 size={16} />
            </button>
          </div>
        </div>
      </header>

      {isLocalBoard && <Ribbon editor={editor} onInsertCharacter={insertCharacter} />}

      <div className="flex min-h-0 flex-1">
        {isLocalBoard && <Toolbar />}
        <div
          ref={(node) => {
            containerRef.current = node;
            setCanvasHost(node);
          }}
          className="relative min-w-0 flex-1"
          style={{ background: 'var(--surface)' }}
        >
          {isLoaded && viewport.width > 0 && (
            <Stage
              width={viewport.width}
              height={viewport.height}
            />
          )}
          <RichTextOverlay />
          <PdfPageControl />

          {isLocalBoard && isDragging && (
            <div
              className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg text-sm"
              style={{ border: '2px dashed var(--accent)', background: 'var(--accent-soft)', opacity: 0.9 }}
            >
              Drop an image or PDF to add it
            </div>
          )}

          {isLocalBoard && isUploading && (
            <div
              className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg px-3 py-1 text-xs"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
            >
              Adding to this board…
            </div>
          )}

          {isLocalBoard && uploadError && (
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

        {isLocalBoard && <PropertiesPanel />}
      </div>

      {showExport && (
        <ExportDialog
          projectId={undefined}
          title={title}
          localOnly={isLocalBoard}
          readOnly={!isLocalBoard}
          onTitleChange={(nextTitle) => setTitle(nextTitle)}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

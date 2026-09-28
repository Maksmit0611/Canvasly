import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FilePlus2, HardDrive, Plus, Trash2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { importFromJson } from '@/lib/export';
import { createLocalBoard, deleteLocalBoard, listLocalBoards, type LocalBoard } from '@/lib/localBoards';

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function LocalBoards(): React.JSX.Element {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [boards, setBoards] = useState<LocalBoard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBoards = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      setBoards(await listLocalBoards());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open local boards.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBoards();
  }, [refreshBoards]);

  const createBoard = async (): Promise<void> => {
    setIsCreating(true);
    setError(null);
    try {
      const board = await createLocalBoard();
      navigate(`/local/${board.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create a board on this device.');
    } finally {
      setIsCreating(false);
    }
  };

  const importFile = async (file: File): Promise<void> => {
    const result = importFromJson(await file.text());
    if (!result.ok || !result.file) {
      setError(result.error ?? 'Could not open that board file.');
      return;
    }

    // Old exports may refer to cloud assets without embedding the bytes. Do
    // not fetch those assets behind the user's back in local-only mode.
    const elements = result.file.elements.map((element) =>
      element.assetId && !element.assetData ? { ...element, assetId: undefined } : element,
    );
    try {
      const fallbackTitle = file.name.replace(/\.canvas\.json$|\.json$/i, '').trim();
      const board = await createLocalBoard({
        title: result.file.title?.trim() || fallbackTitle || 'Imported board',
        elements,
        appState: result.file.appState,
      });
      navigate(`/local/${board.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import this board.');
    }
  };

  const removeBoard = async (id: string): Promise<void> => {
    try {
      await deleteLocalBoard(id);
      setBoards((current) => current.filter((board) => board.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete this local board.');
    }
  };

  return (
    <div className="mx-auto min-h-full w-full max-w-5xl px-6 py-8 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo size={27} />
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
          style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
          data-testid="local-only-badge"
        >
          <HardDrive size={14} /> Stored only on this device
        </span>
      </header>

      <main>
        <div className="mt-10 flex flex-col justify-between gap-5 sm:mt-14 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>
              Your private workspace
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Local boards</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Your work stays in this browser. Download a Canvasly board file to keep a copy on your computer or move it to another device.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".json,.canvas.json,application/json"
              className="sr-only"
              aria-label="Open a Canvasly board file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.target.value = '';
              }}
            />
            <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
              <FilePlus2 size={16} />
              Open board file
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void createBoard()}
              disabled={isCreating}
              data-testid="new-local-board"
            >
              <Plus size={16} />
              {isCreating ? 'Creating…' : 'New board'}
            </button>
          </div>
        </div>

        <div
          className="mt-7 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-raised)', color: 'var(--text-muted)' }}
        >
          <Download size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <p><strong style={{ color: 'var(--text)' }}>Make a backup:</strong> use “Save to computer” inside any board. Local browser data can be cleared by browser settings, so keep a downloaded copy of important work.</p>
        </div>

        {error && <p className="mt-5 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}

        {isLoading ? (
          <p className="mt-8 text-sm" style={{ color: 'var(--text-muted)' }}>Loading boards from this device…</p>
        ) : boards.length === 0 ? (
          <div className="card mt-8 flex flex-col items-center px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <HardDrive size={22} />
            </div>
            <h2 className="mt-4 text-base font-semibold">A blank canvas, just for you</h2>
            <p className="mt-2 max-w-sm text-sm" style={{ color: 'var(--text-muted)' }}>
              Create a board to start planning, teaching, or mapping ideas. Nothing is uploaded to an account.
            </p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => void createBoard()} disabled={isCreating}>
              <Plus size={16} /> Create your first board
            </button>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="local-board-list">
            {boards.map((board) => (
              <li key={board.id} className="card group relative overflow-hidden transition-shadow duration-200 hover:shadow-md">
                <button type="button" onClick={() => navigate(`/local/${board.id}`)} className="block w-full p-4 text-left">
                  <div className="flex h-28 items-center justify-center rounded-lg" style={{ background: 'var(--surface-sunken)' }}>
                    <span className="text-3xl" aria-hidden="true">▱</span>
                  </div>
                  <div className="mt-3 truncate text-sm font-semibold">{board.title}</div>
                  <div className="mt-1 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{board.elements.length} items</span>
                    <span>{formatDate(board.updatedAt)}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void removeBoard(board.id)}
                  aria-label={`Delete ${board.title}`}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

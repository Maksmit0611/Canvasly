import { useRef, useState } from 'react';
import type Konva from 'konva';
import { X } from 'lucide-react';
import { AppStateSchema } from '@canvas/shared';
import { useCanvasStore } from '@/store/canvasStore';
import {
  downloadDataUrl,
  downloadText,
  exportPortableJson,
  exportStageToPng,
  exportToSvg,
  importFromJson,
  safeFilename,
} from '@/lib/export';
import { exportToPdf } from '@/lib/exportPdf';
import { api } from '@/lib/api';

interface Props {
  projectId: string | undefined;
  title: string;
  localOnly?: boolean;
  readOnly?: boolean;
  onTitleChange?: (title: string) => void;
  onClose: () => void;
}

const stage = (): Konva.Stage | undefined =>
  (window as { Konva?: { stages: Konva.Stage[] } }).Konva?.stages[0];

export default function ExportDialog({
  projectId,
  title,
  localOnly = false,
  readOnly = false,
  onTitleChange,
  onClose,
}: Props) {
  const [pixelRatio, setPixelRatio] = useState<1 | 2 | 3>(2);
  const [transparent, setTransparent] = useState(false);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const elementsToExport = () => {
    const store = useCanvasStore.getState();
    return selectionOnly && store.selectedIds.length > 0
      ? store.selectedElements()
      : store.orderedElements();
  };

  const stem = safeFilename(title);

  const handlePng = (): void => {
    const konva = stage();
    if (!konva) return;
    const url = exportStageToPng(konva, { elements: elementsToExport(), pixelRatio, transparent });
    if (url) downloadDataUrl(url, `${stem}.png`);
    else setMessage('There is nothing to export yet.');
  };

  const handleSvg = async (): Promise<void> => {
    setBusy('svg');
    setMessage(null);
    try {
      const svg = await exportToSvg(elementsToExport(), transparent);
      if (svg) downloadText(svg, `${stem}.svg`, 'image/svg+xml');
      else setMessage('There is nothing to export yet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not export SVG.');
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = (): void => {
    const konva = stage();
    if (!konva) return;
    if (!exportToPdf(konva, elementsToExport(), `${stem}.pdf`)) {
      setMessage('There is nothing to export yet.');
    }
  };

  const handleJson = async (): Promise<void> => {
    setBusy('json');
    setMessage(null);
    try {
      const store = useCanvasStore.getState();
      const appState = AppStateSchema.parse({
        zoom: store.zoom,
        scrollX: store.scrollX,
        scrollY: store.scrollY,
      });
      const file = await exportPortableJson(elementsToExport(), appState, title);
      downloadText(JSON.stringify(file, null, 2), `${stem}.canvas.json`, 'application/json');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not export the board file.');
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (file: File): Promise<void> => {
    try {
      const result = importFromJson(await file.text());
      if (!result.ok || !result.file) {
        setMessage(result.error ?? 'Import failed.');
        return;
      }

      const importedElements = localOnly
        ? result.file.elements.map((element) =>
            element.assetId && !element.assetData ? { ...element, assetId: undefined } : element,
          )
        : result.file.elements;
      const store = useCanvasStore.getState();
      store.loadElements(importedElements);
      store.setEditingTextId(null);
      store.setViewport({
        zoom: result.file.appState.zoom,
        scrollX: result.file.appState.scrollX,
        scrollY: result.file.appState.scrollY,
      });
      if (result.file.title) onTitleChange?.(result.file.title);
      setMessage(`Imported ${importedElements.length} element(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import that board.');
    }
  };

  const handleShare = async (): Promise<void> => {
    if (!projectId) return;
    setBusy('share');
    try {
      const { data } = await api.post<{ url: string }>(`/projects/${projectId}/share`, { permission: 'view' });
      setShareUrl(data.url);
    } catch {
      setMessage('Could not create a share link.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-md p-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Export board"
        data-testid="export-dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{localOnly ? 'Save or export' : 'Export board'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1">
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1">
            Scale
            <select
              value={pixelRatio}
              onChange={(event) => setPixelRatio(Number(event.target.value) as 1 | 2 | 3)}
              className="h-6 rounded px-1"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              aria-label="Export scale"
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />
            Transparent background
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={selectionOnly} onChange={(event) => setSelectionOnly(event.target.checked)} />
            Selection only
          </label>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <button type="button" className="btn btn-ghost text-xs" onClick={handlePng} data-testid="export-png">PNG</button>
          <button type="button" className="btn btn-ghost text-xs" onClick={() => void handleSvg()} disabled={busy === 'svg'} data-testid="export-svg">SVG</button>
          <button type="button" className="btn btn-ghost text-xs" onClick={handlePdf} data-testid="export-pdf">PDF</button>
          <button type="button" className="btn btn-ghost text-xs" onClick={() => void handleJson()} disabled={busy === 'json'} data-testid="export-json">
            {busy === 'json' ? 'Saving…' : 'Board file'}
          </button>
        </div>
        {localOnly && <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>The portable board file includes embedded images and PDFs.</p>}

        {!readOnly && (
          <div className="mt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="mt-3 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Open a board file</div>
            <input
              key={fileInputKey}
              type="file"
              accept=".json,application/json"
              className="mt-1 w-full text-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
                setFileInputKey((key) => key + 1);
              }}
              aria-label="Import a .canvas.json file"
            />
          </div>
        )}

        {!localOnly && !readOnly && (
          <div className="mt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="mt-3 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Share</div>
            <div className="mt-1 flex gap-2">
              <button type="button" className="btn btn-ghost text-xs" onClick={() => void handleShare()} disabled={busy === 'share' || !projectId} data-testid="share-view">
                Create read-only link
              </button>
            </div>
            {shareUrl && (
              <div className="mt-2 flex items-center gap-1">
                <input readOnly value={shareUrl} className="h-7 min-w-0 flex-1 rounded px-2 font-mono text-[11px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} aria-label="Share link" data-testid="share-url" />
                <button type="button" onClick={() => void navigator.clipboard.writeText(shareUrl)} aria-label="Copy share link" className="flex h-7 w-7 items-center justify-center rounded" style={{ border: '1px solid var(--border)' }}>Copy</button>
              </div>
            )}
          </div>
        )}

        {message && <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }} role="status">{message}</p>}
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import type Konva from 'konva';
import { Check, Copy, X } from 'lucide-react';
import { AppStateSchema } from '@canvas/shared';
import { useCanvasStore } from '@/store/canvasStore';
import {
  downloadDataUrl, downloadText, exportStageToPng, exportToJson, exportToSvg,
  importFromJson, safeFilename,
} from '@/lib/export';
import { exportToPdf } from '@/lib/exportPdf';
import { api } from '@/lib/api';

interface Props {
  projectId: string | undefined;
  title: string;
  onClose: () => void;
}

const stage = (): Konva.Stage | undefined =>
  (window as { Konva?: { stages: Konva.Stage[] } }).Konva?.stages[0];

export default function ExportDialog({ projectId, title, onClose }: Props) {
  const [pixelRatio, setPixelRatio] = useState<1 | 2 | 3>(2);
  const [transparent, setTransparent] = useState(false);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
    try {
      const svg = await exportToSvg(elementsToExport(), transparent);
      if (svg) downloadText(svg, `${stem}.svg`, 'image/svg+xml');
      else setMessage('There is nothing to export yet.');
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

  const handleJson = (): void => {
    const store = useCanvasStore.getState();
    const appState = AppStateSchema.parse({
      zoom: store.zoom,
      scrollX: store.scrollX,
      scrollY: store.scrollY,
    });
    downloadText(
      JSON.stringify(exportToJson(elementsToExport(), appState), null, 2),
      `${stem}.canvas.json`,
      'application/json',
    );
  };

  const handleImport = async (file: File): Promise<void> => {
    const result = importFromJson(await file.text());
    if (!result.ok || !result.file) {
      setMessage(result.error ?? 'Import failed.');
      return;
    }

    const store = useCanvasStore.getState();
    store.loadElements(result.file.elements);
    store.setViewport({
      zoom: result.file.appState.zoom,
      scrollX: result.file.appState.scrollX,
      scrollY: result.file.appState.scrollY,
    });
    // Mark everything dirty so the imported board is persisted.
    useCanvasStore.setState({
      dirtyIds: new Set(result.file.elements.map((e) => e.id)),
      isDirty: true,
    });
    setMessage(`Imported ${result.file.elements.length} element(s).`);
  };

  const handleShare = async (permission: 'view' | 'edit'): Promise<void> => {
    if (!projectId) return;
    setBusy('share');
    try {
      const { data } = await api.post<{ url: string }>(`/projects/${projectId}/share`, { permission });
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
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Export and share"
        data-testid="export-dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Export &amp; share</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1">
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1">
            Scale
            <select
              value={pixelRatio}
              onChange={(e) => setPixelRatio(Number(e.target.value) as 1 | 2 | 3)}
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
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
            Transparent background
          </label>

          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selectionOnly}
              onChange={(e) => setSelectionOnly(e.target.checked)}
            />
            Selection only
          </label>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <button type="button" className="btn btn-ghost text-xs" onClick={handlePng} data-testid="export-png">PNG</button>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => void handleSvg()}
            disabled={busy === 'svg'}
            data-testid="export-svg"
          >
            SVG
          </button>
          <button type="button" className="btn btn-ghost text-xs" onClick={handlePdf} data-testid="export-pdf">PDF</button>
          <button type="button" className="btn btn-ghost text-xs" onClick={handleJson} data-testid="export-json">JSON</button>
        </div>

        <div className="mt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="mt-3 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Import
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="mt-1 w-full text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = '';
            }}
            aria-label="Import a .canvas.json file"
          />
        </div>

        <div className="mt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="mt-3 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Share
          </div>

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => void handleShare('view')}
              disabled={busy === 'share' || !projectId}
              data-testid="share-view"
            >
              Create read-only link
            </button>
          </div>

          {shareUrl && (
            <div className="mt-2 flex items-center gap-1">
              <input
                readOnly
                value={shareUrl}
                className="h-7 min-w-0 flex-1 rounded px-2 font-mono text-[11px]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                aria-label="Share link"
                data-testid="share-url"
              />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                aria-label="Copy share link"
                className="flex h-7 w-7 items-center justify-center rounded"
                style={{ border: '1px solid var(--border)' }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          )}
        </div>

        {message && (
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }} role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

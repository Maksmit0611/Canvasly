import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CanvasElement, Project } from '@canvas/shared';
import Stage from '@/canvas/Stage';
import ZoomControls from '@/ui/ZoomControls';
import { useCanvasStore } from '@/store/canvasStore';
import { api } from '@/lib/api';

interface ShareResponse {
  project: Project;
  elements: CanvasElement[];
  permission: 'view' | 'edit';
}

export default function SharedView() {
  const { token } = useParams<{ token: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [title, setTitle] = useState('Shared board');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  }, [isLoading]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    // Editing is disabled in the store, so no interaction path can mutate the
    // board regardless of what the UI exposes.
    useCanvasStore.getState().setReadOnly(true);

    void api
      .get<ShareResponse>(`/share/${token}`)
      .then(({ data }) => {
        if (cancelled) return;
        setTitle(data.project.title);
        useCanvasStore.getState().loadElements(data.elements);
        useCanvasStore.getState().setReadOnly(true);
        useCanvasStore.getState().setTool('select');
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('This link is no longer available.');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      useCanvasStore.getState().setReadOnly(false);
    };
  }, [token]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="card max-w-sm px-6 py-8 text-center">
          <h1 className="text-base font-semibold">Link unavailable</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            This share link has been revoked or has expired.
          </p>
          <Link to="/" className="btn btn-ghost mt-4">Go to Canvasly</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex h-12 shrink-0 items-center justify-between px-4"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}
      >
        <span className="text-sm font-medium">{title}</span>
        <span
          className="rounded px-2 py-0.5 text-xs"
          style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
          data-testid="readonly-badge"
        >
          Read only
        </span>
      </header>

      <div ref={containerRef} className="relative min-h-0 flex-1" style={{ background: 'var(--surface)' }}>
        {isLoading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : (
          viewport.width > 0 && <Stage width={viewport.width} height={viewport.height} />
        )}
        <ZoomControls viewport={viewport} />
      </div>
    </div>
  );
}

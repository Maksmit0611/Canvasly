import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjs } from './pdfWorker';
import { scaleTier } from '@/lib/zoom';
import { fetchAssetBytes } from '@/lib/assets';

const RENDER_DEBOUNCE_MS = 300;
const MAX_CACHED_PAGES = 20;

/** Rendered pages, keyed by asset, page and resolution tier. */
const pageCache = new Map<string, HTMLCanvasElement>();
const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

const cacheKey = (assetId: string, page: number, tier: number): string =>
  `${assetId}:${page}:${tier}`;

function loadDocument(assetId: string): Promise<PDFDocumentProxy> {
  const existing = documentCache.get(assetId);
  if (existing) return existing;

  // Bytes come through the authenticated API client, then straight into
  // pdf.js — it cannot attach our bearer token to a URL of its own.
  const promise = fetchAssetBytes(assetId)
    .then((bytes) => pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise)
    .catch((err: unknown) => {
      // A failed load must not be cached, or a retry can never succeed.
      documentCache.delete(assetId);
      throw err;
    });

  documentCache.set(assetId, promise);
  return promise;
}

export interface PdfPageState {
  canvas: HTMLCanvasElement | null;
  pageCount: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Render one page of a PDF to an offscreen canvas for Konva to draw.
 *
 * Resolution follows the zoom tier, so a page stays crisp when zoomed in
 * instead of turning to mud, and re-renders are debounced so dragging the zoom
 * does not queue a render per frame.
 */
export function usePdfPage(assetId: string | undefined, page: number, zoom: number): PdfPageState {
  const [state, setState] = useState<PdfPageState>({
    canvas: null,
    pageCount: 0,
    isLoading: false,
    error: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tier = scaleTier(zoom);

  useEffect(() => {
    if (!assetId) {
      setState({ canvas: null, pageCount: 0, isLoading: false, error: null });
      return;
    }

    let cancelled = false;

    const cached = pageCache.get(cacheKey(assetId, page, tier));
    if (cached) {
      setState((s) => ({ ...s, canvas: cached, isLoading: false, error: null }));
      // Still fall through to refresh pageCount if we do not have it yet.
    } else {
      setState((s) => ({ ...s, isLoading: true, error: null }));
    }

    const run = async (): Promise<void> => {
      try {
        const doc = await loadDocument(assetId);
        if (cancelled) return;

        const key = cacheKey(assetId, page, tier);
        const hit = pageCache.get(key);
        if (hit) {
          setState({ canvas: hit, pageCount: doc.numPages, isLoading: false, error: null });
          return;
        }

        const clamped = Math.min(Math.max(1, page), doc.numPages);
        const pdfPage = await doc.getPage(clamped);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale: tier });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create a 2D context for the PDF page');

        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
        if (cancelled) return;

        // Bound the cache so a long session does not hold every page rendered.
        if (pageCache.size >= MAX_CACHED_PAGES) {
          const oldest = pageCache.keys().next().value;
          if (oldest) pageCache.delete(oldest);
        }
        pageCache.set(key, canvas);

        setState({ canvas, pageCount: doc.numPages, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          canvas: null,
          pageCount: 0,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to render the PDF',
        });
      }
    };

    if (timerRef.current) clearTimeout(timerRef.current);
    // Render the first view immediately; debounce only subsequent re-renders
    // triggered by zooming.
    timerRef.current = setTimeout(run, cached ? 0 : RENDER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [assetId, page, tier]);

  return state;
}

/** Test hook: clears both caches. */
export function clearPdfCaches(): void {
  pageCache.clear();
  documentCache.clear();
}

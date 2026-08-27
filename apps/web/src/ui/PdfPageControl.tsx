import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCanvasStore } from '@/store/canvasStore';
import { canvasToScreen } from '@/lib/geometry';
import { usePdfPage } from '@/pdf/usePdfPage';

/**
 * Floating page control for the selected PDF element. Rendered as HTML chrome
 * over the canvas so it stays a constant physical size at any zoom.
 */
export default function PdfPageControl() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const elements = useCanvasStore((s) => s.elements);
  const zoom = useCanvasStore((s) => s.zoom);
  const scrollX = useCanvasStore((s) => s.scrollX);
  const scrollY = useCanvasStore((s) => s.scrollY);

  const element = selectedIds.length === 1 ? elements[selectedIds[0]!] : undefined;
  const isPdf = element?.type === 'pdf' && !element.isDeleted;

  // Hooks must run unconditionally, so this is called even when not a PDF.
  const { pageCount } = usePdfPage(isPdf ? element.assetId : undefined, element?.pdfPage ?? 1, zoom);

  if (!isPdf || !element) return null;

  const page = element.pdfPage ?? 1;
  const total = pageCount || 1;

  const goTo = (next: number): void => {
    const clamped = Math.min(Math.max(1, next), total);
    if (clamped === page) return;
    useCanvasStore.getState().updateElements([element.id], { pdfPage: clamped }, { label: 'Change page' });
  };

  const screen = canvasToScreen(
    { x: element.x + element.width / 2, y: element.y + element.height },
    zoom,
    scrollX,
    scrollY,
  );

  return (
    <div
      className="absolute flex items-center gap-1 rounded-lg px-1 py-1"
      style={{
        left: screen.x,
        top: screen.y + 8,
        transform: 'translateX(-50%)',
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        zIndex: 5,
      }}
      data-testid="pdf-page-control"
    >
      <button
        type="button"
        onClick={() => goTo(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
      >
        <ChevronLeft size={14} />
      </button>

      <span className="px-1 text-xs tabular-nums" data-testid="pdf-page-label">
        {page} / {total}
      </span>

      <button
        type="button"
        onClick={() => goTo(page + 1)}
        disabled={page >= total}
        aria-label="Next page"
        className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

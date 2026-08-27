import { useCallback, useEffect, useState } from 'react';
import type { CanvasElement } from '@canvas/shared';
import { useCanvasStore } from '@/store/canvasStore';
import { createElement } from '@/lib/elementFactory';
import { fitPlacementSize, imageDimensions, uploadAsset } from '@/lib/assets';
import { screenToCanvas } from '@/lib/geometry';

interface Options {
  projectId: string | undefined;
  container: HTMLElement | null;
}

export interface AssetDropState {
  isDragging: boolean;
  isUploading: boolean;
  error: string | null;
}

/**
 * Upload files dropped on the canvas or pasted from the clipboard, then place
 * them at the drop point sized to their natural dimensions.
 */
export function useAssetDrop({ projectId, container }: Options): AssetDropState {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeFile = useCallback(
    async (file: File, screenPoint: { x: number; y: number }): Promise<void> => {
      if (!projectId) return;

      setIsUploading(true);
      setError(null);

      try {
        const asset = await uploadAsset(projectId, file);
        const store = useCanvasStore.getState();
        const at = screenToCanvas(screenPoint, store.zoom, store.scrollX, store.scrollY);

        let size = { width: 400, height: 520 };
        if (asset.kind === 'image') {
          const natural = await imageDimensions(file);
          size = fitPlacementSize(natural.width, natural.height);
        }

        const element: CanvasElement = createElement(
          asset.kind === 'pdf' ? 'pdf' : 'image',
          { x: at.x - size.width / 2, y: at.y - size.height / 2 },
          {
            width: size.width,
            height: size.height,
            assetId: asset.id,
            zIndex: store.elementOrder.length,
            ...(asset.kind === 'pdf' ? { pdfPage: 1 } : {}),
          },
        );

        store.addElement(element);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!container) return;

    const onDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setIsDragging(true);
    };

    const onDragLeave = (e: DragEvent): void => {
      // Ignore moves between child nodes inside the container.
      if (e.relatedTarget && container.contains(e.relatedTarget as Node)) return;
      setIsDragging(false);
    };

    const onDrop = (e: DragEvent): void => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      e.preventDefault();
      setIsDragging(false);

      const rect = container.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      for (const file of Array.from(files)) void placeFile(file, point);
    };

    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null;
      // Let a focused text editor handle its own paste.
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target?.tagName ?? '')) return;

      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;

      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const centre = { x: rect.width / 2, y: rect.height / 2 };
      for (const file of files) void placeFile(file, centre);
    };

    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);

    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('dragleave', onDragLeave);
      container.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [container, placeFile]);

  return { isDragging, isUploading, error };
}

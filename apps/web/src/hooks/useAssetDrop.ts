import { useCallback, useEffect, useState } from 'react';
import type { CanvasElement } from '@canvas/shared';
import { useCanvasStore } from '@/store/canvasStore';
import { createElement } from '@/lib/elementFactory';
import { fileToDataUrl, fitPlacementSize, imageDimensions, uploadAsset } from '@/lib/assets';
import { screenToCanvas } from '@/lib/geometry';

interface Options {
  projectId: string | undefined;
  container: HTMLElement | null;
  localOnly?: boolean;
  allowRemoteUpload?: boolean;
}

export interface AssetDropState {
  isDragging: boolean;
  isUploading: boolean;
  error: string | null;
}

/** Add dropped or pasted files; private boards retain their bytes in the board itself. */
export function useAssetDrop({
  projectId,
  container,
  localOnly = false,
  allowRemoteUpload = true,
}: Options): AssetDropState {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeFile = useCallback(
    async (file: File, screenPoint: { x: number; y: number }): Promise<void> => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (localOnly ? (!file.type.startsWith('image/') && !isPdf) : (!allowRemoteUpload || !projectId)) return;

      setIsUploading(true);
      setError(null);

      try {
        const kind = isPdf ? 'pdf' : 'image';
        if (localOnly && kind === 'image' && !file.type.startsWith('image/')) {
          throw new Error('Choose an image or PDF file.');
        }

        const [asset, assetData] = await Promise.all([
          localOnly ? Promise.resolve(null) : uploadAsset(projectId!, file),
          localOnly ? fileToDataUrl(file) : Promise.resolve(undefined),
        ]);
        const store = useCanvasStore.getState();
        const at = screenToCanvas(screenPoint, store.zoom, store.scrollX, store.scrollY);

        let size = { width: 400, height: 520 };
        if (kind === 'image') {
          const natural = await imageDimensions(file);
          size = fitPlacementSize(natural.width, natural.height);
        }

        const element: CanvasElement = createElement(
          kind === 'pdf' ? 'pdf' : 'image',
          { x: at.x - size.width / 2, y: at.y - size.height / 2 },
          {
            width: size.width,
            height: size.height,
            ...(asset ? { assetId: asset.id } : {}),
            ...(assetData ? { assetData } : {}),
            zIndex: store.elementOrder.length,
            ...(kind === 'pdf' ? { pdfPage: 1 } : {}),
          },
        );

        store.addElement(element);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add this file');
      } finally {
        setIsUploading(false);
      }
    },
    [allowRemoteUpload, localOnly, projectId],
  );

  useEffect(() => {
    if (!container) return;

    const onDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setIsDragging(true);
    };

    const onDragLeave = (e: DragEvent): void => {
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

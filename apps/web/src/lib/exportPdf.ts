import { jsPDF } from 'jspdf';
import type Konva from 'konva';
import type { CanvasElement } from '@canvas/shared';
import { exportBounds, exportStageToPng } from './export';

/**
 * Render the board to a PDF. The content region is rasterised once and placed
 * on a page sized to match, so nothing is cropped or letterboxed.
 */
export function exportToPdf(
  stage: Konva.Stage,
  elements: readonly CanvasElement[],
  filename: string,
): boolean {
  const bounds = exportBounds(elements);
  if (!bounds) return false;

  const dataUrl = exportStageToPng(stage, { elements, pixelRatio: 2, transparent: false });
  if (!dataUrl) return false;

  const orientation = bounds.width >= bounds.height ? 'landscape' : 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: [bounds.width, bounds.height],
  });

  doc.addImage(dataUrl, 'PNG', 0, 0, bounds.width, bounds.height);
  doc.save(filename);
  return true;
}

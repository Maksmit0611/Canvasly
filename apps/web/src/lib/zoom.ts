import type { StrokeStyle } from '@canvas/shared';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;
export const MIN_VISIBLE_STROKE_PX = 1;

/**
 * Screen-pixel width to render a stroke at.
 *
 * Konva draws these with `strokeScaleEnabled={false}`, so the value is already
 * in screen pixels and a 2px stroke stays exactly 2px from 10% to 1000% zoom —
 * which is requirement #2. The only adjustment is a floor, so a sub-pixel
 * hairline still renders as a visible line rather than disappearing.
 *
 * `zoom` is accepted for call-site symmetry with `invariant()` and because a
 * future DPI-aware tweak belongs here; deliberately unused today, since any
 * dependence on zoom is precisely what would break the requirement.
 */
export const renderedStrokeWidth = (strokeWidth: number, _zoom?: number): number =>
  Math.max(MIN_VISIBLE_STROKE_PX, strokeWidth);

/**
 * Convert a screen-pixel measurement into canvas units, so chrome drawn in
 * canvas space (selection outlines, handles, guides, remote cursors) keeps a
 * constant physical size at every zoom level.
 */
export const invariant = (px: number, zoom: number): number => px / zoom;

export const HANDLE_SIZE_PX = 8;
export const OUTLINE_WIDTH_PX = 1.5;
export const ROTATION_HANDLE_OFFSET_PX = 24;

/** Dash pattern in canvas units for a given stroke style. */
export function dashArray(style: StrokeStyle, strokeWidth: number): number[] | undefined {
  switch (style) {
    case 'dashed':
      return [strokeWidth * 3, strokeWidth * 2];
    case 'dotted':
      return [strokeWidth * 0.1, strokeWidth * 2];
    case 'solid':
    default:
      return undefined;
  }
}

/**
 * Zoom about a focal point, keeping whatever sits under it fixed on screen.
 * Returns the next zoom together with the scroll needed to hold that point.
 */
export function zoomAtPoint(
  zoom: number,
  scrollX: number,
  scrollY: number,
  focal: { x: number; y: number },
  factor: number,
): { zoom: number; scrollX: number; scrollY: number } {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  if (nextZoom === zoom) return { zoom, scrollX, scrollY };

  // World point under the cursor before the change...
  const worldX = (focal.x - scrollX) / zoom;
  const worldY = (focal.y - scrollY) / zoom;

  // ...must land back under the cursor after it.
  return {
    zoom: nextZoom,
    scrollX: focal.x - worldX * nextZoom,
    scrollY: focal.y - worldY * nextZoom,
  };
}

/** Scroll and zoom that fit `bounds` inside a viewport with padding. */
export function fitToBounds(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  padding = 64,
): { zoom: number; scrollX: number; scrollY: number } {
  const availableW = Math.max(1, viewport.width - padding * 2);
  const availableH = Math.max(1, viewport.height - padding * 2);

  const zoom =
    bounds.width === 0 || bounds.height === 0
      ? 1
      : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(availableW / bounds.width, availableH / bounds.height)));

  return {
    zoom,
    scrollX: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    scrollY: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
  };
}

/**
 * Resolution tier to rasterise assets at. Quantised so a PDF page is not
 * re-rendered on every pixel of zoom change.
 */
export const scaleTier = (zoom: number): number => {
  if (zoom <= 1) return 1;
  if (zoom <= 2) return 2;
  if (zoom <= 4) return 3;
  return 4;
};

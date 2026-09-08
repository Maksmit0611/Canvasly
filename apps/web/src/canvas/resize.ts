import type { Bounds } from '@/lib/geometry';
import type { HandleId } from './SelectionLayer';

/**
 * Apply a resize drag to a bounding box. `preserveAspect` keeps the original
 * proportions, which is what Shift does while dragging a corner.
 */
export function resizeBounds(
  start: Bounds,
  handle: HandleId,
  dx: number,
  dy: number,
  preserveAspect: boolean,
): Bounds {
  let { x, y, width, height } = start;

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se';

  if (movesLeft) {
    x = start.x + dx;
    width = start.width - dx;
  } else if (movesRight) {
    width = start.width + dx;
  }

  if (movesTop) {
    y = start.y + dy;
    height = start.height - dy;
  } else if (movesBottom) {
    height = start.height + dy;
  }

  if (preserveAspect && start.width !== 0 && start.height !== 0) {
    const ratio = start.height / start.width;
    const isCorner = (movesLeft || movesRight) && (movesTop || movesBottom);

    if (isCorner) {
      // Let the larger change drive, so the shape follows the pointer.
      const byWidth = Math.abs(width) > Math.abs(height / ratio);
      if (byWidth) height = width * ratio;
      else width = height / ratio;

      if (movesLeft) x = start.x + (start.width - width);
      if (movesTop) y = start.y + (start.height - height);
    }
  }

  return { x, y, width, height };
}

/** Scale factors and origin needed to map elements from one box into another. */
export function boundsTransform(from: Bounds, to: Bounds): {
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
} {
  return {
    scaleX: from.width === 0 ? 1 : to.width / from.width,
    scaleY: from.height === 0 ? 1 : to.height / from.height,
    originX: from.x,
    originY: from.y,
  };
}

import type { CanvasElement, Point } from '@canvas/shared';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The two coordinate spaces. Element coordinates are always stored in canvas
 * space; only rendering and pointer handling convert between the two.
 */
export const screenToCanvas = (p: Point, zoom: number, scrollX: number, scrollY: number): Point => ({
  x: (p.x - scrollX) / zoom,
  y: (p.y - scrollY) / zoom,
});

export const canvasToScreen = (p: Point, zoom: number, scrollX: number, scrollY: number): Point => ({
  x: p.x * zoom + scrollX,
  y: p.y * zoom + scrollY,
});

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Bounds with width/height forced positive, so a shape dragged up-left still hit-tests. */
export const normalizeBounds = (b: Bounds): Bounds => ({
  x: b.width < 0 ? b.x + b.width : b.x,
  y: b.height < 0 ? b.y + b.height : b.y,
  width: Math.abs(b.width),
  height: Math.abs(b.height),
});

export const elementBounds = (el: CanvasElement): Bounds =>
  normalizeBounds({ x: el.x, y: el.y, width: el.width, height: el.height });

export const boundsCenter = (b: Bounds): Point => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

/** Smallest box containing every input box; null for an empty list. */
export function unionBounds(list: readonly Bounds[]): Bounds | null {
  if (list.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const raw of list) {
    const b = normalizeBounds(raw);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const boundsOfElements = (elements: readonly CanvasElement[]): Bounds | null =>
  unionBounds(elements.map(elementBounds));

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  const p = normalizeBounds(a);
  const q = normalizeBounds(b);
  return !(p.x + p.width < q.x || q.x + q.width < p.x || p.y + p.height < q.y || q.y + q.height < p.y);
}

export const pointInBounds = (p: Point, b: Bounds): boolean => {
  const n = normalizeBounds(b);
  return p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height;
};

/** Rotate a point about an origin by `angle` radians. */
export function rotatePoint(p: Point, origin: Point, angle: number): Point {
  if (angle === 0) return p;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const snapToGrid = (value: number, gridSize: number): number =>
  gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;

export const snapPointToGrid = (p: Point, gridSize: number): Point => ({
  x: snapToGrid(p.x, gridSize),
  y: snapToGrid(p.y, gridSize),
});

/**
 * Where a ray leaving `from` toward `to` crosses the rectangle around `from`.
 * Used to sit a bound arrow's endpoint on a shape's edge rather than its centre.
 */
export function rayBoxIntersection(from: Point, to: Point, box: Bounds): Point {
  const b = normalizeBounds(box);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;

  const halfW = b.width / 2;
  const halfH = b.height / 2;
  const center = boundsCenter(b);

  // Scale the direction until it first touches a vertical or horizontal edge.
  const scaleX = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** The ellipse equivalent of rayBoxIntersection. */
export function rayEllipseIntersection(from: Point, to: Point, box: Bounds): Point {
  const b = normalizeBounds(box);
  const center = boundsCenter(b);
  const dx = to.x - center.x;
  const dy = to.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const rx = b.width / 2;
  const ry = b.height / 2;
  if (rx === 0 || ry === 0) return center;

  // Solve (t*dx/rx)^2 + (t*dy/ry)^2 = 1 for t.
  const t = 1 / Math.hypot(dx / rx, dy / ry);
  return { x: center.x + dx * t, y: center.y + dy * t };
}

/** Attachment point on a shape's edge, matched to that shape's outline. */
export function edgeAttachmentPoint(target: CanvasElement, toward: Point): Point {
  const box = elementBounds(target);
  const center = boundsCenter(box);
  return target.type === 'ellipse'
    ? rayEllipseIntersection(center, toward, box)
    : rayBoxIntersection(center, toward, box);
}

/** Constrain a drag to the dominant axis — used while Shift is held. */
export function constrainToAxis(origin: Point, p: Point): Point {
  return Math.abs(p.x - origin.x) >= Math.abs(p.y - origin.y)
    ? { x: p.x, y: origin.y }
    : { x: origin.x, y: p.y };
}

/** Absolute points for a line/arrow/freedraw, whose `points` are (x,y)-relative. */
export const absolutePoints = (el: CanvasElement): Point[] =>
  (el.points ?? []).map((p) => ({ x: el.x + p.x, y: el.y + p.y }));

/** Tight bounds for point-based elements, padded by half the stroke. */
export function pointsBounds(el: CanvasElement): Bounds {
  const pts = absolutePoints(el);
  if (pts.length === 0) return elementBounds(el);

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = el.strokeWidth / 2;

  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
}

/** Bounds appropriate to the element's kind. */
export const hitBounds = (el: CanvasElement): Bounds =>
  el.points && el.points.length > 0 ? pointsBounds(el) : elementBounds(el);

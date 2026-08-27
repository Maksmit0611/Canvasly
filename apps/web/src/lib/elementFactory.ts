import type { CanvasElement, ElementType, Point } from '@canvas/shared';

/**
 * A v4 UUID. crypto.randomUUID is unavailable on http origins in some browsers,
 * so fall back to getRandomValues rather than to a weaker source.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ElementDefaults {
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  strokeStyle: CanvasElement['strokeStyle'];
  fillStyle: CanvasElement['fillStyle'];
  roughness: CanvasElement['roughness'];
  opacity: number;
  fontFamily: string;
  fontSize: number;
}

export const DEFAULTS: ElementDefaults = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  strokeWidth: 2,
  strokeStyle: 'solid',
  fillStyle: 'solid',
  roughness: 'artist',
  opacity: 1,
  fontFamily: 'Inter',
  fontSize: 20,
};

export function createElement(
  type: ElementType,
  origin: Point,
  overrides: Partial<CanvasElement> = {},
  defaults: ElementDefaults = DEFAULTS,
): CanvasElement {
  const usesPoints = type === 'line' || type === 'arrow' || type === 'freedraw';

  return {
    id: newId(),
    type,
    x: origin.x,
    y: origin.y,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: defaults.strokeColor,
    backgroundColor: defaults.backgroundColor,
    strokeWidth: defaults.strokeWidth,
    strokeStyle: defaults.strokeStyle,
    fillStyle: defaults.fillStyle,
    roughness: defaults.roughness,
    opacity: defaults.opacity,
    cornerRadius: 0,
    points: usesPoints ? [{ x: 0, y: 0 }] : undefined,
    startArrowhead: 'none',
    endArrowhead: type === 'arrow' ? 'arrow' : 'none',
    fontFamily: defaults.fontFamily,
    fontSize: defaults.fontSize,
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: 1.4,
    zIndex: 0,
    locked: false,
    isDeleted: false,
    version: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** A stable pseudo-random seed per element, so roughjs output doesn't jitter. */
export function seedFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

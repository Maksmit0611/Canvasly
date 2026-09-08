import type { CanvasElement } from '@canvas/shared';

export interface ShapeProps {
  element: CanvasElement;
  zoom: number;
  isSelected: boolean;
  onPointerDown?: (e: import('konva/lib/Node').KonvaEventObject<PointerEvent>) => void;
  onDoubleClick?: (e: import('konva/lib/Node').KonvaEventObject<MouseEvent>) => void;
}

/** Props every shape shares: opacity, rotation, and the interaction handlers. */
export const commonNodeProps = (p: ShapeProps) => ({
  id: p.element.id,
  x: p.element.x,
  y: p.element.y,
  rotation: (p.element.angle * 180) / Math.PI,
  opacity: p.element.opacity,
  listening: !p.element.locked,
  onPointerdown: p.onPointerDown,
  onDblclick: p.onDoubleClick,
  onDbltap: p.onDoubleClick,
});

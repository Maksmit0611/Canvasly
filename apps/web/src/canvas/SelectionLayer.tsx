import { Circle, Group, Line, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement } from '@canvas/shared';
import type { Bounds } from '@/lib/geometry';
import { hitBounds, unionBounds } from '@/lib/geometry';
import { HANDLE_SIZE_PX, OUTLINE_WIDTH_PX, ROTATION_HANDLE_OFFSET_PX, invariant } from '@/lib/zoom';

export type HandleId =
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

/** Handle positions in canvas space for a given selection box. */
export function handlesFor(b: Bounds, zoom: number): Handle[] {
  const { x, y, width: w, height: h } = b;
  const offset = invariant(ROTATION_HANDLE_OFFSET_PX, zoom);

  return [
    { id: 'nw', x, y },
    { id: 'n', x: x + w / 2, y },
    { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: y + h / 2 },
    { id: 'se', x: x + w, y: y + h },
    { id: 's', x: x + w / 2, y: y + h },
    { id: 'sw', x, y: y + h },
    { id: 'w', x, y: y + h / 2 },
    { id: 'rotate', x: x + w / 2, y: y - offset },
  ];
}

export const CURSOR_FOR_HANDLE: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  rotate: 'grab',
};

interface Props {
  selected: CanvasElement[];
  zoom: number;
  marquee: Bounds | null;
  accent?: string;
  onHandlePointerDown?: (id: HandleId, e: KonvaEventObject<PointerEvent>) => void;
}

/**
 * Selection chrome. Every dimension here is divided by zoom, so outlines and
 * handles keep a constant physical size however far the canvas is zoomed.
 */
export default function SelectionLayer({
  selected,
  zoom,
  marquee,
  accent = '#5b5bd6',
  onHandlePointerDown,
}: Props) {
  const outlineWidth = invariant(OUTLINE_WIDTH_PX, zoom);
  const handleSize = invariant(HANDLE_SIZE_PX, zoom);
  const dash = [invariant(4, zoom), invariant(4, zoom)];

  const boxes = selected.map(hitBounds);
  const bounds = unionBounds(boxes);

  return (
    <>
      {/* Per-element outlines, shown only when several things are selected. */}
      {selected.length > 1 &&
        boxes.map((b, i) => (
          <Rect
            key={selected[i]!.id}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            stroke={accent}
            strokeWidth={outlineWidth}
            dash={dash}
            opacity={0.5}
            strokeScaleEnabled={false}
            listening={false}
          />
        ))}

      {bounds && (
        <Group>
          <Rect
            x={bounds.x}
            y={bounds.y}
            width={bounds.width}
            height={bounds.height}
            stroke={accent}
            strokeWidth={outlineWidth}
            strokeScaleEnabled={false}
            listening={false}
          />

          {/* Stem connecting the rotation handle to the box. */}
          <Line
            points={[
              bounds.x + bounds.width / 2,
              bounds.y,
              bounds.x + bounds.width / 2,
              bounds.y - invariant(ROTATION_HANDLE_OFFSET_PX, zoom),
            ]}
            stroke={accent}
            strokeWidth={outlineWidth}
            strokeScaleEnabled={false}
            listening={false}
          />

          {handlesFor(bounds, zoom).map((handle) =>
            handle.id === 'rotate' ? (
              <Circle
                key={handle.id}
                x={handle.x}
                y={handle.y}
                radius={handleSize / 2}
                fill="#ffffff"
                stroke={accent}
                strokeWidth={outlineWidth}
                strokeScaleEnabled={false}
                onPointerdown={(e: KonvaEventObject<PointerEvent>) => onHandlePointerDown?.(handle.id, e)}
              />
            ) : (
              <Rect
                key={handle.id}
                x={handle.x - handleSize / 2}
                y={handle.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke={accent}
                strokeWidth={outlineWidth}
                strokeScaleEnabled={false}
                onPointerdown={(e: KonvaEventObject<PointerEvent>) => onHandlePointerDown?.(handle.id, e)}
              />
            ),
          )}
        </Group>
      )}

      {marquee && (
        <Rect
          x={marquee.x}
          y={marquee.y}
          width={marquee.width}
          height={marquee.height}
          fill={`${accent}18`}
          stroke={accent}
          strokeWidth={outlineWidth}
          dash={dash}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </>
  );
}

import { Circle, Group, Line } from 'react-konva';
import type { Arrowhead, CanvasElement, Point } from '@canvas/shared';
import { dashArray, invariant, renderedStrokeWidth } from '@/lib/zoom';
import { edgeAttachmentPoint } from '@/lib/geometry';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

interface Props extends ShapeProps {
  /** Needed to resolve bound endpoints onto their target shapes. */
  elementsById: Record<string, CanvasElement>;
}

/** Arrowhead length in screen pixels, converted to canvas units when drawn. */
const HEAD_PX = 14;

/**
 * Endpoints for the arrow in element-local space, with bound ends snapped onto
 * the edge of whatever shape they attach to.
 */
export function resolveArrowPoints(
  element: CanvasElement,
  elementsById: Record<string, CanvasElement>,
): Point[] {
  const local = element.points ?? [];
  if (local.length < 2) return local as Point[];

  const absolute = local.map((p) => ({ x: element.x + p.x, y: element.y + p.y }));
  const first = absolute[0]!;
  const last = absolute[absolute.length - 1]!;

  const start = element.boundStartId ? elementsById[element.boundStartId] : undefined;
  const end = element.boundEndId ? elementsById[element.boundEndId] : undefined;

  // Aim each bound end at its neighbouring point, so the attachment tracks the
  // shape as it moves.
  if (start && !start.isDeleted) {
    absolute[0] = edgeAttachmentPoint(start, absolute[1] ?? last);
  }
  if (end && !end.isDeleted) {
    absolute[absolute.length - 1] = edgeAttachmentPoint(end, absolute[absolute.length - 2] ?? first);
  }

  return absolute.map((p) => ({ x: p.x - element.x, y: p.y - element.y }));
}

/** Two barbs for the arrowhead, sized in canvas units so it holds shape at any zoom. */
function headPoints(tip: Point, from: Point, size: number): number[] {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = Math.PI / 7;
  return [
    tip.x - size * Math.cos(angle - spread),
    tip.y - size * Math.sin(angle - spread),
    tip.x,
    tip.y,
    tip.x - size * Math.cos(angle + spread),
    tip.y - size * Math.sin(angle + spread),
  ];
}

function Head({
  kind, tip, from, size, color, strokeWidth,
}: {
  kind: Arrowhead;
  tip: Point;
  from: Point;
  size: number;
  color: string;
  strokeWidth: number;
}) {
  if (kind === 'none') return null;

  if (kind === 'dot') {
    return <Circle x={tip.x} y={tip.y} radius={size / 3} fill={color} listening={false} />;
  }

  return (
    <Line
      points={headPoints(tip, from, size)}
      stroke={color}
      strokeWidth={strokeWidth}
      closed={kind === 'triangle'}
      fill={kind === 'triangle' ? color : undefined}
      lineCap="round"
      lineJoin="round"
      strokeScaleEnabled={false}
      listening={false}
    />
  );
}

export default function ArrowShape({ elementsById, ...props }: Props) {
  const { element, zoom } = props;
  const points = resolveArrowPoints(element, elementsById);
  if (points.length < 2) return null;

  const flat = points.flatMap((p) => [p.x, p.y]);
  const strokeWidth = renderedStrokeWidth(element.strokeWidth, zoom);
  // Convert the screen-pixel head size into canvas units for this zoom level.
  const headSize = invariant(HEAD_PX, zoom) + element.strokeWidth;

  const tipEnd = points[points.length - 1]!;
  const beforeEnd = points[points.length - 2]!;
  const tipStart = points[0]!;
  const afterStart = points[1]!;

  return (
    <Group {...commonNodeProps(props)}>
      <Line
        points={flat}
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth * 3, 12)}
        strokeScaleEnabled={false}
        lineCap="round"
      />
      <Line
        points={flat}
        stroke={element.strokeColor}
        strokeWidth={strokeWidth}
        dash={dashArray(element.strokeStyle, strokeWidth)}
        lineCap="round"
        lineJoin="round"
        strokeScaleEnabled={false}
        listening={false}
      />
      <Head
        kind={element.endArrowhead}
        tip={tipEnd}
        from={beforeEnd}
        size={headSize}
        color={element.strokeColor}
        strokeWidth={strokeWidth}
      />
      <Head
        kind={element.startArrowhead}
        tip={tipStart}
        from={afterStart}
        size={headSize}
        color={element.strokeColor}
        strokeWidth={strokeWidth}
      />
    </Group>
  );
}

import { Group, Line } from 'react-konva';
import { dashArray, renderedStrokeWidth } from '@/lib/zoom';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

/** A polyline. Points are stored relative to the element's (x, y). */
export default function LineShape(props: ShapeProps) {
  const { element, zoom } = props;
  const flat = (element.points ?? []).flatMap((p) => [p.x, p.y]);
  if (flat.length < 4) return null;

  const strokeWidth = renderedStrokeWidth(element.strokeWidth, zoom);

  return (
    <Group {...commonNodeProps(props)}>
      {/* Wide invisible stroke gives the line a forgiving hit target. */}
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
    </Group>
  );
}

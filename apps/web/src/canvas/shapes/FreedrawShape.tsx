import { useMemo } from 'react';
import { Group, Path } from 'react-konva';
import getStroke from 'perfect-freehand';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

/** Convert perfect-freehand's outline polygon into SVG path data. */
function toPathData(outline: number[][]): string {
  if (outline.length === 0) return '';

  const [first, ...rest] = outline;
  let d = `M ${first![0]!.toFixed(2)} ${first![1]!.toFixed(2)}`;
  for (const point of rest) d += ` L ${point[0]!.toFixed(2)} ${point[1]!.toFixed(2)}`;
  return `${d} Z`;
}

/**
 * Freehand strokes are rendered as a filled outline rather than a stroked
 * polyline — that is what gives them a natural taper instead of a uniform tube.
 * The outline is in canvas units, so unlike other shapes it does scale with
 * zoom, which is correct: a thick brush stroke is a property of the drawing.
 */
export default function FreedrawShape(props: ShapeProps) {
  const { element } = props;

  const data = useMemo(() => {
    const points = (element.points ?? []).map((p) => [p.x, p.y]);
    if (points.length === 0) return '';

    const outline = getStroke(points, {
      size: element.strokeWidth * 2.5,
      thinning: 0.55,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: true,
      last: true,
    });

    return toPathData(outline);
  }, [element.points, element.strokeWidth]);

  if (!data) return null;

  return (
    <Group {...commonNodeProps(props)}>
      <Path data={data} fill={element.strokeColor} lineCap="round" lineJoin="round" />
    </Group>
  );
}

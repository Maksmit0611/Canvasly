import { useMemo } from 'react';
import { Group, Path, Rect } from 'react-konva';
import { dashArray, renderedStrokeWidth } from '@/lib/zoom';
import { normalizeBounds } from '@/lib/geometry';
import { commonNodeProps, type ShapeProps } from './ShapeProps';
import { roughDiamond, roughEllipse, roughRectangle, type RoughPaths } from './roughPath';

type Kind = 'rectangle' | 'ellipse' | 'diamond';

interface Props extends ShapeProps {
  kind: Kind;
}

/**
 * Rectangle, ellipse and diamond share everything but their path generator.
 *
 * `strokeScaleEnabled={false}` is what makes a 2px stroke render as 2 screen
 * pixels at every zoom level — without it Konva scales stroke width with the
 * shape, so lines go fat when zoomed in and vanish when zoomed out.
 */
export default function RoughShape({ kind, ...props }: Props) {
  const { element, zoom } = props;
  const { width, height } = normalizeBounds({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  });

  // Regenerating roughjs output every frame both costs time and makes the
  // sketch lines crawl, so memoise on the inputs that actually change it.
  const paths: RoughPaths = useMemo(() => {
    if (width <= 0 || height <= 0) return { stroke: [], fill: [], fillIsSolid: false };
    switch (kind) {
      case 'ellipse':
        return roughEllipse(element, width, height);
      case 'diamond':
        return roughDiamond(element, width, height);
      case 'rectangle':
      default:
        return roughRectangle(element, width, height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kind,
    element.id,
    width,
    height,
    element.roughness,
    element.fillStyle,
    element.backgroundColor,
    element.strokeWidth,
  ]);

  const strokeWidth = renderedStrokeWidth(element.strokeWidth, zoom);
  const dash = dashArray(element.strokeStyle, strokeWidth);
  const hasFill = element.backgroundColor !== 'transparent' && element.fillStyle !== 'none';

  return (
    <Group {...commonNodeProps(props)}>
      {/* Transparent hit area so clicks inside an unfilled shape still register. */}
      <Rect width={width} height={height} fill="transparent" />

      {hasFill &&
        paths.fill.map((d, i) => (
          <Path
            key={`f${i}`}
            data={d}
            fill={paths.fillIsSolid ? element.backgroundColor : undefined}
            stroke={paths.fillIsSolid ? undefined : element.backgroundColor}
            strokeWidth={paths.fillIsSolid ? undefined : renderedStrokeWidth(element.strokeWidth / 2, zoom)}
            strokeScaleEnabled={false}
            listening={false}
          />
        ))}

      {paths.stroke.map((d, i) => (
        <Path
          key={`s${i}`}
          data={d}
          stroke={element.strokeColor}
          strokeWidth={strokeWidth}
          dash={dash}
          lineCap="round"
          lineJoin="round"
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
    </Group>
  );
}

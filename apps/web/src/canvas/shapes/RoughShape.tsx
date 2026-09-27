import { useMemo } from 'react';
import { Group, Line, Path, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/store/canvasStore';
import { normalizeBounds } from '@/lib/geometry';
import { dashArray, renderedStrokeWidth } from '@/lib/zoom';
import { measureText } from '../measureText';
import { layoutRichText, type RichTextNode } from '../richTextLayout';
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
  const isEditingLabel = useCanvasStore((s) => s.editingTextId === element.id);
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
  const inset = Math.min(12, Math.max(4, Math.min(width, height) * 0.08));
  const label = useMemo(() => {
    const doc = element.richText as RichTextNode | undefined;
    const source: RichTextNode | undefined = doc ?? (element.plainText
      ? {
          type: 'doc',
          content: element.plainText.split('\n').map((line) => ({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : [],
          })),
        }
      : undefined);

    return layoutRichText(source, {
      width: Math.max(1, width - inset * 2),
      fontSize: element.fontSize,
      fontFamily: element.fontFamily,
      lineHeight: element.lineHeight,
      align: element.textAlign,
      color: element.strokeColor,
      measureText,
    });
  }, [
    element.richText,
    element.plainText,
    element.fontSize,
    element.fontFamily,
    element.lineHeight,
    element.textAlign,
    element.strokeColor,
    width,
    inset,
  ]);
  const labelY = inset + (element.verticalAlign === 'middle'
    ? Math.max(0, (height - inset * 2 - label.height) / 2)
    : element.verticalAlign === 'bottom'
      ? Math.max(0, height - inset * 2 - label.height)
      : 0);

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

      {!isEditingLabel && label.lines.flatMap((line) =>
        line.runs.map((run, i) => {
          const y = labelY + run.y;
          const baseline = y + line.height;
          const key = `${line.y}-${i}`;
          const color = run.color ?? element.strokeColor;

          return (
            <Group key={key} listening={false}>
              <Text
                x={inset + run.x}
                y={y}
                text={run.text}
                fontSize={run.fontSize}
                fontFamily={run.fontFamily ?? element.fontFamily}
                fontStyle={
                  run.bold && run.italic
                    ? 'italic 700'
                    : run.bold
                      ? '700'
                      : run.italic
                        ? 'italic'
                        : 'normal'
                }
                fill={color}
              />
              {run.underline && (
                <Line
                  points={[inset + run.x, baseline - run.fontSize * 0.12, inset + run.x + run.width, baseline - run.fontSize * 0.12]}
                  stroke={color}
                  strokeWidth={Math.max(1, run.fontSize / 16)}
                  strokeScaleEnabled={false}
                />
              )}
              {run.strike && (
                <Line
                  points={[inset + run.x, y + run.fontSize * 0.55, inset + run.x + run.width, y + run.fontSize * 0.55]}
                  stroke={color}
                  strokeWidth={Math.max(1, run.fontSize / 16)}
                  strokeScaleEnabled={false}
                />
              )}
            </Group>
          );
        }),
      )}
    </Group>
  );
}

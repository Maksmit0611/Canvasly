import { useMemo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { layoutRichText, type RichTextNode } from '../richTextLayout';
import { measureText } from '../measureText';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

/**
 * Renders rich text on the canvas when it is not being edited.
 *
 * Konva's `<Text>` carries a single style per node, so a paragraph mixing bold,
 * colour and sizes is decomposed into one node per styled run, positioned by
 * `layoutRichText`. Underline and strike-through are drawn as separate lines
 * because Konva has no text-decoration support.
 */
export default function TextShape(props: ShapeProps) {
  const { element } = props;

  const layout = useMemo(() => {
    const doc = element.richText as RichTextNode | undefined;

    // Before any rich content exists, fall back to the plain-text field.
    const source: RichTextNode | undefined =
      doc ??
      (element.plainText
        ? {
            type: 'doc',
            content: element.plainText.split('\n').map((line) => ({
              type: 'paragraph',
              content: line ? [{ type: 'text', text: line }] : [],
            })),
          }
        : undefined);

    return layoutRichText(source, {
      width: element.width > 0 ? element.width : 200,
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
    element.width,
    element.fontSize,
    element.fontFamily,
    element.lineHeight,
    element.textAlign,
    element.strokeColor,
  ]);

  return (
    <Group {...commonNodeProps(props)}>
      {/*
        Hit area. It must cover the box the user drew, not just the laid-out
        content — otherwise an empty or short text element is only clickable
        across its first line and double-click misses it entirely.
      */}
      <Rect
        width={element.width > 0 ? element.width : 200}
        height={Math.max(layout.height, element.height, element.fontSize)}
        fill="transparent"
      />

      {layout.lines.flatMap((line) =>
        line.runs.map((run, i) => {
          const baseline = run.y + line.height;
          const key = `${line.y}-${i}`;

          return (
            <Group key={key} listening={false}>
              <Text
                x={run.x}
                y={run.y}
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
                fill={run.color ?? element.strokeColor}
              />

              {run.underline && (
                <Line
                  points={[run.x, baseline - run.fontSize * 0.12, run.x + run.width, baseline - run.fontSize * 0.12]}
                  stroke={run.color ?? element.strokeColor}
                  strokeWidth={Math.max(1, run.fontSize / 16)}
                  strokeScaleEnabled={false}
                />
              )}

              {run.strike && (
                <Line
                  points={[run.x, run.y + run.fontSize * 0.55, run.x + run.width, run.y + run.fontSize * 0.55]}
                  stroke={run.color ?? element.strokeColor}
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

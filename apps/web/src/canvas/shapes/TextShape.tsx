import { Group, Text } from 'react-konva';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

/**
 * Plain-text rendering. Phase 7 replaces this with a styled-run layout driven
 * by the TipTap document; until then `plainText` carries the content.
 */
export default function TextShape(props: ShapeProps) {
  const { element } = props;
  const text = element.plainText ?? '';

  return (
    <Group {...commonNodeProps(props)}>
      <Text
        text={text}
        width={element.width > 0 ? element.width : undefined}
        fontSize={element.fontSize}
        fontFamily={element.fontFamily}
        fill={element.strokeColor}
        align={element.textAlign}
        verticalAlign={element.verticalAlign}
        lineHeight={element.lineHeight}
        wrap="word"
        listening
      />
    </Group>
  );
}

import { Group, Image as KonvaImage, Rect, Text } from 'react-konva';
import { usePdfPage } from '@/pdf/usePdfPage';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

/**
 * A rendered PDF page. The raster resolution follows the zoom tier, so the page
 * re-renders sharply rather than pixelating when zoomed in.
 */
export default function PdfShape(props: ShapeProps) {
  const { element, zoom } = props;
  const { canvas, isLoading, error } = usePdfPage(
    element.assetId ?? (element.assetData ? element.id : undefined),
    element.pdfPage ?? 1,
    zoom,
    element.assetData,
  );

  return (
    <Group {...commonNodeProps(props)}>
      <Rect
        width={element.width}
        height={element.height}
        fill="#ffffff"
        stroke="#dedede"
        strokeWidth={1}
        strokeScaleEnabled={false}
      />

      {canvas && (
        <KonvaImage image={canvas} width={element.width} height={element.height} listening={false} />
      )}

      {(isLoading || error) && (
        <Text
          x={12}
          y={12}
          text={error ?? 'Rendering page…'}
          fontSize={12}
          fontFamily="Inter"
          fill={error ? '#d64545' : '#71717a'}
          listening={false}
        />
      )}
    </Group>
  );
}

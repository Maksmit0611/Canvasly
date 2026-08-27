import { memo } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement } from '@canvas/shared';
import RoughShape from './shapes/RoughShape';
import LineShape from './shapes/LineShape';
import ArrowShape from './shapes/ArrowShape';
import FreedrawShape from './shapes/FreedrawShape';
import TextShape from './shapes/TextShape';

interface Props {
  element: CanvasElement;
  zoom: number;
  isSelected: boolean;
  elementsById: Record<string, CanvasElement>;
  onPointerDown?: (e: KonvaEventObject<PointerEvent>) => void;
  onDoubleClick?: (e: KonvaEventObject<MouseEvent>) => void;
}

function ElementRenderer({ element, elementsById, ...rest }: Props) {
  if (element.isDeleted) return null;

  const shared = { element, ...rest };

  switch (element.type) {
    case 'rectangle':
    case 'frame':
      return <RoughShape kind="rectangle" {...shared} />;
    case 'ellipse':
      return <RoughShape kind="ellipse" {...shared} />;
    case 'diamond':
      return <RoughShape kind="diamond" {...shared} />;
    case 'line':
      return <LineShape {...shared} />;
    case 'arrow':
      return <ArrowShape elementsById={elementsById} {...shared} />;
    case 'freedraw':
      return <FreedrawShape {...shared} />;
    case 'text':
      return <TextShape {...shared} />;
    // image and pdf arrive in Phase 8.
    default:
      return null;
  }
}

export default memo(ElementRenderer);

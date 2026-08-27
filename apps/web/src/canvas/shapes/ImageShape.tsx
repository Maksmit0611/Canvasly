import { useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Rect } from 'react-konva';
import { fetchAssetObjectUrl } from '@/lib/assets';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

/** Cache decoded images so panning does not re-fetch them. */
const imageCache = new Map<string, HTMLImageElement>();

export default function ImageShape(props: ShapeProps) {
  const { element } = props;
  const [image, setImage] = useState<HTMLImageElement | null>(
    element.assetId ? (imageCache.get(element.assetId) ?? null) : null,
  );

  useEffect(() => {
    const assetId = element.assetId;
    if (!assetId) return;

    const cached = imageCache.get(assetId);
    if (cached) {
      setImage(cached);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    void fetchAssetObjectUrl(assetId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        const img = new window.Image();
        img.onload = () => {
          if (cancelled) return;
          imageCache.set(assetId, img);
          setImage(img);
        };
        img.src = url;
      })
      .catch(() => {
        // Leaves the placeholder in place; nothing else to do here.
      });

    return () => {
      cancelled = true;
      // The decoded image stays in the cache, so the blob can be released.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [element.assetId]);

  return (
    <Group {...commonNodeProps(props)}>
      {image ? (
        <KonvaImage image={image} width={element.width} height={element.height} />
      ) : (
        // Placeholder keeps the layout stable while the bytes arrive.
        <Rect
          width={element.width}
          height={element.height}
          fill="var(--surface-sunken)"
          stroke="#c4c4c7"
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
      )}
    </Group>
  );
}

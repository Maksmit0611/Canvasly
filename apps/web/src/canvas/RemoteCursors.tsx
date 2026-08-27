import { Group, Label, Line, Tag, Text } from 'react-konva';
import type { RemotePresence } from '@/collab/useYjsRoom';
import { invariant } from '@/lib/zoom';

interface Props {
  peers: RemotePresence[];
  zoom: number;
}

/**
 * Remote pointers with a name label. Sized with invariant() so a cursor stays
 * the same physical size however far the canvas is zoomed.
 */
export default function RemoteCursors({ peers, zoom }: Props) {
  const size = invariant(14, zoom);
  const fontSize = invariant(11, zoom);
  const padding = invariant(4, zoom);

  return (
    <>
      {peers.map((peer) =>
        peer.cursor ? (
          <Group key={peer.clientId} x={peer.cursor.x} y={peer.cursor.y} listening={false}>
            <Line
              points={[0, 0, 0, size, size * 0.28, size * 0.75, size * 0.62, size * 1.05, size * 0.72, size * 0.62]}
              closed
              fill={peer.color}
              stroke="#ffffff"
              strokeWidth={invariant(1, zoom)}
              strokeScaleEnabled={false}
            />
            <Label x={size * 0.8} y={size * 0.9}>
              <Tag fill={peer.color} cornerRadius={invariant(3, zoom)} />
              <Text
                text={peer.name}
                fontSize={fontSize}
                fontFamily="Inter"
                fill="#ffffff"
                padding={padding}
              />
            </Label>
          </Group>
        ) : null,
      )}
    </>
  );
}

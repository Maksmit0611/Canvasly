import { Circle, Group, Line, Rect } from 'react-konva';
import { commonNodeProps, type ShapeProps } from './ShapeProps';

/** A compact, blocky classroom/team figure that remains one selectable object. */
export default function PersonShape(props: ShapeProps) {
  const { element } = props;
  const gender = element.characterGender ?? 'male';
  const bodyColor = element.backgroundColor === 'transparent'
    ? gender === 'female' ? '#c96852' : '#3d7a70'
    : element.backgroundColor;
  const hairColor = gender === 'female' ? '#674633' : '#3c302a';

  return (
    <Group
      {...commonNodeProps(props)}
      scaleX={element.width / 120}
      scaleY={element.height / 160}
    >
      <Rect width={120} height={160} fill="transparent" />

      {/* Back hair, arms and legs */}
      {gender === 'female' && (
        <Rect x={38} y={20} width={44} height={42} cornerRadius={15} fill={hairColor} />
      )}
      <Rect x={22} y={68} width={76} height={19} cornerRadius={8} fill={bodyColor} stroke={element.strokeColor} strokeWidth={2} />
      <Circle x={24} y={78} radius={8} fill="#f1c6a4" stroke={element.strokeColor} strokeWidth={1.5} />
      <Circle x={96} y={78} radius={8} fill="#f1c6a4" stroke={element.strokeColor} strokeWidth={1.5} />
      <Rect x={40} y={105} width={17} height={36} cornerRadius={5} fill={bodyColor} stroke={element.strokeColor} strokeWidth={2} />
      <Rect x={63} y={105} width={17} height={36} cornerRadius={5} fill={bodyColor} stroke={element.strokeColor} strokeWidth={2} />
      <Rect x={35} y={136} width={24} height={10} cornerRadius={4} fill="#34404a" />
      <Rect x={61} y={136} width={24} height={10} cornerRadius={4} fill="#34404a" />

      {/* Neck and torso */}
      <Rect x={53} y={51} width={14} height={15} fill="#f1c6a4" />
      <Rect x={35} y={62} width={50} height={47} cornerRadius={9} fill={bodyColor} stroke={element.strokeColor} strokeWidth={2} />
      <Line points={[60, 70, 60, 101]} stroke="#ffffff" strokeWidth={2} opacity={0.6} listening={false} />
      <Circle x={60} y={78} radius={2} fill="#ffffff" listening={false} />
      <Circle x={60} y={89} radius={2} fill="#ffffff" listening={false} />

      {/* Face and simple hair silhouette */}
      <Circle x={60} y={35} radius={19} fill="#f1c6a4" stroke={element.strokeColor} strokeWidth={2} />
      {gender === 'female' ? (
        <>
          <Rect x={42} y={19} width={36} height={9} cornerRadius={5} fill={hairColor} />
          <Circle x={44} y={36} radius={6} fill={hairColor} />
          <Circle x={76} y={36} radius={6} fill={hairColor} />
        </>
      ) : (
        <Rect x={43} y={17} width={34} height={10} cornerRadius={5} fill={hairColor} />
      )}
      <Circle x={53} y={35} radius={1.7} fill="#332b28" />
      <Circle x={67} y={35} radius={1.7} fill="#332b28" />
      <Line points={[55, 44, 60, 46, 65, 44]} stroke="#9b5f50" strokeWidth={1.5} lineCap="round" listening={false} />
      <Circle x={60} y={12} radius={5} fill="#e3ad3c" stroke={element.strokeColor} strokeWidth={1.5} />
    </Group>
  );
}

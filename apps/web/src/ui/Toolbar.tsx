import {
  ArrowRight, Circle, Diamond, Hand, Minus, MousePointer2, Pencil, Square, Type,
} from 'lucide-react';
import clsx from 'clsx';
import { useCanvasStore, type Tool } from '@/store/canvasStore';

const TOOLS: { tool: Tool; icon: typeof Square; label: string; shortcut: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'R' },
  { tool: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'O' },
  { tool: 'diamond', icon: Diamond, label: 'Diamond', shortcut: 'D' },
  { tool: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
  { tool: 'arrow', icon: ArrowRight, label: 'Arrow', shortcut: 'A' },
  { tool: 'freedraw', icon: Pencil, label: 'Draw', shortcut: 'P' },
  { tool: 'text', icon: Type, label: 'Text', shortcut: 'T' },
  { tool: 'pan', icon: Hand, label: 'Pan', shortcut: 'H' },
];

export default function Toolbar() {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const setTool = useCanvasStore((s) => s.setTool);

  return (
    <div
      className="flex w-12 shrink-0 flex-col items-center gap-1 py-2"
      style={{ borderRight: '1px solid var(--border)', background: 'var(--surface-raised)' }}
      role="toolbar"
      aria-label="Drawing tools"
    >
      {TOOLS.map(({ tool, icon: Icon, label, shortcut }) => (
        <button
          key={tool}
          type="button"
          onClick={() => setTool(tool)}
          title={`${label} (${shortcut})`}
          aria-label={label}
          aria-pressed={activeTool === tool}
          data-testid={`tool-${tool}`}
          className={clsx('flex h-9 w-9 items-center justify-center rounded-lg')}
          style={
            activeTool === tool
              ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
              : { color: 'var(--text-muted)' }
          }
        >
          <Icon size={17} />
        </button>
      ))}
    </div>
  );
}

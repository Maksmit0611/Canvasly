import { useState } from 'react';
import type { CanvasElement } from '@canvas/shared';
import { useCanvasStore } from '@/store/canvasStore';
import { isTransparent } from '@/lib/color';
import ColorPicker from './ColorPicker';

type PickerTarget = 'stroke' | 'fill' | null;

function SwatchButton({
  color, label, onClick, active,
}: {
  color: string;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className="h-7 w-7 rounded"
      style={{
        background: isTransparent(color)
          ? 'repeating-conic-gradient(#d0d0d0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'
          : color,
        border: active ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
      }}
    />
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

export default function PropertiesPanel() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const elements = useCanvasStore((s) => s.elements);
  const [picker, setPicker] = useState<PickerTarget>(null);

  const selected = selectedIds
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => Boolean(el) && !el!.isDeleted);

  // The panel appears only when something is selected.
  if (selected.length === 0) return null;

  const first = selected[0]!;
  const update = (patch: Partial<CanvasElement>, label: string): void => {
    useCanvasStore.getState().updateElements(selectedIds, patch, { label });
  };

  return (
    <aside
      className="w-60 shrink-0 overflow-y-auto p-3"
      style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface-raised)' }}
      aria-label="Element properties"
      data-testid="properties-panel"
    >
      <Row label="Stroke">
        <SwatchButton
          color={first.strokeColor}
          label="Stroke colour"
          active={picker === 'stroke'}
          onClick={() => setPicker(picker === 'stroke' ? null : 'stroke')}
        />
      </Row>

      {picker === 'stroke' && (
        <ColorPicker
          label="Stroke"
          value={first.strokeColor}
          // Stroke is usually text or an outline over the fill behind it.
          contrastAgainst={isTransparent(first.backgroundColor) ? '#ffffff' : first.backgroundColor}
          onChange={(c) => update({ strokeColor: c }, 'Change stroke colour')}
          onClose={() => setPicker(null)}
        />
      )}

      <Row label="Fill">
        <SwatchButton
          color={first.backgroundColor}
          label="Fill colour"
          active={picker === 'fill'}
          onClick={() => setPicker(picker === 'fill' ? null : 'fill')}
        />
      </Row>

      {picker === 'fill' && (
        <ColorPicker
          label="Fill"
          value={first.backgroundColor}
          onChange={(c) => update({ backgroundColor: c }, 'Change fill colour')}
          onClose={() => setPicker(null)}
        />
      )}

      <Row label="Stroke width">
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.5}
          value={first.strokeWidth}
          onChange={(e) => update({ strokeWidth: Number(e.target.value) }, 'Change stroke width')}
          className="w-28"
          aria-label="Stroke width"
        />
      </Row>

      <Row label="Style">
        <select
          value={first.strokeStyle}
          onChange={(e) =>
            update({ strokeStyle: e.target.value as CanvasElement['strokeStyle'] }, 'Change stroke style')
          }
          className="h-7 rounded px-1 text-xs"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          aria-label="Stroke style"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </Row>

      <Row label="Fill style">
        <select
          value={first.fillStyle}
          onChange={(e) =>
            update({ fillStyle: e.target.value as CanvasElement['fillStyle'] }, 'Change fill style')
          }
          className="h-7 rounded px-1 text-xs"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          aria-label="Fill style"
        >
          <option value="solid">Solid</option>
          <option value="hachure">Hachure</option>
          <option value="cross-hatch">Cross-hatch</option>
          <option value="none">None</option>
        </select>
      </Row>

      <Row label="Sketchiness">
        <select
          value={first.roughness}
          onChange={(e) =>
            update({ roughness: e.target.value as CanvasElement['roughness'] }, 'Change roughness')
          }
          className="h-7 rounded px-1 text-xs"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          aria-label="Sketchiness"
        >
          <option value="architect">Architect</option>
          <option value="artist">Artist</option>
          <option value="cartoonist">Cartoonist</option>
        </select>
      </Row>

      <Row label="Opacity">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(first.opacity * 100)}
          onChange={(e) => update({ opacity: Number(e.target.value) / 100 }, 'Change opacity')}
          className="w-28"
          aria-label="Opacity"
        />
      </Row>
    </aside>
  );
}

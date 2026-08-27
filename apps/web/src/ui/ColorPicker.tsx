import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Pipette, Trash2 } from 'lucide-react';
import {
  HUE_PALETTE, NEUTRAL_RAMP, TRANSPARENT, contrastRatio, deletePalette,
  fromHsl, getRecentColors, getSavedPalettes, hasEyeDropper, isTransparent,
  meetsAA, normalizeColor, pickWithEyeDropper, pushRecentColor, readableOn,
  savePalette, toHsl, toHslString, toRgbString, type SavedPalette,
} from '@/lib/color';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Compared against `value` for the contrast warning. */
  contrastAgainst?: string;
  allowTransparent?: boolean;
  label?: string;
  onClose?: () => void;
}

function Swatch({
  color, selected, onSelect, title,
}: {
  color: string;
  selected: boolean;
  onSelect: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={title ?? color}
      aria-label={title ?? color}
      aria-pressed={selected}
      className="relative h-5 w-5 rounded"
      style={{
        background: isTransparent(color)
          ? 'repeating-conic-gradient(#d0d0d0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'
          : color,
        border: '1px solid var(--border-strong)',
      }}
    >
      {selected && (
        <Check
          size={12}
          className="absolute inset-0 m-auto"
          style={{ color: readableOn(isTransparent(color) ? '#ffffff' : color) }}
        />
      )}
    </button>
  );
}

export default function ColorPicker({
  value, onChange, contrastAgainst, allowTransparent = true, label, onClose,
}: Props) {
  const hsl = toHsl(isTransparent(value) ? '#ffffff' : value);

  const [hexInput, setHexInput] = useState(value);
  const [recents, setRecents] = useState<string[]>(() => getRecentColors());
  const [palettes, setPalettes] = useState<SavedPalette[]>(() => getSavedPalettes());
  const [paletteName, setPaletteName] = useState('');
  const squareRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => setHexInput(value), [value]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setRecents(pushRecentColor(next));
    },
    [onChange],
  );

  /** Saturation/value square: x is saturation, y is lightness. */
  const applyFromSquare = useCallback(
    (clientX: number, clientY: number) => {
      const rect = squareRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = Math.min(Math.max(0, clientX - rect.left), rect.width) / rect.width;
      const y = Math.min(Math.max(0, clientY - rect.top), rect.height) / rect.height;

      onChange(fromHsl({ h: hsl.h, s: x * 100, l: (1 - y) * 100, a: hsl.a }));
    },
    [hsl.h, hsl.a, onChange],
  );

  useEffect(() => {
    const move = (e: PointerEvent): void => {
      if (draggingRef.current) applyFromSquare(e.clientX, e.clientY);
    };
    const up = (): void => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      // Record once per drag, not once per pointer move.
      setRecents(pushRecentColor(value));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [applyFromSquare, value]);

  const ratio = contrastAgainst ? contrastRatio(value, contrastAgainst) : null;
  const showContrastWarning = contrastAgainst ? !meetsAA(value, contrastAgainst) : false;

  return (
    <div
      className="w-64 rounded-lg p-3"
      style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
      data-testid="color-picker"
    >
      {label && (
        <div className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
      )}

      <div
        ref={squareRef}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          applyFromSquare(e.clientX, e.clientY);
        }}
        className="relative h-28 w-full cursor-crosshair rounded"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsl.h}, 100%, 50%))`,
        }}
        role="slider"
        aria-label="Saturation and lightness"
        aria-valuenow={Math.round(hsl.s)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        data-testid="sv-square"
      >
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${hsl.s}%`,
            top: `${100 - hsl.l}%`,
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
          }}
        />
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Hue</span>
        <input
          type="range"
          min={0}
          max={360}
          value={Math.round(hsl.h)}
          onChange={(e) => onChange(fromHsl({ ...hsl, h: Number(e.target.value) }))}
          onPointerUp={() => setRecents(pushRecentColor(value))}
          className="h-3 w-full cursor-pointer appearance-none rounded"
          style={{
            background:
              'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          }}
          data-testid="hue-slider"
        />
      </label>

      <label className="mt-2 block">
        <span className="sr-only">Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(hsl.a * 100)}
          onChange={(e) => onChange(fromHsl({ ...hsl, a: Number(e.target.value) / 100 }))}
          className="h-3 w-full cursor-pointer appearance-none rounded"
          style={{
            background: `linear-gradient(to right, transparent, ${isTransparent(value) ? '#000' : value}), repeating-conic-gradient(#d0d0d0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px`,
          }}
          data-testid="alpha-slider"
        />
      </label>

      <div className="mt-3 flex items-center gap-1">
        <input
          value={hexInput}
          onChange={(e) => {
            setHexInput(e.target.value);
            const parsed = normalizeColor(e.target.value);
            if (parsed) onChange(parsed);
          }}
          onBlur={() => {
            const parsed = normalizeColor(hexInput);
            if (parsed) commit(parsed);
            else setHexInput(value);
          }}
          className="h-7 min-w-0 flex-1 rounded px-2 font-mono text-xs"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          aria-label="Colour value"
          data-testid="hex-input"
          spellCheck={false}
        />

        {hasEyeDropper() && (
          <button
            type="button"
            onClick={() => {
              void pickWithEyeDropper().then((picked) => {
                if (picked) commit(picked);
              });
            }}
            title="Pick a colour from the screen"
            aria-label="Eyedropper"
            className="flex h-7 w-7 items-center justify-center rounded"
            style={{ border: '1px solid var(--border)' }}
            data-testid="eyedropper"
          >
            <Pipette size={14} />
          </button>
        )}
      </div>

      <div className="mt-1 flex gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span className="truncate">{isTransparent(value) ? 'transparent' : toRgbString(value)}</span>
        <span className="truncate">{isTransparent(value) ? '' : toHslString(value)}</span>
      </div>

      {showContrastWarning && ratio !== null && (
        <div
          className="mt-2 flex items-start gap-1 rounded px-2 py-1 text-[11px]"
          style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
          role="status"
          data-testid="contrast-warning"
        >
          <AlertTriangle size={12} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <span>
            Contrast {ratio.toFixed(1)}:1 — below the 4.5:1 needed for readable body text.
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        {allowTransparent && (
          <Swatch
            color={TRANSPARENT}
            title="Transparent"
            selected={isTransparent(value)}
            onSelect={() => onChange(TRANSPARENT)}
          />
        )}
        {NEUTRAL_RAMP.map((c) => (
          <Swatch key={c} color={c} selected={value === c} onSelect={() => commit(c)} />
        ))}
      </div>

      <div className="mt-1 flex flex-wrap gap-1">
        {HUE_PALETTE.flat().map((c) => (
          <Swatch key={c} color={c} selected={value === c} onSelect={() => commit(c)} />
        ))}
      </div>

      {recents.length > 0 && (
        <>
          <div className="mt-3 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Recent
          </div>
          <div className="mt-1 flex flex-wrap gap-1" data-testid="recent-colors">
            {recents.map((c) => (
              <Swatch key={c} color={c} selected={value === c} onSelect={() => commit(c)} />
            ))}
          </div>
        </>
      )}

      <div className="mt-3 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Palettes
      </div>

      {palettes.map((palette) => (
        <div key={palette.name} className="mt-1 flex items-center gap-1">
          <span className="w-16 truncate text-[11px]">{palette.name}</span>
          <div className="flex flex-1 flex-wrap gap-1">
            {palette.colors.map((c) => (
              <Swatch key={c} color={c} selected={value === c} onSelect={() => commit(c)} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPalettes(deletePalette(palette.name))}
            aria-label={`Delete palette ${palette.name}`}
            className="flex h-5 w-5 items-center justify-center rounded"
            style={{ color: 'var(--text-muted)' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      <div className="mt-2 flex gap-1">
        <input
          value={paletteName}
          onChange={(e) => setPaletteName(e.target.value)}
          placeholder="Palette name"
          className="h-6 min-w-0 flex-1 rounded px-2 text-[11px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          aria-label="New palette name"
        />
        <button
          type="button"
          disabled={!paletteName.trim() || recents.length === 0}
          onClick={() => {
            setPalettes(savePalette(paletteName.trim(), recents.slice(0, 8)));
            setPaletteName('');
          }}
          className="rounded px-2 text-[11px] disabled:opacity-30"
          style={{ border: '1px solid var(--border)' }}
        >
          Save
        </button>
      </div>

      {onClose && (
        <button type="button" onClick={onClose} className="mt-3 w-full rounded py-1 text-xs" style={{ border: '1px solid var(--border)' }}>
          Done
        </button>
      )}
    </div>
  );
}

import { colord, extend, type Colord } from 'colord';
import a11yPlugin from 'colord/plugins/a11y';
import namesPlugin from 'colord/plugins/names';

extend([a11yPlugin, namesPlugin]);

export const TRANSPARENT = 'transparent';

/** WCAG AA for normal-size body text. */
export const AA_CONTRAST = 4.5;

const RECENT_KEY = 'canvasly.recentColors';
const PALETTES_KEY = 'canvasly.savedPalettes';
const MAX_RECENT = 12;

/** A curated default palette: a neutral ramp plus ten hues at three lightnesses. */
export const NEUTRAL_RAMP = [
  '#ffffff', '#f4f4f5', '#dedede', '#c4c4c7',
  '#9a9aa0', '#71717a', '#3f3f46', '#1e1e1e',
];

export const HUE_PALETTE = [
  ['#fecaca', '#ef4444', '#991b1b'], // red
  ['#fed7aa', '#f97316', '#9a3412'], // orange
  ['#fde68a', '#f59e0b', '#92400e'], // amber
  ['#d9f99d', '#84cc16', '#3f6212'], // lime
  ['#bbf7d0', '#22c55e', '#166534'], // green
  ['#99f6e4', '#14b8a6', '#115e59'], // teal
  ['#bae6fd', '#0ea5e9', '#075985'], // sky
  ['#c7d2fe', '#6366f1', '#3730a3'], // indigo
  ['#e9d5ff', '#a855f7', '#6b21a8'], // purple
  ['#fbcfe8', '#ec4899', '#9d174d'], // pink
];

export const isTransparent = (value: string): boolean => value === TRANSPARENT;

/**
 * Normalise any user input — hex, rgb(), hsl(), or a CSS colour name — into the
 * 6/8-digit hex the element schema accepts. Returns null when unparseable.
 */
export function normalizeColor(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === TRANSPARENT) return TRANSPARENT;

  // Bare hex digits typed without the leading '#'.
  const candidate = /^[0-9a-fA-F]{3,8}$/.test(trimmed) ? `#${trimmed}` : trimmed;

  const parsed = colord(candidate);
  if (!parsed.isValid()) return null;

  return parsed.alpha() === 1 ? parsed.toHex().slice(0, 7) : parsed.toHex();
}

export const toColord = (value: string): Colord =>
  isTransparent(value) ? colord('#00000000') : colord(value);

export interface HslValue {
  h: number;
  s: number;
  l: number;
  a: number;
}

/**
 * HSL at full precision. colord's own toHsl() rounds to whole degrees and
 * percentages, which makes a hex -> HSL -> hex round-trip drift (#5b5bd6
 * becomes #5c5cd6) — enough to visibly shift a colour as a slider is dragged.
 */
export const toHsl = (value: string): HslValue => {
  const { r, g, b, a } = toColord(value).toRgb();
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;

    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100, a };
};

export const fromHsl = ({ h, s, l, a }: HslValue): string => {
  const sn = s / 100;
  const ln = l / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const m = ln - c / 2;
  const [r, g, b] = rgb.map((v) => Math.round((v + m) * 255)) as [number, number, number];

  const parsed = colord({ r, g, b, a });
  return a === 1 ? parsed.toHex().slice(0, 7) : parsed.toHex();
};

export const toRgbString = (value: string): string => toColord(value).toRgbString();
export const toHslString = (value: string): string => toColord(value).toHslString();

/** Contrast ratio between two colours; transparent is measured against white. */
export function contrastRatio(foreground: string, background: string): number {
  const fg = isTransparent(foreground) ? '#000000' : foreground;
  const bg = isTransparent(background) ? '#ffffff' : background;
  return colord(fg).contrast(colord(bg));
}

export const meetsAA = (foreground: string, background: string): boolean =>
  contrastRatio(foreground, background) >= AA_CONTRAST;

/** Readable text colour for a swatch of the given background. */
export const readableOn = (background: string): string =>
  toColord(background).isDark() ? '#ffffff' : '#1e1e1e';

const readList = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeList = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private-mode browsers reject writes; recents are a convenience only.
  }
};

export const getRecentColors = (): string[] => readList<string[]>(RECENT_KEY, []);

/** Record a colour as most-recent, de-duplicated, capped at MAX_RECENT. */
export function pushRecentColor(value: string): string[] {
  if (isTransparent(value)) return getRecentColors();

  const next = [value, ...getRecentColors().filter((c) => c !== value)].slice(0, MAX_RECENT);
  writeList(RECENT_KEY, next);
  return next;
}

export interface SavedPalette {
  name: string;
  colors: string[];
}

// TODO(phase-later): saved palettes move server-side once teams exist, so a
// palette can be shared rather than living in one browser.
export const getSavedPalettes = (): SavedPalette[] => readList<SavedPalette[]>(PALETTES_KEY, []);

export function savePalette(name: string, colors: string[]): SavedPalette[] {
  const next = [...getSavedPalettes().filter((p) => p.name !== name), { name, colors }];
  writeList(PALETTES_KEY, next);
  return next;
}

export function deletePalette(name: string): SavedPalette[] {
  const next = getSavedPalettes().filter((p) => p.name !== name);
  writeList(PALETTES_KEY, next);
  return next;
}

/** The native EyeDropper API, where the browser provides it. */
export const hasEyeDropper = (): boolean =>
  typeof window !== 'undefined' && 'EyeDropper' in window;

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperConstructor {
  new (): { open(): Promise<EyeDropperResult> };
}

export async function pickWithEyeDropper(): Promise<string | null> {
  if (!hasEyeDropper()) return null;
  try {
    const Ctor = (window as unknown as { EyeDropper: EyeDropperConstructor }).EyeDropper;
    const result = await new Ctor().open();
    return normalizeColor(result.sRGBHex);
  } catch {
    // The user dismissed the picker.
    return null;
  }
}

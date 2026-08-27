import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import type { CanvasElement } from '@canvas/shared';
import { seedFromId } from '@/lib/elementFactory';

const ROUGHNESS: Record<CanvasElement['roughness'], number> = {
  architect: 0.6,
  artist: 1.2,
  cartoonist: 2.4,
};

const FILL_STYLE: Record<CanvasElement['fillStyle'], string> = {
  solid: 'solid',
  hachure: 'hachure',
  'cross-hatch': 'cross-hatch',
  none: 'solid',
};

// A single detached generator: it produces path data without touching the DOM.
const generator = rough.generator();

export interface RoughPaths {
  /** Outline path data, one entry per roughjs op set. */
  stroke: string[];
  /** Fill path data, drawn beneath the outline. */
  fill: string[];
  fillIsSolid: boolean;
}

const optionsFor = (el: CanvasElement): Options => ({
  seed: seedFromId(el.id),
  roughness: ROUGHNESS[el.roughness],
  // Stroke and fill widths are applied by Konva, not baked into the path.
  strokeWidth: el.strokeWidth,
  fill: el.backgroundColor === 'transparent' ? undefined : el.backgroundColor,
  fillStyle: FILL_STYLE[el.fillStyle],
  fillWeight: el.strokeWidth / 2,
  hachureGap: el.strokeWidth * 4,
  disableMultiStroke: el.roughness === 'architect',
});

function toPaths(drawable: ReturnType<typeof generator.rectangle>): RoughPaths {
  const stroke: string[] = [];
  const fill: string[] = [];
  let fillIsSolid = false;

  for (const set of drawable.sets) {
    const data = generator.opsToPath(set);
    if (set.type === 'path') stroke.push(data);
    else if (set.type === 'fillPath') {
      fill.push(data);
      fillIsSolid = true;
    } else if (set.type === 'fillSketch') fill.push(data);
  }

  return { stroke, fill, fillIsSolid };
}

export function roughRectangle(el: CanvasElement, w: number, h: number): RoughPaths {
  return toPaths(generator.rectangle(0, 0, w, h, optionsFor(el)));
}

export function roughEllipse(el: CanvasElement, w: number, h: number): RoughPaths {
  return toPaths(generator.ellipse(w / 2, h / 2, w, h, optionsFor(el)));
}

export function roughDiamond(el: CanvasElement, w: number, h: number): RoughPaths {
  return toPaths(
    generator.polygon(
      [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ],
      optionsFor(el),
    ),
  );
}

export function roughLine(el: CanvasElement, points: readonly { x: number; y: number }[]): RoughPaths {
  if (points.length < 2) return { stroke: [], fill: [], fillIsSolid: false };
  return toPaths(
    generator.linearPath(
      points.map((p) => [p.x, p.y] as [number, number]),
      optionsFor(el),
    ),
  );
}

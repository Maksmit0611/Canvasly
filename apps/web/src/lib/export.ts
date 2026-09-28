import type Konva from 'konva';
import {
  CANVAS_FILE_VERSION, CanvasFileSchema, type AppState, type CanvasElement, type CanvasFile,
} from '@canvas/shared';
import { boundsOfElements, type Bounds } from './geometry';
import { fetchAssetDataUrl } from './assets';
import { layoutRichText, type RichTextNode } from '@/canvas/richTextLayout';
import { measureText } from '@/canvas/measureText';

export const EXPORT_PADDING = 24;

/** The region to export: the content's bounding box plus padding, not the viewport. */
export function exportBounds(elements: readonly CanvasElement[], padding = EXPORT_PADDING): Bounds | null {
  const bounds = boundsOfElements(elements);
  if (!bounds) return null;

  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

export interface PngOptions {
  pixelRatio?: 1 | 2 | 3;
  transparent?: boolean;
  elements: readonly CanvasElement[];
}

/**
 * Export the content region to a PNG data URL.
 *
 * The stage is temporarily reset to 1:1 with no scroll so the export captures
 * canvas coordinates rather than whatever the user happens to be looking at.
 */
export function exportStageToPng(stage: Konva.Stage, options: PngOptions): string | null {
  const bounds = exportBounds(options.elements);
  if (!bounds) return null;

  const previous = {
    x: stage.x(), y: stage.y(),
    scaleX: stage.scaleX(), scaleY: stage.scaleY(),
  };

  try {
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });

    return stage.toDataURL({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      pixelRatio: options.pixelRatio ?? 2,
      mimeType: 'image/png',
      ...(options.transparent ? {} : { backgroundColor: '#ffffff' }),
    });
  } finally {
    stage.scale({ x: previous.scaleX, y: previous.scaleY });
    stage.position({ x: previous.x, y: previous.y });
  }
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const dashFor = (element: CanvasElement): string => {
  if (element.strokeStyle === 'dashed') return `${element.strokeWidth * 3},${element.strokeWidth * 2}`;
  if (element.strokeStyle === 'dotted') return `${element.strokeWidth * 0.1},${element.strokeWidth * 2}`;
  return '';
};

function elementToSvg(element: CanvasElement, assetUrls: Map<string, string>): string {
  const stroke = element.strokeColor;
  const fill = element.backgroundColor === 'transparent' ? 'none' : element.backgroundColor;
  const dash = dashFor(element);

  const common =
    `stroke="${stroke}" stroke-width="${element.strokeWidth}" fill="${fill}" ` +
    `opacity="${element.opacity}"${dash ? ` stroke-dasharray="${dash}"` : ''}`;

  const transform =
    element.angle !== 0
      ? ` transform="rotate(${(element.angle * 180) / Math.PI} ${element.x + element.width / 2} ${element.y + element.height / 2})"`
      : '';

  switch (element.type) {
    case 'rectangle':
    case 'frame':
      return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.cornerRadius}" ${common}${transform} />`;

    case 'ellipse':
      return `<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${Math.abs(element.width / 2)}" ry="${Math.abs(element.height / 2)}" ${common}${transform} />`;

    case 'diamond': {
      const points = [
        `${element.x + element.width / 2},${element.y}`,
        `${element.x + element.width},${element.y + element.height / 2}`,
        `${element.x + element.width / 2},${element.y + element.height}`,
        `${element.x},${element.y + element.height / 2}`,
      ].join(' ');
      return `<polygon points="${points}" ${common}${transform} />`;
    }

    case 'person': {
      const gender = element.characterGender ?? 'male';
      const body = element.backgroundColor === 'transparent'
        ? gender === 'female' ? '#c96852' : '#3d7a70'
        : element.backgroundColor;
      const hair = gender === 'female' ? '#674633' : '#3c302a';
      const rotation = element.angle === 0 ? '' : ` rotate(${(element.angle * 180) / Math.PI} 60 80)`;
      return `<g transform="translate(${element.x} ${element.y}) scale(${element.width / 120} ${element.height / 160})${rotation}" opacity="${element.opacity}">
        <rect x="22" y="68" width="76" height="19" rx="8" fill="${body}" stroke="${stroke}" stroke-width="2" />
        <circle cx="24" cy="78" r="8" fill="#f1c6a4" stroke="${stroke}" stroke-width="1.5" /><circle cx="96" cy="78" r="8" fill="#f1c6a4" stroke="${stroke}" stroke-width="1.5" />
        <rect x="40" y="105" width="17" height="36" rx="5" fill="${body}" stroke="${stroke}" stroke-width="2" /><rect x="63" y="105" width="17" height="36" rx="5" fill="${body}" stroke="${stroke}" stroke-width="2" />
        <rect x="35" y="136" width="24" height="10" rx="4" fill="#34404a" /><rect x="61" y="136" width="24" height="10" rx="4" fill="#34404a" />
        <rect x="53" y="51" width="14" height="15" fill="#f1c6a4" /><rect x="35" y="62" width="50" height="47" rx="9" fill="${body}" stroke="${stroke}" stroke-width="2" />
        <circle cx="60" cy="35" r="19" fill="#f1c6a4" stroke="${stroke}" stroke-width="2" />
        ${gender === 'female' ? `<rect x="42" y="19" width="36" height="9" rx="5" fill="${hair}" /><circle cx="44" cy="36" r="6" fill="${hair}" /><circle cx="76" cy="36" r="6" fill="${hair}" />` : `<rect x="43" y="17" width="34" height="10" rx="5" fill="${hair}" />`}
        <circle cx="53" cy="35" r="1.7" fill="#332b28" /><circle cx="67" cy="35" r="1.7" fill="#332b28" /><circle cx="60" cy="12" r="5" fill="#e3ad3c" stroke="${stroke}" stroke-width="1.5" />
      </g>`;
    }

    case 'line':
    case 'arrow':
    case 'freedraw': {
      const points = (element.points ?? [])
        .map((p) => `${element.x + p.x},${element.y + p.y}`)
        .join(' ');
      if (!points) return '';

      const marker = element.type === 'arrow' && element.endArrowhead !== 'none'
        ? ' marker-end="url(#arrowhead)"'
        : '';

      return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${element.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${element.opacity}"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker} />`;
    }

    case 'text': {
      // Rich text becomes one <tspan> per styled run, positioned exactly as
      // the canvas renderer lays it out.
      const layout = layoutRichText(
        (element.richText as RichTextNode | undefined) ??
          (element.plainText
            ? {
                type: 'doc',
                content: element.plainText.split('\n').map((line) => ({
                  type: 'paragraph',
                  content: line ? [{ type: 'text', text: line }] : [],
                })),
              }
            : undefined),
        {
          width: element.width > 0 ? element.width : 200,
          fontSize: element.fontSize,
          fontFamily: element.fontFamily,
          lineHeight: element.lineHeight,
          align: element.textAlign,
          color: element.strokeColor,
          measureText,
        },
      );

      const spans = layout.lines
        .flatMap((line) =>
          line.runs.map((run) => {
            const weight = run.bold ? ' font-weight="700"' : '';
            const style = run.italic ? ' font-style="italic"' : '';
            const decoration = run.underline
              ? ' text-decoration="underline"'
              : run.strike
                ? ' text-decoration="line-through"'
                : '';
            return (
              `<tspan x="${element.x + run.x}" y="${element.y + run.y + run.fontSize}" ` +
              `font-size="${run.fontSize}" font-family="${escapeXml(run.fontFamily ?? element.fontFamily)}" ` +
              `fill="${run.color ?? element.strokeColor}"${weight}${style}${decoration}>` +
              `${escapeXml(run.text)}</tspan>`
            );
          }),
        )
        .join('');

      return `<text opacity="${element.opacity}"${transform}>${spans}</text>`;
    }

    case 'image':
    case 'pdf': {
      const href = element.assetData ?? (element.assetId ? assetUrls.get(element.assetId) : undefined);
      if (!href) {
        return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="#f4f4f5" stroke="#c4c4c7" />`;
      }
      return `<image x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" href="${href}" opacity="${element.opacity}"${transform} />`;
    }

    default:
      return '';
  }
}

/** Base64 data URIs for asset-backed elements, so the SVG is self-contained. */
async function collectAssetUrls(elements: readonly CanvasElement[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const ids = [...new Set(elements.filter((el) => (el.type === 'image' || el.type === 'pdf') && el.assetId && !el.assetData).map((el) => el.assetId!))];

  await Promise.all(
    ids.map(async (id) => {
      try {
        urls.set(id, await fetchAssetDataUrl(id));
      } catch {
        // A missing asset falls back to a placeholder rectangle.
      }
    }),
  );

  return urls;
}

export async function exportToSvg(elements: readonly CanvasElement[], transparent = false): Promise<string | null> {
  const bounds = exportBounds(elements);
  if (!bounds) return null;

  const assetUrls = await collectAssetUrls(elements);
  const body = elements.map((element) => elementToSvg(element, assetUrls)).join('\n  ');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `     width="${bounds.width}" height="${bounds.height}"`,
    `     viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">`,
    `  <defs>`,
    `    <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />`,
    `    </marker>`,
    `    <style>text { font-family: Inter, system-ui, sans-serif; }</style>`,
    `  </defs>`,
    transparent ? '' : `  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />`,
    `  ${body}`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The versioned interchange format. */
export function exportToJson(
  elements: readonly CanvasElement[],
  appState: AppState,
  title?: string,
): CanvasFile {
  return {
    version: CANVAS_FILE_VERSION,
    ...(title ? { title } : {}),
    elements: [...elements],
    appState,
  };
}

/** Make a self-contained file; legacy account assets are downloaded only when
 * the user explicitly saves a portable copy. */
export async function exportPortableJson(
  elements: readonly CanvasElement[],
  appState: AppState,
  title: string,
): Promise<CanvasFile> {
  const assets = new Map<string, string>();
  const ids = [...new Set(elements.filter((el) => el.assetId && !el.assetData).map((el) => el.assetId!))];
  await Promise.all(ids.map(async (id) => {
    assets.set(id, await fetchAssetDataUrl(id));
  }));

  return exportToJson(
    elements.map((element) => element.assetId && !element.assetData
      ? { ...element, assetData: assets.get(element.assetId), assetId: undefined }
      : element),
    appState,
    title,
  );
}

/** Save with a native destination picker where available, otherwise download. */
export async function saveTextToComputer(
  text: string,
  filename: string,
  mimeType: string,
): Promise<'saved' | 'downloaded' | 'cancelled'> {
  type WritableFile = { write: (data: string) => Promise<void>; close: () => Promise<void> };
  type SavePickerWindow = Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{ createWritable: () => Promise<WritableFile> }>;
  };

  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: filename,
        types: [{ description: 'Canvasly board', accept: { [mimeType]: [`.${filename.split('.').pop() ?? 'json'}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return 'saved';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }

  downloadText(text, filename, mimeType);
  return 'downloaded';
}

export interface ImportResult {
  ok: boolean;
  file?: CanvasFile;
  error?: string;
}

/**
 * Parse a `.canvas.json` file, rejecting unknown versions with a clear message
 * rather than importing something we cannot interpret.
 */
export function importFromJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const version = (raw as { version?: unknown }).version;
  if (typeof version === 'number' && version !== CANVAS_FILE_VERSION) {
    return {
      ok: false,
      error: `This file uses format version ${version}, but this version of Canvasly reads version ${CANVAS_FILE_VERSION}.`,
    };
  }

  const parsed = CanvasFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'That file is not a valid Canvasly board.' };
  }

  return { ok: true, file: parsed.data };
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadText(text: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  downloadDataUrl(url, filename);
  // Revoke on the next tick, after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Filesystem-safe filename stem from a board title. */
export const safeFilename = (title: string): string =>
  title.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'canvasly-board';

import type { TextAlign } from '@canvas/shared';

/** A contiguous span of text sharing one style. */
export interface StyledRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  fontFamily?: string;
  fontSize: number;
}

/** A run positioned on a laid-out line. */
export interface PositionedRun extends StyledRun {
  x: number;
  y: number;
  width: number;
}

export interface LayoutLine {
  runs: PositionedRun[];
  y: number;
  height: number;
  width: number;
}

export interface LayoutResult {
  lines: LayoutLine[];
  width: number;
  height: number;
}

/** Minimal shape of the TipTap/ProseMirror JSON we consume. */
export interface RichTextNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichTextNode[];
}

export interface LayoutOptions {
  width: number;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  align: TextAlign;
  color: string;
  /** Injected so layout stays pure and testable without a canvas. */
  measureText: (text: string, run: StyledRun) => number;
}

/** Heading sizes as a multiple of the base font size. */
const HEADING_SCALE: Record<number, number> = { 1: 2, 2: 1.5, 3: 1.25, 4: 1.1, 5: 1, 6: 1 };

const LIST_INDENT = 24;
const BULLET = '•';

interface Block {
  runs: StyledRun[];
  /** Rendered ahead of the block with a hanging indent. */
  marker?: string;
  indent: number;
}

function runFromNode(node: RichTextNode, base: LayoutOptions, sizeScale: number): StyledRun {
  const marks = node.marks ?? [];
  const has = (type: string): boolean => marks.some((m) => m.type === type);

  const textStyle = marks.find((m) => m.type === 'textStyle');
  const colorMark = marks.find((m) => m.type === 'color');

  const color =
    (colorMark?.attrs?.color as string | undefined) ??
    (textStyle?.attrs?.color as string | undefined) ??
    base.color;

  const fontFamily =
    (textStyle?.attrs?.fontFamily as string | undefined) ?? base.fontFamily;

  return {
    text: node.text ?? '',
    bold: has('bold') || has('strong'),
    italic: has('italic') || has('em'),
    underline: has('underline'),
    strike: has('strike') || has('s'),
    color,
    fontFamily,
    fontSize: base.fontSize * sizeScale,
  };
}

/**
 * Walk the document into flat blocks. Lists contribute a marker run with a
 * hanging indent; nested lists deepen the indent.
 */
export function flattenBlocks(
  doc: RichTextNode | null | undefined,
  base: LayoutOptions,
): Block[] {
  const blocks: Block[] = [];

  const walk = (node: RichTextNode, depth: number, marker?: string): void => {
    switch (node.type) {
      case 'doc':
        node.content?.forEach((child) => walk(child, depth));
        return;

      case 'bulletList':
        node.content?.forEach((child) => walk(child, depth + 1, BULLET));
        return;

      case 'orderedList': {
        const start = Number(node.attrs?.start ?? 1);
        node.content?.forEach((child, i) => walk(child, depth + 1, `${start + i}.`));
        return;
      }

      case 'listItem':
        node.content?.forEach((child, i) => {
          // Only the first paragraph of an item carries the marker.
          walk(child, depth, i === 0 ? marker : undefined);
        });
        return;

      case 'blockquote':
        node.content?.forEach((child) => walk(child, depth + 1));
        return;

      case 'heading': {
        const level = Number(node.attrs?.level ?? 1);
        const scale = HEADING_SCALE[level] ?? 1;
        blocks.push({
          runs: (node.content ?? []).map((c) => ({
            ...runFromNode(c, base, scale),
            bold: true,
          })),
          marker,
          indent: depth * LIST_INDENT,
        });
        return;
      }

      case 'codeBlock':
        blocks.push({
          runs: (node.content ?? []).map((c) => ({
            ...runFromNode(c, base, 1),
            fontFamily: 'monospace',
          })),
          marker,
          indent: depth * LIST_INDENT,
        });
        return;

      case 'paragraph':
        blocks.push({
          runs: (node.content ?? []).map((c) => runFromNode(c, base, 1)),
          marker,
          indent: depth * LIST_INDENT,
        });
        return;

      case 'hardBreak':
        blocks.push({ runs: [], indent: depth * LIST_INDENT });
        return;

      default:
        if (node.content) node.content.forEach((child) => walk(child, depth, marker));
        else if (node.text) {
          blocks.push({ runs: [runFromNode(node, base, 1)], marker, indent: depth * LIST_INDENT });
        }
    }
  };

  if (doc) walk(doc, 0);
  return blocks;
}

/** Split a run at whitespace, keeping the trailing space with each word. */
function splitWords(run: StyledRun): StyledRun[] {
  const parts = run.text.match(/\S+\s*|\s+/g) ?? [];
  return parts.map((text) => ({ ...run, text }));
}

/**
 * Lay a rich-text document out into positioned runs, wrapping at `width`.
 *
 * Konva's `<Text>` supports one style per node, so a paragraph mixing bold and
 * colour has to be decomposed into separate nodes — this produces exactly that
 * list, already positioned.
 */
export function layoutRichText(
  doc: RichTextNode | null | undefined,
  options: LayoutOptions,
): LayoutResult {
  const blocks = flattenBlocks(doc, options);
  const lines: LayoutLine[] = [];
  let y = 0;

  for (const block of blocks) {
    const maxWidth = Math.max(1, options.width - block.indent);

    // An empty paragraph still occupies a line.
    if (block.runs.length === 0) {
      const height = options.fontSize * options.lineHeight;
      lines.push({ runs: [], y, height, width: 0 });
      y += height;
      continue;
    }

    const words = block.runs.flatMap(splitWords).filter((w) => w.text.length > 0);

    let current: PositionedRun[] = [];
    let cursorX = block.indent;
    let lineHeight = 0;
    let isFirstLineOfBlock = true;

    const flush = (): void => {
      if (current.length === 0) return;

      const height = lineHeight * options.lineHeight;
      const contentWidth = cursorX - block.indent;

      // Alignment shifts the whole line; justify is treated as left here
      // because inter-word stretching needs per-space adjustment.
      let shift = 0;
      if (options.align === 'center') shift = (maxWidth - contentWidth) / 2;
      else if (options.align === 'right') shift = maxWidth - contentWidth;

      lines.push({
        runs: current.map((r) => ({ ...r, x: r.x + shift, y })),
        y,
        height,
        width: contentWidth,
      });

      y += height;
      current = [];
      cursorX = block.indent;
      lineHeight = 0;
      isFirstLineOfBlock = false;
    };

    // The list marker sits in the hanging indent, left of the text.
    if (block.marker) {
      const markerRun: StyledRun = {
        text: block.marker,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        color: options.color,
        fontFamily: options.fontFamily,
        fontSize: options.fontSize,
      };
      const markerWidth = options.measureText(markerRun.text, markerRun);
      current.push({
        ...markerRun,
        x: Math.max(0, block.indent - LIST_INDENT),
        y,
        width: markerWidth,
      });
      lineHeight = Math.max(lineHeight, markerRun.fontSize);
    }

    for (const word of words) {
      const wordWidth = options.measureText(word.text, word);
      const isSpaceOnly = word.text.trim().length === 0;

      const overflows = cursorX - block.indent + wordWidth > maxWidth;
      const hasContent = current.some((r) => r.text.trim().length > 0);

      if (overflows && hasContent && !isSpaceOnly) {
        flush();
      }

      // A space that lands at the start of a wrapped line is dropped.
      if (isSpaceOnly && cursorX === block.indent && !isFirstLineOfBlock) continue;

      current.push({ ...word, x: cursorX, y, width: wordWidth });
      cursorX += wordWidth;
      lineHeight = Math.max(lineHeight, word.fontSize);
    }

    flush();
  }

  return {
    lines,
    width: options.width,
    height: y,
  };
}

/** Flatten a document to plain text — the search/export/accessibility fallback. */
export function toPlainText(doc: RichTextNode | null | undefined): string {
  if (!doc) return '';
  const parts: string[] = [];

  const walk = (node: RichTextNode): void => {
    if (node.text) parts.push(node.text);
    node.content?.forEach(walk);
    if (node.type === 'paragraph' || node.type === 'heading') parts.push('\n');
  };

  walk(doc);
  return parts.join('').replace(/\n+$/, '');
}

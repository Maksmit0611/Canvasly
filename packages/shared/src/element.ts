import { z } from 'zod';

export const ElementTypeSchema = z.enum([
  'rectangle', 'ellipse', 'diamond', 'line', 'arrow',
  'freedraw', 'text', 'image', 'pdf', 'frame',
]);
export type ElementType = z.infer<typeof ElementTypeSchema>;

export const StrokeStyleSchema = z.enum(['solid', 'dashed', 'dotted']);
export type StrokeStyle = z.infer<typeof StrokeStyleSchema>;

export const FillStyleSchema = z.enum(['solid', 'hachure', 'cross-hatch', 'none']);
export type FillStyle = z.infer<typeof FillStyleSchema>;

export const RoughnessSchema = z.enum(['architect', 'artist', 'cartoonist']);
export type Roughness = z.infer<typeof RoughnessSchema>;

/** Hex colour, 6 or 8 digits, or the literal "transparent". */
export const ColorSchema = z.union([
  z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  z.literal('transparent'),
]);
export type Color = z.infer<typeof ColorSchema>;

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

export const ArrowheadSchema = z.enum(['none', 'arrow', 'triangle', 'dot']);
export type Arrowhead = z.infer<typeof ArrowheadSchema>;

export const TextAlignSchema = z.enum(['left', 'center', 'right', 'justify']);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const VerticalAlignSchema = z.enum(['top', 'middle', 'bottom']);
export type VerticalAlign = z.infer<typeof VerticalAlignSchema>;

export const CanvasElementSchema = z.object({
  id: z.string().uuid(),
  type: ElementTypeSchema,

  // Transform
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  angle: z.number().default(0),          // radians

  // Appearance
  strokeColor: ColorSchema.default('#1e1e1e'),
  backgroundColor: ColorSchema.default('transparent'),
  strokeWidth: z.number().min(0.5).max(40).default(2),
  strokeStyle: StrokeStyleSchema.default('solid'),
  fillStyle: FillStyleSchema.default('solid'),
  roughness: RoughnessSchema.default('artist'),
  opacity: z.number().min(0).max(1).default(1),
  cornerRadius: z.number().min(0).default(0),

  // Line / arrow / freedraw geometry, relative to (x, y)
  points: z.array(PointSchema).optional(),
  startArrowhead: ArrowheadSchema.default('none'),
  endArrowhead: ArrowheadSchema.default('none'),

  // Text. `richText` is TipTap JSON; `plainText` is the flattened fallback
  // used for search, export, and accessibility.
  richText: z.unknown().optional(),
  plainText: z.string().optional(),
  fontFamily: z.string().default('Kalam'),
  fontSize: z.number().min(8).max(200).default(16),
  textAlign: TextAlignSchema.default('left'),
  verticalAlign: VerticalAlignSchema.default('top'),
  lineHeight: z.number().default(1.4),

  // Asset-backed elements (image, pdf)
  assetId: z.string().uuid().optional(),
  pdfPage: z.number().int().min(1).optional(),

  // Binding: arrows can attach to shapes and follow them
  boundStartId: z.string().uuid().optional(),
  boundEndId: z.string().uuid().optional(),

  // Bookkeeping
  zIndex: z.number().int(),
  locked: z.boolean().default(false),
  isDeleted: z.boolean().default(false),   // soft delete, needed for CRDT merges
  version: z.number().int().default(1),
  updatedAt: z.string().datetime(),
});

export type CanvasElement = z.infer<typeof CanvasElementSchema>;

/**
 * Partial patch applied to an existing element. `id` identifies the target and
 * cannot itself be patched, so it is omitted from the patchable surface.
 */
export const CanvasElementPatchSchema = CanvasElementSchema.partial().omit({ id: true });
export type CanvasElementPatch = z.infer<typeof CanvasElementPatchSchema>;

export const ElementBatchSchema = z.object({
  upserts: z.array(CanvasElementSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
export type ElementBatch = z.infer<typeof ElementBatchSchema>;

/**
 * The serialisable mutation vocabulary. Every canvas mutation — from the UI,
 * from CRDT sync, and later from an AI agent — funnels through these.
 */
export const CanvasCommandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), elements: z.array(CanvasElementSchema) }),
  z.object({ op: z.literal('update'), ids: z.array(z.string().uuid()), patch: CanvasElementPatchSchema }),
  z.object({ op: z.literal('delete'), ids: z.array(z.string().uuid()) }),
  z.object({ op: z.literal('reorder'), id: z.string().uuid(), toIndex: z.number().int().min(0) }),
]);
export type CanvasCommand = z.infer<typeof CanvasCommandSchema>;

export const CommandOriginSchema = z.enum(['user', 'remote', 'ai']);
export type CommandOrigin = z.infer<typeof CommandOriginSchema>;

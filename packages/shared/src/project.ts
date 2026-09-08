import { z } from 'zod';
import { CanvasElementSchema } from './element.js';

export const ThemeSchema = z.enum(['light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

export const AppStateSchema = z.object({
  zoom: z.number().min(0.1).max(10).default(1),
  scrollX: z.number().default(0),
  scrollY: z.number().default(0),
  theme: ThemeSchema.default('light'),
  gridEnabled: z.boolean().default(false),
  gridSize: z.number().int().min(1).max(200).default(20),
  snapToGrid: z.boolean().default(false),
});
export type AppState = z.infer<typeof AppStateSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string().min(1).max(200),
  thumbnail: z.string().nullable().default(null),
  appState: AppStateSchema,
  isArchived: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  appState: AppStateSchema.partial().optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const ProjectWithElementsSchema = z.object({
  project: ProjectSchema,
  elements: z.array(CanvasElementSchema),
});
export type ProjectWithElements = z.infer<typeof ProjectWithElementsSchema>;

export const AssetKindSchema = z.enum(['image', 'pdf']);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  uploaderId: z.string().uuid(),
  kind: AssetKindSchema,
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const SharePermissionSchema = z.enum(['view', 'edit']);
export type SharePermission = z.infer<typeof SharePermissionSchema>;

export const CreateShareLinkSchema = z.object({
  permission: SharePermissionSchema,
  expiresAt: z.string().datetime().optional(),
});
export type CreateShareLinkInput = z.infer<typeof CreateShareLinkSchema>;

export const ShareLinkSchema = z.object({
  url: z.string(),
  token: z.string(),
  permission: SharePermissionSchema,
  expiresAt: z.string().datetime().nullable().default(null),
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;

/** The versioned `.canvas.json` interchange format used by export/import. */
export const CANVAS_FILE_VERSION = 1;

export const CanvasFileSchema = z.object({
  version: z.literal(CANVAS_FILE_VERSION),
  elements: z.array(CanvasElementSchema),
  appState: AppStateSchema,
});
export type CanvasFile = z.infer<typeof CanvasFileSchema>;

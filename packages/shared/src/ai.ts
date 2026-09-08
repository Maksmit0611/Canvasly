import { z } from 'zod';
import { CanvasCommandSchema } from './element.js';

/**
 * Request/response contract for `POST /api/projects/:id/ai/command`. The route
 * exists and returns 501 until the AI milestone; defining the types now keeps
 * the seam stable for both sides.
 */
export const AiCommandRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  selectedIds: z.array(z.string().uuid()).default([]),
});
export type AiCommandRequest = z.infer<typeof AiCommandRequestSchema>;

export const AiCommandResponseSchema = z.object({
  commands: z.array(CanvasCommandSchema),
  explanation: z.string(),
});
export type AiCommandResponse = z.infer<typeof AiCommandResponseSchema>;

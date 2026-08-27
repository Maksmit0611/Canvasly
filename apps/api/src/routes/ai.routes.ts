import { Router } from 'express';
import { z } from 'zod';
import { AiCommandRequestSchema } from '@canvas/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { findProjectForOwner } from '../db/queries/projects.js';
import { ApiError, notFound } from '../errors.js';

export const aiRouter = Router();

const IdParams = z.object({ id: z.string().uuid() });

/**
 * Reserved for the AI milestone.
 *
 * The route, its auth, and its request/response types exist now so the seam is
 * fixed; the handler returns 501 until the model integration lands. Provider
 * keys will live server-side only and are never shipped to the browser.
 */
aiRouter.post(
  '/projects/:id/ai/command',
  requireAuth,
  validate({ params: IdParams, body: AiCommandRequestSchema }),
  async (req, res, next) => {
    try {
      const project = await findProjectForOwner(req.params.id!, currentUser(req).id);
      if (!project) throw notFound('Project');

      throw new ApiError('NOT_IMPLEMENTED', 'AI commands are not available yet');
    } catch (err) {
      next(err);
    }
  },
);

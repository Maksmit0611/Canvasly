import { Router } from 'express';
import { z } from 'zod';
import { CanvasElementSchema } from '@canvas/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { findProjectForOwner } from '../db/queries/projects.js';
import { applyElementBatch, listElements, projectElementVersion } from '../db/queries/elements.js';
import { notFound } from '../errors.js';

export const elementsRouter = Router();

const IdParams = z.object({ id: z.string().uuid() });

const BatchBody = z.object({
  upserts: z.array(CanvasElementSchema).max(2000).default([]),
  deletes: z.array(z.string().uuid()).max(2000).default([]),
});

elementsRouter.get(
  '/projects/:id/elements',
  requireAuth,
  validate({ params: IdParams }),
  async (req, res, next) => {
    try {
      const project = await findProjectForOwner(req.params.id!, currentUser(req).id);
      if (!project) throw notFound('Project');
      res.json(await listElements(project.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Batched saves, not per-element writes. The client debounces changes and posts
 * one batch; every element is validated and the whole batch applies in a single
 * transaction, with stale versions rejected at the SQL level.
 */
elementsRouter.post(
  '/projects/:id/elements/batch',
  requireAuth,
  validate({ params: IdParams, body: BatchBody }),
  async (req, res, next) => {
    try {
      const project = await findProjectForOwner(req.params.id!, currentUser(req).id);
      if (!project) throw notFound('Project');

      const { upserts, deletes } = req.body as z.infer<typeof BatchBody>;
      const result = await applyElementBatch(project.id, upserts, deletes);

      res.json({
        ok: true,
        version: await projectElementVersion(project.id),
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

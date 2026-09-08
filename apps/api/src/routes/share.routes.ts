import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { CreateShareLinkSchema } from '@canvas/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { findProjectById, findProjectForOwner } from '../db/queries/projects.js';
import { listElements } from '../db/queries/elements.js';
import {
  createShareLink, findActiveShareLink, listShareLinks, revokeShareLink,
} from '../db/queries/shareLinks.js';
import { config } from '../config.js';
import { notFound } from '../errors.js';

export const shareRouter = Router();

const IdParams = z.object({ id: z.string().uuid() });
const TokenParams = z.object({ token: z.string().min(16).max(64) });

/**
 * 24 random bytes as base64url — never a sequential id, which would let anyone
 * enumerate other people's boards.
 */
const generateToken = (): string => randomBytes(24).toString('base64url');

const shareUrl = (token: string): string => {
  const origin = config.CORS_ORIGINS[0] ?? 'http://localhost:5173';
  return `${origin}/s/${token}`;
};

shareRouter.post(
  '/projects/:id/share',
  requireAuth,
  validate({ params: IdParams, body: CreateShareLinkSchema }),
  async (req, res, next) => {
    try {
      const project = await findProjectForOwner(req.params.id!, currentUser(req).id);
      if (!project) throw notFound('Project');

      const { permission, expiresAt } = req.body as z.infer<typeof CreateShareLinkSchema>;
      const token = generateToken();

      await createShareLink({
        projectId: project.id,
        token,
        permission,
        createdBy: currentUser(req).id,
        expiresAt: expiresAt ?? null,
      });

      res.status(201).json({ url: shareUrl(token), token, permission, expiresAt: expiresAt ?? null });
    } catch (err) {
      next(err);
    }
  },
);

shareRouter.get(
  '/projects/:id/share',
  requireAuth,
  validate({ params: IdParams }),
  async (req, res, next) => {
    try {
      const project = await findProjectForOwner(req.params.id!, currentUser(req).id);
      if (!project) throw notFound('Project');

      const rows = await listShareLinks(project.id);
      res.json(
        rows.map((row) => ({
          url: shareUrl(row.token),
          token: row.token,
          permission: row.permission,
          expiresAt: row.expires_at?.toISOString() ?? null,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** Public: resolves a share token to a read-only view of the board. */
shareRouter.get('/share/:token', validate({ params: TokenParams }), async (req, res, next) => {
  try {
    const link = await findActiveShareLink(req.params.token!);
    // A revoked or expired token is indistinguishable from one that never
    // existed, so a probe learns nothing.
    if (!link) throw notFound('Share link');

    const project = await findProjectById(link.project_id);
    if (!project) throw notFound('Share link');

    res.json({
      project,
      elements: await listElements(project.id),
      permission: link.permission,
    });
  } catch (err) {
    next(err);
  }
});

shareRouter.delete(
  '/share/:token',
  requireAuth,
  validate({ params: TokenParams }),
  async (req, res, next) => {
    try {
      if (!(await revokeShareLink(req.params.token!, currentUser(req).id))) {
        throw notFound('Share link');
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

import { Router } from 'express';
import { z } from 'zod';
import { CreateProjectSchema, UpdateProjectSchema } from '@canvas/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import {
  createProject,
  deleteProject,
  findProjectForOwner,
  listProjects,
  updateProject,
} from '../db/queries/projects.js';
import { listElements } from '../db/queries/elements.js';
import { notFound } from '../errors.js';

export const projectsRouter = Router();

const IdParams = z.object({ id: z.string().uuid() });

projectsRouter.use('/projects', requireAuth);

projectsRouter.get(
  '/projects',
  validate({ query: z.object({ archived: z.enum(['true', 'false']).default('false') }) }),
  async (req, res, next) => {
    try {
      const { archived } = req.query as unknown as { archived: 'true' | 'false' };
      res.json(await listProjects(currentUser(req).id, archived === 'true'));
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.post('/projects', validate({ body: CreateProjectSchema }), async (req, res, next) => {
  try {
    const { title } = req.body as { title?: string };
    res.status(201).json(await createProject(currentUser(req).id, title));
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id', validate({ params: IdParams }), async (req, res, next) => {
  try {
    // findProjectForOwner is the ownership check: a project belonging to
    // someone else is indistinguishable from one that does not exist.
    const project = await findProjectForOwner(req.params.id!, currentUser(req).id);
    if (!project) throw notFound('Project');
    res.json({ project, elements: await listElements(project.id) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch(
  '/projects/:id',
  validate({ params: IdParams, body: UpdateProjectSchema }),
  async (req, res, next) => {
    try {
      const project = await updateProject(req.params.id!, currentUser(req).id, req.body);
      if (!project) throw notFound('Project');
      res.json(project);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.delete('/projects/:id', validate({ params: IdParams }), async (req, res, next) => {
  try {
    if (!(await deleteProject(req.params.id!, currentUser(req).id))) throw notFound('Project');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

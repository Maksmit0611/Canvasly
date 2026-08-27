import { AppStateSchema, type AppState, type Project } from '@canvas/shared';
import { query, queryOne } from '../pool.js';
import type { ProjectRow } from '../rows.js';

export const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  thumbnail: row.thumbnail,
  // Rows predating a schema addition may lack newer keys; parse fills defaults.
  appState: AppStateSchema.parse(row.app_state ?? {}),
  isArchived: row.is_archived,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export async function listProjects(ownerId: string, archived: boolean): Promise<Project[]> {
  const rows = await query<ProjectRow>(
    `SELECT * FROM projects
     WHERE owner_id = $1 AND is_archived = $2
     ORDER BY updated_at DESC`,
    [ownerId, archived],
  );
  return rows.map(toProject);
}

export async function createProject(ownerId: string, title?: string): Promise<Project> {
  const row = await queryOne<ProjectRow>(
    `INSERT INTO projects (owner_id, title, app_state)
     VALUES ($1, COALESCE($2, 'Untitled'), $3::jsonb)
     RETURNING *`,
    [ownerId, title ?? null, JSON.stringify(AppStateSchema.parse({}))],
  );

  if (!row) throw new Error('createProject returned no row');
  return toProject(row);
}

/** Fetch a project only if `ownerId` owns it — the ownership check lives here. */
export async function findProjectForOwner(id: string, ownerId: string): Promise<Project | null> {
  const row = await queryOne<ProjectRow>(
    `SELECT * FROM projects WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return row ? toProject(row) : null;
}

/** Fetch a project without an ownership check — for share-token access paths. */
export async function findProjectById(id: string): Promise<Project | null> {
  const row = await queryOne<ProjectRow>(`SELECT * FROM projects WHERE id = $1`, [id]);
  return row ? toProject(row) : null;
}

export interface UpdateProjectFields {
  title?: string;
  appState?: Partial<AppState>;
  isArchived?: boolean;
  thumbnail?: string;
}

export async function updateProject(
  id: string,
  ownerId: string,
  fields: UpdateProjectFields,
): Promise<Project | null> {
  // Build the SET list from only the provided fields, keeping every value in
  // the parameter array rather than the SQL text.
  const sets: string[] = [];
  const params: unknown[] = [];

  const push = (fragment: string, value: unknown): void => {
    params.push(value);
    sets.push(fragment.replace('?', `$${params.length}`));
  };

  if (fields.title !== undefined) push('title = ?', fields.title);
  if (fields.isArchived !== undefined) push('is_archived = ?', fields.isArchived);
  if (fields.thumbnail !== undefined) push('thumbnail = ?', fields.thumbnail);
  if (fields.appState !== undefined) {
    push('app_state = app_state || ?::jsonb', JSON.stringify(fields.appState));
  }

  if (sets.length === 0) return findProjectForOwner(id, ownerId);

  sets.push('updated_at = now()');
  params.push(id, ownerId);

  const row = await queryOne<ProjectRow>(
    `UPDATE projects SET ${sets.join(', ')}
     WHERE id = $${params.length - 1} AND owner_id = $${params.length}
     RETURNING *`,
    params,
  );
  return row ? toProject(row) : null;
}

export async function touchProject(id: string): Promise<void> {
  await query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [id]);
}

export async function deleteProject(id: string, ownerId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id`,
    [id, ownerId],
  );
  return rows.length > 0;
}

import type { SharePermission } from '@canvas/shared';
import { query, queryOne } from '../pool.js';
import type { ShareLinkRow } from '../rows.js';

export interface CreateShareLinkInput {
  projectId: string;
  token: string;
  permission: SharePermission;
  createdBy: string;
  expiresAt: string | null;
}

export async function createShareLink(input: CreateShareLinkInput): Promise<ShareLinkRow> {
  const row = await queryOne<ShareLinkRow>(
    `INSERT INTO share_links (project_id, token, permission, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.projectId, input.token, input.permission, input.createdBy, input.expiresAt],
  );

  if (!row) throw new Error('createShareLink returned no row');
  return row;
}

/**
 * Resolve a token to its link, excluding revoked and expired ones. Both checks
 * live in SQL so no caller can forget them.
 */
export async function findActiveShareLink(token: string): Promise<ShareLinkRow | null> {
  return queryOne<ShareLinkRow>(
    `SELECT * FROM share_links
     WHERE token = $1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
}

export async function listShareLinks(projectId: string): Promise<ShareLinkRow[]> {
  return query<ShareLinkRow>(
    `SELECT * FROM share_links
     WHERE project_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [projectId],
  );
}

/** Revoke a link, but only if `ownerId` owns the project it points at. */
export async function revokeShareLink(token: string, ownerId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE share_links sl
     SET revoked_at = now()
     FROM projects p
     WHERE sl.project_id = p.id
       AND sl.token = $1
       AND p.owner_id = $2
       AND sl.revoked_at IS NULL
     RETURNING sl.id`,
    [token, ownerId],
  );
  return rows.length > 0;
}

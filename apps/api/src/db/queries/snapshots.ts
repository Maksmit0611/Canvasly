import { query, queryOne } from '../pool.js';
import type { SnapshotRow } from '../rows.js';

/** Persist an encoded Yjs document state for a project. */
export async function insertSnapshot(projectId: string, state: Buffer): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO project_snapshots (project_id, ydoc_state) VALUES ($1, $2) RETURNING id`,
    [projectId, state],
  );

  if (!row) throw new Error('insertSnapshot returned no row');
  return row.id;
}

export async function findLatestSnapshot(projectId: string): Promise<SnapshotRow | null> {
  return queryOne<SnapshotRow>(
    `SELECT * FROM project_snapshots
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId],
  );
}

/**
 * Drop all but the newest `keep` snapshots for a project. Snapshots are written
 * on a timer, so without pruning the table grows without bound.
 */
export async function pruneSnapshots(projectId: string, keep: number): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM project_snapshots
     WHERE project_id = $1
       AND id NOT IN (
         SELECT id FROM project_snapshots
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       )
     RETURNING id`,
    [projectId, keep],
  );
  return rows.length;
}

import type { PoolClient } from 'pg';
import { CanvasElementSchema, type CanvasElement } from '@canvas/shared';
import { query, withTransaction } from '../pool.js';
import type { ElementRow } from '../rows.js';

export const toElement = (row: ElementRow): CanvasElement =>
  CanvasElementSchema.parse({
    ...row.data,
    id: row.id,
    type: row.type,
    zIndex: row.z_index,
    version: row.version,
    isDeleted: row.is_deleted,
    updatedAt: row.updated_at.toISOString(),
  });

/** All live elements for a project, in paint order. */
export async function listElements(projectId: string): Promise<CanvasElement[]> {
  const rows = await query<ElementRow>(
    `SELECT * FROM elements
     WHERE project_id = $1 AND is_deleted = false
     ORDER BY z_index ASC`,
    [projectId],
  );
  return rows.map(toElement);
}

/** Includes soft-deleted rows — needed when hydrating a CRDT document. */
export async function listElementsIncludingDeleted(projectId: string): Promise<CanvasElement[]> {
  const rows = await query<ElementRow>(
    `SELECT * FROM elements WHERE project_id = $1 ORDER BY z_index ASC`,
    [projectId],
  );
  return rows.map(toElement);
}

async function upsertOne(
  client: PoolClient,
  projectId: string,
  element: CanvasElement,
): Promise<void> {
  await client.query(
    `INSERT INTO elements (id, project_id, type, data, z_index, version, is_deleted, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, now())
     ON CONFLICT (id) DO UPDATE
       SET type       = EXCLUDED.type,
           data       = EXCLUDED.data,
           z_index    = EXCLUDED.z_index,
           version    = EXCLUDED.version,
           is_deleted = EXCLUDED.is_deleted,
           updated_at = now()
     WHERE elements.project_id = EXCLUDED.project_id
       AND elements.version <= EXCLUDED.version`,
    [
      element.id,
      projectId,
      element.type,
      JSON.stringify(element),
      element.zIndex,
      element.version,
      element.isDeleted,
    ],
  );
}

export interface BatchResult {
  upserted: number;
  deleted: number;
}

/**
 * Apply a batch of element changes in one transaction. Upserts are rejected
 * when the incoming version is older than what is stored, so a stale client
 * cannot clobber newer data. Deletes are soft, because a hard delete can
 * resurrect on a CRDT merge from an offline peer.
 */
export async function applyElementBatch(
  projectId: string,
  upserts: CanvasElement[],
  deletes: string[],
): Promise<BatchResult> {
  return withTransaction(async (client) => {
    for (const element of upserts) {
      await upsertOne(client, projectId, element);
    }

    let deleted = 0;
    if (deletes.length > 0) {
      const result = await client.query(
        `UPDATE elements
         SET is_deleted = true, version = version + 1, updated_at = now()
         WHERE project_id = $1 AND id = ANY($2::uuid[]) AND is_deleted = false`,
        [projectId, deletes],
      );
      deleted = result.rowCount ?? 0;
    }

    await client.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [projectId]);

    return { upserted: upserts.length, deleted };
  });
}

/** Highest version across a project's elements — used as its sync cursor. */
export async function projectElementVersion(projectId: string): Promise<number> {
  const rows = await query<{ version: number | null }>(
    `SELECT MAX(version)::int AS version FROM elements WHERE project_id = $1`,
    [projectId],
  );
  return rows[0]?.version ?? 0;
}

export async function deleteAllElements(projectId: string): Promise<void> {
  await query(`DELETE FROM elements WHERE project_id = $1`, [projectId]);
}

import type { Asset, AssetKind } from '@canvas/shared';
import { query, queryOne } from '../pool.js';
import type { AssetRow } from '../rows.js';

/** The public shape: `storage_key` and `checksum` stay server-side. */
export const toAsset = (row: AssetRow): Asset => ({
  id: row.id,
  projectId: row.project_id,
  uploaderId: row.uploader_id,
  kind: row.kind,
  filename: row.filename,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes),
  pageCount: row.page_count,
  createdAt: row.created_at.toISOString(),
});

export interface CreateAssetInput {
  projectId: string;
  uploaderId: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  pageCount: number | null;
  checksum: string;
}

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const row = await queryOne<AssetRow>(
    `INSERT INTO assets
       (project_id, uploader_id, kind, filename, mime_type, size_bytes, storage_key, page_count, checksum)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.projectId,
      input.uploaderId,
      input.kind,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.storageKey,
      input.pageCount,
      input.checksum,
    ],
  );

  if (!row) throw new Error('createAsset returned no row');
  return toAsset(row);
}

/** Deduplication lookup: an identical upload in the same project is reused. */
export async function findAssetByChecksum(
  projectId: string,
  checksum: string,
): Promise<Asset | null> {
  const row = await queryOne<AssetRow>(
    `SELECT * FROM assets WHERE project_id = $1 AND checksum = $2`,
    [projectId, checksum],
  );
  return row ? toAsset(row) : null;
}

/** Full row including the storage key — for routes that must stream bytes. */
export async function findAssetRow(id: string): Promise<AssetRow | null> {
  return queryOne<AssetRow>(`SELECT * FROM assets WHERE id = $1`, [id]);
}

export async function findAsset(id: string): Promise<Asset | null> {
  const row = await findAssetRow(id);
  return row ? toAsset(row) : null;
}

export async function listAssets(projectId: string): Promise<Asset[]> {
  const rows = await query<AssetRow>(
    `SELECT * FROM assets WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId],
  );
  return rows.map(toAsset);
}

export async function deleteAsset(id: string): Promise<AssetRow | null> {
  const rows = await query<AssetRow>(`DELETE FROM assets WHERE id = $1 RETURNING *`, [id]);
  return rows[0] ?? null;
}

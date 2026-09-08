/**
 * Row shapes as postgres returns them (snake_case), kept separate from the
 * camelCase API types in @canvas/shared. Each queries/*.ts module owns the
 * mapping between the two.
 */

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  oauth_provider: string;
  oauth_subject: string;
  created_at: Date;
  last_login_at: Date | null;
}

export interface ProjectRow {
  id: string;
  owner_id: string;
  title: string;
  thumbnail: string | null;
  app_state: Record<string, unknown>;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ElementRow {
  id: string;
  project_id: string;
  type: string;
  data: Record<string, unknown>;
  z_index: number;
  version: number;
  is_deleted: boolean;
  updated_at: Date;
}

export interface AssetRow {
  id: string;
  project_id: string;
  uploader_id: string;
  kind: 'image' | 'pdf';
  filename: string;
  mime_type: string;
  size_bytes: string; // BIGINT arrives as a string from node-postgres
  storage_key: string;
  page_count: number | null;
  checksum: string;
  created_at: Date;
}

export interface ShareLinkRow {
  id: string;
  project_id: string;
  token: string;
  permission: 'view' | 'edit';
  created_by: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export interface SnapshotRow {
  id: string;
  project_id: string;
  ydoc_state: Buffer;
  created_at: Date;
}

/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS citext;`);

  pgm.sql(`
    CREATE TABLE users (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email          CITEXT UNIQUE NOT NULL,
      name           TEXT,
      avatar_url     TEXT,
      oauth_provider TEXT NOT NULL,
      oauth_subject  TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at  TIMESTAMPTZ,
      UNIQUE (oauth_provider, oauth_subject)
    );
  `);

  pgm.sql(`
    CREATE TABLE projects (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL DEFAULT 'Untitled',
      thumbnail   TEXT,
      app_state   JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_archived BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_projects_owner ON projects(owner_id, updated_at DESC);`);

  pgm.sql(`
    CREATE TABLE elements (
      id         UUID PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      data       JSONB NOT NULL,
      z_index    INTEGER NOT NULL DEFAULT 0,
      version    INTEGER NOT NULL DEFAULT 1,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_elements_project ON elements(project_id, z_index);`);

  pgm.sql(`
    CREATE TABLE assets (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      uploader_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK (kind IN ('image','pdf')),
      filename      TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      size_bytes    BIGINT NOT NULL,
      storage_key   TEXT NOT NULL,
      page_count    INTEGER,
      checksum      TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_assets_project ON assets(project_id);`);
  // Phase 8 deduplicates uploads by (project, checksum); enforce it in the schema.
  pgm.sql(`CREATE UNIQUE INDEX idx_assets_project_checksum ON assets(project_id, checksum);`);

  pgm.sql(`
    CREATE TABLE share_links (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      token      TEXT UNIQUE NOT NULL,
      permission TEXT NOT NULL CHECK (permission IN ('view','edit')),
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_share_token ON share_links(token) WHERE revoked_at IS NULL;`);

  pgm.sql(`
    CREATE TABLE project_snapshots (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      ydoc_state BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_snapshots_project ON project_snapshots(project_id, created_at DESC);`);
};

exports.down = (pgm) => {
  // Dropped in reverse dependency order; indexes go with their tables.
  pgm.sql(`DROP TABLE IF EXISTS project_snapshots;`);
  pgm.sql(`DROP TABLE IF EXISTS share_links;`);
  pgm.sql(`DROP TABLE IF EXISTS assets;`);
  pgm.sql(`DROP TABLE IF EXISTS elements;`);
  pgm.sql(`DROP TABLE IF EXISTS projects;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
};

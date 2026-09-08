#!/usr/bin/env node
/**
 * Wrapper around the node-pg-migrate CLI.
 *
 * The CLI only knows how to read a connection string from an env var, but in
 * development the connection is described by the individual DB_* variables.
 * This resolves the URL the same way src/config.ts does, then hands off to the
 * CLI with every argument passed through (`up`, `down`, `create <name>`, ...).
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// In production (Docker/Railway) there is no .env file; env vars are injected
// directly. dotenv is a no-op when the file is absent, so this is always safe.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const env = process.env;

const databaseUrl =
  env.DATABASE_URL && env.DATABASE_URL.length > 0
    ? env.DATABASE_URL
    : `postgres://${encodeURIComponent(env.DB_USER || 'postgres')}:` +
      `${encodeURIComponent(env.DB_PASSWORD || 'postgres')}@` +
      `${env.DB_HOST || 'localhost'}:${env.DB_PORT || 5432}/` +
      `${env.DB_NAME || 'canvas'}`;

// Resolved from the package root rather than as a subpath import: the package's
// "exports" map does not expose bin/, so require.resolve() cannot reach it.
const pkgJson = require.resolve('node-pg-migrate/package.json');
const cli = path.join(path.dirname(pkgJson), 'bin', 'node-pg-migrate.js');

const result = spawnSync(
  process.execPath,
  [cli, '--migrations-dir', path.resolve(__dirname, '../migrations'), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...env, DATABASE_URL: databaseUrl },
    cwd: path.resolve(__dirname, '..'),
  },
);

process.exit(result.status === null ? 1 : result.status);

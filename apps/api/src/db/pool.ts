import { Pool, type QueryResultRow } from 'pg';
import { config, databaseUrl, isProduction } from '../config.js';

const SLOW_QUERY_MS = 200;

export const pool = new Pool({
  connectionString: databaseUrl(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: isProduction && config.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle postgres client', err);
});

/**
 * Run a parameterised query. Never interpolate values into `text` — pass them
 * as `params` so postgres does the escaping.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const started = Date.now();
  const result = await pool.query<T>(text, params as unknown[]);
  const elapsed = Date.now() - started;

  if (!isProduction && elapsed > SLOW_QUERY_MS) {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    console.warn(`slow query ${elapsed}ms: ${oneLine}`);
  }

  return result.rows;
}

/** Run a query expected to return at most one row. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a transaction, committing on success and rolling back on any
 * thrown error.
 */
export async function withTransaction<T>(
  fn: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDbHealth(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

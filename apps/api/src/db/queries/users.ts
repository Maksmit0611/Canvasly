import type { User } from '@canvas/shared';
import { query, queryOne } from '../pool.js';
import type { UserRow } from '../rows.js';

export const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  avatarUrl: row.avatar_url,
  createdAt: row.created_at.toISOString(),
});

export interface UpsertUserInput {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  oauthProvider: string;
  oauthSubject: string;
}

/**
 * Insert the user on first sign-in, or refresh their profile and login stamp on
 * subsequent ones. Identity is the (provider, subject) pair — not the email,
 * which a user can change at the provider.
 */
export async function upsertUser(input: UpsertUserInput): Promise<User> {
  const row = await queryOne<UserRow>(
    `INSERT INTO users (email, name, avatar_url, oauth_provider, oauth_subject, last_login_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (oauth_provider, oauth_subject) DO UPDATE
       SET email         = EXCLUDED.email,
           name          = EXCLUDED.name,
           avatar_url    = EXCLUDED.avatar_url,
           last_login_at = now()
     RETURNING *`,
    [input.email, input.name, input.avatarUrl, input.oauthProvider, input.oauthSubject],
  );

  if (!row) throw new Error('upsertUser returned no row');
  return toUser(row);
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await queryOne<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return row ? toUser(row) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const row = await queryOne<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  return row ? toUser(row) : null;
}

export async function listUsers(): Promise<User[]> {
  const rows = await query<UserRow>(`SELECT * FROM users ORDER BY created_at DESC`);
  return rows.map(toUser);
}

import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// The monorepo keeps a single .env at the repo root, two levels above apps/api.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const csv = (value: string): string[] =>
  value.split(',').map((s) => s.trim()).filter(Boolean);

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CORS_ORIGINS: z.string().default('http://localhost:5173').transform(csv),

    // Railway injects DATABASE_URL; it wins over the individual DB_* vars.
    DATABASE_URL: z.string().optional(),
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().int().default(5432),
    DB_USER: z.string().default('postgres'),
    DB_PASSWORD: z.string().default('postgres'),
    DB_NAME: z.string().default('canvas'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().default('./uploads'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.STORAGE_DRIVER !== 's3') return;
    for (const key of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
      if (!cfg[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=s3`,
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${lines.join('\n')}\n`);
  console.error('Copy .env.example to .env at the repo root and fill in the missing values.');
  process.exit(1);
}

export const config: Readonly<Config> = Object.freeze(parsed.data);

export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

/** Connection string used by both the pool and node-pg-migrate. */
export const databaseUrl = (): string => {
  if (config.DATABASE_URL) return config.DATABASE_URL;
  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = config;
  const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`;
  return `postgres://${auth}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
};

/**
 * Integration tests run against a real `canvas_test` database, migrated by
 * `npm run test:setup`. Pointing at a separate database means a test run can
 * truncate freely without touching development data.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME ?? 'canvas_test';
process.env.DATABASE_URL = '';

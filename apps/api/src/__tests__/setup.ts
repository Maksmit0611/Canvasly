/**
 * Integration tests run against a real `canvas_test` database, migrated by
 * `npm run test:setup`. Pointing at a separate database means a test run can
 * truncate freely without touching development data.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME ?? 'canvas_test';
process.env.DATABASE_URL = '';

// Enable MCP on the test app so the MCP route's auth and tools can be
// exercised end-to-end. The MCP user is created by the mcp.test.ts suite.
process.env.MCP_TOKEN = 'mcp-test-token-with-plenty-of-entropy';
process.env.MCP_USER_EMAIL = 'mcp-test@example.com';

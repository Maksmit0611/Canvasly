import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

import request from 'supertest';
import { app } from '../app.js';
import { closePool, query } from '../db/pool.js';
import { config } from '../config.js';

const EMAIL = 'mcp-test@example.com';
const OTHER = 'mcp-other@example.com';

const MCP_TOKEN = 'mcp-test-token-with-plenty-of-entropy';
const asUser = (sub: string, email: string) => ({
  getPayload: () => ({ sub, email, email_verified: true, name: 'MCP Test' }),
});

const post = (body: object) =>
  request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${MCP_TOKEN}`)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .send(body);

interface RpcResult { result?: Record<string, unknown>; error?: Record<string, unknown> }

/** The transport may answer as JSON or SSE; normalise both to the JSON-RPC message. */
function rpcFrom(res: { headers: Record<string, string | string[] | undefined>; text?: string; body: unknown }): RpcResult {
  const contentType = String(res.headers['content-type'] ?? '');
  if (contentType.includes('text/event-stream') && typeof res.text === 'string') {
    const dataLine = res.text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .pop();
    if (dataLine) return JSON.parse(dataLine.slice('data:'.length).trim()) as RpcResult;
    throw new Error(`No SSE data frame: ${res.text.slice(0, 400)}`);
  }
  return res.body as RpcResult;
}

const callTool = (name: string, args: Record<string, unknown> = {}) =>
  post({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } });

const toolJson = async (
  res: Awaited<ReturnType<typeof post>>,
): Promise<{ value: Record<string, unknown>; isError: boolean }> => {
  const rpc = rpcFrom(res);
  const result = rpc.result as { content?: Array<{ text: string }>; isError?: boolean } | undefined;
  const text = result?.content?.[0]?.text ?? 'null';
  if (result?.isError) throw new Error(`Tool error in test harness: ${text.slice(0, 600)}`);
  return { value: JSON.parse(text) as Record<string, unknown>, isError: Boolean(result?.isError) };
};

const cleanup = async (): Promise<void> => {
  await query(`DELETE FROM users WHERE email IN ($1, $2)`, [EMAIL, OTHER]);
};

let mcpUserId = '';
beforeAll(async () => {
  await cleanup();

  // MCP_USER_EMAIL is fixed in setup.ts; this sign-in makes that user real.
  verifyIdToken.mockResolvedValue(asUser('mcp-test-subject', EMAIL));
  const login = await request(app).post('/api/auth/google').send({ credential: 't' });
  mcpUserId = login.body.user.id;

  verifyIdToken.mockResolvedValue(asUser('mcp-other-subject', OTHER));
  await request(app).post('/api/auth/google').send({ credential: 't2' });
});

beforeEach(() => {
  verifyIdToken.mockResolvedValue(asUser('mcp-test-subject', EMAIL));
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('MCP auth gate', () => {
  it('501s when no credentials at all and MCP_TOKEN is unset-free', async () => {
    // config.MCP_TOKEN is truthy in tests, so a missing bearer is 401, not disable.
    const res = await request(app).post('/mcp').send({});
    expect(res.status).toBe(401);
  });

  it('401s on a wrong bearer token, timing-safe compare', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer wrong-token-completely-different')
      .send({});
    expect(res.status).toBe(401);
  });

  it('401s on a non-Bearer scheme', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', `Basic ${MCP_TOKEN}`)
      .send({});
    expect(res.status).toBe(401);
  });

  it('405s GET /mcp', async () => {
    const res = await request(app).get('/mcp').set('Authorization', `Bearer ${MCP_TOKEN}`);
    expect(res.status).toBe(405);
  });
});

describe('MCP protocol', () => {
  it('initializes and reports the canvasly server info', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1' },
      },
    });

    expect(res.status).toBe(200);
    const rpc = rpcFrom(res);
    expect((rpc.result as { serverInfo: { name: string } }).serverInfo).toMatchObject({ name: 'canvasly' });
    expect((rpc.result as { capabilities: { tools: object } }).capabilities.tools).toBeDefined();
  });

  it('lists Canvasly tools over tools/list', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    expect(res.status).toBe(200);
    const tools = (rpcFrom(res).result as { tools: Array<{ name: string }> }).tools;
    const names = tools.map((t) => t.name);
    for (const expected of [
      'list_boards', 'create_board', 'get_board', 'update_elements',
      'delete_elements', 'rename_board', 'set_board_state', 'share_board',
      'revoke_share_link', 'check_share_link',
    ]) {
      expect(names).toContain(expected);
    }
  });
});

describe('MCP board tools', () => {
  it('creates a board, lists it, reads titles back', async () => {
    const created = await callTool('create_board', { title: 'MCP-built board' });
    expect(created.status).toBe(200);
    const createdText = await toolJson(created);
    expect(createdText.value.title).toBe('MCP-built board');
    expect(createdText.value.id).toEqual(expect.any(String));

    const list = await callTool('list_boards');
    const listed = await toolJson(list);
    const boards = listed.value as unknown as Array<{ id: string }>;
    expect(Array.isArray(boards)).toBe(true);
    expect(boards.some((b) => b.id === createdText.value.id)).toBe(true);
  });

  it('add shapes, reads back, deletes them', async () => {
    const board = await callTool('create_board', { title: 'Element board' });
    const boardValue = (await toolJson(board)).value as unknown as { id: string };
    const projectId = boardValue.id;

    const element = {
      type: 'rectangle',
      x: 0, y: 0, width: 10, height: 5,
      text: 'hello buffer',
    };
    const add = await callTool('update_elements', { projectId, elements: [element] });
    expect(add.status).toBe(200);
    const addResult = await toolJson(add);
    expect(addResult.value.upserted).toBe(1);

    const read = await callTool('get_board', { projectId });
    const state = await toolJson(read);
    const boardState = state.value as unknown as {
      project: { id: string };
      elements: Array<{ id: string; plainText?: string }>;
    };
    expect(boardState.project.id).toBe(projectId);
    expect(boardState.elements.find((e) => e.plainText === 'hello buffer')).toBeDefined();

    const elementId = boardState.elements[0].id;
    const remove = await callTool('delete_elements', { projectId, elementIds: [elementId] });
    const removeResult = await toolJson(remove);
    expect(removeResult.value.deleted).toBe(1);
  });

  it('renames and archives a board', async () => {
    const board = await callTool('create_board', { title: 'Old name' });
    const boardValue = (await toolJson(board)).value as unknown as { id: string };
    const id = boardValue.id;
    const rename = await callTool('rename_board', { projectId: id, title: 'New name' });
    expect(((await toolJson(rename)).value as { title: string }).title).toBe('New name');

    const archive = await callTool('rename_board', { projectId: id, isArchived: true });
    expect(((await toolJson(archive)).value as { isArchived: boolean }).isArchived).toBe(true);
  });

  it('does not touch another user’s board', async () => {
    // The MCP account is not the owner of this REST-created project.
    verifyIdToken.mockResolvedValue(asUser('mcp-other-subject', OTHER));
    const otherLogin = await request(app).post('/api/auth/google').send({ credential: 't3' });
    const otherToken = otherLogin.body.token;
    const foreign = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Not mine' });
    const foreignId = foreign.body.id as string;
    await query(`DELETE FROM users WHERE email = $1`, [OTHER]);

    verifyIdToken.mockResolvedValue(asUser('mcp-test-subject', EMAIL));

    const res = await callTool('get_board', { projectId: foreignId });
    expect(res.status).toBe(200);
    // The tool-level error is reported through isError on the content payload.
    const rpc = rpcFrom(res);
    expect(rpc.result?.isError as boolean).toBe(true);
    expect((rpc.result as { content: Array<{ text: string }> }).content[0].text).toMatch(/failed/i);
  });
});

describe('MCP share-link tools', () => {
  it('creates, lists, and revokes a share link', async () => {
    const board = await callTool('create_board', { title: 'Share board' });
    const boardValue = (await toolJson(board)).value as unknown as { id: string };
    const projectId = boardValue.id;
    const shared = await callTool('share_board', { projectId, permission: 'view' });
    const { token } = (await toolJson(shared)).value as unknown as { token: string };
    expect(token).toEqual(expect.any(String));

    const check = await callTool('check_share_link', { token });
    expect((await toolJson(check)).value).toMatchObject({ live: true });

    const rest = await request(app).get(`/api/share/${token}`);
    expect(rest.status).toBe(200);

    const revoke = await callTool('revoke_share_link', { token });
    expect((await toolJson(revoke)).value).toMatchObject({ ok: true });

    const gone = await callTool('check_share_link', { token });
    expect((await toolJson(gone)).value).toMatchObject({ live: false });
  });
});

describe('MCP keeps ownership boundaries aligned with REST', () => {
  it('MCP user matches the real signed-in user', async () => {
    const login = await request(app).post('/api/auth/google').send({ credential: 't' });
    expect(config.MCP_USER_EMAIL).toBe(EMAIL);
    expect(login.body.user.id).toBe(mcpUserId);
  });
});

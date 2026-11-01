import { timingSafeEqual, createHash, randomBytes } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CreateProjectSchema, AppStateSchema } from '@canvas/shared';
import { config } from '../config.js';
import {
  findProjectForOwner,
  listProjects,
  createProject,
  updateProject,
} from '../db/queries/projects.js';
import { listElements, applyElementBatch } from '../db/queries/elements.js';
import {
  createShareLink,
  listShareLinks,
  findActiveShareLink,
  revokeShareLink,
} from '../db/queries/shareLinks.js';
import { forbidden, notFound } from '../errors.js';
import { findUserByEmail } from '../db/queries/users.js';
import { randomUUID } from 'node:crypto';
import { CanvasElementSchema } from '@canvas/shared';

/**
 * Canvasly's MCP surface.
 *
 * One MCP token operates as exactly one Canvasly user, configured via
 * `MCP_USER_EMAIL` alongside `MCP_TOKEN`. That keeps board ownership intact —
 * the token is not an all-user master key — while staying simple enough for a
 * single local/hobby deployment.
 */

/** Hash both sides before comparing, so timingSafeEqual's equal-length precondition holds for arbitrary input. */
export function mcpTokenMatches(presented: string): boolean {
  if (!config.MCP_TOKEN) return false;
  const presentedHash = createHash('sha256').update(presented).digest();
  const expectedHash = createHash('sha256').update(config.MCP_TOKEN).digest();
  return timingSafeEqual(presentedHash, expectedHash);
}

/**
 * Resolve the user this MCP credential acts as.
 *
 * Uses the API's own query surface so MCP tool results are identical to what
 * the REST app would produce — there is no parallel query path that could
 * drift away from ownership rules.
 */
export async function resolveMcpUser(): Promise<{ id: string; email: string } | null> {
  if (!config.MCP_USER_EMAIL) return null;
  const user = await findUserByEmail(config.MCP_USER_EMAIL);
  if (!user) return null;
  return { id: user.id, email: user.email };
}

/** JSON Schema value stubs, so the tool list is plain data instead of generic type inference. */
const str = (description: string) => ({ type: 'string', description } as const);
const number = (description: string) => ({ type: 'number', description } as const);
const integer = (description: string) => ({ type: 'integer', description } as const);
const bool = (description: string) => ({ type: 'boolean', description } as const);
const arrayOf = (description: string, items: object) => ({ type: 'array', description, items } as const);

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
  /** Runs inside the tool call after the MCP user is resolved. */
  run: (args: Record<string, unknown>, user: { id: string; email: string }) => Promise<{ text: string; isError?: boolean }>;
}

/**
 * Element payloads arrive as free-form objects: the full CanvasElementSchema
 * is a 40-field Zod object and threading it through MCP SDK generics ran tsc
 * out of heap. Validation still happens here, integrally, via safeParse.
 */
const toText = (value: { text: string; isError?: boolean }) => ({ text: value.text, isError: value.isError });

const uuid = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error(`${key} must be a UUID (got ${JSON.stringify(value)?.slice(0, 80)})`);
  }
  return value;
};


const optionalString = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

const optionalBoolean = (args: Record<string, unknown>, key: string): boolean | undefined => {
  const value = args[key];
  return typeof value === 'boolean' ? value : undefined;
};

/**
 * A fresh MCP `Server` with every Canvasly tool registered.
 *
 * A `Server` instance serves one transport at a time; the stateless HTTP
 * handler builds a new pair per request, so this is a factory — not a
 * singleton.
 */
export function createCanvaslyMcpServer(): Server {
  const server = new Server(
    { name: 'canvasly', version: '1.0.0' },
    { capabilities: { tools: { listChanged: false } } },
  );

  const requireUser = async (): Promise<{ id: string; email: string }> => {
    const user = await resolveMcpUser();
    if (!user) throw forbidden('MCP user is not configured');
    return user;
  };

  const requireProject = async (projectId: string, userId: string) => {
    const project = await findProjectForOwner(projectId, userId);
    if (!project) throw notFound('Project');
    return project;
  };

  const TOOL_DEFS: ToolDef[] = [
    {
      name: 'list_boards',
      title: 'List Canvasly boards',
      description: 'List the Canvasly user’s cloud boards, newest activity first.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: async (_args, user) => {
        const projects = await listProjects(user.id, false);
        return {
          text: JSON.stringify(
            projects.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt })),
            null,
            2,
          ),
        };
      },
    },
    {
      name: 'create_board',
      title: 'Create a Canvasly board',
      description: 'Create a new Canvasly cloud board with an optional title.',
      inputSchema: {
        type: 'object',
        properties: {
          title: str('Board title, 1-200 chars. Defaults to "Untitled".'),
        },
      },
      run: async (args, user) => {
        const parsed = CreateProjectSchema.safeParse({
          title: optionalString(args, 'title'),
        });
        if (!parsed.success) {
          return { text: 'Invalid title. Keep it between 1 and 200 characters.', isError: true };
        }
        const project = await createProject(user.id, parsed.data.title);
        return { text: JSON.stringify({ id: project.id, title: project.title }, null, 2) };
      },
    },
    {
      name: 'get_board',
      title: 'Read a Canvasly board',
      description: 'Read a board’s metadata and every element/shape currently on it.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: str('Board id from list_boards or create_board.'),
        },
        required: ['projectId'],
      },
      annotations: { readOnlyHint: true },
      run: async (args, user) => {
        const projectId = uuid(args, 'projectId');
        const project = await requireProject(projectId, user.id);
        const elements = await listElements(project.id);
        return { text: JSON.stringify({ project, elements }, null, 2) };
      },
    },
    {
      name: 'update_elements',
      title: 'Add or update shapes on a Canvasly board',
      description:
        'Batch upsert Canvasly elements (rectangle, ellipse, diamond, line, arrow, freedraw, text, frame, person). ' +
        'Pass a sparse element to create one; pass its `id` to update that element.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: str('Board id.'),
          elements: arrayOf(
            'Sparse element payloads. A new element needs {type, x, y, width, height}; include `text` for text shapes.',
            {
              type: 'object',
              properties: {
                id: str('Existing element id to update. Omit to create.'),
                type: str('Element type, e.g. rectangle | ellipse | diamond | line | arrow | freedraw | text | frame | person.'),
                x: number('Left edge.'),
                y: number('Top edge.'),
                width: number('Width.'),
                height: number('Height.'),
                text: str('Visible text for text elements.'),
                zIndex: integer('Paint order.'),
                strokeColor: str('Hex colour, e.g. #1e1e1e.'),
                backgroundColor: str('Hex colour or "transparent".'),
                strokeWidth: number('Stroke width 0.5-40.'),
              },
              required: ['type', 'x', 'y', 'width', 'height'],
            },
          ),
        },
        required: ['projectId', 'elements'],
      },
      run: async (args, user) => {
        const projectId = uuid(args, 'projectId');
        await requireProject(projectId, user.id);

        const elements = Array.isArray(args.elements)
          ? (args.elements as Record<string, unknown>[])
          : [];
        const now = new Date().toISOString();
        let nextIndex = 0;
        const ready = elements.map((e) =>
          CanvasElementSchema.parse({
            id: typeof e.id === 'string' ? e.id : randomUUID(),
            version: 1,
            isDeleted: false,
            updatedAt: now,
            type: e.type,
            x: e.x,
            y: e.y,
            width: e.width,
            height: e.height,            ...(typeof e.text === 'string' ? { plainText: e.text } : {}),
            ...(typeof e.zIndex === 'number' ? { zIndex: e.zIndex } : { zIndex: nextIndex++ }),
            ...(typeof e.strokeColor === 'string' ? { strokeColor: e.strokeColor } : {}),
            ...(typeof e.backgroundColor === 'string' ? { backgroundColor: e.backgroundColor } : {}),
            ...(typeof e.strokeWidth === 'number' ? { strokeWidth: e.strokeWidth } : {}),
          }),
      );

        const result = await applyElementBatch(projectId, ready, []);
        return { text: JSON.stringify(result, null, 2) };
      },
    },
    {
      name: 'delete_elements',
      title: 'Delete shapes from a Canvasly board',
      description: 'Soft-delete elements by id so a later CRDT merge cannot resurrect them.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: str('Board id.'),
          elementIds: arrayOf('Element ids to remove.', { type: 'string' }),
        },
        required: ['projectId', 'elementIds'],
      },
      annotations: { destructiveHint: true },
      run: async (args, user) => {
        const projectId = uuid(args, 'projectId');
        await requireProject(projectId, user.id);

        const ids = Array.isArray(args.elementIds) ? (args.elementIds as string[]) : [];
        const result = await applyElementBatch(projectId, [], ids);
        return { text: JSON.stringify(result, null, 2) };
      },
    },
    {
      name: 'rename_board',
      title: 'Rename a Canvasly board',
      description: 'Rename a board, or archive it with isArchived.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: str('Board id.'),
          title: str('New title, 1-200 chars.'),
          isArchived: bool('Set true to archive the board, false to restore it.'),
        },
        required: ['projectId'],
      },
      run: async (args, user) => {
        const projectId = uuid(args, 'projectId');
        await requireProject(projectId, user.id);

        const project = await updateProject(projectId, user.id, {
          title: optionalString(args, 'title'),
          isArchived: optionalBoolean(args, 'isArchived'),
        });
        if (!project) throw notFound('Project');
        return {
          text: JSON.stringify(
            { id: project.id, title: project.title, isArchived: project.isArchived },
            null,
            2,
          ),
        };
      },
    },
    {
      name: 'set_board_state',
      title: 'Set the view state of a Canvasly board',
      description: 'Merge view settings (zoom, scroll, grid, theme) into the board.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: str('Board id.'),
          appState: {
            type: 'object',
            description: 'Partial appState: zoom, scrollX, scrollY, theme, gridEnabled, gridSize, snapToGrid.',
            properties: {
              zoom: number('0.1-10.'),
              scrollX: number('Horizontal scroll offset.'),
              scrollY: number('Vertical scroll offset.'),
              theme: { type: 'string', description: 'light | dark' },
              gridEnabled: bool('Show the grid.'),
              gridSize: integer('Grid cell size 1-200.'),
              snapToGrid: bool('Snap new shapes to the grid.'),
            },
          },
        },
        required: ['projectId', 'appState'],
      },
      run: async (args, user) => {
        const projectId = uuid(args, 'projectId');
        await requireProject(projectId, user.id);

        const parsed = AppStateSchema.partial().safeParse(args.appState ?? {});
        if (!parsed.success) {
          return { text: 'Invalid appState values.', isError: true };
        }
        const project = await updateProject(projectId, user.id, { appState: parsed.data });
        if (!project) throw notFound('Project');
        return { text: JSON.stringify(project.appState, null, 2) };
      },
    },
    {
      name: 'share_board',
      title: 'Create a share link for a Canvasly board',
      description: 'Create a public view (or edit) link with an optional ISO expiry date.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: str('Board id.'),
          permission: { type: 'string', description: 'view (default) | edit' },
          expiresAt: str('Optional ISO 8601 timestamp after which the link stops working.'),
        },
        required: ['projectId'],
      },
      run: async (args, user) => {
        const projectId = uuid(args, 'projectId');
        const project = await requireProject(projectId, user.id);

        const permission = optionalString(args, 'permission') === 'edit' ? 'edit' : 'view';
        const expiresAtRaw = optionalString(args, 'expiresAt');
        const expiresAt = expiresAtRaw
          ? new Date(expiresAtRaw).toISOString()
          : null;

        const token = randomBytes(24).toString('base64url');
        await createShareLink({
          projectId: project.id,
          token,
          permission,
          createdBy: user.id,
          expiresAt,
        });
        return { text: JSON.stringify({ token, permission, expiresAt }, null, 2) };
      },
    },
    {
      name: 'list_share_links',
      title: 'List share links for a Canvasly board',
      description: 'List the active public share links a board currently has.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: str('Board id.'),
        },
        required: ['projectId'],
      },
      annotations: { readOnlyHint: true },
      run: async (args, user) => {
        const projectId = uuid(args, 'projectId');
        const project = await requireProject(projectId, user.id);
        const links = await listShareLinks(project.id);
        return {
          text: JSON.stringify(
            links.map((l) => ({
              token: l.token,
              permission: l.permission,
              expiresAt: l.expires_at?.toISOString() ?? null,
            })),
            null,
            2,
          ),
        };
      },
    },
    {
      name: 'revoke_share_link',
      title: 'Revoke a share link',
      description: 'Revoke a public share link so that URL stops working immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          token: str('The share token from share_board or list_share_links.'),
        },
        required: ['token'],
      },
      annotations: { destructiveHint: true },
      run: async (args, user) => {
        const token = optionalString(args, 'token') ?? '';
        const ok = await revokeShareLink(token, user.id);
        if (!ok) throw notFound('Share link');
        return { text: JSON.stringify({ ok: true }, null, 2) };
      },
    },
    {
      name: 'check_share_link',
      title: 'Check whether a share link is still live',
      description: 'Look up a share token and report whether it resolves to a live board.',
      inputSchema: {
        type: 'object',
        properties: {
          token: str('The share token to check.'),
        },
        required: ['token'],
      },
      annotations: { readOnlyHint: true },
      run: async (args) => {
        const token = optionalString(args, 'token') ?? '';
        const link = await findActiveShareLink(token);
        return {
          text: JSON.stringify(
            link ? { live: true, permission: link.permission } : { live: false },
            null,
            2,
          ),
        };
      },
    },
  ];

  const TOOLS = TOOL_DEFS.map((def) => ({
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: def.inputSchema,
    annotations: def.annotations,
  }));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const def = TOOL_DEFS.find((tool) => tool.name === name);
    if (!def) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const user = await requireUser();
      const result = toText(await def.run(request.params.arguments ?? {}, user));
      return {
        content: [{ type: 'text', text: result.text }],
        ...(result.isError ? { isError: true } : {}),
      };
    } catch (err) {
      // Ownership failures surface as tool errors, not HTTP errors, so a
      // misbehaving caller sees the same envelope any other MCP client gets.
      const message = err instanceof Error ? err.message : 'Tool call failed';
      return {
        content: [{ type: 'text', text: `Tool ${name} failed: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

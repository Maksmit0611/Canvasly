import { Router, type Request, type Response, type NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { mcpTokenMatches, createCanvaslyMcpServer } from './server.js';
import { config } from '../config.js';
import { ApiError } from '../errors.js';

/**
 * MCP over Streamable HTTP, mounted at /mcp.
 *
 * Auth: `Authorization: Bearer $MCP_TOKEN` is checked first, with a
 * timing-safe comparison. Without `MCP_TOKEN` set the whole surface is off.
 *
 * Transport: stateless mode (`sessionIdGenerator: undefined`) so any MCP
 * client — including hosted connectors that hold no sticky session — can talk
 * to it over plain HTTP POSTs. Each request gets a fresh transport and server
 * pair, which keeps concurrent sessions isolated without session affinity.
 */
export const mcpRouter = Router();

/** A bearer credential is required whenever MCP is enabled. */
const requireMcpToken = (req: Request, _res: Response, next: NextFunction): void => {
  if (!config.MCP_TOKEN) {
    next(new ApiError('NOT_IMPLEMENTED', 'MCP is not enabled on this deployment'));
    return;
  }

  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || !mcpTokenMatches(token)) {
    next(new ApiError('UNAUTHENTICATED', 'MCP credentials required'));
    return;
  }

  next();
};

mcpRouter.use(requireMcpToken);

mcpRouter.post('/', async (req, res, next) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    // Stateless mode has no session registry. A follow-up request carrying a
    // stale or invented id has nothing to bind to — reject early instead of
    // letting a caller try to replay a session that never existed.
    if (sessionId && !isInitializeRequest(req.body as never)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'MCP session lookup is not supported' },
      });
      return;
    }

    // Per-request server + transport: one McpServer serves one transport at a
    // time, and stateless mode needs neither to survive the request.
    const server = createCanvaslyMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'INTERNAL', message: 'MCP request failed' } });
    } else {
      next(err);
    }
  }
});

mcpRouter.get('/', (_req, res) => {
  res.status(405).json({ error: { code: 'NOT_IMPLEMENTED', message: 'GET /mcp is not supported (stateless mode)' } });
});

mcpRouter.delete('/', (_req, res) => {
  res.status(405).json({ error: { code: 'NOT_IMPLEMENTED', message: 'DELETE /mcp is a no-op in stateless mode' } });
})

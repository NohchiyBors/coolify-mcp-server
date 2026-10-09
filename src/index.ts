import http from 'node:http';
import { randomUUID } from 'node:crypto';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  isInitializeRequest,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { redactSensitiveData, redactSensitiveText } from './redaction.js';
import { loadEnvironment } from './runtime.js';
import { tools } from './tools.js';

const DEFAULT_HTTP_PORT = 3031;
const DEFAULT_MAX_BODY_KB = 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

type CoolifyConfig = ReturnType<typeof loadConfig>;
type TransportMode = 'stdio' | 'http' | 'streamable-http' | 'both';

function renderResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  return JSON.stringify(result, null, 2);
}

function createMcpServer(config: CoolifyConfig): Server {
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  const server = new Server(
    {
      name: 'coolify-mcp-server',
      version: '0.2.0',
      title: 'Coolify MCP Server',
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      instructions:
        'MCP server for managing Coolify API across one or more configured servers by using the optional server_id argument.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => {
        const inputSchema = { ...tool.inputSchema };
        if (!inputSchema.properties) inputSchema.properties = {};
        inputSchema.properties.server_id = {
          type: 'string',
          description: `Coolify server ID to target. Available servers: ${Object.keys(config.servers).join(', ')}. Defaults to the first available if omitted.`,
        };
        return {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema,
        };
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const requestId = randomUUID();
    const startMs = Date.now();
    const tool = toolMap.get(request.params.name);

    if (!tool) {
      logger.warn('tool_call_unknown_tool', {
        request_id: requestId,
        tool: request.params.name,
      });
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
    }

    try {
      const args = request.params.arguments && typeof request.params.arguments === 'object'
        ? (request.params.arguments as Record<string, unknown>)
        : {};

      const requestedId = typeof args.server_id === 'string' ? args.server_id.trim().toLowerCase() : undefined;
      const serverId = requestedId || config.defaultServerId;
      logger.info('tool_call_started', {
        request_id: requestId,
        tool: request.params.name,
        server_id: serverId,
        args,
      });

      const serverConfig = config.servers[serverId];
      if (!serverConfig) {
        logger.warn('tool_call_unknown_server', {
          request_id: requestId,
          tool: request.params.name,
          server_id: serverId,
        });
        throw new McpError(ErrorCode.InvalidParams, `Unknown server ID: ${serverId}`);
      }

      const result = await tool.handler(serverConfig, args);
      const safeResult = redactSensitiveData(result);
      logger.info('tool_call_finished', {
        request_id: requestId,
        tool: request.params.name,
        server_id: serverId,
        duration_ms: Date.now() - startMs,
        status: result.status,
      });

      return {
        content: [
          {
            type: 'text',
            text: renderResult(safeResult),
          },
        ],
        structuredContent: safeResult,
      };
    } catch (error) {
      logger.error('tool_call_failed', {
        request_id: requestId,
        tool: request.params.name,
        duration_ms: Date.now() - startMs,
        error,
      });
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error
              ? redactSensitiveText(error.message)
              : renderResult(redactSensitiveData(error)),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

function parseTransportMode(value: string | undefined): TransportMode {
  const normalized = (value ?? 'stdio').toLowerCase();
  if (
    normalized === 'stdio' ||
    normalized === 'http' ||
    normalized === 'streamable-http' ||
    normalized === 'both'
  ) {
    return normalized;
  }
  throw new Error(`Unsupported MCP_TRANSPORT: ${value}`);
}

async function readJsonBody(req: http.IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBodyBytes) {
      throw new Error('Payload Too Large');
    }
    chunks.push(buf);
  }

  const raw = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
  return raw ? JSON.parse(raw) : undefined;
}

function isAuthorized(req: http.IncomingMessage, apiKey: string | undefined): boolean {
  if (!apiKey) return true;
  return req.headers.authorization === `Bearer ${apiKey}`;
}

async function startHttp(config: CoolifyConfig): Promise<void> {
  const host = process.env.MCP_HTTP_HOST ?? '127.0.0.1';
  const port = Number.parseInt(process.env.MCP_HTTP_PORT ?? String(DEFAULT_HTTP_PORT), 10);
  const apiKey = process.env.MCP_API_KEY;
  const maxBodyKb = Number.parseInt(process.env.MCP_HTTP_MAX_BODY_KB ?? String(DEFAULT_MAX_BODY_KB), 10);
  const maxBodyBytes = Math.max(1, maxBodyKb) * 1024;

  if (!apiKey && !LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Refusing MCP HTTP bind to non-loopback host ${host} without MCP_API_KEY`);
  }

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    if (!isAuthorized(req, apiKey)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req, maxBodyBytes);
    } catch (error) {
      const status = error instanceof Error && error.message === 'Payload Too Large' ? 413 : 400;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: status === 413 ? 'Payload Too Large' : 'Parse error' }));
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    try {
      let transport = sessionId ? sessions.get(sessionId) : undefined;

      if (!transport && !sessionId && body && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, transport!);
            logger.info('http_session_started', { session_id: sid });
          },
        });
        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid) {
            sessions.delete(sid);
            logger.info('http_session_closed', { session_id: sid });
          }
        };
        await createMcpServer(config).connect(transport);
      }

      if (!transport) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request' }, id: null }));
        return;
      }

      await transport.handleRequest(req, res, body);
    } catch (error) {
      logger.error('http_request_failed', { error });
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      logger.info('server_started', {
        transport: 'streamable-http',
        host,
        port,
        auth: apiKey ? 'bearer' : 'loopback-only',
        tool_count: tools.length,
      });
      resolve();
    });
  });
}

async function startStdio(config: CoolifyConfig): Promise<void> {
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('server_started', { transport: 'stdio', tool_count: tools.length });
}

async function main(): Promise<void> {
  loadEnvironment();
  const config = loadConfig();
  const transportMode = parseTransportMode(process.env.MCP_TRANSPORT);

  if (transportMode === 'http' || transportMode === 'streamable-http') {
    await startHttp(config);
  } else if (transportMode === 'both') {
    await startHttp(config);
    await startStdio(config);
  } else {
    await startStdio(config);
  }
}

main().catch((error) => {
  logger.error('server_crash', { error });
  process.exit(1);
});

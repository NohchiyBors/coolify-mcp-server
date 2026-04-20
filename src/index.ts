import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { tools } from './tools.js';

function renderResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  return JSON.stringify(result, null, 2);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  const server = new Server(
    {
      name: 'coolify-mcp-server',
      version: '0.1.0',
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

      const requestedId = typeof args.server_id === 'string' ? args.server_id : undefined;
      const defaultId = Object.keys(config.servers)[0];
      const serverId = requestedId || defaultId;
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
            text: renderResult(result),
          },
        ],
        structuredContent: result,
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
            text: error instanceof Error ? error.message : renderResult(error),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('server_started', { tool_count: tools.length });
}

main().catch((error) => {
  logger.error('server_crash', { error });
  process.exit(1);
});

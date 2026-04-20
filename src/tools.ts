import type { ServerConfig } from './config.js';
import { callCoolifyApi, type HttpMethod, type ApiCallResult } from './coolify-client.js';

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  description?: string;
  default?: unknown;
  minimum?: number;
  additionalProperties?: boolean | JsonSchema;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (config: ServerConfig, args: Record<string, unknown>) => Promise<ApiCallResult>;
}

type ResourceKind = 'application' | 'service' | 'database';
type ResourceAction = 'start' | 'stop' | 'restart';

const emptySchema: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const uuidSchema: JsonSchema = {
  type: 'object',
  properties: {
    uuid: {
      type: 'string',
      description: 'Resource UUID.',
    },
  },
  required: ['uuid'],
  additionalProperties: false,
};

const readOnlyMethods = new Set<HttpMethod>(['GET', 'HEAD']);
const rawMethods: HttpMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'];
const resourcePathByKind: Record<ResourceKind, string> = {
  application: 'applications',
  service: 'services',
  database: 'databases',
};

function stringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredStringArg(args: Record<string, unknown>, name: string): string {
  const value = stringArg(args, name);

  if (!value) {
    throw new Error(`Argument ${name} is required`);
  }

  return value;
}

function numberArg(args: Record<string, unknown>, name: string): number | undefined {
  const value = args[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Argument ${name} must be a number`);
  }

  return parsed;
}

function booleanArg(args: Record<string, unknown>, name: string): boolean | undefined {
  const value = args[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  throw new Error(`Argument ${name} must be a boolean`);
}

function objectArg(args: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const value = args[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error(`Argument ${name} must be an object`);
}

function enumArg<T extends string>(args: Record<string, unknown>, name: string, allowed: readonly T[]): T {
  const value = requiredStringArg(args, name);

  if (!allowed.includes(value as T)) {
    throw new Error(`Argument ${name} must be one of: ${allowed.join(', ')}`);
  }

  return value as T;
}

function includeDefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export const tools: ToolDefinition[] = [
  {
    name: 'coolify_current_server',
    title: 'Current Coolify server',
    description: 'Returns the selected Coolify server profile id and API base URL. Use server_id to check a specific profile.',
    inputSchema: emptySchema,
    handler: async (config) => ({
      status: 200,
      headers: {},
      data: {
        id: config.id,
        apiBaseUrl: config.apiBaseUrl,
      },
    }),
  },
  {
    name: 'coolify_healthcheck',
    title: 'Coolify healthcheck',
    description: 'Checks the Coolify /health endpoint. This endpoint does not require authentication.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/health', auth: false }),
  },
  {
    name: 'coolify_version',
    title: 'Coolify version',
    description: 'Returns the Coolify version.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/version' }),
  },
  {
    name: 'coolify_list_resources',
    title: 'List Coolify resources',
    description: 'Lists all Coolify resources.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/resources' }),
  },
  {
    name: 'coolify_list_projects',
    title: 'List Coolify projects',
    description: 'Lists all Coolify projects.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/projects' }),
  },
  {
    name: 'coolify_list_servers',
    title: 'List Coolify servers',
    description: 'Lists all Coolify servers.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/servers' }),
  },
  {
    name: 'coolify_list_applications',
    title: 'List Coolify applications',
    description: 'Lists Coolify applications, optionally filtered by tag.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'Optional tag filter.',
        },
      },
      additionalProperties: false,
    },
    handler: (config, args) => callCoolifyApi(config, { path: '/applications', query: includeDefined({ tag: stringArg(args, 'tag') }) }),
  },
  {
    name: 'coolify_get_application',
    title: 'Get Coolify application',
    description: 'Gets a Coolify application by UUID.',
    inputSchema: uuidSchema,
    handler: (config, args) => callCoolifyApi(config, { path: `/applications/${encodeURIComponent(requiredStringArg(args, 'uuid'))}` }),
  },
  {
    name: 'coolify_get_application_logs',
    title: 'Get Coolify application logs',
    description: 'Gets application logs by UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Application UUID.',
        },
        lines: {
          type: 'integer',
          description: 'Number of lines to show from the end of the logs.',
          default: 100,
          minimum: 1,
        },
      },
      required: ['uuid'],
      additionalProperties: false,
    },
    handler: (config, args) =>
      callCoolifyApi(config, {
        path: `/applications/${encodeURIComponent(requiredStringArg(args, 'uuid'))}/logs`,
        query: includeDefined({ lines: numberArg(args, 'lines') }),
      }),
  },
  {
    name: 'coolify_list_services',
    title: 'List Coolify services',
    description: 'Lists all Coolify services.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/services' }),
  },
  {
    name: 'coolify_get_service',
    title: 'Get Coolify service',
    description: 'Gets a Coolify service by UUID.',
    inputSchema: uuidSchema,
    handler: (config, args) => callCoolifyApi(config, { path: `/services/${encodeURIComponent(requiredStringArg(args, 'uuid'))}` }),
  },
  {
    name: 'coolify_list_databases',
    title: 'List Coolify databases',
    description: 'Lists all Coolify databases.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/databases' }),
  },
  {
    name: 'coolify_list_deployments',
    title: 'List Coolify deployments',
    description: 'Lists currently running deployments.',
    inputSchema: emptySchema,
    handler: (config) => callCoolifyApi(config, { path: '/deployments' }),
  },
  {
    name: 'coolify_get_deployment',
    title: 'Get Coolify deployment',
    description: 'Gets a deployment by deployment UUID.',
    inputSchema: uuidSchema,
    handler: (config, args) => callCoolifyApi(config, { path: `/deployments/${encodeURIComponent(requiredStringArg(args, 'uuid'))}` }),
  },
  {
    name: 'coolify_list_application_deployments',
    title: 'List application deployments',
    description: 'Lists deployments for an application UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Application UUID.',
        },
        skip: {
          type: 'integer',
          description: 'Number of records to skip.',
          default: 0,
          minimum: 0,
        },
        take: {
          type: 'integer',
          description: 'Number of records to take.',
          default: 10,
          minimum: 1,
        },
      },
      required: ['uuid'],
      additionalProperties: false,
    },
    handler: (config, args) =>
      callCoolifyApi(config, {
        path: `/deployments/applications/${encodeURIComponent(requiredStringArg(args, 'uuid'))}`,
        query: includeDefined({
          skip: numberArg(args, 'skip'),
          take: numberArg(args, 'take'),
        }),
      }),
  },
  {
    name: 'coolify_deploy',
    title: 'Deploy Coolify resource',
    description: 'Deploys resources by UUID or tag. At least one of uuid or tag is required.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Resource UUID or comma-separated UUIDs.',
        },
        tag: {
          type: 'string',
          description: 'Tag name or comma-separated tags.',
        },
        force: {
          type: 'boolean',
          description: 'Force rebuild without cache.',
        },
        pr: {
          type: 'integer',
          description: 'Pull request ID. Cannot be used with tag.',
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    handler: (config, args) => {
      const uuid = stringArg(args, 'uuid');
      const tag = stringArg(args, 'tag');

      if (!uuid && !tag) {
        throw new Error('At least one of uuid or tag is required');
      }

      if (tag && numberArg(args, 'pr') !== undefined) {
        throw new Error('Argument pr cannot be used with tag');
      }

      return callCoolifyApi(config, {
        path: '/deploy',
        query: includeDefined({
          uuid,
          tag,
          force: booleanArg(args, 'force'),
          pr: numberArg(args, 'pr'),
        }),
      });
    },
  },
  {
    name: 'coolify_control_resource',
    title: 'Control Coolify resource',
    description: 'Starts, stops, or restarts an application, service, or database by UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['application', 'service', 'database'],
          description: 'Resource kind.',
        },
        action: {
          type: 'string',
          enum: ['start', 'stop', 'restart'],
          description: 'Action to run.',
        },
        uuid: {
          type: 'string',
          description: 'Resource UUID.',
        },
        force: {
          type: 'boolean',
          description: 'Application start only: force rebuild.',
        },
        instant_deploy: {
          type: 'boolean',
          description: 'Application start only: skip queuing.',
        },
        latest: {
          type: 'boolean',
          description: 'Service restart only: pull latest images.',
        },
      },
      required: ['kind', 'action', 'uuid'],
      additionalProperties: false,
    },
    handler: (config, args) => {
      const kind = enumArg(args, 'kind', ['application', 'service', 'database']);
      const action = enumArg(args, 'action', ['start', 'stop', 'restart']);
      const uuid = requiredStringArg(args, 'uuid');
      const query =
        kind === 'application' && action === 'start'
          ? includeDefined({ force: booleanArg(args, 'force'), instant_deploy: booleanArg(args, 'instant_deploy') })
          : kind === 'service' && action === 'restart'
            ? includeDefined({ latest: booleanArg(args, 'latest') })
            : {};

      return callCoolifyApi(config, {
        path: `/${resourcePathByKind[kind]}/${encodeURIComponent(uuid)}/${action}`,
        query,
      });
    },
  },
  {
    name: 'coolify_api_request',
    title: 'Raw Coolify API request',
    description: 'Runs a raw request against the configured Coolify /api/v1 base URL. Non-read methods require COOLIFY_ALLOW_RAW_WRITE=true and confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: rawMethods,
          default: 'GET',
          description: 'HTTP method.',
        },
        path: {
          type: 'string',
          description: 'Relative API path, for example /applications.',
        },
        query: {
          type: 'object',
          description: 'Query parameters.',
          additionalProperties: true,
        },
        body: {
          type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
          description: 'JSON body for non-GET requests.',
        },
        confirm: {
          type: 'boolean',
          description: 'Required for write requests.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    handler: (config, args) => {
      const methodValue = stringArg(args, 'method') ?? 'GET';

      if (!rawMethods.includes(methodValue as HttpMethod)) {
        throw new Error(`Argument method must be one of: ${rawMethods.join(', ')}`);
      }

      const method = methodValue as HttpMethod;

      if (!readOnlyMethods.has(method) && (!config.allowRawWrite || booleanArg(args, 'confirm') !== true)) {
        throw new Error('Raw write requests require COOLIFY_ALLOW_RAW_WRITE=true and confirm=true');
      }

      return callCoolifyApi(config, {
        method,
        path: requiredStringArg(args, 'path'),
        query: objectArg(args, 'query'),
        body: args.body,
      });
    },
  },
];

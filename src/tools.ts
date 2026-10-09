import type { ServerConfig } from './config.js';
import { randomBytes } from 'node:crypto';
import { callCoolifyApi, CoolifyApiError, type HttpMethod, type ApiCallResult } from './coolify-client.js';

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  oneOf?: JsonSchema[];
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

const emptySchema: JsonSchema = { type: 'object', properties: {}, additionalProperties: false };
const uuidSchema: JsonSchema = {
  type: 'object',
  properties: { uuid: { type: 'string', description: 'Resource UUID.' } },
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
  const v = args[name]; return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function requiredStringArg(args: Record<string, unknown>, name: string): string {
  const v = stringArg(args, name); if (!v) throw new Error(`Argument ${name} is required`); return v;
}
function numberArg(args: Record<string, unknown>, name: string): number | undefined {
  const v = args[name]; if (v === undefined || v === null) return undefined;
  const p = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(p)) throw new Error(`Argument ${name} must be a number`); return p;
}
function booleanArg(args: Record<string, unknown>, name: string): boolean | undefined {
  const v = args[name]; if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const n = v.trim().toLowerCase();
    if (['true','1','yes','on'].includes(n)) return true;
    if (['false','0','no','off'].includes(n)) return false;
  }
  throw new Error(`Argument ${name} must be a boolean`);
}
function objectArg(args: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const v = args[name]; if (v === undefined || v === null) return undefined;
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new Error(`Argument ${name} must be an object`);
}
function enumArg<T extends string>(args: Record<string, unknown>, name: string, allowed: readonly T[]): T {
  const v = requiredStringArg(args, name);
  if (!allowed.includes(v as T)) throw new Error(`Argument ${name} must be one of: ${allowed.join(', ')}`);
  return v as T;
}
function includeDefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}
function requireConfirm(args: Record<string, unknown>, name: string): void {
  if (booleanArg(args, 'confirm') !== true) {
    throw new Error(`${name}: confirm=true is required to perform this write`);
  }
}

const logProperties: Record<string, JsonSchema> = {
  uuid: { type: 'string', description: 'Resource UUID.' },
  lines: {
    description: 'Lines from the end: 1–10000, -1, or "all". "all" requires Coolify 4.3.20+. Omit for the API default of 100.',
    oneOf: [
      { type: 'integer', minimum: 1, maximum: 10000 },
      { type: 'integer', enum: [-1] },
      { type: 'string', enum: ['all'] },
    ],
  },
  show_timestamps: { type: 'boolean', description: 'Include timestamps in the logs.' },
};

function logQuery(args: Record<string, unknown>): Record<string, unknown> {
  const lines = args.lines;
  if (lines !== undefined && lines !== 'all' &&
      !(typeof lines === 'number' && Number.isInteger(lines) && (lines === -1 || (lines >= 1 && lines <= 10000)))) {
    throw new Error('Argument lines must be an integer from 1 to 10000, -1, or "all"');
  }
  return includeDefined({ lines, show_timestamps: booleanArg(args, 'show_timestamps') });
}

function makeLogTool(name: string, title: string, path: (uuid: string) => string): ToolDefinition {
  return {
    name, title, description: 'Gets runtime logs. Supports lines and show_timestamps; full-log requests may produce large responses.',
    inputSchema: { type: 'object', properties: logProperties, required: ['uuid'], additionalProperties: false },
    handler: (cfg, args) => callCoolifyApi(cfg, {
      path: path(encodeURIComponent(requiredStringArg(args, 'uuid'))), query: logQuery(args),
    }),
  };
}

function makeCurrentTeamTool(name: string, title: string, suffix: string): ToolDefinition {
  return {
    name, title, description: 'Reads the API token team using /team, with a 404-only fallback for older Coolify versions.', inputSchema: emptySchema,
    handler: async (cfg) => {
      try {
        return await callCoolifyApi(cfg, { path: `/team${suffix}` });
      } catch (error) {
        if (!(error instanceof CoolifyApiError) || error.status !== 404) throw error;
        return callCoolifyApi(cfg, { path: `/teams/current${suffix}` });
      }
    },
  };
}

// ─── Schema builders for write tools ─────────────────────────────────────────
function bodyOnlySchema(bodyDoc: string): JsonSchema {
  return {
    type: 'object',
    properties: {
      body: { type: 'object', additionalProperties: true, description: bodyDoc },
      confirm: { type: 'boolean', description: 'Must be true to perform the write.' },
    },
    required: ['body', 'confirm'],
    additionalProperties: false,
  };
}
function uuidBodySchema(bodyDoc: string): JsonSchema {
  return {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Parent resource UUID.' },
      body: { type: 'object', additionalProperties: true, description: bodyDoc },
      confirm: { type: 'boolean', description: 'Must be true to perform the write.' },
    },
    required: ['uuid', 'body', 'confirm'],
    additionalProperties: false,
  };
}
const uuidDeleteSchema: JsonSchema = {
  type: 'object',
  properties: {
    uuid: { type: 'string', description: 'Resource UUID.' },
    confirm: { type: 'boolean', description: 'Must be true to perform the deletion.' },
  },
  required: ['uuid', 'confirm'],
  additionalProperties: false,
};

// ─── Tool builders ───────────────────────────────────────────────────────────
function makeListTool(name: string, title: string, description: string, path: string): ToolDefinition {
  return { name, title, description, inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path }) };
}
function makeGetByUuidTool(name: string, title: string, description: string, pathFn: (u: string) => string): ToolDefinition {
  return { name, title, description, inputSchema: uuidSchema,
    handler: (cfg, args) => callCoolifyApi(cfg, { path: pathFn(encodeURIComponent(requiredStringArg(args, 'uuid'))) }) };
}
function makeListByUuidTool(name: string, title: string, description: string, pathFn: (u: string) => string): ToolDefinition {
  return { name, title, description, inputSchema: uuidSchema,
    handler: (cfg, args) => callCoolifyApi(cfg, { path: pathFn(encodeURIComponent(requiredStringArg(args, 'uuid'))) }) };
}
function makeCreateBodyTool(name: string, title: string, description: string, path: string, bodyDoc: string): ToolDefinition {
  return { name, title, description, inputSchema: bodyOnlySchema(bodyDoc),
    handler: (cfg, args) => {
      requireConfirm(args, name);
      return callCoolifyApi(cfg, { method: 'POST', path, body: objectArg(args, 'body') ?? {} });
    } };
}
function makeCreateByUuidBodyTool(name: string, title: string, description: string, pathFn: (u: string) => string, bodyDoc: string): ToolDefinition {
  return { name, title, description, inputSchema: uuidBodySchema(bodyDoc),
    handler: (cfg, args) => {
      requireConfirm(args, name);
      return callCoolifyApi(cfg, {
        method: 'POST',
        path: pathFn(encodeURIComponent(requiredStringArg(args, 'uuid'))),
        body: objectArg(args, 'body') ?? {},
      });
    } };
}
function makeUpdateByUuidBodyTool(name: string, title: string, description: string, pathFn: (u: string) => string, bodyDoc: string): ToolDefinition {
  return { name, title, description, inputSchema: uuidBodySchema(bodyDoc),
    handler: (cfg, args) => {
      requireConfirm(args, name);
      return callCoolifyApi(cfg, {
        method: 'PATCH',
        path: pathFn(encodeURIComponent(requiredStringArg(args, 'uuid'))),
        body: objectArg(args, 'body') ?? {},
      });
    } };
}
function makeDeleteByUuidTool(name: string, title: string, description: string, pathFn: (u: string) => string): ToolDefinition {
  return { name, title, description, inputSchema: uuidDeleteSchema,
    handler: (cfg, args) => {
      if (booleanArg(args, 'confirm') !== true) throw new Error(`${name}: confirm=true is required to delete this resource`);
      return callCoolifyApi(cfg, { method: 'DELETE', path: pathFn(encodeURIComponent(requiredStringArg(args, 'uuid'))) });
    } };
}
function makeDeleteChildByUuidTool(
  name: string, title: string, description: string,
  pathFn: (parent: string, child: string) => string, childKey: string,
): ToolDefinition {
  return {
    name, title, description,
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Parent resource UUID.' },
        [childKey]: { type: 'string', description: 'Child resource UUID to delete.' },
        confirm: { type: 'boolean', description: 'Must be true to perform the deletion.' },
      },
      required: ['uuid', childKey, 'confirm'],
      additionalProperties: false,
    },
    handler: (cfg, args) => {
      if (booleanArg(args, 'confirm') !== true) throw new Error(`${name}: confirm=true is required`);
      return callCoolifyApi(cfg, {
        method: 'DELETE',
        path: pathFn(
          encodeURIComponent(requiredStringArg(args, 'uuid')),
          encodeURIComponent(requiredStringArg(args, childKey)),
        ),
      });
    },
  };
}

// ─── Existing 18 tools ───────────────────────────────────────────────────────
const baseTools: ToolDefinition[] = [
  {
    name: 'coolify_current_server', title: 'Current Coolify server',
    description: 'Returns the selected Coolify server profile id, API base URL, and configured external/local IP metadata. IP fields do not change API routing.',
    inputSchema: emptySchema,
    handler: async (cfg) => ({
      status: 200,
      headers: {},
      data: {
        id: cfg.id,
        apiBaseUrl: cfg.apiBaseUrl,
        externalIp: cfg.externalIp ?? null,
        localIp: cfg.localIp ?? null,
      },
    }),
  },
  { name: 'coolify_healthcheck', title: 'Coolify healthcheck',
    description: 'Checks /health. Does not require auth.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/health', auth: false }) },
  { name: 'coolify_version', title: 'Coolify version',
    description: 'Returns the Coolify version.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/version' }) },
  { name: 'coolify_list_resources', title: 'List resources',
    description: 'Lists all Coolify resources.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/resources' }) },
  { name: 'coolify_list_projects', title: 'List projects',
    description: 'Lists all Coolify projects.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/projects' }) },
  { name: 'coolify_list_servers', title: 'List servers',
    description: 'Lists all Coolify servers.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/servers' }) },
  {
    name: 'coolify_list_applications', title: 'List applications',
    description: 'Lists Coolify applications, optionally filtered by tag.',
    inputSchema: { type: 'object',
      properties: { tag: { type: 'string', description: 'Optional tag filter.' } },
      additionalProperties: false },
    handler: (cfg, args) => callCoolifyApi(cfg, { path: '/applications', query: includeDefined({ tag: stringArg(args, 'tag') }) }),
  },
  { name: 'coolify_get_application', title: 'Get application',
    description: 'Gets an application by UUID.', inputSchema: uuidSchema,
    handler: (cfg, args) => callCoolifyApi(cfg, { path: `/applications/${encodeURIComponent(requiredStringArg(args, 'uuid'))}` }) },
  makeLogTool('coolify_get_application_logs', 'Get application logs', (u) => `/applications/${u}/logs`),
  makeLogTool('coolify_get_database_logs', 'Get database logs', (u) => `/databases/${u}/logs`),
  {
    name: 'coolify_get_preview_application_logs', title: 'Get preview application logs',
    description: 'Gets runtime logs for a running application preview by pull request ID. Requires Coolify 4.3.23+; these are not build logs.',
    inputSchema: { type: 'object', properties: {
      ...logProperties, pull_request_id: { type: 'integer', minimum: 1, description: 'Pull request ID.' },
    }, required: ['uuid', 'pull_request_id'], additionalProperties: false },
    handler: (cfg, args) => {
      const pr = args.pull_request_id;
      if (typeof pr !== 'number' || !Number.isSafeInteger(pr) || pr < 1) throw new Error('Argument pull_request_id must be a positive integer');
      return callCoolifyApi(cfg, {
        path: `/applications/${encodeURIComponent(requiredStringArg(args, 'uuid'))}/previews/${pr}/logs`, query: logQuery(args),
      });
    },
  },
  {
    ...makeLogTool('coolify_get_service_logs', 'Get service logs', (u) => `/services/${u}/logs`),
    inputSchema: { type: 'object', properties: {
      ...logProperties, sub_service_name: { type: 'string', description: 'Required name of a service application/database, from coolify_get_service.' },
    }, required: ['uuid', 'sub_service_name'], additionalProperties: false },
    handler: (cfg, args) => callCoolifyApi(cfg, {
      path: `/services/${encodeURIComponent(requiredStringArg(args, 'uuid'))}/logs`,
      query: includeDefined({ ...logQuery(args), sub_service_name: requiredStringArg(args, 'sub_service_name') }),
    }),
  },
  { name: 'coolify_list_services', title: 'List services',
    description: 'Lists all Coolify services.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/services' }) },
  { name: 'coolify_get_service', title: 'Get service',
    description: 'Gets a service by UUID.', inputSchema: uuidSchema,
    handler: (cfg, args) => callCoolifyApi(cfg, { path: `/services/${encodeURIComponent(requiredStringArg(args, 'uuid'))}` }) },
  { name: 'coolify_list_databases', title: 'List databases',
    description: 'Lists all Coolify databases.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/databases' }) },
  { name: 'coolify_list_deployments', title: 'List deployments',
    description: 'Lists currently running deployments.', inputSchema: emptySchema,
    handler: (cfg) => callCoolifyApi(cfg, { path: '/deployments' }) },
  { name: 'coolify_get_deployment', title: 'Get deployment',
    description: 'Gets a deployment by UUID.', inputSchema: uuidSchema,
    handler: (cfg, args) => callCoolifyApi(cfg, { path: `/deployments/${encodeURIComponent(requiredStringArg(args, 'uuid'))}` }) },
  {
    name: 'coolify_list_application_deployments', title: 'List application deployments',
    description: 'Lists deployments for an application UUID.',
    inputSchema: { type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Application UUID.' },
        skip: { type: 'integer', description: 'Records to skip.', default: 0, minimum: 0 },
        take: { type: 'integer', description: 'Records to take.', default: 10, minimum: 1 },
      },
      required: ['uuid'], additionalProperties: false },
    handler: (cfg, args) => callCoolifyApi(cfg, {
      path: `/deployments/applications/${encodeURIComponent(requiredStringArg(args, 'uuid'))}`,
      query: includeDefined({ skip: numberArg(args, 'skip'), take: numberArg(args, 'take') }),
    }),
  },
  {
    name: 'coolify_deploy', title: 'Deploy resource',
    description: 'Deploys resources by UUID or tag. At least one of uuid or tag is required.',
    inputSchema: { type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Resource UUID or comma-separated UUIDs.' },
        tag: { type: 'string', description: 'Tag name or comma-separated tags.' },
        force: { type: 'boolean', description: 'Force rebuild without cache.' },
        pr: { type: 'integer', description: 'Pull request ID. Cannot be used with tag.', minimum: 1 },
      },
      additionalProperties: false },
    handler: (cfg, args) => {
      const uuid = stringArg(args, 'uuid'); const tag = stringArg(args, 'tag');
      if (!uuid && !tag) throw new Error('At least one of uuid or tag is required');
      if (tag && numberArg(args, 'pr') !== undefined) throw new Error('Argument pr cannot be used with tag');
      return callCoolifyApi(cfg, { method: 'POST', path: '/deploy',
        query: includeDefined({ uuid, tag, force: booleanArg(args, 'force'), pr: numberArg(args, 'pr') }) });
    },
  },
  {
    name: 'coolify_control_resource', title: 'Control resource',
    description: 'Starts, stops, or restarts an application, service, or database by UUID.',
    inputSchema: { type: 'object',
      properties: {
        kind: { type: 'string', enum: ['application','service','database'], description: 'Resource kind.' },
        action: { type: 'string', enum: ['start','stop','restart'], description: 'Action.' },
        uuid: { type: 'string', description: 'Resource UUID.' },
        force: { type: 'boolean', description: 'Application start only: force rebuild.' },
        instant_deploy: { type: 'boolean', description: 'Application start only: skip queueing.' },
        latest: { type: 'boolean', description: 'Service restart only: pull latest images.' },
      },
      required: ['kind','action','uuid'], additionalProperties: false },
    handler: (cfg, args) => {
      const kind = enumArg(args, 'kind', ['application','service','database']);
      const action = enumArg(args, 'action', ['start','stop','restart']);
      const uuid = requiredStringArg(args, 'uuid');
      const query =
        kind === 'application' && action === 'start'
          ? includeDefined({ force: booleanArg(args, 'force'), instant_deploy: booleanArg(args, 'instant_deploy') })
          : kind === 'service' && action === 'restart'
            ? includeDefined({ latest: booleanArg(args, 'latest') })
            : {};
      return callCoolifyApi(cfg, { method: 'POST', path: `/${resourcePathByKind[kind]}/${encodeURIComponent(uuid)}/${action}`, query });
    },
  },
  {
    name: 'coolify_api_request', title: 'Raw API request',
    description: 'Runs a raw request against the configured Coolify /api/v1 base URL. Non-read methods require COOLIFY_ALLOW_RAW_WRITE=true and confirm=true.',
    inputSchema: { type: 'object',
      properties: {
        method: { type: 'string', enum: rawMethods, default: 'GET', description: 'HTTP method.' },
        path: { type: 'string', description: 'Relative API path, e.g. /applications.' },
        query: { type: 'object', description: 'Query parameters.', additionalProperties: true },
        body: { type: ['object','array','string','number','boolean','null'], description: 'JSON body for non-GET requests.' },
        confirm: { type: 'boolean', description: 'Required for write requests.' },
      },
      required: ['path'], additionalProperties: false },
    handler: (cfg, args) => {
      const methodValue = stringArg(args, 'method') ?? 'GET';
      if (!rawMethods.includes(methodValue as HttpMethod)) {
        throw new Error(`Argument method must be one of: ${rawMethods.join(', ')}`);
      }
      const method = methodValue as HttpMethod;
      if (!readOnlyMethods.has(method) && (!cfg.allowRawWrite || booleanArg(args, 'confirm') !== true)) {
        throw new Error('Raw write requests require COOLIFY_ALLOW_RAW_WRITE=true and confirm=true');
      }
      return callCoolifyApi(cfg, {
        method, path: requiredStringArg(args, 'path'),
        query: objectArg(args, 'query'), body: args.body,
      });
    },
  },
];

// ─── Body docs ───────────────────────────────────────────────────────────────
const applicationCreateBody =
  'Required: project_uuid, environment_name (or environment_uuid), server_uuid, git_repository, git_branch, ports_exposes. Optional: name, description, build_pack, instant_deploy, base_directory, publish_directory, dockerfile_location, docker_compose_location, install_command, build_command, start_command, custom_labels, ...';
const serviceCreateBody =
  'Required: type (one-click app slug, e.g. wordpress-with-mysql, n8n, directus), project_uuid, environment_name, server_uuid. Optional: name, description, instant_deploy, ...';
const databaseCreateBody =
  'Required: project_uuid, environment_name (or environment_uuid), server_uuid, name. Optional: description, image, public_port, postgres_user, postgres_password, postgres_db, ... (fields depend on type)';

// ─── Applications CRUD + envs ────────────────────────────────────────────────
const applicationCrudTools: ToolDefinition[] = [
  makeCreateBodyTool('coolify_create_application_public',
    'Create application from public Git repo', 'Creates an application from a public Git repository. Requires confirm=true.',
    '/applications/public', applicationCreateBody),
  makeCreateBodyTool('coolify_create_application_private_github_app',
    'Create application from private GitHub app', 'Creates an application using a configured private GitHub app. Required also: github_app_uuid. Requires confirm=true.',
    '/applications/private-github-app', applicationCreateBody + ', github_app_uuid'),
  makeCreateBodyTool('coolify_create_application_private_deploy_key',
    'Create application from private deploy key', 'Creates an application via private repository accessed by a deploy key. Required also: private_key_uuid. Requires confirm=true.',
    '/applications/private-deploy-key', applicationCreateBody + ', private_key_uuid'),
  makeCreateBodyTool('coolify_create_application_dockerfile',
    'Create application from Dockerfile', 'Creates an application from a Dockerfile string. Requires confirm=true.',
    '/applications/dockerfile',
    'Required: project_uuid, environment_name, server_uuid, dockerfile (string), ports_exposes. Optional: instant_deploy, name, description, ...'),
  {
    ...makeCreateBodyTool('coolify_create_application_dockercompose',
      'Create legacy Docker Compose application (Coolify 4.0 only)',
      'Legacy application endpoint removed in Coolify 4.1. For current Coolify use coolify_create_service_dockercompose, which creates a service. Requires confirm=true.',
      '/applications/dockercompose', 'Legacy API body; docker_compose_raw must be base64 encoded.'),
    handler: async (cfg, args) => {
      requireConfirm(args, 'coolify_create_application_dockercompose');
      const body = objectArg(args, 'body');
      if (!body) throw new Error('Argument body is required');
      const result = await callCoolifyApi(cfg, { path: '/version' });
      const version = typeof result.data === 'string' ? result.data :
        typeof result.data === 'object' && result.data !== null ? (result.data as Record<string, unknown>).version : undefined;
      if (typeof version !== 'string' || !/^v?4\.0\.\d+(?:[-+].*)?$/.test(version.trim())) {
        throw new Error('Legacy Docker Compose application creation requires Coolify 4.0. Use coolify_create_service_dockercompose to create a compose service on current Coolify. No resource was created.');
      }
      return callCoolifyApi(cfg, { method: 'POST', path: '/applications/dockercompose', body });
    },
  },
  makeCreateBodyTool('coolify_create_application_dockerimage',
    'Create application from a Docker image', 'Creates an application from an existing Docker image. Requires confirm=true.',
    '/applications/dockerimage',
    'Required: project_uuid, environment_name, server_uuid, docker_registry_image_name, ports_exposes. Optional: docker_registry_image_tag, instant_deploy, name, description, ...'),
  makeUpdateByUuidBodyTool('coolify_update_application',
    'Update application', 'Updates fields of an application. Requires confirm=true.',
    (u) => `/applications/${u}`, 'Any updatable application fields.'),
  makeDeleteByUuidTool('coolify_delete_application',
    'Delete application', 'Deletes an application. Requires confirm=true.',
    (u) => `/applications/${u}`),
  {
    name: 'coolify_execute_application_command',
    title: 'Unavailable: execute command in container',
    description: 'Compatibility placeholder: Coolify 4.0/4.3.23 have no supported API endpoint for arbitrary container commands. Always returns an error without executing anything. Use the Coolify terminal or separately authorized saved SSH access.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Application UUID.' },
        command: { type: 'string', description: 'Shell command to run.' },
        confirm: { type: 'boolean', description: 'Must be true to execute the command.' },
      },
      required: ['uuid', 'command', 'confirm'],
      additionalProperties: false,
    },
    handler: async (_cfg, args) => {
      requireConfirm(args, 'coolify_execute_application_command');
      throw new Error('Coolify has no supported API endpoint for arbitrary container commands. Use the Coolify terminal or separately authorized saved SSH access. No command was executed.');
    },
  },
  makeListByUuidTool('coolify_list_application_envs',
    'List application env vars', 'Lists env vars for an application UUID.',
    (u) => `/applications/${u}/envs`),
  makeCreateByUuidBodyTool('coolify_create_application_env',
    'Create application env var', 'Creates one env var on an application. Requires confirm=true.',
    (u) => `/applications/${u}/envs`,
    'Required: key, value. Optional: is_preview, is_build_time, is_literal, is_multiline, is_shown_once.'),
  makeUpdateByUuidBodyTool('coolify_update_application_env',
    'Update application env var', 'Updates one env var on an application (matched by key). Requires confirm=true.',
    (u) => `/applications/${u}/envs`,
    'Required: key, value. Optional: is_preview, is_build_time, is_literal, is_multiline, is_shown_once.'),
  makeUpdateByUuidBodyTool('coolify_update_application_envs_bulk',
    'Bulk update application env vars', 'Bulk-updates env vars on an application. Body: { data: [{ key, value, ... }] }. Requires confirm=true.',
    (u) => `/applications/${u}/envs/bulk`, 'Required: data (array).'),
  makeDeleteChildByUuidTool('coolify_delete_application_env',
    'Delete application env var', 'Deletes one env var on an application. Requires confirm=true.',
    (a, e) => `/applications/${a}/envs/${e}`, 'env_uuid'),
];

// ─── Services CRUD + envs ────────────────────────────────────────────────────
const serviceCrudTools: ToolDefinition[] = [
  {
    ...makeCreateBodyTool('coolify_create_service_dockercompose', 'Create Docker Compose service',
      'Creates a service via POST /services. body.docker_compose_raw is plain UTF-8 YAML; MCP encodes it as base64. Requires confirm=true. Does not deploy unless instant_deploy=true.',
      '/services', 'Required: project_uuid, server_uuid, environment_name or environment_uuid, docker_compose_raw (plain UTF-8 YAML, not base64). Optional: name, description, destination_uuid, urls, tags, instant_deploy.'),
    handler: (cfg, args) => {
      requireConfirm(args, 'coolify_create_service_dockercompose');
      const body = objectArg(args, 'body');
      if (!body) throw new Error('Argument body is required');
      if (body.type !== undefined) throw new Error('Compose service creation does not accept type; use coolify_create_service for templates');
      requiredStringArg(body, 'project_uuid'); requiredStringArg(body, 'server_uuid');
      if (!stringArg(body, 'environment_name') && !stringArg(body, 'environment_uuid')) throw new Error('Provide environment_name or environment_uuid');
      const compose = body.docker_compose_raw;
      if (typeof compose !== 'string' || !compose.trim()) throw new Error('body.docker_compose_raw must contain plain UTF-8 Compose YAML');
      return callCoolifyApi(cfg, { method: 'POST', path: '/services', body: {
        ...body, docker_compose_raw: Buffer.from(compose, 'utf8').toString('base64'),
      } });
    },
  },
  makeCreateBodyTool('coolify_create_service',
    'Create service from one-click template', 'Creates a one-click service. Requires confirm=true.',
    '/services', serviceCreateBody),
  makeUpdateByUuidBodyTool('coolify_update_service',
    'Update service', 'Updates a service. Requires confirm=true.',
    (u) => `/services/${u}`, 'Any updatable service fields.'),
  makeDeleteByUuidTool('coolify_delete_service',
    'Delete service', 'Deletes a service. Requires confirm=true.', (u) => `/services/${u}`),
  makeListByUuidTool('coolify_list_service_envs',
    'List service env vars', 'Lists env vars for a service UUID.', (u) => `/services/${u}/envs`),
  makeCreateByUuidBodyTool('coolify_create_service_env',
    'Create service env var', 'Creates one env var on a service. Requires confirm=true.',
    (u) => `/services/${u}/envs`,
    'Required: key, value. Optional: is_preview, is_build_time, is_literal, is_multiline, is_shown_once.'),
  makeUpdateByUuidBodyTool('coolify_update_service_env',
    'Update service env var', 'Updates one env var on a service. Requires confirm=true.',
    (u) => `/services/${u}/envs`, 'Required: key, value.'),
  makeUpdateByUuidBodyTool('coolify_update_service_envs_bulk',
    'Bulk update service env vars', 'Bulk-updates env vars on a service. Requires confirm=true.',
    (u) => `/services/${u}/envs/bulk`, 'Required: data (array).'),
  makeDeleteChildByUuidTool('coolify_delete_service_env',
    'Delete service env var', 'Deletes one env var on a service. Requires confirm=true.',
    (s, e) => `/services/${s}/envs/${e}`, 'env_uuid'),
];

// ─── Databases CRUD ──────────────────────────────────────────────────────────
const databaseCrudTools: ToolDefinition[] = [
  makeGetByUuidTool('coolify_get_database', 'Get database', 'Gets a database by UUID.', (u) => `/databases/${u}`),
  makeCreateBodyTool('coolify_create_database_postgresql', 'Create PostgreSQL database', 'Creates a PostgreSQL database. Requires confirm=true.', '/databases/postgresql', databaseCreateBody),
  makeCreateBodyTool('coolify_create_database_clickhouse', 'Create ClickHouse database', 'Creates a ClickHouse database. Requires confirm=true.', '/databases/clickhouse', databaseCreateBody),
  makeCreateBodyTool('coolify_create_database_dragonfly', 'Create Dragonfly database', 'Creates a Dragonfly database. Requires confirm=true.', '/databases/dragonfly', databaseCreateBody),
  makeCreateBodyTool('coolify_create_database_redis',     'Create Redis database',      'Creates a Redis database. Requires confirm=true.',      '/databases/redis',      databaseCreateBody),
  makeCreateBodyTool('coolify_create_database_keydb',     'Create KeyDB database',      'Creates a KeyDB database. Requires confirm=true.',      '/databases/keydb',      databaseCreateBody),
  makeCreateBodyTool('coolify_create_database_mariadb',   'Create MariaDB database',    'Creates a MariaDB database. Requires confirm=true.',    '/databases/mariadb',    databaseCreateBody),
  makeCreateBodyTool('coolify_create_database_mysql',     'Create MySQL database',      'Creates a MySQL database. Requires confirm=true.',      '/databases/mysql',      databaseCreateBody),
  makeCreateBodyTool('coolify_create_database_mongodb',   'Create MongoDB database',    'Creates a MongoDB database. Requires confirm=true.',    '/databases/mongodb',    databaseCreateBody),
  makeUpdateByUuidBodyTool('coolify_update_database', 'Update database', 'Updates fields on a database. Requires confirm=true.', (u) => `/databases/${u}`, 'Any updatable database fields.'),
  makeDeleteByUuidTool('coolify_delete_database', 'Delete database', 'Deletes a database. Requires confirm=true.', (u) => `/databases/${u}`),
];

// ─── Projects ────────────────────────────────────────────────────────────────
const projectCrudTools: ToolDefinition[] = [
  makeGetByUuidTool('coolify_get_project', 'Get project', 'Gets a project by UUID.', (u) => `/projects/${u}`),
  makeCreateBodyTool('coolify_create_project', 'Create project',
    'Creates a project. Requires confirm=true.', '/projects',
    'Required: name. Optional: description.'),
  makeUpdateByUuidBodyTool('coolify_update_project', 'Update project',
    'Updates a project. Requires confirm=true.', (u) => `/projects/${u}`,
    'Optional: name, description.'),
  makeDeleteByUuidTool('coolify_delete_project', 'Delete project',
    'Deletes a project. Requires confirm=true.', (u) => `/projects/${u}`),
  {
    name: 'coolify_get_project_environment', title: 'Get project environment',
    description: 'Gets a single environment within a project.',
    inputSchema: { type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Project UUID.' },
        environment_name_or_uuid: { type: 'string', description: 'Environment name or UUID.' },
      },
      required: ['uuid', 'environment_name_or_uuid'], additionalProperties: false },
    handler: (cfg, args) => callCoolifyApi(cfg, {
      path: `/projects/${encodeURIComponent(requiredStringArg(args, 'uuid'))}/${encodeURIComponent(requiredStringArg(args, 'environment_name_or_uuid'))}`,
    }),
  },
];

// ─── Servers ─────────────────────────────────────────────────────────────────
const serverCrudTools: ToolDefinition[] = [
  makeGetByUuidTool('coolify_get_server', 'Get server', 'Gets a server by UUID.', (u) => `/servers/${u}`),
  makeCreateBodyTool('coolify_create_server', 'Create server',
    'Registers a new server. Requires confirm=true.', '/servers',
    'Required: name, ip, private_key_uuid. Optional: port, user, description, is_build_server, instant_validate.'),
  makeUpdateByUuidBodyTool('coolify_update_server', 'Update server',
    'Updates a server. Requires confirm=true.', (u) => `/servers/${u}`, 'Any updatable server fields.'),
  makeDeleteByUuidTool('coolify_delete_server', 'Delete server',
    'Deletes a server. Requires confirm=true.', (u) => `/servers/${u}`),
  makeListByUuidTool('coolify_get_server_resources',
    'List resources on server', 'Lists resources running on a server.', (u) => `/servers/${u}/resources`),
  makeListByUuidTool('coolify_get_server_domains',
    'List domains on server', 'Lists domains served by a server.', (u) => `/servers/${u}/domains`),
  {
    name: 'coolify_validate_server',
    title: 'Validate server',
    description: 'Starts server validation (SSH connectivity, Docker, etc.). Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Server UUID.' },
        confirm: { type: 'boolean', description: 'Must be true to start server validation.' },
      },
      required: ['uuid', 'confirm'],
      additionalProperties: false,
    },
    handler: (cfg, args) => {
      requireConfirm(args, 'coolify_validate_server');
      return callCoolifyApi(cfg, {
        method: 'POST',
        path: `/servers/${encodeURIComponent(requiredStringArg(args, 'uuid'))}/validate`,
      });
    },
  },
  {
    name: 'coolify_rotate_server_sentinel_token',
    title: 'Rotate server Sentinel token',
    description: 'Generates a new Sentinel token inside the MCP server, updates the selected Coolify server, and never returns the token. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Server UUID.' },
        confirm: { type: 'boolean', description: 'Must be true to rotate the Sentinel token and restart/sync Sentinel.' },
      },
      required: ['uuid', 'confirm'],
      additionalProperties: false,
    },
    handler: async (cfg, args) => {
      requireConfirm(args, 'coolify_rotate_server_sentinel_token');
      const uuid = encodeURIComponent(requiredStringArg(args, 'uuid'));
      const sentinelToken = randomBytes(32).toString('hex');
      const result = await callCoolifyApi(cfg, {
        method: 'PATCH',
        path: `/servers/${uuid}/sentinel`,
        body: { sentinel_token: sentinelToken },
      });
      return {
        status: result.status,
        headers: result.headers,
        data: {
          rotated: true,
          tokenReturned: false,
          serverUuid: decodeURIComponent(uuid),
          followUp: 'Verify Sentinel In Sync and healthy state.',
        },
      };
    },
  },
];

// ─── Private keys ────────────────────────────────────────────────────────────
const privateKeyCrudTools: ToolDefinition[] = [
  makeListTool('coolify_list_private_keys', 'List private keys', 'Lists all stored private keys.', '/security/keys'),
  makeGetByUuidTool('coolify_get_private_key', 'Get private key', 'Gets a private key by UUID.', (u) => `/security/keys/${u}`),
  makeCreateBodyTool('coolify_create_private_key', 'Create private key',
    'Stores a new SSH private key. Requires confirm=true.', '/security/keys',
    'Required: private_key. Optional: name, description.'),
  makeUpdateByUuidBodyTool('coolify_update_private_key', 'Update private key',
    'Updates a private key entry. Requires confirm=true.', (u) => `/security/keys/${u}`,
    'Optional: name, description, private_key.'),
  makeDeleteByUuidTool('coolify_delete_private_key', 'Delete private key',
    'Deletes a private key. Requires confirm=true.', (u) => `/security/keys/${u}`),
];

// ─── Teams (read-only) ───────────────────────────────────────────────────────
const teamReadTools: ToolDefinition[] = [
  makeListTool('coolify_list_teams', 'List teams', 'Lists teams visible to the API token.', '/teams'),
  makeGetByUuidTool('coolify_get_team', 'Get team', 'Gets a team by id.', (u) => `/teams/${u}`),
  makeCurrentTeamTool('coolify_get_current_team', 'Get current team', ''),
  makeCurrentTeamTool('coolify_get_current_team_members', 'List current team members', '/members'),
];

// ─── Final export ────────────────────────────────────────────────────────────
export const tools: ToolDefinition[] = [
  ...baseTools,
  ...applicationCrudTools,
  ...serviceCrudTools,
  ...databaseCrudTools,
  ...projectCrudTools,
  ...serverCrudTools,
  ...privateKeyCrudTools,
  ...teamReadTools,
];

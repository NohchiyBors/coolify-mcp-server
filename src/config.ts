export interface ServerConfig {
  id: string;
  apiBaseUrl: string;
  apiToken: string;
  timeoutMs: number;
  userAgent: string;
  allowRawWrite: boolean;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number`);
  }

  return parsed;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();

  if (!raw) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false;
  }

  throw new Error(`Environment variable ${name} must be a boolean`);
}

export interface AppConfig {
  servers: Record<string, ServerConfig>;
  /** Canonical profile used when server_id is omitted. */
  defaultServerId: string;
}

function buildServerConfig(id: string, prefix: string, tokenEnvName: string, fallbackBaseUrl: string): ServerConfig {
  return {
    id,
    apiBaseUrl: (process.env[`${prefix}API_BASE_URL`] ?? fallbackBaseUrl).trim().replace(/\/+$/, ''),
    apiToken: readRequiredEnv(tokenEnvName),
    timeoutMs: readNumberEnv(`${prefix}TIMEOUT_MS`, readNumberEnv('COOLIFY_TIMEOUT_MS', 30_000)),
    userAgent: (process.env[`${prefix}USER_AGENT`] ?? process.env.COOLIFY_USER_AGENT ?? 'coolify-mcp-server/0.1.0').trim(),
    allowRawWrite: readBooleanEnv(`${prefix}ALLOW_RAW_WRITE`, readBooleanEnv('COOLIFY_ALLOW_RAW_WRITE', false)),
  };
}

function hostnameFromApiBaseUrl(apiBaseUrl: string): string | undefined {
  try {
    const hostname = new URL(apiBaseUrl).hostname.trim().toLowerCase();
    return hostname || undefined;
  } catch {
    return undefined;
  }
}

function registerServer(servers: Record<string, ServerConfig>, serverId: string, config: ServerConfig): void {
  const existing = servers[serverId];
  if (existing && existing !== config) {
    throw new Error(`Duplicate server_id "${serverId}" for Coolify profiles "${existing.id}" and "${config.id}"`);
  }
  servers[serverId] = config;
}

function registerDomainAlias(servers: Record<string, ServerConfig>, config: ServerConfig): void {
  const hostname = hostnameFromApiBaseUrl(config.apiBaseUrl);
  if (!hostname || hostname === config.id) {
    return;
  }

  const existing = servers[hostname];
  if (existing && existing.id !== config.id) {
    throw new Error(
      `Domain alias "${hostname}" is shared by Coolify profiles "${existing.id}" and "${config.id}"`,
    );
  }

  servers[hostname] = config;
}

export function loadConfig(): AppConfig {
  const servers: Record<string, ServerConfig> = {};
  let defaultServerId: string | undefined;

  if (process.env.COOLIFY_API_TOKEN) {
    const serverId = (process.env.COOLIFY_ID?.trim() || 'host').toLowerCase();
    const config = buildServerConfig(serverId, 'COOLIFY_', 'COOLIFY_API_TOKEN', 'https://coolify.example.com/api/v1');
    registerServer(servers, serverId, config);
    defaultServerId = serverId;
  }

  for (const key of Object.keys(process.env)) {
    const indexedMatch = key.match(/^COOLIFY_(\d+)_API_TOKEN$/);

    if (indexedMatch) {
      const index = indexedMatch[1];
      const prefix = `COOLIFY_${index}_`;
      const serverId = (process.env[`${prefix}ID`]?.trim() || index).toLowerCase();
      registerServer(servers, serverId, buildServerConfig(serverId, prefix, key, 'https://coolify.example.com/api/v1'));
      continue;
    }

    const match = key.match(/^COOLIFY_(.+)_API_TOKEN$/);
    if (match) {
      const serverId = match[1].toLowerCase();
      if (serverId === 'api' || /^\d+$/.test(serverId)) continue;

      const prefix = `COOLIFY_${match[1]}_`;
      registerServer(servers, serverId, buildServerConfig(serverId, prefix, key, 'https://coolify.example.com/api/v1'));
    }
  }

  if (!defaultServerId) {
    defaultServerId = Object.values(servers)[0]?.id;
  }

  if (!defaultServerId) {
    throw new Error('No Coolify servers configured. Please set COOLIFY_API_TOKEN or COOLIFY_<ID>_API_TOKEN');
  }

  const canonicalConfigs = new Map<string, ServerConfig>();
  for (const config of Object.values(servers)) {
    canonicalConfigs.set(config.id, config);
  }
  for (const config of canonicalConfigs.values()) {
    registerDomainAlias(servers, config);
  }

  return { servers, defaultServerId };
}

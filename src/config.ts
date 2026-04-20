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

export function loadConfig(): AppConfig {
  const servers: Record<string, ServerConfig> = {};

  if (process.env.COOLIFY_API_TOKEN) {
    servers['default'] = buildServerConfig('default', 'COOLIFY_', 'COOLIFY_API_TOKEN', 'https://coolify.example.com/api/v1');
  }

  for (const key of Object.keys(process.env)) {
    const indexedMatch = key.match(/^COOLIFY_(\d+)_API_TOKEN$/);

    if (indexedMatch) {
      const index = indexedMatch[1];
      const prefix = `COOLIFY_${index}_`;
      const serverId = (process.env[`${prefix}ID`]?.trim() || index).toLowerCase();
      servers[serverId] = buildServerConfig(serverId, prefix, key, 'https://coolify.example.com/api/v1');
      continue;
    }

    const match = key.match(/^COOLIFY_(.+)_API_TOKEN$/);
    if (match) {
      const serverId = match[1].toLowerCase();
      if (serverId === 'api' || /^\d+$/.test(serverId)) continue;

      const prefix = `COOLIFY_${match[1]}_`;
      servers[serverId] = buildServerConfig(serverId, prefix, key, 'https://coolify.example.com/api/v1');
    }
  }

  if (Object.keys(servers).length === 0) {
    throw new Error('No Coolify servers configured. Please set COOLIFY_API_TOKEN or COOLIFY_<ID>_API_TOKEN');
  }

  return { servers };
}

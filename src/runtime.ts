import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';

export type RuntimePlatform = 'win32' | 'linux' | 'darwin' | string;

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WSL_MOUNT_PATH = /^\/mnt\/[A-Za-z](?:\/|$)/;

export function resolveEnvFilePath(
  requestedPath: string | undefined,
  cwd = process.cwd(),
  platform: RuntimePlatform = process.platform,
): { path: string; explicit: boolean } {
  const requested = requestedPath?.trim();

  if (!requested) {
    return { path: resolve(cwd, '.env'), explicit: false };
  }

  if (platform !== 'win32' && WINDOWS_DRIVE_PATH.test(requested)) {
    throw new Error(
      `COOLIFY_ENV_FILE uses a Windows path in ${platform}. Convert the exact path with wslpath -u before starting MCP.`,
    );
  }

  if (platform === 'win32' && WSL_MOUNT_PATH.test(requested)) {
    throw new Error(
      'COOLIFY_ENV_FILE uses a WSL path in Windows. Use the corresponding Windows drive path before starting MCP.',
    );
  }

  return { path: resolve(cwd, requested), explicit: true };
}

export function loadEnvironment(): string | undefined {
  const selected = resolveEnvFilePath(process.env.COOLIFY_ENV_FILE);

  if (selected.explicit && !existsSync(selected.path)) {
    throw new Error(`COOLIFY_ENV_FILE does not exist: ${selected.path}`);
  }

  if (!selected.explicit && !existsSync(selected.path)) {
    return undefined;
  }

  const result = loadDotenv({ path: selected.path, override: false, quiet: true });
  if (result.error) {
    throw new Error(`Failed to load COOLIFY_ENV_FILE: ${selected.path}`, { cause: result.error });
  }

  return selected.path;
}

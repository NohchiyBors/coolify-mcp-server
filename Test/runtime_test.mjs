import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadEnvironment, resolveEnvFilePath } from '../dist/runtime.js';

const cwd = '/mnt/d/data/onedrive/source/mcp/coolify-mcp-server';

assert.deepEqual(resolveEnvFilePath(undefined, cwd, 'linux'), {
  path: `${cwd}/.env`,
  explicit: false,
});

assert.equal(resolveEnvFilePath('./config/dev.env', cwd, 'linux').path, `${cwd}/config/dev.env`);
assert.throws(() => resolveEnvFilePath('D:\\Data\\Project\\.env', cwd, 'linux'), /wslpath -u/);
assert.throws(
  () => resolveEnvFilePath('/mnt/d/data/project/.env', 'D:\\Data\\Project', 'win32'),
  /WSL path in Windows/,
);

const priorEnvFile = process.env.COOLIFY_ENV_FILE;
const priorToken = process.env.COOLIFY_RUNTIME_TEST_API_TOKEN;
const temp = mkdtempSync(join(tmpdir(), 'coolify-runtime-test-'));
const envFile = join(temp, 'config with spaces.env');
writeFileSync(envFile, 'COOLIFY_RUNTIME_TEST_API_TOKEN=loaded-from-explicit-file\n', 'utf8');

try {
  delete process.env.COOLIFY_RUNTIME_TEST_API_TOKEN;
  process.env.COOLIFY_ENV_FILE = envFile;
  assert.equal(loadEnvironment(), envFile);
  assert.equal(process.env.COOLIFY_RUNTIME_TEST_API_TOKEN, 'loaded-from-explicit-file');

  process.env.COOLIFY_ENV_FILE = join(temp, 'missing.env');
  assert.throws(() => loadEnvironment(), /does not exist/);
} finally {
  if (priorEnvFile === undefined) delete process.env.COOLIFY_ENV_FILE;
  else process.env.COOLIFY_ENV_FILE = priorEnvFile;
  if (priorToken === undefined) delete process.env.COOLIFY_RUNTIME_TEST_API_TOKEN;
  else process.env.COOLIFY_RUNTIME_TEST_API_TOKEN = priorToken;
}

console.log('runtime_test: PASS');

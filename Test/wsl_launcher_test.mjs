import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux') {
  console.log('wsl_launcher_test: SKIP (requires Linux/WSL)');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const start = join(root, 'scripts/start-wsl.sh');
const prepare = join(root, 'scripts/prepare-wsl-runtime.sh');
const common = join(root, 'scripts/wsl-common.sh');
const temp = mkdtempSync(join(tmpdir(), 'coolify-wsl-launcher-'));
const runtime = join(temp, 'runtime with spaces');
const envFile = join(temp, 'profiles with spaces.env');
const nodeWithSpaces = join(temp, 'node with spaces');
const baseEnv = {
  ...process.env,
  HOME: join(temp, 'home-without-nvm'),
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
  COOLIFY_NODE_BIN: process.execPath,
};
delete baseEnv.COOLIFY_WSL_RUNTIME_ROOT;
delete baseEnv.COOLIFY_ENV_FILE;
delete baseEnv.MCP_TRANSPORT;

function run(script, args = [], overrides = {}) {
  return spawnSync('/bin/bash', [script, ...args], {
    cwd: temp, env: { ...baseEnv, ...overrides }, encoding: 'utf8', timeout: 10_000,
  });
}
function fails(result, message) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '', 'Launcher diagnostics must not contaminate MCP stdout');
  assert.match(result.stderr, message);
}

try {
  mkdirSync(join(runtime, 'dist'), { recursive: true });
  writeFileSync(join(runtime, 'dist/index.js'), `console.log(JSON.stringify({
    cwd: process.cwd(), platform: process.platform,
    envFile: process.env.COOLIFY_ENV_FILE, transport: process.env.MCP_TRANSPORT
  }));\n`);
  writeFileSync(envFile, 'COOLIFY_API_TOKEN=test-token\n');
  symlinkSync(process.execPath, nodeWithSpaces);
  for (const path of [start, prepare, common]) {
    assert.ok(!readFileSync(path).includes(13), 'Shell scripts must keep LF line endings');
    assert.equal(spawnSync('/bin/bash', ['-n', path]).status, 0);
  }

  // No NVM directory: Node lookup must reach PATH instead of exiting under set -e.
  const fallback = spawnSync('/bin/bash', ['-c', 'set -euo pipefail; . "$1"; coolify_linux_node', 'test', common], {
    env: { ...baseEnv, COOLIFY_NODE_BIN: '' }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.equal(fallback.stdout.trim(), process.execPath);

  const launched = run(start, [runtime, envFile], { COOLIFY_NODE_BIN: nodeWithSpaces });
  assert.equal(launched.status, 0, launched.stderr);
  assert.equal(launched.stderr, '');
  assert.deepEqual(JSON.parse(launched.stdout), {
    cwd: runtime, platform: 'linux', envFile, transport: 'stdio',
  });

  const viaEnv = run(start, [], { COOLIFY_WSL_RUNTIME_ROOT: runtime, COOLIFY_ENV_FILE: envFile, MCP_TRANSPORT: 'http' });
  assert.equal(viaEnv.status, 0, viaEnv.stderr);
  assert.equal(JSON.parse(viaEnv.stdout).transport, 'http');
  fails(run(start, [join(temp, 'missing'), envFile]), /runtime is not built/);
  fails(run(start, [runtime, join(temp, 'missing.env')]), /missing or unreadable/);

  const fakeNode = join(temp, 'fake-node');
  writeFileSync(fakeNode, '#!/bin/sh\nprintf "win32:24\\n"\n', { mode: 0o700 });
  fails(run(start, [runtime, envFile], { COOLIFY_NODE_BIN: fakeNode }), /native Linux Node/);
  writeFileSync(fakeNode, '#!/bin/sh\nprintf "linux:18\\n"\n', { mode: 0o700 });
  fails(run(start, [runtime, envFile], { COOLIFY_NODE_BIN: fakeNode }), /20\+/);

  fails(run(prepare, ['/mnt/d/runtime-must-not-be-created']), /Linux filesystem/);
  assert.equal(existsSync('/mnt/d/runtime-must-not-be-created'), false);
  const windowsMountLink = join(temp, 'windows-mount-link');
  symlinkSync('/mnt/d', windowsMountLink);
  fails(run(prepare, [join(windowsMountLink, 'runtime-must-not-be-created')]), /Linux filesystem/);

  // Exercise real wslpath on the exact public fixture; never read local credentials.
  const manifest = join(root, 'runtime-manifest.json');
  const sourceRoot = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).source_root : root;
  const fixture = join(sourceRoot, '.env.example');
  if (/microsoft/i.test(readFileSync('/proc/version', 'utf8')) && /^\/mnt\/[a-z]\//i.test(fixture)) {
    const converted = spawnSync('wslpath', ['-w', fixture], { encoding: 'utf8' });
    assert.equal(converted.status, 0, converted.stderr);
    const windowsPath = converted.stdout.trim();
    for (const path of [windowsPath, windowsPath.replaceAll('\\', '/')]) {
      const result = run(start, [runtime, path]);
      assert.equal(result.status, 0, result.stderr);
      const expected = spawnSync('wslpath', ['-u', path], { encoding: 'utf8' }).stdout.trim();
      assert.equal(JSON.parse(result.stdout).envFile, resolve(expected));
    }
    fails(run(prepare, ['D:\\runtime-must-not-be-created']), /Linux filesystem/);
  }
  console.log('wsl_launcher_test: PASS (Linux Node, PATH fallback, spaces, paths, isolation, stderr diagnostics)');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const startedAt = performance.now();

const mcp = spawn('node', [resolve(projectRoot, 'dist/index.js')], {
  cwd: projectRoot,
  env: {
    PATH: process.env.PATH,
    LOG_LEVEL: 'warn',
    MCP_TRANSPORT: 'stdio',
    COOLIFY_TESTHOST_API_BASE_URL: 'http://127.0.0.1:9/api/v1',
    COOLIFY_TESTHOST_API_TOKEN: 'test-token',
    COOLIFY_TESTHOST_EXTERNAL_IP: '203.0.113.10',
    COOLIFY_TESTHOST_LOCAL_IP: '10.10.10.100',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdoutBuffer = '';
let stderrBuffer = '';
const pending = new Map();
const protocolNoise = [];
let nextId = 1;

mcp.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString();
  let newline;
  while ((newline = stdoutBuffer.indexOf('\n')) !== -1) {
    const line = stdoutBuffer.slice(0, newline).trim();
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      if (message.id != null && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    } catch {
      protocolNoise.push(line);
    }
  }
});
mcp.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString(); });

function rpc(method, params) {
  return new Promise((resolveResponse, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`stdio RPC timeout for ${method}; stderr=${stderrBuffer.slice(-500)}`));
    }, 120_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolveResponse(message);
    });
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

try {
  const initialized = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'stdio-transport-test', version: '1.0.0' },
  });
  assert.ok(initialized.result);
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);

  const listed = await rpc('tools/list', {});
  assert.equal(listed.result.tools.length, 77);

  const current = await rpc('tools/call', {
    name: 'coolify_current_server',
    arguments: { server_id: 'testhost' },
  });
  assert.equal(current.result.isError, undefined);
  assert.equal(current.result.structuredContent.data.id, 'testhost');
  assert.equal(current.result.structuredContent.data.externalIp, '203.0.113.10');
  assert.equal(current.result.structuredContent.data.localIp, '10.10.10.100');
  assert.equal(current.result.structuredContent.data.apiBaseUrl, 'http://127.0.0.1:9/api/v1');
  assert.deepEqual(protocolNoise, []);

  const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(2);
  console.log(`stdio_transport_test: PASS (77 tools, clean stdout, read-only call, ${elapsedSeconds}s)`);
} finally {
  mcp.kill();
}

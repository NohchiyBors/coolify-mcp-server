import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const apiKey = 'http-transport-test-key';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

function stop(child) {
  if (child && !child.killed) child.kill();
}

const mock = spawn('node', [resolve(__dirname, 'mock_coolify.mjs')], {
  env: { ...process.env, MOCK_TOKEN: 'test-token' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

let mcp;
let client;

try {
  const mockPort = await new Promise((resolvePort, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('mock startup timeout')), 10_000);
    mock.once('exit', (code) => reject(new Error(`mock exited during startup: ${code}`)));
    mock.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/MOCK_LISTENING port=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    });
  });

  const mcpPort = await freePort();
  const mcpUrl = new URL(`http://127.0.0.1:${mcpPort}/mcp`);

  mcp = spawn('node', [resolve(projectRoot, 'dist/index.js')], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH,
      LOG_LEVEL: 'error',
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: String(mcpPort),
      MCP_HTTP_MAX_BODY_KB: '1',
      MCP_API_KEY: apiKey,
      COOLIFY_TESTHOST_API_BASE_URL: `http://127.0.0.1:${mockPort}/api/v1`,
      COOLIFY_TESTHOST_API_TOKEN: 'test-token',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let serverError = '';
  mcp.stderr.on('data', (chunk) => { serverError += chunk.toString(); });
  mcp.once('exit', (code) => {
    if (code && code !== 0) serverError += `\nMCP exited with ${code}`;
  });

  let unauthorized;
  // OneDrive-backed /mnt/d startup has previously taken about 28 seconds.
  // Keep this bounded but aligned with the documented MCP startup timeout.
  for (let attempt = 0; attempt < 1_200; attempt += 1) {
    try {
      unauthorized = await fetch(mcpUrl, { method: 'POST' });
      break;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  assert.ok(unauthorized, `HTTP MCP did not start: ${serverError}`);
  assert.equal(unauthorized.status, 401);

  const malformed = await fetch(mcpUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);

  const oversized = await fetch(mcpUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(2048) }),
  });
  assert.equal(oversized.status, 413);

  client = new Client({ name: 'http-transport-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  await client.connect(transport);

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 77);

  const current = await client.callTool({
    name: 'coolify_current_server',
    arguments: { server_id: 'testhost' },
  });
  assert.equal(current.isError, undefined);
  assert.equal(current.structuredContent?.data?.id, 'testhost');

  await client.close();
  client = undefined;
  console.log('http_transport_test: PASS (401, 400, 413, initialize, 77 tools, read-only call)');
} finally {
  if (client) await client.close().catch(() => {});
  stop(mcp);
  stop(mock);
}

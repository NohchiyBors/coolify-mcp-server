import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../dist/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Tiny .env loader (no extra deps).
function loadEnv(path) {
  const txt = readFileSync(path, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    if (line.trim().startsWith('#')) continue;
    let [, k, v] = m;
    v = v.replace(/^['"]|['"]$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(resolve(projectRoot, '.env'));

const config = loadConfig();
const requestedServers = process.env.COOLIFY_SMOKE_SERVER_IDS
  ?.split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const SERVERS = requestedServers?.length
  ? requestedServers
  : [...new Set([config.defaultServerId, 'hostkz'].filter((id) => config.servers[id]))];
const READ_ONLY_TOOLS = [
  'coolify_current_server',
  'coolify_healthcheck',
  'coolify_version',
  'coolify_list_resources',
  'coolify_list_projects',
  'coolify_list_servers',
  'coolify_list_applications',
  'coolify_list_services',
  'coolify_list_databases',
  'coolify_list_deployments',
];

const proc = spawn('node', [resolve(projectRoot, 'dist/index.js')], {
  cwd: projectRoot,
  env: { ...process.env, LOG_LEVEL: 'warn' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const pending = new Map();

proc.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.error('non-JSON on stdout:', line); continue; }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
proc.stderr.on('data', () => {});

let nextId = 1;
function rpc(method, params) {
  return new Promise((res) => {
    const id = nextId++;
    pending.set(id, res);
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function notify(method, params) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

function summarise(result) {
  if (result.error) return `RPC ERROR: ${result.error.message ?? JSON.stringify(result.error)}`;
  const r = result.result;
  if (!r) return 'no result';
  if (r.isError) {
    const t = r.content?.[0]?.text ?? '';
    return `TOOL ERROR: ${t.split('\n').slice(0, 2).join(' | ').slice(0, 220)}`;
  }
  const sc = r.structuredContent;
  if (!sc) return 'ok (no structured content)';
  const status = sc.status;
  const data = sc.data;
  let dataPreview;
  if (Array.isArray(data)) dataPreview = `array(len=${data.length})`;
  else if (data && typeof data === 'object') dataPreview = `object{${Object.keys(data).slice(0, 6).join(',')}}`;
  else dataPreview = JSON.stringify(data)?.slice(0, 80);
  return `HTTP ${status} → ${dataPreview}`;
}

(async () => {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0' },
  });
  notify('notifications/initialized', {});

  const tools = await rpc('tools/list', {});
  console.log(`tools/list returned ${tools.result.tools.length} tools\n`);

  for (const server of SERVERS) {
    console.log(`========== server_id="${server}" ==========`);
    for (const name of READ_ONLY_TOOLS) {
      const res = await rpc('tools/call', { name, arguments: { server_id: server } });
      console.log(`  ${name.padEnd(36)} ${summarise(res)}`);
    }
    console.log('');
  }
  proc.kill();
  process.exit(0);
})();

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const mock = spawn('node', [resolve(__dirname, 'mock_coolify.mjs')], {
  env: { ...process.env, MOCK_TOKEN: 'test-token' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const port = await new Promise((res) => {
  let buf = '';
  mock.stdout.on('data', (c) => { buf += c.toString(); const m = buf.match(/MOCK_LISTENING port=(\d+)/); if (m) res(Number(m[1])); });
});

const mcp = spawn('node', [resolve(projectRoot, 'dist/index.js')], {
  cwd: projectRoot,
  env: {
    PATH: process.env.PATH,
    LOG_LEVEL: 'warn',
    COOLIFY_TESTHOST_API_BASE_URL: `http://127.0.0.1:${port}/api/v1`,
    COOLIFY_TESTHOST_API_TOKEN: 'test-token',
    COOLIFY_TESTHOST_ALLOW_RAW_WRITE: 'true',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = ''; const pending = new Map();
mcp.stdout.on('data', (c) => {
  buf += c.toString(); let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const l = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!l) continue; let m; try { m = JSON.parse(l); } catch { continue; }
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
mcp.stderr.on('data', () => {});
let id = 1;
const rpc = (method, params) => new Promise((r) => { const i = id++; pending.set(i, r); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
const notify = (m, p) => mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: m, params: p }) + '\n');

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'full', version: '0' } });
notify('notifications/initialized', {});

const SID = 'testhost';
const APP = 'app-uuid-1', SVC = 'svc-uuid-1', DB = 'db-uuid-1';
const PRJ = 'proj-uuid-1', SRV = 'srv-uuid-1', KEY = 'key-uuid-1';
const TM  = 'team-1', ENV = 'env-uuid-1', DEP = 'dep-uuid-1';

const dummyApp     = { project_uuid: PRJ, environment_name: 'production', server_uuid: SRV, git_repository: 'https://github.com/x/y', git_branch: 'main', ports_exposes: '3000' };
const dummyDfile   = { project_uuid: PRJ, environment_name: 'production', server_uuid: SRV, dockerfile: 'FROM node', ports_exposes: '3000' };
const dummyCompose = { project_uuid: PRJ, environment_name: 'production', server_uuid: SRV, docker_compose_raw: 'services: { web: { image: nginx } }' };
const dummyImage   = { project_uuid: PRJ, environment_name: 'production', server_uuid: SRV, docker_registry_image_name: 'nginx', ports_exposes: '80' };
const dummyDb      = { project_uuid: PRJ, environment_name: 'production', server_uuid: SRV, name: 'pgdb' };
const dummyEnv     = { key: 'K', value: 'V' };
const dummyEnvBulk = { data: [{ key: 'K1', value: 'V1' }, { key: 'K2', value: 'V2' }] };
const C = { confirm: true };

const calls = [
  // Existing 18
  ['coolify_current_server', {}],
  ['coolify_healthcheck', {}],
  ['coolify_version', {}],
  ['coolify_list_resources', {}],
  ['coolify_list_projects', {}],
  ['coolify_list_servers', {}],
  ['coolify_list_applications', { tag: 'prod' }],
  ['coolify_get_application', { uuid: APP }],
  ['coolify_get_application_logs', { uuid: APP, lines: 50 }],
  ['coolify_list_services', {}],
  ['coolify_get_service', { uuid: SVC }],
  ['coolify_list_databases', {}],
  ['coolify_list_deployments', {}],
  ['coolify_get_deployment', { uuid: DEP }],
  ['coolify_list_application_deployments', { uuid: APP, skip: 0, take: 5 }],
  ['coolify_deploy', { uuid: APP, force: true }],
  ['coolify_control_resource', { kind: 'application', action: 'start', uuid: APP }],
  ['coolify_api_request', { method: 'GET', path: '/echo' }],

  // Applications CRUD + envs (now require confirm)
  ['coolify_create_application_public', { body: dummyApp, ...C }],
  ['coolify_create_application_private_github_app', { body: { ...dummyApp, github_app_uuid: 'gh-1' }, ...C }],
  ['coolify_create_application_private_deploy_key', { body: { ...dummyApp, private_key_uuid: KEY }, ...C }],
  ['coolify_create_application_dockerfile', { body: dummyDfile, ...C }],
  ['coolify_create_application_dockercompose', { body: dummyCompose, ...C }],
  ['coolify_create_application_dockerimage', { body: dummyImage, ...C }],
  ['coolify_update_application', { uuid: APP, body: { name: 'renamed' }, ...C }],
  ['coolify_execute_application_command', { uuid: APP, command: 'whoami', ...C }],
  ['coolify_list_application_envs', { uuid: APP }],
  ['coolify_create_application_env', { uuid: APP, body: dummyEnv, ...C }],
  ['coolify_update_application_env', { uuid: APP, body: dummyEnv, ...C }],
  ['coolify_update_application_envs_bulk', { uuid: APP, body: dummyEnvBulk, ...C }],
  ['coolify_delete_application_env', { uuid: APP, env_uuid: ENV, ...C }],
  ['coolify_delete_application', { uuid: APP, ...C }],

  // Services CRUD + envs
  ['coolify_create_service', { body: { type: 'wordpress-with-mysql', project_uuid: PRJ, environment_name: 'production', server_uuid: SRV }, ...C }],
  ['coolify_update_service', { uuid: SVC, body: { name: 'svc-renamed' }, ...C }],
  ['coolify_list_service_envs', { uuid: SVC }],
  ['coolify_create_service_env', { uuid: SVC, body: dummyEnv, ...C }],
  ['coolify_update_service_env', { uuid: SVC, body: dummyEnv, ...C }],
  ['coolify_update_service_envs_bulk', { uuid: SVC, body: dummyEnvBulk, ...C }],
  ['coolify_delete_service_env', { uuid: SVC, env_uuid: ENV, ...C }],
  ['coolify_delete_service', { uuid: SVC, ...C }],

  // Databases CRUD
  ['coolify_get_database', { uuid: DB }],
  ['coolify_create_database_postgresql', { body: dummyDb, ...C }],
  ['coolify_create_database_clickhouse', { body: dummyDb, ...C }],
  ['coolify_create_database_dragonfly', { body: dummyDb, ...C }],
  ['coolify_create_database_redis', { body: dummyDb, ...C }],
  ['coolify_create_database_keydb', { body: dummyDb, ...C }],
  ['coolify_create_database_mariadb', { body: dummyDb, ...C }],
  ['coolify_create_database_mysql', { body: dummyDb, ...C }],
  ['coolify_create_database_mongodb', { body: dummyDb, ...C }],
  ['coolify_update_database', { uuid: DB, body: { name: 'db-renamed' }, ...C }],
  ['coolify_delete_database', { uuid: DB, ...C }],

  // Projects
  ['coolify_get_project', { uuid: PRJ }],
  ['coolify_create_project', { body: { name: 'p1' }, ...C }],
  ['coolify_update_project', { uuid: PRJ, body: { description: 'd' }, ...C }],
  ['coolify_get_project_environment', { uuid: PRJ, environment_name_or_uuid: 'production' }],
  ['coolify_delete_project', { uuid: PRJ, ...C }],

  // Servers
  ['coolify_get_server', { uuid: SRV }],
  ['coolify_create_server', { body: { name: 's1', ip: '1.2.3.4', private_key_uuid: KEY }, ...C }],
  ['coolify_update_server', { uuid: SRV, body: { description: 'd' }, ...C }],
  ['coolify_get_server_resources', { uuid: SRV }],
  ['coolify_get_server_domains', { uuid: SRV }],
  ['coolify_validate_server', { uuid: SRV }],
  ['coolify_delete_server', { uuid: SRV, ...C }],

  // Private keys
  ['coolify_list_private_keys', {}],
  ['coolify_get_private_key', { uuid: KEY }],
  ['coolify_create_private_key', { body: { private_key: '-----BEGIN-----' }, ...C }],
  ['coolify_update_private_key', { uuid: KEY, body: { name: 'renamed' }, ...C }],
  ['coolify_delete_private_key', { uuid: KEY, ...C }],

  // Teams
  ['coolify_list_teams', {}],
  ['coolify_get_team', { uuid: TM }],
  ['coolify_get_current_team', {}],
  ['coolify_get_current_team_members', {}],

  // Negative checks — confirm gate
  ['coolify_delete_application',           { uuid: APP }, 'fail'],
  ['coolify_create_application_public',    { body: dummyApp }, 'fail'],
  ['coolify_update_application',           { uuid: APP, body: { name: 'x' } }, 'fail'],
  ['coolify_create_application_env',       { uuid: APP, body: dummyEnv }, 'fail'],
  ['coolify_execute_application_command',  { uuid: APP, command: 'whoami' }, 'fail'],
  ['coolify_create_database_postgresql',   { body: dummyDb }, 'fail'],
  ['coolify_create_project',               { body: { name: 'x' } }, 'fail'],
  ['coolify_create_server',                { body: { name: 's', ip: '1.1.1.1', private_key_uuid: KEY } }, 'fail'],
  ['coolify_api_request',                  { method: 'POST', path: '/echo', body: {} }, 'fail'],
];

let pass = 0, fail = 0;
const failures = [];
for (const [name, args, expect] of calls) {
  const want = expect ?? 'ok';
  const res = await rpc('tools/call', { name, arguments: { server_id: SID, ...args } });
  const r = res.result;
  const isToolErr = r?.isError === true;
  const status = r?.structuredContent?.status;
  const got = isToolErr ? 'fail' : (status >= 200 && status < 300 ? 'ok' : 'fail');
  const ok = got === want;
  if (ok) pass++; else { fail++; failures.push({ name, args, want, got, msg: r?.content?.[0]?.text?.slice(0, 200) ?? `HTTP ${status}` }); }
}
console.log(`\nresults: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  ${f.name.padEnd(46)} want=${f.want} got=${f.got}  args=${JSON.stringify(f.args).slice(0,80)}  msg=${f.msg}`);
}
mcp.kill(); mock.kill('SIGTERM');
await new Promise((r) => setTimeout(r, 200));
process.exit(fail ? 1 : 0);

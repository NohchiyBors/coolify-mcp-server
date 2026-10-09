// Mock of Coolify /api/v1 covering every endpoint that the MCP tools hit.
// Permissive: any known path pattern returns 200 with a plausible body.
// Logs every request so the test driver can assert.
import http from 'node:http';

const PORT  = Number(process.env.MOCK_PORT  || 0);
const TOKEN = process.env.MOCK_TOKEN || 'test-token';
const requests = [];

const APP = 'app-uuid-1';
const SVC = 'svc-uuid-1';
const DB  = 'db-uuid-1';
const PRJ = 'proj-uuid-1';
const SRV = 'srv-uuid-1';
const KEY = 'key-uuid-1';
const TM  = 'team-1';
const ENV = 'env-uuid-1';
const DEP = 'dep-uuid-1';

function send(res, status, data, ct = 'application/json') {
  res.writeHead(status, { 'Content-Type': ct });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}
async function readBody(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text); } catch { return text; }
}

function route(req, body, urlObj) {
  const m = req.method;
  const path = urlObj.pathname;
  const q = Object.fromEntries(urlObj.searchParams);

  if (!path.startsWith('/api/v1')) return [404, { error: 'wrong prefix' }];
  const p = path.slice(7) || '/';

  if (p === '/health') return [200, 'OK', 'text/plain'];

  // Auth required for everything else.
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return [401, { error: 'bad auth' }];

  if (p === '/version') return [200, { version: '4.3.23' }];
  if (p === '/resources') return [200, [{ uuid: APP, type: 'application' }]];

  // Projects
  if (p === '/projects' && m === 'GET')  return [200, [{ uuid: PRJ, name: 'p1' }]];
  if (p === '/projects' && m === 'POST') return [200, { uuid: PRJ, ...(body || {}) }];
  if (p === `/projects/${PRJ}` && m === 'GET')    return [200, { uuid: PRJ }];
  if (p === `/projects/${PRJ}` && m === 'PATCH')  return [200, { uuid: PRJ, ...(body || {}) }];
  if (p === `/projects/${PRJ}` && m === 'DELETE') return [200, { ok: true, deleted: PRJ }];
  if (p === `/projects/${PRJ}/production` && m === 'GET') return [200, { name: 'production' }];

  // Servers
  if (p === '/servers' && m === 'GET')  return [200, [{ uuid: SRV, name: 's1' }]];
  if (p === '/servers' && m === 'POST') return [200, { uuid: SRV, ...(body || {}) }];
  if (p === `/servers/${SRV}` && m === 'GET')    return [200, { uuid: SRV, settings: { sentinel_token: 'server-secret-value', nested: { api_key: 'nested-secret-value' } } }];
  if (p === `/servers/${SRV}` && m === 'PATCH')  return [200, { uuid: SRV, ...(body || {}) }];
  if (p === `/servers/${SRV}` && m === 'DELETE') return [200, { ok: true, deleted: SRV }];
  if (p === `/servers/${SRV}/resources`) return [200, [{ type: 'application', uuid: APP }]];
  if (p === `/servers/${SRV}/domains`)   return [200, ['example.com']];
  if (p === `/servers/${SRV}/validate`) {
    if (m !== 'POST') return [405, { message: 'Method Not Allowed' }];
    if (body !== undefined) return [422, { message: 'Validation request must not include a body.' }];
    return [201, {
      message: 'Validation started.',
      request_method: m,
      request_body_present: false,
      validation_secret: 'validate-response-secret',
    }];
  }
  if (p === `/servers/${SRV}/sentinel` && m === 'PATCH') return [200, { ok: true, sentinel_token: body?.sentinel_token ?? null }];

  // Applications
  if (p === '/applications' && m === 'GET') return [200, [{ uuid: APP, tags: q.tag ? [q.tag] : [] }]];
  if (p === '/applications/public' && m === 'POST')               return [200, { uuid: APP, kind: 'public' }];
  if (p === '/applications/private-github-app' && m === 'POST')   return [200, { uuid: APP, kind: 'private-github-app' }];
  if (p === '/applications/private-deploy-key' && m === 'POST')   return [200, { uuid: APP, kind: 'private-deploy-key' }];
  if (p === '/applications/dockerfile' && m === 'POST')           return [200, { uuid: APP, kind: 'dockerfile' }];
  if (p === '/applications/dockerimage' && m === 'POST')          return [200, { uuid: APP, kind: 'dockerimage' }];
  if (p === `/applications/${APP}` && m === 'GET')                return [200, { uuid: APP }];
  if (p === `/applications/${APP}` && m === 'PATCH')              return [200, { uuid: APP, ...(body || {}) }];
  if (p === `/applications/${APP}` && m === 'DELETE')             return [200, { ok: true, deleted: APP }];
  if (p === `/applications/${APP}/logs` || p === `/applications/${APP}/previews/42/logs`) return [200, { logs: 'l1\nl2', ...q }];
  if (p === `/applications/${APP}/start`)                         return [200, { ok: true, action: 'start' }];
  if (p === `/applications/${APP}/stop`)                          return [200, { ok: true, action: 'stop' }];
  if (p === `/applications/${APP}/restart`)                       return [200, { ok: true, action: 'restart' }];
  if (p === `/applications/${APP}/envs` && m === 'GET')           return [200, [{ uuid: ENV, key: 'K' }]];
  if (p === `/applications/${APP}/envs` && m === 'POST')          return [200, { uuid: ENV, ...(body || {}) }];
  if (p === `/applications/${APP}/envs` && m === 'PATCH')         return [200, { uuid: ENV, ...(body || {}) }];
  if (p === `/applications/${APP}/envs/bulk` && m === 'PATCH')    return [200, { ok: true, count: (body?.data || []).length }];
  if (p === `/applications/${APP}/envs/${ENV}` && m === 'DELETE') return [200, { ok: true, deleted: ENV }];

  // Services
  if (p === '/services' && m === 'GET')  return [200, [{ uuid: SVC }]];
  if (p === '/services' && m === 'POST') {
    if (body?.docker_compose_raw && Buffer.from(body.docker_compose_raw, 'base64').toString('utf8').includes('services:') === false) return [422, { error: 'expected base64 Compose YAML' }];
    return [201, { uuid: SVC }];
  }
  if (p === `/services/${SVC}/logs`) return q.sub_service_name ? [200, { logs: 'svc log', ...q }] : [400, { message: 'Sub service name is required.' }];
  if (p === `/services/${SVC}` && m === 'GET')    return [200, { uuid: SVC }];
  if (p === `/services/${SVC}` && m === 'PATCH')  return [200, { uuid: SVC, ...(body || {}) }];
  if (p === `/services/${SVC}` && m === 'DELETE') return [200, { ok: true, deleted: SVC }];
  if (p === `/services/${SVC}/start`)             return [200, { ok: true, action: 'start' }];
  if (p === `/services/${SVC}/stop`)              return [200, { ok: true, action: 'stop' }];
  if (p === `/services/${SVC}/restart`)           return [200, { ok: true, action: 'restart', latest: q.latest ?? null }];
  if (p === `/services/${SVC}/envs` && m === 'GET')   return [200, [{ uuid: ENV, key: 'K' }]];
  if (p === `/services/${SVC}/envs` && m === 'POST')  return [200, { uuid: ENV, ...(body || {}) }];
  if (p === `/services/${SVC}/envs` && m === 'PATCH') return [200, { uuid: ENV, ...(body || {}) }];
  if (p === `/services/${SVC}/envs/bulk` && m === 'PATCH') return [200, { ok: true }];
  if (p === `/services/${SVC}/envs/${ENV}` && m === 'DELETE') return [200, { ok: true, deleted: ENV }];

  // Databases
  if (p === '/databases' && m === 'GET') return [200, [{ uuid: DB }]];
  for (const t of ['postgresql','clickhouse','dragonfly','redis','keydb','mariadb','mysql','mongodb']) {
    if (p === `/databases/${t}` && m === 'POST') return [200, { uuid: DB, type: t }];
  }
  if (p === `/databases/${DB}` && m === 'GET')    return [200, { uuid: DB }];
  if (p === `/databases/${DB}` && m === 'PATCH')  return [200, { uuid: DB, ...(body || {}) }];
  if (p === `/databases/${DB}` && m === 'DELETE') return [200, { ok: true, deleted: DB }];
  if (p === `/databases/${DB}/logs`) return [200, { logs: 'db log', ...q }];
  if (p === `/databases/${DB}/start`)   return [200, { ok: true, action: 'start' }];
  if (p === `/databases/${DB}/stop`)    return [200, { ok: true, action: 'stop' }];
  if (p === `/databases/${DB}/restart`) return [200, { ok: true, action: 'restart' }];

  // Deployments
  if (p === '/deployments') return [200, [{ uuid: DEP }]];
  if (p === `/deployments/${DEP}`) return [200, { uuid: DEP }];
  if (p === `/deployments/applications/${APP}`) return [200, { skip: q.skip ?? null, take: q.take ?? null, items: [{ uuid: DEP }] }];
  if (p === '/deploy') return [200, { deployments: [{ uuid: 'new-dep' }], received: q }];

  // Private keys
  if (p === '/security/keys' && m === 'GET')  return [200, [{ uuid: KEY }]];
  if (p === '/security/keys' && m === 'POST') return [200, { uuid: KEY, ...(body || {}) }];
  if (p === `/security/keys/${KEY}` && m === 'GET')    return [200, { uuid: KEY }];
  if (p === `/security/keys/${KEY}` && m === 'PATCH')  return [200, { uuid: KEY, ...(body || {}) }];
  if (p === `/security/keys/${KEY}` && m === 'DELETE') return [200, { ok: true, deleted: KEY }];

  // Teams
  if (p === '/teams') return [200, [{ id: TM }]];
  if (p === `/teams/${TM}`) return [200, { id: TM }];
  if (p === '/team') return [200, { id: TM, current: true }];
  if (p === '/team/members') return [200, [{ id: 'u1' }]];

  // Echo for raw api_request testing
  if (p.startsWith('/echo')) return [200, { method: m, path: p, query: q, body: body ?? null }];

  return [404, { error: 'no mock for', method: m, path: p }];
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, 'http://localhost');
  const body = await readBody(req);
  const [status, data, ct] = route(req, body, urlObj);
  requests.push({ method: req.method, path: urlObj.pathname, query: Object.fromEntries(urlObj.searchParams), body, status });
  send(res, status, data, ct);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`MOCK_LISTENING port=${server.address().port}`);
});

function dump() {
  console.log('\n---REQUEST_LOG---');
  console.log(JSON.stringify(requests, null, 2));
  console.log('---END_REQUEST_LOG---');
  process.exit(0);
}
process.on('SIGTERM', dump);
process.on('SIGINT', dump);

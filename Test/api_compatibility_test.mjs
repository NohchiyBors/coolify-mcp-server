import assert from 'node:assert/strict';
import { tools } from '../dist/tools.js';
import { CoolifyApiError } from '../dist/coolify-client.js';

const cfg = { id: 'test', apiBaseUrl: 'https://audit.invalid/api/v1', apiToken: 'synthetic', timeoutMs: 1000, userAgent: 'test', allowRawWrite: false };
const originalFetch = globalThis.fetch;
const requests = [];
let reply = () => ({ status: 200, data: {} });
const invoke = async (name, args = {}) => tools.find((t) => t.name === name).handler(cfg, args);
globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'audit.invalid');
  const request = { path: parsed.pathname.slice('/api/v1'.length), method: options.method, query: Object.fromEntries(parsed.searchParams), body: options.body === undefined ? undefined : JSON.parse(options.body) };
  requests.push(request);
  const { status, data } = reply(request);
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
};

try {
  for (const [tool, path, extra] of [
    ['coolify_get_application_logs', '/applications/app%2Fid/logs', {}],
    ['coolify_get_preview_application_logs', '/applications/app%2Fid/previews/42/logs', { pull_request_id: 42 }],
    ['coolify_get_database_logs', '/databases/app%2Fid/logs', {}],
    ['coolify_get_service_logs', '/services/app%2Fid/logs', { sub_service_name: 'worker one' }],
  ]) {
    for (const lines of [undefined, 1, 10000, -1, 'all']) {
      await invoke(tool, { uuid: 'app/id', ...extra, ...(lines === undefined ? {} : { lines }), show_timestamps: false });
      const request = requests.at(-1);
      assert.equal(request.path, path);
      assert.equal(request.method, 'GET');
      assert.equal(request.query.lines, lines === undefined ? undefined : String(lines));
      assert.equal(request.query.show_timestamps, 'false');
      assert.equal(request.query.sub_service_name, extra.sub_service_name);
    }
  }
  await invoke('coolify_get_application_logs', { uuid: 'app', lines: 'all', show_timestamps: true });
  assert.equal(requests.at(-1).query.show_timestamps, 'true');
  await invoke('coolify_get_application_logs', { uuid: 'app' });
  assert.deepEqual(requests.at(-1).query, {});
  for (const lines of [0, -2, 1.5, 10001, '10', 'ALL', null, {}, Infinity]) {
    const before = requests.length;
    await assert.rejects(invoke('coolify_get_application_logs', { uuid: 'app', lines }), /Argument lines/);
    assert.equal(requests.length, before);
  }
  for (const pull_request_id of [0, -1, 1.1, '42', Number.MAX_SAFE_INTEGER + 1]) {
    const before = requests.length;
    await assert.rejects(invoke('coolify_get_preview_application_logs', { uuid: 'app', pull_request_id }), /positive integer/);
    assert.equal(requests.length, before);
  }

  for (const [tool, suffix] of [['coolify_get_current_team', ''], ['coolify_get_current_team_members', '/members']]) {
    requests.length = 0;
    await invoke(tool);
    assert.deepEqual(requests.map((r) => r.path), [`/team${suffix}`]);
    reply = (r) => ({ status: r.path === `/team${suffix}` ? 404 : 200, data: {} });
    requests.length = 0;
    await invoke(tool);
    assert.deepEqual(requests.map((r) => r.path), [`/team${suffix}`, `/teams/current${suffix}`]);
    for (const status of [401, 403, 429, 500]) {
      reply = () => ({ status, data: { api_token: 'must-not-leak' } });
      requests.length = 0;
      await assert.rejects(invoke(tool), (e) => e instanceof CoolifyApiError && e.status === status && !e.message.includes('must-not-leak'));
      assert.equal(requests.length, 1);
    }
    reply = () => { throw new TypeError('network failure'); };
    requests.length = 0;
    await assert.rejects(invoke(tool), /network failure/);
    assert.equal(requests.length, 1);
    reply = () => ({ status: 200, data: {} });
  }

  const yaml = 'services:\n  web:\n    image: nginx\n    environment:\n      GREETING: "Привет 🌍"\n';
  const body = { project_uuid: 'p', server_uuid: 's', environment_uuid: 'e', docker_compose_raw: yaml };
  const unchanged = structuredClone(body);
  requests.length = 0;
  await invoke('coolify_create_service_dockercompose', { body, confirm: true });
  assert.equal(requests.at(-1).path, '/services');
  assert.equal(requests.at(-1).method, 'POST');
  assert.equal(Buffer.from(requests.at(-1).body.docker_compose_raw, 'base64').toString('utf8'), yaml);
  assert.equal(requests.at(-1).body.instant_deploy, undefined);
  assert.deepEqual(body, unchanged);
  await invoke('coolify_create_service_dockercompose', { body: { ...body, instant_deploy: true }, confirm: true });
  assert.equal(requests.at(-1).body.instant_deploy, true);
  for (const args of [
    { body },
    { body, confirm: false },
    { body: { ...body, type: 'n8n' }, confirm: true },
    { body: { ...body, environment_uuid: '' }, confirm: true },
    { body: { ...body, docker_compose_raw: '' }, confirm: true },
    { body: { ...body, project_uuid: '' }, confirm: true },
  ]) {
    const before = requests.length;
    await assert.rejects(invoke('coolify_create_service_dockercompose', args));
    assert.equal(requests.length, before);
  }

  for (const version of ['4.0.0', { version: 'v4.0.0-beta.420' }]) {
    reply = (r) => ({ status: 200, data: r.path === '/version' ? version : {} });
    requests.length = 0;
    const legacyBody = { docker_compose_raw: 'already-encoded' };
    await invoke('coolify_create_application_dockercompose', { body: legacyBody, confirm: true });
    assert.deepEqual(requests.map((r) => [r.method, r.path]), [['GET', '/version'], ['POST', '/applications/dockercompose']]);
    assert.deepEqual(requests.at(-1).body, legacyBody);
  }
  for (const version of ['4.1.0', '4.3.23', '5.0.0', {}, 'unknown']) {
    reply = () => ({ status: 200, data: version });
    requests.length = 0;
    await assert.rejects(invoke('coolify_create_application_dockercompose', { body: {}, confirm: true }), /coolify_create_service_dockercompose/);
    assert.deepEqual(requests.map((r) => r.method), ['GET']);
  }
  requests.length = 0;
  await assert.rejects(invoke('coolify_create_application_dockercompose', { body: {} }), /confirm=true/);
  await assert.rejects(invoke('coolify_execute_application_command', { uuid: 'app', command: 'whoami', confirm: true }), /No command was executed/);
  assert.equal(requests.length, 0);
  await assert.rejects(invoke('coolify_get_service_logs', { uuid: 'service' }), /sub_service_name/);
  assert.equal(requests.length, 0);
  console.log('api_compatibility_test: PASS (log parameters, team fallback boundaries, compose wire encoding/version gates, unsupported execution never sent)');
} finally {
  globalThis.fetch = originalFetch;
}

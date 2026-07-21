import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../dist/config.js';
import { callCoolifyApi } from '../dist/coolify-client.js';
import { formatAuditError } from './audit-safety.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const reportDir = resolve(projectRoot, 'StatusProject');
const timeoutMs = Number(process.env.COOLIFY_AUDIT_TIMEOUT_MS || 8000);

function uniqueProfiles(config) {
  const seen = new Set();
  const profiles = [];
  for (const cfg of Object.values(config.servers)) {
    if (seen.has(cfg.id)) continue;
    seen.add(cfg.id);
    profiles.push({
      config: { ...cfg, timeoutMs: Math.min(cfg.timeoutMs, timeoutMs) },
      aliases: Object.entries(config.servers)
        .filter(([, value]) => value === cfg)
        .map(([key]) => key)
        .sort(),
    });
  }
  return profiles.sort((a, b) => a.config.id.localeCompare(b.config.id));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of ['data', 'items', 'servers', 'applications', 'services', 'databases', 'resources', 'domains']) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

function firstOf(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function safeString(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function itemServerUuid(item) {
  return firstOf(item, ['server_uuid', 'serverUuid']) ??
    firstOf(firstOf(item, ['server', 'destination', 'destination_server']), ['uuid', 'id']);
}

function itemProjectUuid(item) {
  return firstOf(item, ['project_uuid', 'projectUuid']) ??
    firstOf(firstOf(item, ['project']), ['uuid', 'id']);
}

function itemName(item) {
  return safeString(firstOf(item, ['name', 'fqdn', 'domain', 'uuid', 'id'])) ?? '(unnamed)';
}

function itemStatus(item) {
  return safeString(firstOf(item, ['status', 'application_status', 'service_status', 'database_status', 'state']));
}

function itemDomains(item) {
  const values = [
    firstOf(item, ['fqdn', 'domain', 'domains']),
    firstOf(item, ['url', 'urls']),
  ].flatMap((value) => Array.isArray(value) ? value : [value]);
  return [...new Set(values.map(safeString).filter(Boolean))];
}

function serverDomainGroups(domains) {
  const groups = [];
  for (const item of domains) {
    if (item && typeof item === 'object' && Array.isArray(item.domains)) {
      groups.push({
        ip: safeString(firstOf(item, ['ip'])),
        domains: [...new Set(item.domains.map(safeString).filter(Boolean))].sort(),
      });
      continue;
    }

    const domain = safeString(firstOf(item, ['domain', 'fqdn', 'name', 'url'])) ?? safeString(item);
    if (domain) groups.push({ ip: undefined, domains: [domain] });
  }
  return groups;
}

function describeResource(item, kind) {
  const bits = [];
  const uuid = safeString(firstOf(item, ['uuid', 'id']));
  const status = itemStatus(item);
  const projectUuid = safeString(itemProjectUuid(item));
  const publicPort = safeString(firstOf(item, ['public_port', 'port']));
  const dbName = kind === 'database' ? safeString(firstOf(item, ['postgres_db', 'mysql_database', 'database', 'db_name'])) : undefined;
  const domains = itemDomains(item);

  if (uuid) bits.push(`uuid=${uuid}`);
  if (status) bits.push(`status=${status}`);
  if (projectUuid) bits.push(`project=${projectUuid}`);
  if (domains.length) bits.push(`domains=${domains.join(', ')}`);
  if (publicPort) bits.push(`port=${publicPort}`);
  if (dbName) bits.push(`db=${dbName}`);

  return bits.length ? `${itemName(item)} (${bits.join('; ')})` : itemName(item);
}

function summarizeResource(item) {
  return {
    uuid: safeString(firstOf(item, ['uuid', 'id'])),
    name: itemName(item),
    status: itemStatus(item),
    server_uuid: safeString(itemServerUuid(item)),
    project_uuid: safeString(itemProjectUuid(item)),
    domains: itemDomains(item),
    public_port: safeString(firstOf(item, ['public_port', 'port'])),
    database: safeString(firstOf(item, ['postgres_db', 'mysql_database', 'database', 'db_name'])),
    type: safeString(firstOf(item, ['type'])),
  };
}

async function get(config, path) {
  try {
    const result = await callCoolifyApi(config, { path });
    return { ok: true, data: result.data };
  } catch (error) {
    return {
      ok: false,
      error: formatAuditError(error),
    };
  }
}

function buildServerMap(servers) {
  const map = new Map();
  for (const server of servers) {
    const uuid = safeString(firstOf(server, ['uuid', 'id'])) ?? `server:${itemName(server)}`;
    map.set(uuid, {
      uuid,
      name: itemName(server),
      ip: safeString(firstOf(server, ['ip'])),
      status: itemStatus(server),
      usable: safeString(firstOf(server, ['is_usable', 'is_reachable', 'is_validated'])),
      domains: [],
      applications: [],
      services: [],
      databases: [],
    });
  }
  if (!map.size) {
    map.set('unknown', {
      uuid: 'unknown',
      name: 'unknown server',
      domains: [],
      applications: [],
      services: [],
      databases: [],
    });
  }
  return map;
}

function addResource(map, collection, item) {
  const serverUuid = safeString(itemServerUuid(item));
  const target = (serverUuid && map.get(serverUuid)) || map.get('unknown') || [...map.values()][0];
  target[collection].push(summarizeResource(item));
}

function renderTree(audit) {
  const lines = [];
  lines.push('# Coolify Server Tree');
  lines.push('');
  lines.push(`- Date: \`${audit.date}\``);
  lines.push(`- Mode: \`read-only\``);
  lines.push(`- Endpoint timeout: \`${audit.timeoutMs}ms\``);
  lines.push('');

  for (const profile of audit.profiles) {
    lines.push(`## ${profile.id}`);
    lines.push('');
    lines.push(`- API: \`${profile.apiBaseUrl}\``);
    lines.push(`- Aliases: \`${profile.aliases.join('`, `')}\``);
    lines.push(`- Version: \`${profile.version ?? 'unavailable'}\``);
    if (profile.errors.length) {
      lines.push(`- Errors: \`${profile.errors.length}\``);
      for (const err of profile.errors) lines.push(`  - \`${err.scope}\`: ${err.error}`);
    }
    lines.push('');
    lines.push('```text');
    lines.push(`${profile.id}`);
    for (const server of profile.servers) {
      const serverBits = [
        server.uuid !== 'unknown' ? `uuid=${server.uuid}` : undefined,
        server.ip ? `ip=${server.ip}` : undefined,
        server.status ? `status=${server.status}` : undefined,
        server.usable ? `usable=${server.usable}` : undefined,
      ].filter(Boolean).join('; ');
      lines.push(`├─ ${server.name}${serverBits ? ` (${serverBits})` : ''}`);

      if (server.domains.length) {
        lines.push('│  ├─ domains');
        for (const group of serverDomainGroups(server.domains)) {
          if (group.ip) lines.push(`│  │  ├─ ${group.ip}`);
          for (const domain of group.domains) lines.push(`│  │  │  └─ ${domain}`);
        }
      } else {
        lines.push('│  ├─ domains: none observed');
      }

      const groups = [
        ['applications', server.applications, 'application'],
        ['services', server.services, 'service'],
        ['databases', server.databases, 'database'],
      ];
      for (const [label, items, kind] of groups) {
        if (!items.length) {
          lines.push(`│  ├─ ${label}: none observed`);
          continue;
        }
        lines.push(`│  ├─ ${label}`);
        for (const item of items) lines.push(`│  │  └─ ${describeResource(item, kind)}`);
      }
    }
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

const config = loadConfig();
const audit = {
  date: new Date().toISOString(),
  timeoutMs,
  profiles: [],
};

for (const profile of uniqueProfiles(config)) {
  const profileAudit = {
    id: profile.config.id,
    apiBaseUrl: profile.config.apiBaseUrl,
    aliases: profile.aliases,
    version: undefined,
    servers: [],
    errors: [],
  };

  const [version, servers, applications, services, databases] = await Promise.all([
    get(profile.config, '/version'),
    get(profile.config, '/servers'),
    get(profile.config, '/applications'),
    get(profile.config, '/services'),
    get(profile.config, '/databases'),
  ]);

  if (version.ok) profileAudit.version = typeof version.data === 'string' ? version.data : JSON.stringify(version.data);
  else profileAudit.errors.push({ scope: 'version', error: version.error });

  if (!servers.ok) profileAudit.errors.push({ scope: 'servers', error: servers.error });
  if (!applications.ok) profileAudit.errors.push({ scope: 'applications', error: applications.error });
  if (!services.ok) profileAudit.errors.push({ scope: 'services', error: services.error });
  if (!databases.ok) profileAudit.errors.push({ scope: 'databases', error: databases.error });

  const serverMap = buildServerMap(servers.ok ? asArray(servers.data) : []);

  for (const server of serverMap.values()) {
    if (server.uuid === 'unknown') continue;
    const domains = await get(profile.config, `/servers/${encodeURIComponent(server.uuid)}/domains`);
    if (domains.ok) server.domains = serverDomainGroups(asArray(domains.data));
    else profileAudit.errors.push({ scope: `server_domains:${server.name}`, error: domains.error });
  }

  for (const item of applications.ok ? asArray(applications.data) : []) addResource(serverMap, 'applications', item);
  for (const item of services.ok ? asArray(services.data) : []) addResource(serverMap, 'services', item);
  for (const item of databases.ok ? asArray(databases.data) : []) addResource(serverMap, 'databases', item);

  profileAudit.servers = [...serverMap.values()].map((server) => ({
    uuid: server.uuid,
    name: server.name,
    ip: server.ip,
    status: server.status,
    usable: server.usable,
    domains: server.domains,
    applications: server.applications,
    services: server.services,
    databases: server.databases,
  }));

  audit.profiles.push(profileAudit);
}

await mkdir(reportDir, { recursive: true });
const datePart = new Date().toISOString().slice(0, 10);
const jsonPath = resolve(reportDir, `coolify-server-tree-${datePart}.json`);
const mdPath = resolve(reportDir, `coolify-server-tree-${datePart}.md`);
await writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
await writeFile(mdPath, renderTree(audit), 'utf8');

console.log(renderTree(audit));
console.error(JSON.stringify({ jsonPath, mdPath }, null, 2));

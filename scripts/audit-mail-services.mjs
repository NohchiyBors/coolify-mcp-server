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
const profileIds = ['host', 'hostkz'];
const timeoutMs = Number(process.env.COOLIFY_AUDIT_TIMEOUT_MS || 8000);
const mailPattern = /(mail|relay|smtp|imap|pop3?|mx|postfix|dovecot|roundcube)/i;
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tbilisi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const localDatePart = localDateFormatter.format(new Date());

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
  if (Array.isArray(value)) return value.filter(Boolean).join(',');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function itemText(item) {
  if (!item || typeof item !== 'object') return safeString(item) ?? '';
  return [
    firstOf(item, ['name', 'fqdn', 'domain', 'domains', 'url', 'urls', 'type', 'description']),
  ].map(safeString).filter(Boolean).join(' ');
}

function matchesMail(item) {
  return mailPattern.test(itemText(item));
}

function itemServerUuid(item) {
  return firstOf(item, ['server_uuid', 'serverUuid']) ??
    firstOf(firstOf(item, ['server', 'destination', 'destination_server']), ['uuid', 'id']);
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

function describe(item) {
  const bits = [];
  const uuid = safeString(firstOf(item, ['uuid', 'id']));
  const status = itemStatus(item);
  const domains = itemDomains(item);
  const type = safeString(firstOf(item, ['type']));
  if (uuid) bits.push(`uuid=${uuid}`);
  if (status) bits.push(`status=${status}`);
  if (type) bits.push(`type=${type}`);
  if (domains.length) bits.push(`domains=${domains.join(', ')}`);
  return `${itemName(item)}${bits.length ? ` (${bits.join('; ')})` : ''}`;
}

function summarizeResource(item) {
  return {
    uuid: safeString(firstOf(item, ['uuid', 'id'])),
    name: itemName(item),
    status: itemStatus(item),
    server_uuid: safeString(itemServerUuid(item)),
    domains: itemDomains(item),
    type: safeString(firstOf(item, ['type'])),
  };
}

function domainRows(domainData) {
  const rows = [];
  for (const item of asArray(domainData)) {
    if (item && typeof item === 'object' && Array.isArray(item.domains)) {
      for (const domain of item.domains) {
        const text = safeString(domain);
        if (text && mailPattern.test(text)) rows.push({ ip: safeString(item.ip), domain: text });
      }
      continue;
    }
    const text = safeString(firstOf(item, ['domain', 'fqdn', 'name', 'url'])) ?? safeString(item);
    if (text && mailPattern.test(text)) rows.push({ ip: undefined, domain: text });
  }
  return rows.sort((a, b) => `${a.ip ?? ''}${a.domain}`.localeCompare(`${b.ip ?? ''}${b.domain}`));
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

function renderMarkdown(audit) {
  const lines = [];
  lines.push('# Mail Services Audit');
  lines.push('');
  lines.push(`- Date: \`${audit.date}\``);
  lines.push(`- Profiles: \`${audit.profiles.map((p) => p.id).join('`, `')}\``);
  lines.push(`- Mode: \`read-only\``);
  lines.push('');
  for (const profile of audit.profiles) {
    lines.push(`## ${profile.id}`);
    lines.push('');
    lines.push(`- API: \`${profile.apiBaseUrl}\``);
    lines.push(`- Version: \`${profile.version ?? 'unavailable'}\``);
    if (profile.errors.length) {
      lines.push(`- Errors: \`${profile.errors.length}\``);
      for (const err of profile.errors) lines.push(`  - \`${err.scope}\`: ${err.error}`);
    }
    lines.push('');
    lines.push('```text');
    lines.push(profile.id);
    for (const server of profile.servers) {
      lines.push(`├─ ${server.name} (${[
        server.uuid ? `uuid=${server.uuid}` : undefined,
        server.ip ? `ip=${server.ip}` : undefined,
      ].filter(Boolean).join('; ')})`);
      if (server.mailDomains.length) {
        lines.push('│  ├─ mail domains');
        for (const row of server.mailDomains) lines.push(`│  │  └─ ${row.ip ? `${row.ip}: ` : ''}${row.domain}`);
      } else {
        lines.push('│  ├─ mail domains: none observed');
      }
      for (const key of ['applications', 'services', 'databases']) {
        if (!server[key].length) {
          lines.push(`│  ├─ ${key}: none observed`);
          continue;
        }
        lines.push(`│  ├─ ${key}`);
        for (const item of server[key]) lines.push(`│  │  └─ ${describe(item)}`);
      }
    }
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

const config = loadConfig();
const audit = { date: `${localDatePart} Asia/Tbilisi`, profiles: [] };

for (const id of profileIds) {
  const cfg = config.servers[id];
  if (!cfg) {
    audit.profiles.push({ id, apiBaseUrl: undefined, version: undefined, servers: [], errors: [{ scope: 'config', error: 'Profile is not configured' }] });
    continue;
  }
  const profileCfg = { ...cfg, timeoutMs: Math.min(cfg.timeoutMs, timeoutMs) };
  const profile = { id, apiBaseUrl: profileCfg.apiBaseUrl, version: undefined, servers: [], errors: [] };
  const [version, servers, applications, services, databases] = await Promise.all([
    get(profileCfg, '/version'),
    get(profileCfg, '/servers'),
    get(profileCfg, '/applications'),
    get(profileCfg, '/services'),
    get(profileCfg, '/databases'),
  ]);

  if (version.ok) profile.version = typeof version.data === 'string' ? version.data : JSON.stringify(version.data);
  else profile.errors.push({ scope: 'version', error: version.error });
  if (!servers.ok) profile.errors.push({ scope: 'servers', error: servers.error });
  if (!applications.ok) profile.errors.push({ scope: 'applications', error: applications.error });
  if (!services.ok) profile.errors.push({ scope: 'services', error: services.error });
  if (!databases.ok) profile.errors.push({ scope: 'databases', error: databases.error });

  const serverMap = new Map();
  for (const server of servers.ok ? asArray(servers.data) : []) {
    const uuid = safeString(firstOf(server, ['uuid', 'id']));
    if (!uuid) continue;
    serverMap.set(uuid, {
      uuid,
      name: itemName(server),
      ip: safeString(firstOf(server, ['ip'])),
      mailDomains: [],
      applications: [],
      services: [],
      databases: [],
    });
  }
  if (!serverMap.size) {
    serverMap.set('unknown', { uuid: 'unknown', name: 'unknown server', mailDomains: [], applications: [], services: [], databases: [] });
  }

  for (const server of serverMap.values()) {
    if (server.uuid === 'unknown') continue;
    const domains = await get(profileCfg, `/servers/${encodeURIComponent(server.uuid)}/domains`);
    if (domains.ok) server.mailDomains = domainRows(domains.data);
    else profile.errors.push({ scope: `server_domains:${server.name}`, error: domains.error });
  }

  const add = (collection, item) => {
    if (!matchesMail(item)) return;
    const serverUuid = safeString(itemServerUuid(item));
    const server = (serverUuid && serverMap.get(serverUuid)) || serverMap.get('unknown') || [...serverMap.values()][0];
    server[collection].push(summarizeResource(item));
  };
  for (const item of applications.ok ? asArray(applications.data) : []) add('applications', item);
  for (const item of services.ok ? asArray(services.data) : []) add('services', item);
  for (const item of databases.ok ? asArray(databases.data) : []) add('databases', item);

  profile.servers = [...serverMap.values()];
  audit.profiles.push(profile);
}

await mkdir(reportDir, { recursive: true });
const datePart = localDatePart;
const jsonPath = resolve(reportDir, `mail-services-${datePart}.json`);
const mdPath = resolve(reportDir, `mail-services-${datePart}.md`);
await writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
await writeFile(mdPath, renderMarkdown(audit), 'utf8');
console.log(renderMarkdown(audit));
console.error(JSON.stringify({ jsonPath, mdPath }, null, 2));

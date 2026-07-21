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

const endpoints = [
  ['version', '/version'],
  ['projects', '/projects'],
  ['servers', '/servers'],
  ['applications', '/applications'],
  ['services', '/services'],
  ['databases', '/databases'],
  ['deployments', '/deployments'],
  ['resources', '/resources'],
  ['teams', '/teams'],
];

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of ['data', 'items', 'projects', 'servers', 'applications', 'services', 'databases', 'deployments', 'resources']) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') out[key] = obj[key];
  }
  return out;
}

function firstOf(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function summarizeList(kind, data) {
  return asArray(data).map((item) => {
    const base = pick(item, [
      'id',
      'uuid',
      'name',
      'description',
      'fqdn',
      'domains',
      'status',
      'application_status',
      'database_status',
      'service_status',
      'type',
      'environment_name',
      'environment',
      'project_uuid',
      'server_uuid',
      'destination_uuid',
      'ip',
      'user',
      'port',
      'is_reachable',
      'is_usable',
      'is_validated',
      'is_public',
      'public_port',
      'created_at',
      'updated_at',
    ]);

    if (kind === 'resources') {
      base.resource_kind = firstOf(item, ['resource_type', 'type', 'kind']);
      base.resource_uuid = firstOf(item, ['uuid', 'resource_uuid']);
    }

    return base;
  });
}

function statusCounts(items) {
  const counts = {};
  for (const item of items) {
    const status = firstOf(item, ['status', 'application_status', 'database_status', 'service_status']) ?? 'unknown';
    counts[String(status)] = (counts[String(status)] ?? 0) + 1;
  }
  return counts;
}

function uniqueProfiles(config) {
  const seen = new Set();
  const profiles = [];
  for (const cfg of Object.values(config.servers)) {
    if (seen.has(cfg.id)) continue;
    seen.add(cfg.id);
    profiles.push({
      config: cfg,
      aliases: Object.entries(config.servers)
        .filter(([, value]) => value === cfg)
        .map(([key]) => key)
        .sort(),
    });
  }
  return profiles.sort((a, b) => a.config.id.localeCompare(b.config.id));
}

async function fetchEndpoint(config, path) {
  try {
    const result = await callCoolifyApi(config, { path });
    return { ok: true, status: result.status, data: result.data };
  } catch (error) {
    return {
      ok: false,
      error: formatAuditError(error),
    };
  }
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push(`# Coolify Projects Audit`);
  lines.push('');
  lines.push(`- Date: \`${audit.date}\``);
  lines.push(`- Default profile: \`${audit.defaultServerId}\``);
  lines.push(`- Profiles audited: \`${audit.profiles.length}\``);
  lines.push(`- Mode: \`read-only\``);
  lines.push('');

  for (const profile of audit.profiles) {
    lines.push(`## ${profile.id}`);
    lines.push('');
    lines.push(`- API: \`${profile.apiBaseUrl}\``);
    lines.push(`- Aliases: \`${profile.aliases.join('`, `')}\``);
    lines.push(`- Version: \`${profile.version ?? 'unavailable'}\``);
    lines.push(`- Errors: \`${profile.errors.length}\``);
    if (profile.errors.length) {
      for (const err of profile.errors) lines.push(`  - \`${err.endpoint}\`: ${err.error}`);
    }
    lines.push('');
    lines.push('| Area | Count | Status counts |');
    lines.push('| --- | ---: | --- |');
    for (const key of ['projects', 'servers', 'applications', 'services', 'databases', 'deployments', 'resources', 'teams']) {
      const summary = profile.summary[key] ?? { count: 0, statusCounts: {} };
      lines.push(`| ${key} | ${summary.count} | \`${JSON.stringify(summary.statusCounts)}\` |`);
    }
    lines.push('');

    for (const key of ['projects', 'servers', 'applications', 'services', 'databases']) {
      const items = profile.items[key] ?? [];
      if (!items.length) continue;
      lines.push(`### ${key}`);
      lines.push('');
      for (const item of items) {
        const label = item.name ?? item.uuid ?? item.id ?? '(unnamed)';
        const status = firstOf(item, ['status', 'application_status', 'database_status', 'service_status']);
        const bits = [
          item.uuid ? `uuid=${item.uuid}` : undefined,
          status ? `status=${status}` : undefined,
          item.fqdn ? `fqdn=${item.fqdn}` : undefined,
          item.public_port ? `public_port=${item.public_port}` : undefined,
          item.ip ? `ip=${item.ip}` : undefined,
        ].filter(Boolean).join('; ');
        lines.push(`- \`${label}\`${bits ? ` — ${bits}` : ''}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

const config = loadConfig();
const audit = {
  date: new Date().toISOString(),
  defaultServerId: config.defaultServerId,
  profiles: [],
};

for (const profile of uniqueProfiles(config)) {
  const profileAudit = {
    id: profile.config.id,
    apiBaseUrl: profile.config.apiBaseUrl,
    aliases: profile.aliases,
    version: undefined,
    summary: {},
    items: {},
    errors: [],
  };

  for (const [name, path] of endpoints) {
    const result = await fetchEndpoint(profile.config, path);
    if (!result.ok) {
      profileAudit.errors.push({ endpoint: name, error: result.error });
      continue;
    }

    if (name === 'version') {
      profileAudit.version = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
      continue;
    }

    const items = summarizeList(name, result.data);
    profileAudit.items[name] = items;
    profileAudit.summary[name] = {
      count: items.length,
      statusCounts: statusCounts(items),
    };
  }

  audit.profiles.push(profileAudit);
}

await mkdir(reportDir, { recursive: true });
const datePart = new Date().toISOString().slice(0, 10);
const jsonPath = resolve(reportDir, `coolify-audit-${datePart}.json`);
const mdPath = resolve(reportDir, `coolify-audit-${datePart}.md`);
await writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
await writeFile(mdPath, renderMarkdown(audit), 'utf8');

console.log(JSON.stringify({
  jsonPath,
  mdPath,
  profiles: audit.profiles.map((profile) => ({
    id: profile.id,
    version: profile.version ?? null,
    errors: profile.errors.length,
    projects: profile.summary.projects?.count ?? 0,
    servers: profile.summary.servers?.count ?? 0,
    applications: profile.summary.applications?.count ?? 0,
    services: profile.summary.services?.count ?? 0,
    databases: profile.summary.databases?.count ?? 0,
    resources: profile.summary.resources?.count ?? 0,
  })),
}, null, 2));

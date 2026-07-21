import assert from 'node:assert/strict';

import { loadConfig } from '../dist/config.js';

const originalCoolifyEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.startsWith('COOLIFY_')),
);

function replaceCoolifyEnv(values) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('COOLIFY_')) delete process.env[key];
  }
  Object.assign(process.env, values);
}

try {
  replaceCoolifyEnv({
    COOLIFY_API_TOKEN: 'default-token',
    COOLIFY_API_BASE_URL: 'https://Host.Example.com/api/v1',
  });
  const defaultConfig = loadConfig();
  assert.equal(defaultConfig.defaultServerId, 'host');
  assert.equal(defaultConfig.servers.host.id, 'host');
  assert.equal(defaultConfig.servers['host.example.com'], defaultConfig.servers.host);

  replaceCoolifyEnv({
    COOLIFY_PROD_API_TOKEN: 'prod-token',
    COOLIFY_PROD_API_BASE_URL: 'https://prod.example.com/api/v1',
  });
  const namedOnlyConfig = loadConfig();
  assert.equal(namedOnlyConfig.defaultServerId, 'prod');
  assert.equal(namedOnlyConfig.servers['prod.example.com'], namedOnlyConfig.servers.prod);

  replaceCoolifyEnv({
    COOLIFY_1_API_TOKEN: 'indexed-token',
    COOLIFY_1_ID: 'Staging',
    COOLIFY_1_API_BASE_URL: 'https://staging.example.com/api/v1',
  });
  const indexedConfig = loadConfig();
  assert.equal(indexedConfig.defaultServerId, 'staging');
  assert.equal(indexedConfig.servers['staging.example.com'], indexedConfig.servers.staging);

  replaceCoolifyEnv({});
  assert.throws(() => loadConfig(), /No Coolify servers configured/);

  console.log('config tests passed');
} finally {
  replaceCoolifyEnv(originalCoolifyEnv);
}

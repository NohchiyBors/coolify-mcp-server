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
    COOLIFY_EXTERNAL_IP: ' 203.0.113.10 ',
    COOLIFY_LOCAL_IP: '10.10.10.100',
  });
  const defaultConfig = loadConfig();
  assert.equal(defaultConfig.defaultServerId, 'host');
  assert.equal(defaultConfig.servers.host.id, 'host');
  assert.equal(defaultConfig.servers['host.example.com'], defaultConfig.servers.host);
  assert.equal(defaultConfig.servers.host.externalIp, '203.0.113.10');
  assert.equal(defaultConfig.servers.host.localIp, '10.10.10.100');
  assert.equal(defaultConfig.servers.host.apiBaseUrl, 'https://Host.Example.com/api/v1');
  assert.equal(defaultConfig.servers['203.0.113.10'], undefined);

  replaceCoolifyEnv({
    COOLIFY_PROD_API_TOKEN: 'prod-token',
    COOLIFY_PROD_API_BASE_URL: 'https://prod.example.com/api/v1',
    COOLIFY_PROD_EXTERNAL_IP: '2001:db8::10',
    COOLIFY_PROD_LOCAL_IP: 'fd00::10',
  });
  const namedOnlyConfig = loadConfig();
  assert.equal(namedOnlyConfig.defaultServerId, 'prod');
  assert.equal(namedOnlyConfig.servers['prod.example.com'], namedOnlyConfig.servers.prod);
  assert.equal(namedOnlyConfig.servers.prod.externalIp, '2001:db8::10');
  assert.equal(namedOnlyConfig.servers.prod.localIp, 'fd00::10');

  replaceCoolifyEnv({
    COOLIFY_1_API_TOKEN: 'indexed-token',
    COOLIFY_1_ID: 'Staging',
    COOLIFY_1_API_BASE_URL: 'https://staging.example.com/api/v1',
    COOLIFY_1_EXTERNAL_IP: '198.51.100.10',
    COOLIFY_1_LOCAL_IP: '192.168.1.10',
  });
  const indexedConfig = loadConfig();
  assert.equal(indexedConfig.defaultServerId, 'staging');
  assert.equal(indexedConfig.servers['staging.example.com'], indexedConfig.servers.staging);
  assert.equal(indexedConfig.servers.staging.externalIp, '198.51.100.10');
  assert.equal(indexedConfig.servers.staging.localIp, '192.168.1.10');

  replaceCoolifyEnv({
    COOLIFY_API_TOKEN: 'default-token',
    COOLIFY_EXTERNAL_IP: '203.0.113.10',
    COOLIFY_LOCAL_IP: '10.10.10.100',
    COOLIFY_PROD_API_TOKEN: 'prod-token',
    COOLIFY_PROD_API_BASE_URL: 'https://prod.example.com/api/v1',
    COOLIFY_PROD_EXTERNAL_IP: ' ',
    COOLIFY_PROD_LOCAL_IP: '',
  });
  const separateConfig = loadConfig();
  assert.equal(separateConfig.servers.prod.externalIp, undefined);
  assert.equal(separateConfig.servers.prod.localIp, undefined);

  for (const key of ['COOLIFY_EXTERNAL_IP', 'COOLIFY_LOCAL_IP', 'COOLIFY_PROD_EXTERNAL_IP', 'COOLIFY_1_LOCAL_IP']) {
    for (const value of ['example.com', '10.0.0.1:8000', '10.0.0.1/24', '[::1]', '999.1.1.1']) {
      replaceCoolifyEnv({ COOLIFY_API_TOKEN: 'default-token', COOLIFY_PROD_API_TOKEN: 'prod-token', COOLIFY_1_API_TOKEN: 'indexed-token', [key]: value });
      assert.throws(() => loadConfig(), new RegExp(`Environment variable ${key} must be an IPv4 or IPv6 address`));
    }
  }

  replaceCoolifyEnv({});
  assert.throws(() => loadConfig(), /No Coolify servers configured/);

  console.log('config tests passed');
} finally {
  replaceCoolifyEnv(originalCoolifyEnv);
}

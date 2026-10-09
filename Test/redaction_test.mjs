import assert from 'node:assert/strict';
import { redactSensitiveData, redactSensitiveText } from '../dist/redaction.js';

const input = {
  settings: {
    sentinel_token: 'sentinel-secret',
    nested: {
      api_key: 'api-secret',
      logdrain_custom_config: 'logdrain-secret',
      internal_db_url: 'postgres://user:db-secret@example.invalid/db',
      safe: 'visible',
    },
  },
  array: [{ password: 'password-secret', name: 'kept' }],
  envs: [
    { key: 'SMTP_PASSWORD', value: 'env-secret' },
    { key: 'OPAQUE', real_value: 'real-env-secret' },
  ],
  authorization: 'Bearer hidden',
  private_key_uuid: 'safe-key-uuid',
  sentinel_token_updated_at: '2026-09-19T00:00:00Z',
  message: 'Authorization: Bearer message-secret',
};
const output = redactSensitiveData(input);
assert.equal(output.settings.sentinel_token, '[REDACTED]');
assert.equal(output.settings.nested.api_key, '[REDACTED]');
assert.equal(output.settings.nested.logdrain_custom_config, '[REDACTED]');
assert.equal(output.settings.nested.internal_db_url, '[REDACTED]');
assert.equal(output.settings.nested.safe, 'visible');
assert.equal(output.array[0].password, '[REDACTED]');
assert.equal(output.array[0].name, 'kept');
assert.equal(output.envs[0].value, '[REDACTED]');
assert.equal(output.envs[1].real_value, '[REDACTED]');
assert.equal(output.authorization, '[REDACTED]');
assert.equal(output.private_key_uuid, 'safe-key-uuid');
assert.equal(output.sentinel_token_updated_at, '2026-09-19T00:00:00Z');
assert.equal(output.message, 'Authorization: Bearer [REDACTED]');

const assigned = redactSensitiveText('sentinel_token=assigned-secret api_key:"quoted-secret"');
assert.equal(assigned.includes('assigned-secret'), false);
assert.equal(assigned.includes('quoted-secret'), false);

for (const secret of [
  'sentinel-secret',
  'api-secret',
  'logdrain-secret',
  'db-secret',
  'password-secret',
  'env-secret',
  'real-env-secret',
  'message-secret',
]) {
  assert.equal(JSON.stringify(output).includes(secret), false);
}
console.log('redaction_test: PASS');

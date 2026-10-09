export const REDACTED_VALUE = '[REDACTED]';

const sensitiveKeyPattern =
  /(?:^|[_-])(?:token|password|passwd|secret|cookie|credential|passphrase|api[_-]?key|private[_-]?key|license[_-]?key)(?:$|[_-])/i;
const safeMetadataKeyPattern =
  /(?:^|_)(?:token|secret|api_key|private_key|license_key)_(?:uuid|id|name|type|expires_at|expiration|created_at|updated_at)$/;
const sensitiveExactKeys = new Set([
  'authorization',
  'internal_db_url',
  'external_db_url',
  'database_url',
  'connection_string',
  'logdrain_custom_config',
  'logdrain_custom_config_parser',
]);
const sensitiveTextLabel =
  '(?:sentinel[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?token|api[_-]?key|password|passwd|client[_-]?secret|private[_-]?key|license[_-]?key|cookie)';
const maxDepth = 20;

export function isSensitiveKey(key: string): boolean {
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (safeMetadataKeyPattern.test(normalized)) return false;
  return sensitiveExactKeys.has(normalized) || sensitiveKeyPattern.test(normalized);
}

export function redactSensitiveText(value: string): string {
  const assignmentPattern = new RegExp(
    `(${sensitiveTextLabel}["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;&}]+)`,
    'gi',
  );

  return value
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED_VALUE}`)
    .replace(
      /(\bauthorization\s*[:=]\s*)(?!Bearer\b)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
      `$1${REDACTED_VALUE}`,
    )
    .replace(assignmentPattern, `$1${REDACTED_VALUE}`);
}

export function redactSensitiveData(value: unknown, depth = 0, visited = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveText(value);
  if (depth >= maxDepth) return '[MaxDepthReached]';
  if (typeof value !== 'object') return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message),
      stack: redactSensitiveText(value.stack ?? ''),
    };
  }

  const objectValue = value as object;
  if (visited.has(objectValue)) return '[Circular]';
  visited.add(objectValue);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1, visited));
  }

  const record = value as Record<string, unknown>;
  const isEnvironmentVariable = typeof record.key === 'string' && ('value' in record || 'real_value' in record);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    const isEnvironmentValue = isEnvironmentVariable && (key === 'value' || key === 'real_value');
    output[key] = isSensitiveKey(key) || isEnvironmentValue
      ? REDACTED_VALUE
      : redactSensitiveData(item, depth + 1, visited);
  }
  return output;
}

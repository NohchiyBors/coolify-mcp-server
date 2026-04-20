type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const secretKeyPattern = /(token|authorization|api[-_]?key|password|secret|cookie)/i;
const maxDepth = 6;

function normalizeLevel(value: string | undefined): LogLevel {
  if (!value) return 'info';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return 'info';
}

function sanitizeString(value: string): string {
  if (value.length > 2_000) {
    return `${value.slice(0, 2_000)}...(truncated)`;
  }
  return value;
}

function sanitizeValue(value: unknown, depth: number, visited: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  const primitiveType = typeof value;
  if (primitiveType === 'string') return sanitizeString(value as string);
  if (primitiveType === 'number' || primitiveType === 'boolean') return value;
  if (primitiveType === 'bigint') return Number(value);
  if (primitiveType === 'function') return '[Function]';
  if (primitiveType === 'symbol') return String(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: sanitizeString(value.stack ?? ''),
    };
  }

  if (depth >= maxDepth) {
    return '[MaxDepthReached]';
  }

  if (typeof value === 'object') {
    const objectValue = value as object;
    if (visited.has(objectValue)) {
      return '[Circular]';
    }
    visited.add(objectValue);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1, visited));
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (secretKeyPattern.test(key)) {
        output[key] = '[REDACTED]';
        continue;
      }
      output[key] = sanitizeValue(item, depth + 1, visited);
    }
    return output;
  }

  return String(value);
}

function serialize(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): string {
  const sanitizedFields = sanitizeValue(fields, 0, new WeakSet<object>());
  const extraFields =
    sanitizedFields && typeof sanitizedFields === 'object' && !Array.isArray(sanitizedFields)
      ? (sanitizedFields as Record<string, unknown>)
      : { fields: sanitizedFields };

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...extraFields,
  };
  return JSON.stringify(payload);
}

export class Logger {
  private readonly minLevel: LogLevel;

  constructor(levelFromEnv = process.env.LOG_LEVEL) {
    this.minLevel = normalizeLevel(levelFromEnv);
  }

  private canLog(level: LogLevel): boolean {
    return levelPriority[level] >= levelPriority[this.minLevel];
  }

  private write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (!this.canLog(level)) return;
    const line = serialize(level, msg, fields);
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.write('debug', msg, fields);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.write('info', msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.write('warn', msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.write('error', msg, fields);
  }
}

export const logger = new Logger();

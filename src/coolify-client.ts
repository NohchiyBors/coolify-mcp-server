import type { ServerConfig } from './config.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD';

export interface ApiCallOptions {
  method?: HttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  auth?: boolean;
}

export interface ApiCallResult {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

function appendSearchParams(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendSearchParams(url, key, item);
    }
    return;
  }

  if (typeof value === 'object') {
    url.searchParams.append(key, JSON.stringify(value));
    return;
  }

  url.searchParams.append(key, String(value));
}

function normalizePath(path: string): string {
  const trimmed = path.trim();

  if (!trimmed) {
    throw new Error('API path is required');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error('Use a relative API path, for example /applications');
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parseResponseContentType(response: Response): string {
  return response.headers.get('content-type')?.toLowerCase() ?? '';
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = parseResponseContentType(response);

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

function buildHeaders(config: ServerConfig, auth: boolean, body: unknown): Headers {
  const headers = new Headers({
    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    'User-Agent': config.userAgent,
  });

  if (auth) {
    headers.set('Authorization', `Bearer ${config.apiToken}`);
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

export async function callCoolifyApi(config: ServerConfig, options: ApiCallOptions): Promise<ApiCallResult> {
  const method = options.method ?? 'GET';
  const path = normalizePath(options.path);
  const url = new URL(`${config.apiBaseUrl}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    appendSearchParams(url, key, value);
  }

  const hasBody = options.body !== undefined && method !== 'GET' && method !== 'HEAD';
  const response = await fetch(url, {
    method,
    headers: buildHeaders(config, options.auth ?? true, hasBody ? options.body : undefined),
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const data = await parseResponseBody(response);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  if (!response.ok) {
    const details = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    throw new Error(`Coolify API request failed with ${response.status} ${response.statusText}\n${details}`);
  }

  return {
    status: response.status,
    headers,
    data,
  };
}

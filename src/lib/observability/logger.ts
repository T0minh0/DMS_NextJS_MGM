export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogDomain = 'auth' | 'stock' | 'sales' | 'job' | 'api';

export interface LogContext {
  requestId: string;
  domain: LogDomain;
  route?: string;
  method?: string;
  role?: string;
  workerId?: string;
  cooperativeId?: string | null;
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'cpf',
  'document',
  'documento',
  'password',
  'pis',
  'rg',
  'secret',
  'senha',
  'token',
]);
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_DEPTH = 4;

export function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getRequestId(request?: Request | null) {
  const requestId =
    request?.headers.get('x-request-id') ||
    request?.headers.get('x-correlation-id');

  if (requestId && REQUEST_ID_PATTERN.test(requestId)) {
    return requestId;
  }

  return createRequestId();
}

export function createLogContext(
  request: Request | null | undefined,
  context: Omit<LogContext, 'requestId' | 'route' | 'method'> & Partial<Pick<LogContext, 'route' | 'method'>>,
): LogContext {
  const url = request ? new URL(request.url) : null;

  return {
    requestId: getRequestId(request),
    route: context.route ?? url?.pathname,
    method: context.method ?? request?.method,
    ...context,
  };
}

function redactText(value: string) {
  return value
    .replace(JWT_PATTERN, '[REDACTED_TOKEN]')
    .replace(CPF_PATTERN, '[REDACTED_DOCUMENT]');
}

export function sanitizeLogData(value: unknown, key = '', depth = 0): unknown {
  const normalizedKey = key.toLowerCase();
  if (
    SENSITIVE_KEYS.has(normalizedKey) ||
    normalizedKey.endsWith('token') ||
    normalizedKey.endsWith('secret') ||
    normalizedKey.includes('password')
  ) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactText(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
    };
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[TRUNCATED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogData(item, key, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeLogData(entryValue, entryKey, depth + 1),
    ]),
  );
}

export function logEvent(
  level: LogLevel,
  event: string,
  context: LogContext,
  metadata: Record<string, unknown> = {},
) {
  const entry = sanitizeLogData({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
    ...metadata,
  });

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function logInfo(event: string, context: LogContext, metadata?: Record<string, unknown>) {
  logEvent('info', event, context, metadata);
}

export function logWarn(event: string, context: LogContext, metadata?: Record<string, unknown>) {
  logEvent('warn', event, context, metadata);
}

export function logError(
  event: string,
  context: LogContext,
  error: unknown,
  metadata: Record<string, unknown> = {},
) {
  logEvent('error', event, context, {
    ...metadata,
    error,
  });
}

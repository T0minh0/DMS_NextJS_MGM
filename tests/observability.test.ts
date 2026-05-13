import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { apiErrorResponse } from '../src/lib/api/errors';
import { AuthError } from '../src/lib/auth/shared';
import { authErrorResponse } from '../src/lib/auth/server';
import {
  clearLoginFailures,
  comparePasswordWithDummy,
  getLoginRateLimit,
  getTrustedClientIp,
  recordLoginFailure,
  resetLoginRateLimitForTests,
} from '../src/lib/auth/login-guard';
import {
  createLogContext,
  logWarn,
  sanitizeLogData,
} from '../src/lib/observability/logger';
import { InMemoryJobRunLedger, runIdempotentJob } from '../src/lib/jobs';
import { maskCpf, maskPis, maskRg } from '../src/lib/privacy/pii';

function captureConsole(method: 'info' | 'warn' | 'error') {
  const original = console[method];
  const lines: string[] = [];

  console[method] = ((message?: unknown) => {
    lines.push(String(message));
  }) as typeof console[typeof method];

  return {
    lines,
    restore() {
      console[method] = original;
    },
  };
}

function collectSourceFiles(target: string): string[] {
  const entries = readdirSync(target, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

function readCallExpression(source: string, callStart: number) {
  const openIndex = source.indexOf('(', callStart);
  if (openIndex === -1) {
    return '';
  }

  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(callStart, index + 1);
      }
    }
  }

  return source.slice(callStart);
}

function findDirectApiErrorResponses(filePath: string) {
  const source = readFileSync(filePath, 'utf8');
  const offenders: string[] = [];
  let searchFrom = 0;

  while (searchFrom < source.length) {
    const callStart = source.indexOf('NextResponse.json', searchFrom);
    if (callStart === -1) {
      break;
    }

    const callSource = readCallExpression(source, callStart);
    if (/status\s*:\s*[45]\d\d/.test(callSource)) {
      const line = source.slice(0, callStart).split('\n').length;
      offenders.push(`${path.relative(process.cwd(), filePath)}:${line}`);
    }

    searchFrom = callStart + 'NextResponse.json'.length;
  }

  return offenders;
}

test('structured log sanitizer redacts sensitive fields and token-like text', () => {
  const sanitized = sanitizeLogData({
    cpf: '00000000001',
    password: 'secret',
    authorization: 'Bearer super-secret-token',
    nested: {
      token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwMSJ9.signature',
      message: 'CPF 000.000.000-01 failed login',
    },
  }) as Record<string, unknown>;

  assert.equal(sanitized.cpf, '[REDACTED]');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.authorization, '[REDACTED]');
  assert.deepEqual(sanitized.nested, {
    token: '[REDACTED]',
    message: 'CPF [REDACTED_DOCUMENT] failed login',
  });
});

test('api error response keeps a consistent compatible shape', async () => {
  const response = apiErrorResponse({
    message: 'Permissão insuficiente',
    code: 'FORBIDDEN',
    status: 403,
    requestId: 'req-test-1',
  });

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('x-request-id'), 'req-test-1');
  assert.deepEqual(await response.json(), {
    error: 'Permissão insuficiente',
    message: 'Permissão insuficiente',
    code: 'FORBIDDEN',
    requestId: 'req-test-1',
  });
});

test('api routes use centralized error helper for 4xx and 5xx responses', () => {
  const apiFiles = collectSourceFiles(path.resolve('src/app/api'));
  const supportingFiles = [path.resolve('src/lib/debug-routes.ts')];
  const offenders = [...apiFiles, ...supportingFiles].flatMap(findDirectApiErrorResponses);

  assert.deepEqual(offenders, []);
});

test('auth error response reuses inbound request id and emits structured auth rejection', async () => {
  const request = new Request('http://localhost/api/materials', {
    method: 'GET',
    headers: { 'x-request-id': 'auth-req-1' },
  });
  const warnCapture = captureConsole('warn');
  let response: Response | null = null;

  try {
    response = authErrorResponse(
      new AuthError('Sessão não encontrada', 401, 'MISSING_TOKEN'),
      request,
    );
  } finally {
    warnCapture.restore();
  }

  assert.ok(response);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-request-id'), 'auth-req-1');
  assert.deepEqual(await response.json(), {
    error: 'Sessão não encontrada',
    message: 'Sessão não encontrada',
    code: 'MISSING_TOKEN',
    requestId: 'auth-req-1',
  });
  assert.equal(warnCapture.lines.length, 1);
  assert.match(warnCapture.lines[0], /"event":"auth\.rejected"/);
  assert.match(warnCapture.lines[0], /"requestId":"auth-req-1"/);
});

test('request context accepts inbound correlation id and logs without PII', () => {
  const request = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'x-request-id': 'req-from-client' },
  });
  const context = createLogContext(request, { domain: 'auth' });
  const warnCapture = captureConsole('warn');

  try {
    logWarn('auth.login.invalid_credentials', context, {
      cpf: '00000000001',
      password: 'secret',
      reason: 'password_mismatch',
    });
  } finally {
    warnCapture.restore();
  }

  assert.equal(context.requestId, 'req-from-client');
  assert.equal(warnCapture.lines.length, 1);
  assert.match(warnCapture.lines[0], /"event":"auth\.login\.invalid_credentials"/);
  assert.doesNotMatch(warnCapture.lines[0], /00000000001|secret/);
});

test('privacy helpers mask personal documents for list responses', () => {
  assert.equal(maskCpf('00000000001'), '***.***.***-01');
  assert.equal(maskPis('90000000001'), '***.*****.**-1');
  assert.equal(maskRg('990000001'), '*******01');
});

test('manager worker lists keep stable ids for edit and delete flows', () => {
  const source = readFileSync(path.resolve('src/app/api/users/route.ts'), 'utf8');

  assert.match(source, /_id:\s*worker\.workerId\.toString\(\)/);
  assert.match(source, /id:\s*worker\.workerId\.toString\(\)/);
  assert.match(source, /worker_id:\s*Number\(worker\.workerId\)/);
  assert.match(source, /user_id:\s*Number\(worker\.workerId\)/);
});

test('login guard compares dummy hash and ignores untrusted forwarded headers', async () => {
  const hash = await bcrypt.hash('valid-password', 10);
  const realPassword = await comparePasswordWithDummy('valid-password', hash);
  const missingUser = await comparePasswordWithDummy('dms-dummy-password', null);
  const legacyPassword = await comparePasswordWithDummy('anything', 'legacy-password');
  const previousTrustProxyHeaders = process.env.DMS_TRUST_PROXY_HEADERS;
  const request = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.10' },
  });

  try {
    delete process.env.DMS_TRUST_PROXY_HEADERS;
    resetLoginRateLimitForTests();
    assert.equal(realPassword.passwordIsValid, true);
    assert.equal(missingUser.passwordIsValid, false);
    assert.equal(legacyPassword.passwordIsValid, false);
    assert.equal(legacyPassword.usedLegacyPassword, true);
    assert.equal(getTrustedClientIp(request), null);

    for (let i = 0; i < 10; i += 1) {
      recordLoginFailure(request, '00000000001');
    }

    assert.equal(getLoginRateLimit(request, '00000000001').limited, true);
    assert.equal(getLoginRateLimit(request, '00000009999').limited, false);

    clearLoginFailures(request, '00000000001');
    assert.equal(getLoginRateLimit(request, '00000000001').limited, false);

    process.env.DMS_TRUST_PROXY_HEADERS = 'true';
    resetLoginRateLimitForTests();
    assert.equal(getTrustedClientIp(request), '203.0.113.10');

    for (let i = 0; i < 40; i += 1) {
      recordLoginFailure(request, `0000001${i.toString().padStart(4, '0')}`);
    }

    assert.equal(getLoginRateLimit(request, '00000019999').limited, true);
  } finally {
    process.env.DMS_TRUST_PROXY_HEADERS = previousTrustProxyHeaders;
    resetLoginRateLimitForTests();
  }
});

test('idempotent jobs emit structured lifecycle logs', async () => {
  const ledger = new InMemoryJobRunLedger();
  const infoCapture = captureConsole('info');
  const warnCapture = captureConsole('warn');

  try {
    const first = await runIdempotentJob(
      ledger,
      'achievement-evaluation:2026-04-01:cooperative-7',
      async () => ({ evaluatedWorkers: 3 }),
      { context: { requestId: 'job-req-1' } },
    );
    const duplicate = await runIdempotentJob(
      ledger,
      'achievement-evaluation:2026-04-01:cooperative-7',
      async () => ({ evaluatedWorkers: 99 }),
      { context: { requestId: 'job-req-1' } },
    );

    assert.equal(first.status, 'completed');
    assert.equal(duplicate.status, 'skipped');
  } finally {
    infoCapture.restore();
    warnCapture.restore();
  }

  assert.equal(infoCapture.lines.length, 2);
  assert.match(infoCapture.lines[0], /"event":"job\.started"/);
  assert.match(infoCapture.lines[1], /"event":"job\.completed"/);
  assert.equal(warnCapture.lines.length, 1);
  assert.match(warnCapture.lines[0], /"event":"job\.skipped"/);
  assert.match(warnCapture.lines[0], /"requestId":"job-req-1"/);
});

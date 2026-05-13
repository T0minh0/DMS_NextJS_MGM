import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { verifyAuthTokenEdge } from '../src/lib/auth/edge';
import { getJwtSecret } from '../src/lib/auth/secret';
import { getDebugRouteDisabledResponse } from '../src/lib/debug-routes';
import { proxy } from '../src/proxy';
import {
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  RBAC_MATRIX,
  AuthSession,
  canAccess,
} from '../src/lib/auth/shared';
import {
  determineTargetCooperative,
  determineTargetWorker,
  signAuthToken,
  verifyAuthToken,
} from '../src/lib/auth/server';
import { scopedSaleWhere, scopedWorkerWhere } from '../src/lib/auth/scoped-queries';

Object.defineProperty(globalThis, 'crypto', {
  value: globalThis.crypto ?? webcrypto,
  configurable: true,
});

process.env.JWT_SECRET = 'unit-test-secret-with-enough-entropy';

const managerSession: AuthSession = {
  workerId: '10',
  cooperativeId: '100',
  role: 'manager',
  userType: 0,
  name: 'Manager',
};

const adminSession: AuthSession = {
  workerId: '1',
  cooperativeId: '100',
  role: 'admin',
  userType: 0,
  name: 'Admin',
};

const workerSession: AuthSession = {
  workerId: '20',
  cooperativeId: '100',
  role: 'worker',
  userType: 1,
  name: 'Worker',
};

function makeToken() {
  return signAuthToken({
    workerId: managerSession.workerId,
    cooperativeId: managerSession.cooperativeId,
    role: managerSession.role,
    userType: managerSession.userType,
    name: managerSession.name,
    cpf: '00000000001',
    cooperativeName: 'Coop A',
  });
}

function tamperSignature(token: string) {
  const [header, payload, signature] = token.split('.');
  const replacement = signature.startsWith('A') ? 'B' : 'A';
  return `${header}.${payload}.${replacement}${signature.slice(1)}`;
}

test('server JWT verification accepts signed token and rejects tampering', () => {
  const token = makeToken();
  const session = verifyAuthToken(token);

  assert.equal(session.role, 'manager');
  assert.equal(session.workerId, '10');
  assert.equal(session.cooperativeId, '100');

  const tampered = tamperSignature(token);
  assert.throws(() => verifyAuthToken(tampered), /Sessão inválida ou expirada/);
});

test('edge verifier rejects invalid signatures and expired tokens', async () => {
  const token = makeToken();
  assert.equal((await verifyAuthTokenEdge(token))?.workerId, '10');

  const tampered = tamperSignature(token);
  assert.equal(await verifyAuthTokenEdge(tampered), null);

  const expired = jwt.sign(
    {
      sub: '10',
      workerId: '10',
      cooperativeId: '100',
      role: 'manager',
      userType: 0,
      name: 'Manager',
    },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      audience: AUTH_TOKEN_AUDIENCE,
      issuer: AUTH_TOKEN_ISSUER,
      expiresIn: -1,
    },
  );

  assert.equal(await verifyAuthTokenEdge(expired), null);
});

test('proxy does not treat API paths with public file extensions as public assets', async () => {
  const response = await proxy(new NextRequest('http://localhost/api/private.json'));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, 'Unauthorized');
  assert.equal(body.message, 'Unauthorized');
  assert.equal(body.code, 'UNAUTHORIZED');
  assert.equal(typeof body.requestId, 'string');
});

test('production runtime refuses JWT secret fallback', () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;

  try {
    delete process.env.JWT_SECRET;
    mutableEnv.NODE_ENV = 'production';

    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);
  } finally {
    process.env.JWT_SECRET = previousSecret;
    mutableEnv.NODE_ENV = previousNodeEnv;
  }
});

test('production runtime refuses weak JWT secret', () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;

  try {
    process.env.JWT_SECRET = 'short';
    mutableEnv.NODE_ENV = 'production';

    assert.throws(() => getJwtSecret(), /at least 32 characters/);
  } finally {
    process.env.JWT_SECRET = previousSecret;
    mutableEnv.NODE_ENV = previousNodeEnv;
  }
});

test('RBAC matrix covers required domains and scopes roles correctly', () => {
  for (const resource of [
    'auth',
    'stock',
    'sales',
    'cooperatives',
    'materials',
    'users',
    'notices',
    'reports',
    'gamification',
  ]) {
    assert.ok(resource in RBAC_MATRIX, `${resource} must be in RBAC matrix`);
  }

  assert.equal(canAccess('admin', 'sales', 'read', 'global'), true);
  assert.equal(canAccess('manager', 'sales', 'read', 'cooperative'), true);
  assert.equal(canAccess('manager', 'sales', 'read', 'global'), false);
  assert.equal(canAccess('manager', 'cooperatives', 'read', 'cooperative'), true);
  assert.equal(canAccess('manager', 'cooperatives', 'read', 'global'), false);
  assert.equal(canAccess('manager', 'users', 'update', 'cooperative'), true);
  assert.equal(canAccess('manager', 'users', 'update', 'global'), false);
  assert.equal(canAccess('worker', 'gamification', 'read', 'self'), true);
  assert.equal(canAccess('worker', 'users', 'delete', 'cooperative'), false);
});

test('cooperative scope blocks manager and worker cross-cooperative access', () => {
  assert.equal(determineTargetCooperative(adminSession, '200'), '200');
  assert.equal(determineTargetCooperative(managerSession), '100');
  assert.equal(determineTargetCooperative(workerSession), '100');

  assert.throws(
    () => determineTargetCooperative(managerSession, '200'),
    /Cooperativa fora do escopo/,
  );
  assert.throws(
    () => determineTargetCooperative(workerSession, '200'),
    /Cooperativa fora do escopo/,
  );
});

test('worker scope allows admin and manager targeting but limits worker to self', () => {
  assert.equal(determineTargetWorker(adminSession, '99'), '99');
  assert.equal(determineTargetWorker(managerSession, '99'), '99');
  assert.equal(determineTargetWorker(workerSession, '20'), '20');

  assert.throws(
    () => determineTargetWorker(workerSession, '21'),
    /Usuário fora do escopo/,
  );
});

test('scoped query helpers hide out-of-scope sales and workers from managers', () => {
  assert.deepEqual(scopedWorkerWhere(adminSession, BigInt(20)), { workerId: BigInt(20) });
  assert.deepEqual(scopedWorkerWhere(managerSession, BigInt(20)), {
    workerId: BigInt(20),
    cooperative: BigInt(100),
  });
  assert.deepEqual(scopedWorkerWhere(workerSession, BigInt(20)), {
    workerId: BigInt(20),
    cooperative: BigInt(100),
    AND: [{ workerId: BigInt(20) }],
  });
  assert.deepEqual(scopedWorkerWhere(workerSession, BigInt(21)), {
    workerId: BigInt(20),
    cooperative: BigInt(100),
    AND: [{ workerId: BigInt(21) }],
  });
  assert.deepEqual(scopedSaleWhere(adminSession, BigInt(77)), { saleId: BigInt(77) });
  assert.deepEqual(scopedSaleWhere(managerSession, BigInt(77)), {
    saleId: BigInt(77),
    responsibleRef: {
      cooperative: BigInt(100),
    },
  });
});

test('debug routes are disabled in production unless explicitly enabled', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDebugFlag = process.env.DMS_DEBUG_ENDPOINTS_ENABLED;
  const mutableEnv = process.env as Record<string, string | undefined>;

  try {
    mutableEnv.NODE_ENV = 'development';
    delete mutableEnv.DMS_DEBUG_ENDPOINTS_ENABLED;
    assert.equal(getDebugRouteDisabledResponse(), null);

    mutableEnv.NODE_ENV = 'production';
    let response = getDebugRouteDisabledResponse();
    assert.equal(response?.status, 404);
    assert.equal(response?.headers.get('x-request-id')?.length, 36);
    let body = await response?.json();
    assert.equal(body.error, 'Debug endpoint disabled');
    assert.equal(body.message, 'Debug endpoint disabled');
    assert.equal(body.code, 'DEBUG_ENDPOINT_DISABLED');
    assert.equal(typeof body.requestId, 'string');

    mutableEnv.DMS_DEBUG_ENDPOINTS_ENABLED = 'true';
    assert.equal(getDebugRouteDisabledResponse(), null);

    response = getDebugRouteDisabledResponse({ allowProductionOverride: false });
    assert.equal(response?.status, 404);
    body = await response?.json();
    assert.equal(body.code, 'DEBUG_ENDPOINT_DISABLED');
  } finally {
    mutableEnv.NODE_ENV = previousNodeEnv;
    mutableEnv.DMS_DEBUG_ENDPOINTS_ENABLED = previousDebugFlag;
  }
});

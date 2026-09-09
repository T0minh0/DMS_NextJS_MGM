import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, AuthSession, canAccess } from '../src/lib/auth/shared';
import { assertStrictAdminSession, signAuthToken } from '../src/lib/auth/server';
import { proxy } from '../src/proxy';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

test('only admins pass the strict gate used by the onboarding routes', () => {
  const manager: AuthSession = { workerId: '1', cooperativeId: '100', role: 'manager', userType: 0, name: 'Gerente' };
  assert.throws(() => assertStrictAdminSession(manager), (error: unknown) => (error as { code?: string }).code === 'ADMIN_REQUIRED');
  assert.equal(canAccess('manager', 'stock', 'manage', 'global'), false);
  assert.equal(canAccess('admin', 'stock', 'manage', 'global'), true);
});

test('proxy redirects workers away from the hidden onboarding page', async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-onboarding-auth';
  const token = signAuthToken({ workerId: '20', cooperativeId: '100', role: 'worker', userType: 1, name: 'Catador' });
  const response = await proxy(new NextRequest('http://localhost/admin/onboarding', {
    headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
  }));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'http://localhost/login?reason=web-role-denied');
});

test('onboarding routes use requireStrictAdmin, global stock scope and never the manager-friendly requireAdmin', () => {
  for (const routeFile of ['src/app/api/admin/onboarding/template/route.ts', 'src/app/api/admin/onboarding/import/route.ts']) {
    const source = readSource(routeFile);
    assert.match(source, /requireStrictAdmin\(\)/, routeFile);
    assert.match(source, /requireScopedPermission\(session, 'stock', 'manage', 'global'\)/, routeFile);
    assert.doesNotMatch(source, /requireAdmin\(|requireManagerOrAdmin\(/, routeFile);
    assert.doesNotMatch(source, /session\.cooperativeId/, `${routeFile} must never default to the admin cooperative`);
  }

  const importRoute = readSource('src/app/api/admin/onboarding/import/route.ts');
  assert.match(importRoute, /export const runtime = 'nodejs'/);
  assert.match(importRoute, /verifyConfirmationToken/);
  assert.match(importRoute, /ONBOARDING_ALREADY_IMPORTED/);
  assert.match(importRoute, /ONBOARDING_DUPLICATES_REQUIRE_FORCE/);
  assert.match(importRoute, /ONBOARDING_INVALID_ROWS/);
  assert.match(importRoute, /ONBOARDING_FILE_TOO_LARGE/);
  assert.match(importRoute, /rebuildWorkerContributions/);
  assert.match(importRoute, /listGamificationFollowUps/);
  assert.doesNotMatch(importRoute, /csv: body\.csv|csvText|logInfo\([^)]*csv\b/, 'csv content must not be logged');
});

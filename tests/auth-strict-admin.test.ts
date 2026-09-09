import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { AuthError, AuthSession, canAccess } from '../src/lib/auth/shared';
import { assertStrictAdminSession } from '../src/lib/auth/server';

function buildSession(role: AuthSession['role']): AuthSession {
  return {
    workerId: '10',
    cooperativeId: '100',
    role,
    userType: role === 'worker' ? 1 : 0,
    name: 'Sessão de teste',
  };
}

test('assertStrictAdminSession only accepts the admin role', () => {
  const admin = buildSession('admin');
  assert.equal(assertStrictAdminSession(admin), admin);

  for (const role of ['manager', 'worker'] as const) {
    assert.throws(
      () => assertStrictAdminSession(buildSession(role)),
      (error: unknown) => (
        error instanceof AuthError &&
        error.status === 403 &&
        error.code === 'ADMIN_REQUIRED'
      ),
      `${role} must be rejected`,
    );
  }
});

test('strict admin tooling relies on a global scope managers never hold', () => {
  assert.equal(canAccess('manager', 'stock', 'manage', 'global'), false);
  assert.equal(canAccess('worker', 'stock', 'manage', 'global'), false);
  assert.equal(canAccess('admin', 'stock', 'manage', 'global'), true);
});

test('requireAdmin keeps its historical manager-friendly behaviour and requireStrictAdmin exists separately', () => {
  const source = readFileSync(path.resolve('src/lib/auth/server.ts'), 'utf8');

  assert.match(source, /export async function requireAdmin\(\)/);
  assert.match(source, /export function assertStrictAdminSession\(session: AuthSession\)/);
  assert.match(source, /export async function requireStrictAdmin\(\)/);
  assert.match(source, /'ADMIN_REQUIRED'/);
});

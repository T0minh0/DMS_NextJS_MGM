import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeAuthPayload, payloadToSession } from '../src/lib/auth/shared';

test('session carries credential version, with legacy tokens at version zero', () => {
  const base = { workerId: '1', cooperativeId: '1', role: 'manager', name: 'Gestor' };
  const current = normalizeAuthPayload({ ...base, authVersion: 4 });
  assert.equal(current && payloadToSession(current).authVersion, 4);
  const legacy = normalizeAuthPayload(base);
  assert.equal(legacy && payloadToSession(legacy).authVersion, 0);
  assert.equal(normalizeAuthPayload({ ...base, authVersion: 'bad' }), null);
});

test('credential version checks reject revoked and missing accounts', async () => {
  const { assertCurrentAuthVersion } = await import('../src/lib/auth/server');
  const session = { workerId: '2', cooperativeId:'1', role:'manager' as const, userType:0, name:'Gestor', authVersion:0 };
  await assertCurrentAuthVersion(session, async () => ({ authVersion:0 }));
  await assert.rejects(() => assertCurrentAuthVersion(session, async () => ({ authVersion:1 })));
  await assert.rejects(() => assertCurrentAuthVersion(session, async () => null));
});

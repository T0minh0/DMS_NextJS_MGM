import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recoveryApiUrl,
  sameOrigin,
  publicRecoveryPayload,
} from '../src/lib/mobile-auth-proxy';
test('recovery proxy uses fixed endpoints and a trusted server-side HTTPS origin', () => {
  assert.equal(
    recoveryApiUrl('reset-password', 'https://api.example.com', true),
    'https://api.example.com/auth/reset-password',
  );
  assert.throws(() =>
    recoveryApiUrl('../workers', 'https://api.example.com', true),
  );
  assert.throws(() =>
    recoveryApiUrl('reset-password', 'http://api.example.com', true),
  );
  assert.throws(() => recoveryApiUrl('reset-password', undefined, true));
  assert.throws(() =>
    recoveryApiUrl(
      'reset-password',
      'https://user:password@api.example.com',
      true,
    ),
  );
});
test('recovery mutations require the exact trusted origin', () => {
  assert.equal(
    sameOrigin(
      'https://coop.example.com',
      'https://coop.example.com/recuperar-senha',
    ),
    true,
  );
  assert.equal(
    sameOrigin(
      'https://evil.example.com',
      'https://coop.example.com/recuperar-senha',
    ),
    false,
  );
  assert.equal(sameOrigin(null, 'https://coop.example.com'), false);
});
test('public proxy strips identity and email overrides and validates required fields', () => {
  assert.deepEqual(
    publicRecoveryPayload('forgot-password', {
      cpf: '90000000101',
      email: 'attacker@example.com',
      workerId: '2',
    }),
    { cpf: '90000000101' },
  );
  assert.throws(() =>
    publicRecoveryPayload('assisted-recovery', { workerId: '1' }),
  );
  assert.throws(() => publicRecoveryPayload('reset-password', { token: 'x' }));
  assert.deepEqual(
    publicRecoveryPayload('reset-password', {
      token: 'x',
      newPassword: '73916284',
      email: 'ignored',
    }),
    { token: 'x', newPassword: '73916284' },
  );
});

test('recovery password validation rejects policy mistakes without submitting proof', async () => {
  const { recoveryPasswordError } =
    await import('../src/lib/recovery-password');
  assert.match(
    recoveryPasswordError('12345678', '12345678') ?? '',
    /sequência/,
  );
  assert.match(recoveryPasswordError('abc', 'abc') ?? '', /6/);
  assert.equal(recoveryPasswordError('73916284', '73916284'), null);
  assert.equal(recoveryPasswordError('73716284', '73716284'), null);
  assert.match(
    recoveryPasswordError('73916284', '73916285') ?? '',
    /mesma senha/,
  );
});

test('forwarded IP signatures bind trusted origin to method, endpoint and timestamp', async () => {
  const { clientIpHeaders } = await import('../src/lib/mobile-auth-proxy');
  const headers = clientIpHeaders(
    'POST',
    '/auth/reset-password',
    '2001:0DB8:0:0:0:0:0:1',
    'x'.repeat(32),
    1770000000,
  );
  assert.equal(headers['x-dms-client-ip'], '2001:db8::1');
  assert.equal(headers['x-dms-client-time'], '1770000000');
  const { createHmac } = await import('node:crypto');
  assert.equal(
    headers['x-dms-client-signature'],
    createHmac('sha256', 'x'.repeat(32))
      .update('1770000000\nPOST\n/auth/reset-password\n2001:db8::1')
      .digest('hex'),
  );
  assert.throws(() =>
    clientIpHeaders(
      'POST',
      '/auth/reset-password',
      'not-an-ip',
      'x'.repeat(32),
      1770000000,
    ),
  );
});

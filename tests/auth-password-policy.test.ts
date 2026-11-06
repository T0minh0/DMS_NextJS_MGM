import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validNewPassword } from '../src/lib/auth/password';
test('worker numeric passwords require eight nontrivial digits', () => {
  for (const value of ['123456', '11111111', '12345678', '87654321']) assert.equal(validNewPassword(value, 'worker'), false);
  assert.equal(validNewPassword('58290417', 'worker'), true);
  assert.equal(validNewPassword('abcdef', 'worker'), true);
  assert.equal(validNewPassword('123456', 'manager'), true);
});

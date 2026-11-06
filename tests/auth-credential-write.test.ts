import type { PrismaClient } from '@prisma/client';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { writePasswordIfVersion } from '../src/lib/auth/credential-write';
test('a stale password write cannot overwrite a newer credential', async () => {
  const record = { authVersion: 2, password: Buffer.from('recovered') };
  const db = { workers: { updateMany: async ({where, data}: { where: { authVersion: number }; data: { password: Uint8Array } }) => { if (where.authVersion !== record.authVersion) return {count:0}; record.authVersion++; record.password = Buffer.from(data.password); return {count:1}; } } };
  assert.equal(await writePasswordIfVersion(db as unknown as Pick<PrismaClient, 'workers'>, BigInt(1), 1, Buffer.from('stale')), false);
  assert.equal(Buffer.from(record.password).toString(), 'recovered');
  assert.equal(await writePasswordIfVersion(db as unknown as Pick<PrismaClient, 'workers'>, BigInt(1), 2, Buffer.from('new')), true);
  assert.equal(Buffer.from(record.password).toString(), 'new');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  hasWorkerOperationalDependencies,
  shouldBlockWorkerCooperativeTransfer,
} from '../src/lib/users/dependencies';

test('worker operational dependencies include sales, measurements and contributions', () => {
  assert.equal(
    hasWorkerOperationalDependencies({
      salesUsage: 0,
      measurementUsage: 0,
      contributionsUsage: 0,
    }),
    false,
  );
  assert.equal(
    hasWorkerOperationalDependencies({
      salesUsage: 1,
      measurementUsage: 0,
      contributionsUsage: 0,
    }),
    true,
  );
  assert.equal(
    hasWorkerOperationalDependencies({
      salesUsage: 0,
      measurementUsage: 1,
      contributionsUsage: 0,
    }),
    true,
  );
  assert.equal(
    hasWorkerOperationalDependencies({
      salesUsage: 0,
      measurementUsage: 0,
      contributionsUsage: 1,
    }),
    true,
  );
});

test('worker cooperative transfer is blocked only when changing tenant with operational history', () => {
  const usage = {
    salesUsage: 1,
    measurementUsage: 0,
    contributionsUsage: 0,
  };

  assert.equal(shouldBlockWorkerCooperativeTransfer(BigInt(1), BigInt(1), usage), false);
  assert.equal(shouldBlockWorkerCooperativeTransfer(BigInt(1), BigInt(2), usage), true);
  assert.equal(
    shouldBlockWorkerCooperativeTransfer(BigInt(1), BigInt(2), {
      salesUsage: 0,
      measurementUsage: 0,
      contributionsUsage: 0,
    }),
    false,
  );
});

test('administrative user update blocks cooperative changes with operational dependencies', () => {
  const source = readFileSync(path.resolve('src/app/api/users/update/route.ts'), 'utf8');

  assert.match(source, /shouldBlockWorkerCooperativeTransfer/);
  assert.match(source, /prisma\.sales\.count\(\{ where: \{ responsible: workerId \} \}\)/);
  assert.match(source, /prisma\.measurments\.count\(\{ where: \{ wastepicker: workerId \} \}\)/);
  assert.match(source, /prisma\.workerContributions\.count\(\{ where: \{ wastepicker: workerId \} \}\)/);
  assert.match(source, /USER_TRANSFER_HAS_DEPENDENCIES/);
});

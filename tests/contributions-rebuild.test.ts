import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import {
  CONTRIBUTIONS_REBUILD_TRANSACTION_OPTIONS,
  calculateISOWeek,
  getWeekRange,
  rebuildWorkerContributions,
  type RebuildContributionsDbClient,
} from '../src/lib/contributions/rebuild';

function createFakeDb(measurements: Array<{ wastepicker: bigint; material: bigint; timeStamp: Date; weightKg: Prisma.Decimal; bagFilled: boolean }>) {
  const events: string[] = [];
  const inserted: number[] = [];
  const transactionOptions: unknown[] = [];
  const tx = {
    workerContributions: {
      deleteMany: async () => {
        events.push('delete');
        return { count: 0 };
      },
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      events.push('insert');
      const sql = strings.join('?');
      assert.match(sql, /INSERT INTO "Worker_contributions"/);
      const joined = values.find((value) => value && typeof value === 'object' && 'values' in (value as object)) as { values?: unknown[] } | undefined;
      inserted.push(joined?.values?.length ?? 0);
      return 1;
    },
  };
  const db = {
    measurments: { findMany: async () => measurements },
    workers: {
      findMany: async ({ where }: { where: { workerId: { in: bigint[] } } }) =>
        where.workerId.in.map((workerId) => ({ workerId, cooperative: BigInt(100) })),
    },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>, options?: unknown) => {
      transactionOptions.push(options);
      events.push('begin');
      const result = await fn(tx);
      events.push('commit');
      return result;
    },
  } as unknown as RebuildContributionsDbClient;

  return { db, events, inserted, transactionOptions };
}

test('rebuildWorkerContributions deletes and reinserts inside one transaction with explicit timeout', async () => {
  const fake = createFakeDb([
    { wastepicker: BigInt(5), material: BigInt(7), timeStamp: new Date('2026-05-05T00:00:00Z'), weightKg: new Prisma.Decimal('2.50'), bagFilled: false },
    { wastepicker: BigInt(5), material: BigInt(7), timeStamp: new Date('2026-05-06T00:00:00Z'), weightKg: new Prisma.Decimal('1.50'), bagFilled: true },
    { wastepicker: BigInt(6), material: BigInt(8), timeStamp: new Date('2026-05-13T00:00:00Z'), weightKg: new Prisma.Decimal('4.00'), bagFilled: false },
  ]);

  const result = await rebuildWorkerContributions(fake.db);

  assert.deepEqual(fake.events, ['begin', 'delete', 'insert', 'commit']);
  assert.deepEqual(fake.transactionOptions[0], CONTRIBUTIONS_REBUILD_TRANSACTION_OPTIONS);
  assert.equal(result.processed, 2);
  assert.deepEqual(result.statistics, {
    totalMeasurements: 3,
    dailyContributions: 3,
    weeklyContributions: 2,
    totalWorkers: 2,
    totalMaterials: 2,
    totalWeight: 8,
  });
});

test('rebuildWorkerContributions returns the legacy empty response without touching the table', async () => {
  const fake = createFakeDb([]);
  const result = await rebuildWorkerContributions(fake.db);
  assert.deepEqual(result, { processed: 0, statistics: null, message: 'No measurements found' });
  assert.deepEqual(fake.events, []);
});

test('week helpers keep the historical route semantics', () => {
  assert.deepEqual(calculateISOWeek(new Date(2026, 0, 1)), { week: 1, year: 2026 });
  const range = getWeekRange(2026, 1);
  assert.match(range.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(range.endDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('recalculate-contributions route is a thin wrapper around the shared rebuild', () => {
  const source = readFileSync(path.resolve('src/app/api/recalculate-contributions/route.ts'), 'utf8');
  assert.match(source, /rebuildWorkerContributions/);
  assert.match(source, /requireScopedPermission\(session, 'reports', 'recalculate', 'global'\)/);
  assert.doesNotMatch(source, /deleteMany/);
});

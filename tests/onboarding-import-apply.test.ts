import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { addHistoricalCollected, addToStock } from '../src/lib/stock/ledger';
import { parseCsv } from '../src/lib/onboarding/csv';
import { validateOnboardingRows, type OnboardingReferenceData } from '../src/lib/onboarding/validate';
import {
  ONBOARDING_IMPORT_TRANSACTION_OPTIONS,
  OnboardingImportError,
  applyOnboardingImport,
  buildOnboardingImportPlan,
  listGamificationFollowUps,
  serializeImportResult,
  type OnboardingImportDbClient,
} from '../src/lib/onboarding/import';
import { signConfirmationToken, verifyConfirmationToken } from '../src/lib/onboarding/contract';

const today = new Date('2026-09-09T12:00:00Z');

function reference(): OnboardingReferenceData {
  return {
    cooperative: { id: BigInt(100), name: 'Coop' },
    workers: [
      { workerId: BigInt(5), wastepickerId: 'WP005', name: 'Ana', normalizedName: 'ana', userType: '1', enterDate: null, exitDate: null },
    ],
    workerCooperativeById: new Map([['5', BigInt(100)]]),
    materials: [
      { materialId: BigInt(7), name: 'Papelão', normalizedName: 'papelao', groupName: null },
      { materialId: BigInt(8), name: 'PET', normalizedName: 'pet', groupName: null },
    ],
  };
}

function toBigInt(value: unknown) {
  return typeof value === 'bigint' ? value : BigInt(String(value));
}

function toDecimal(value: unknown) {
  return Prisma.Decimal.isDecimal(value) ? value : new Prisma.Decimal(String(value));
}

function createFakeDb(options: { existingMeasurements?: Array<{ wastepicker: bigint; material: bigint; timeStamp: Date; weightKg: Prisma.Decimal }> } = {}) {
  const calls: string[] = [];
  const transactionOptions: unknown[] = [];
  const devices: Array<{ deviceId: bigint; cooperativeId: bigint }> = [];
  const measurements: Array<{ wastepicker: bigint; material: bigint; timeStamp: Date; weightKg: Prisma.Decimal; bagFilled?: boolean; device?: bigint; weightingId?: bigint }> = [...(options.existingMeasurements ?? [])];
  const stock = new Map<string, { stockId: bigint; totalCollectedKg: Prisma.Decimal; totalSoldKg: Prisma.Decimal; currentStockKg: Prisma.Decimal }>([
    ['100:7', { stockId: BigInt(1), totalCollectedKg: new Prisma.Decimal('50.00'), totalSoldKg: new Prisma.Decimal('20.00'), currentStockKg: new Prisma.Decimal('30.00') }],
  ]);
  const createManyCalls: number[] = [];
  let nextId = BigInt(1000);

  const tx = {
    $executeRaw: async (strings: TemplateStringsArray) => {
      calls.push(strings.join('?'));
      return 1;
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      calls.push(sql);
      if (/INSERT INTO "Stock"/.test(sql)) {
        const key = `${toBigInt(values[0])}:${toBigInt(values[1])}`;
        const amount = toDecimal(values[2]);
        const current = toDecimal(values[4]);
        const existing = stock.get(key);
        const collectedOnly = !/"Current_stock_KG" = "Stock"\."Current_stock_KG"/.test(sql);
        if (existing) {
          existing.totalCollectedKg = existing.totalCollectedKg.plus(amount);
          if (!collectedOnly) existing.currentStockKg = existing.currentStockKg.plus(amount);
          return [{ ...existing }];
        }
        const created = { stockId: BigInt(stock.size + 1), totalCollectedKg: amount, totalSoldKg: new Prisma.Decimal(0), currentStockKg: current };
        stock.set(key, created);
        return [{ ...created }];
      }
      throw new Error(`Unexpected query ${sql}`);
    },
    devices: {
      findFirst: async ({ where }: { where: { cooperativeId: bigint } }) => devices.find((device) => device.cooperativeId === where.cooperativeId) ?? null,
      create: async ({ data }: { data: { cooperativeId: bigint } }) => {
        const created = { deviceId: BigInt(3), cooperativeId: data.cooperativeId };
        devices.push(created);
        return created;
      },
    },
    measurments: {
      findMany: async () => measurements,
      createManyAndReturn: async ({ data }: { data: Array<{ weightKg: string; timeStamp: Date; wastepicker: bigint; material: bigint; device: bigint; bagFilled: boolean }> }) => {
        createManyCalls.push(data.length);
        return data.map((row) => {
          const created = { weightingId: nextId, wastepicker: row.wastepicker, material: row.material, timeStamp: row.timeStamp, weightKg: new Prisma.Decimal(row.weightKg), device: row.device, bagFilled: row.bagFilled };
          nextId += BigInt(1);
          measurements.push(created);
          return { weightingId: created.weightingId };
        });
      },
    },
    materialBagState: {
      update: async () => {
        throw new Error('material_bag_state must never be touched by the import');
      },
    },
  };

  const db = {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>, txOptions?: unknown) => {
      transactionOptions.push(txOptions);
      return fn(tx);
    },
  } as unknown as OnboardingImportDbClient;

  return { db, tx, calls, transactionOptions, devices, measurements, stock, createManyCalls };
}

function planFor(lines: string[], existing = new Map<string, number>(), stockMode: 'collected_only' | 'collected_and_current' = 'collected_only') {
  const parsed = parseCsv(['data_coleta;coletor;material;peso_kg;estado_sacola', ...lines].join('\n'));
  const report = validateOnboardingRows(parsed, reference(), existing, { today, stockMode });
  return buildOnboardingImportPlan(report, BigInt(100), stockMode);
}

test('addHistoricalCollected only increments the collected total and creates rows with current stock 0', async () => {
  const fake = createFakeDb();
  const existing = await addHistoricalCollected(fake.tx as unknown as Prisma.TransactionClient, { cooperativeId: BigInt(100), materialId: BigInt(7), amountKg: '5.00' });
  assert.equal(existing.totalCollectedKg.toFixed(2), '55.00');
  assert.equal(existing.currentStockKg.toFixed(2), '30.00');

  const created = await addHistoricalCollected(fake.tx as unknown as Prisma.TransactionClient, { cooperativeId: BigInt(100), materialId: BigInt(8), amountKg: '2.50' });
  assert.equal(created.totalCollectedKg.toFixed(2), '2.50');
  assert.equal(created.currentStockKg.toFixed(2), '0.00');

  const sql = fake.calls.find((call) => /INSERT INTO "Stock"/.test(call));
  assert.ok(sql);
  assert.doesNotMatch(sql, /"Current_stock_KG" = "Stock"\."Current_stock_KG"/);

  const live = await addToStock(fake.tx as unknown as Prisma.TransactionClient, { cooperativeId: BigInt(100), materialId: BigInt(7), amountKg: '1.00' });
  assert.equal(live.currentStockKg.toFixed(2), '31.00');
});

test('applyOnboardingImport writes deltas in chunks, resolves a device once and upserts stock per material', async () => {
  const fake = createFakeDb();
  const lines = Array.from({ length: 5 }, (_, index) => `1${index}/03/2024;WP005;${index % 2 === 0 ? 'Papelão' : 'PET'};1,50;cheia`);
  const plan = planFor(lines);
  const result = await applyOnboardingImport(fake.db, plan, { chunkSize: 2 });

  assert.equal(result.measurementCount, 5);
  assert.deepEqual(fake.createManyCalls, [2, 2, 1]);
  assert.equal(fake.devices.length, 1);
  assert.equal(result.deviceId, BigInt(3));
  assert.equal(result.totalKg, 7.5);
  assert.equal(result.weightingIds.length, 5);
  assert.equal(fake.measurements[0].weightKg.toFixed(2), '1.50');
  assert.equal(fake.measurements[0].timeStamp.toISOString(), '2024-03-10T00:00:00.000Z');
  assert.equal(fake.measurements[0].bagFilled, true);

  const papelao = result.byMaterial.find((entry) => entry.materialId === BigInt(7));
  assert.equal(papelao?.addedCollectedKg, 4.5);
  assert.equal(papelao?.stockAfter.totalCollectedKg.toFixed(2), '54.50');
  assert.equal(papelao?.stockAfter.currentStockKg.toFixed(2), '30.00');
  const pet = result.byMaterial.find((entry) => entry.materialId === BigInt(8));
  assert.equal(pet?.stockAfter.currentStockKg.toFixed(2), '0.00');

  assert.ok(fake.calls.some((call) => /pg_advisory_xact_lock/.test(call)));
  assert.deepEqual(fake.transactionOptions[0], ONBOARDING_IMPORT_TRANSACTION_OPTIONS);
  assert.equal(ONBOARDING_IMPORT_TRANSACTION_OPTIONS.timeout, 60_000);

  const serialized = serializeImportResult(result);
  assert.equal(serialized.weighting_ids.length, 5);
  assert.equal(serialized.weighting_id_range?.from, '1000');
  assert.equal(serialized.by_material[0].stock_after.current_stock_kg, 30);
});

test('collected_and_current mode also raises the current balance', async () => {
  const fake = createFakeDb();
  const plan = planFor(['15/03/2024;WP005;Papelão;2,00;vazia'], new Map(), 'collected_and_current');
  const result = await applyOnboardingImport(fake.db, plan);
  assert.equal(result.byMaterial[0].stockAfter.currentStockKg.toFixed(2), '32.00');
  assert.equal(result.byMaterial[0].stockAfter.totalCollectedKg.toFixed(2), '52.00');
});

test('applyOnboardingImport aborts when duplicates appeared after validation', async () => {
  const fake = createFakeDb({
    existingMeasurements: [{ wastepicker: BigInt(5), material: BigInt(7), timeStamp: new Date('2024-03-15T00:00:00.000Z'), weightKg: new Prisma.Decimal('2.00') }],
  });
  const plan = planFor(['15/03/2024;WP005;Papelão;2,00;vazia']);
  assert.equal(plan.expectedDuplicateCount, 0);

  await assert.rejects(
    () => applyOnboardingImport(fake.db, plan),
    (error: unknown) => error instanceof OnboardingImportError && error.code === 'ONBOARDING_ALREADY_IMPORTED' && error.status === 409,
  );
  assert.deepEqual(fake.createManyCalls, []);
});

test('buildOnboardingImportPlan refuses reports with errors', () => {
  const parsed = parseCsv('data_coleta;coletor;material;peso_kg;estado_sacola\n15/03/2024;WP999;Papelão;1;cheia\n');
  const report = validateOnboardingRows(parsed, reference(), new Map(), { today, stockMode: 'collected_only' });
  assert.throws(
    () => buildOnboardingImportPlan(report, BigInt(100), 'collected_only'),
    (error: unknown) => error instanceof OnboardingImportError && error.code === 'ONBOARDING_NOT_APPLICABLE',
  );
});

test('confirmation tokens bind file, cooperative and stock mode with a TTL', () => {
  const secret = 'test-secret';
  const payload = { sha256: 'abc', cooperativeId: '100', stockMode: 'collected_only' as const };
  const now = new Date('2026-09-09T12:00:00Z');
  const signed = signConfirmationToken(payload, secret, now);

  assert.deepEqual(verifyConfirmationToken(signed.token, payload, secret, now), { ok: true });
  assert.deepEqual(verifyConfirmationToken(signed.token, { ...payload, sha256: 'xyz' }, secret, now), { ok: false, reason: 'mismatch' });
  assert.deepEqual(verifyConfirmationToken(signed.token, { ...payload, stockMode: 'collected_and_current' }, secret, now), { ok: false, reason: 'mismatch' });
  assert.deepEqual(verifyConfirmationToken(signed.token, payload, secret, new Date(now.getTime() + 31 * 60 * 1000)), { ok: false, reason: 'expired' });
  assert.deepEqual(verifyConfirmationToken(signed.token, payload, 'other-secret', now), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyConfirmationToken(`${signed.token}x`, payload, secret, now), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyConfirmationToken(null, payload, secret, now), { ok: false, reason: 'invalid' });
});

test('gamification follow-ups list one job set per affected month', () => {
  const jobs = listGamificationFollowUps(['2024-03', '2024-04'], BigInt(100));
  assert.equal(jobs.length, 6);
  assert.equal(jobs[0].path, '/api/jobs/achievement-evaluation');
  assert.deepEqual(jobs[0].body, { yearMonth: '2024-03', cooperativeId: '100' });
});

test('import module never references bag-state logic', () => {
  const source = readFileSync(path.resolve('src/lib/onboarding/import.ts'), 'utf8');
  assert.doesNotMatch(source, /materialBagState|calculateBagStateDelta|ensureBagStateLocked/);
  assert.match(source, /createManyAndReturn/);
  assert.match(source, /pg_advisory_xact_lock/);
});

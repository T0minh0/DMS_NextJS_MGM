import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import {
  ApiRequestError,
  apiRequestErrorResponse,
  readJsonBody,
} from '../src/lib/api/errors';
import { AuthSession } from '../src/lib/auth/shared';
import { formatDecimal } from '../src/lib/decimal';
import {
  MaterialDomainError,
  addManualStock,
  parseInsertMaterialRequest,
  recordMaterialWeighing,
} from '../src/lib/materials/measurements';

type FakeStockRow = {
  stockId: bigint;
  cooperative: bigint;
  material: bigint;
  totalCollectedKg: Prisma.Decimal;
  totalSoldKg: Prisma.Decimal;
  currentStockKg: Prisma.Decimal;
};

type FakeBagState = {
  bagStateId: bigint;
  cooperativeId: bigint;
  materialId: bigint;
  isBegun: boolean;
  currentKg: Prisma.Decimal;
  lastUpdated: Date;
};

const workerSession: AuthSession = {
  workerId: '20',
  cooperativeId: '100',
  role: 'worker',
  userType: 1,
  name: 'Worker',
};

const managerSession: AuthSession = {
  workerId: '10',
  cooperativeId: '100',
  role: 'manager',
  userType: 0,
  name: 'Manager',
};

function toBigInt(value: unknown) {
  return BigInt(String(value));
}

function toDecimal(value: unknown) {
  if (Prisma.Decimal.isDecimal(value)) {
    return value;
  }

  return new Prisma.Decimal(String(value));
}

function keyFor(cooperativeId: bigint, materialId: bigint) {
  return `${cooperativeId.toString()}:${materialId.toString()}`;
}

function cloneStock(row: FakeStockRow) {
  return {
    stockId: row.stockId,
    totalCollectedKg: row.totalCollectedKg,
    totalSoldKg: row.totalSoldKg,
    currentStockKg: row.currentStockKg,
  };
}

function createFakeTx() {
  let nextBagStateId = BigInt(1);
  let nextStockId = BigInt(1);
  let nextMeasurementId = BigInt(1);
  const calls: string[] = [];
  const cooperatives = new Set<bigint>([BigInt(100)]);
  const materials = new Set<bigint>([BigInt(7), BigInt(8)]);
  const workers = new Map<bigint, { workerId: bigint; cooperative: bigint }>([
    [BigInt(20), { workerId: BigInt(20), cooperative: BigInt(100) }],
    [BigInt(21), { workerId: BigInt(21), cooperative: BigInt(200) }],
  ]);
  const devices = new Map<bigint, { deviceId: bigint; cooperativeId: bigint }>([
    [BigInt(3), { deviceId: BigInt(3), cooperativeId: BigInt(100) }],
    [BigInt(4), { deviceId: BigInt(4), cooperativeId: BigInt(200) }],
  ]);
  const bagStates = new Map<string, FakeBagState>([
    [
      keyFor(BigInt(100), BigInt(7)),
      {
        bagStateId: nextBagStateId,
        cooperativeId: BigInt(100),
        materialId: BigInt(7),
        isBegun: true,
        currentKg: new Prisma.Decimal('4.25'),
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
    ],
  ]);
  nextBagStateId += BigInt(1);

  const stock = new Map<string, FakeStockRow>([
    [
      keyFor(BigInt(100), BigInt(7)),
      {
        stockId: nextStockId,
        cooperative: BigInt(100),
        material: BigInt(7),
        totalCollectedKg: new Prisma.Decimal('10.00'),
        totalSoldKg: new Prisma.Decimal('0.00'),
        currentStockKg: new Prisma.Decimal('10.00'),
      },
    ],
  ]);
  nextStockId += BigInt(1);

  const measurements: Array<{
    weightingId: bigint;
    weightKg: Prisma.Decimal;
    timeStamp: Date;
    wastepicker: bigint;
    material: bigint;
    device: bigint;
    bagFilled: boolean;
  }> = [];

  async function $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join('?');
    calls.push(sql);

    if (/INSERT INTO "material_bag_state"/.test(sql)) {
      assert.match(sql, /ON CONFLICT \("cooperative_id", "material_id"\) DO NOTHING/);
      const cooperativeId = toBigInt(values[0]);
      const materialId = toBigInt(values[1]);
      const bagKey = keyFor(cooperativeId, materialId);

      if (!bagStates.has(bagKey)) {
        bagStates.set(bagKey, {
          bagStateId: nextBagStateId,
          cooperativeId,
          materialId,
          isBegun: false,
          currentKg: new Prisma.Decimal(0),
          lastUpdated: new Date(),
        });
        nextBagStateId += BigInt(1);
      }

      return 1;
    }

    throw new Error(`Unexpected fake execute SQL: ${sql}`);
  }

  async function $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join('?');
    calls.push(sql);

    if (/FROM "material_bag_state"/.test(sql)) {
      assert.match(sql, /FOR UPDATE/);
      const cooperativeId = toBigInt(values[0]);
      const materialId = toBigInt(values[1]);
      const bag = bagStates.get(keyFor(cooperativeId, materialId));
      return bag
        ? [{
          bagStateId: bag.bagStateId,
          isBegun: bag.isBegun,
          currentKg: bag.currentKg,
          lastUpdated: bag.lastUpdated,
        }]
        : [];
    }

    if (/INSERT INTO "Stock"/.test(sql)) {
      assert.match(sql, /ON CONFLICT \("Cooperative", "Material"\)/);
      const cooperativeId = toBigInt(values[0]);
      const materialId = toBigInt(values[1]);
      const amount = toDecimal(values[2]);
      const stockKey = keyFor(cooperativeId, materialId);
      const existing = stock.get(stockKey);

      if (existing) {
        existing.totalCollectedKg = existing.totalCollectedKg.plus(amount);
        existing.currentStockKg = existing.currentStockKg.plus(amount);
        return [cloneStock(existing)];
      }

      const created = {
        stockId: nextStockId,
        cooperative: cooperativeId,
        material: materialId,
        totalCollectedKg: amount,
        totalSoldKg: new Prisma.Decimal(0),
        currentStockKg: amount,
      };
      nextStockId += BigInt(1);
      stock.set(stockKey, created);
      return [cloneStock(created)];
    }

    if (
      /UPDATE "Stock"/.test(sql) &&
      /"Total_collected_KG" = "Total_collected_KG" \+/.test(sql)
    ) {
      assert.match(sql, /"Current_stock_KG" = "Current_stock_KG" \+/);
      const amount = toDecimal(values[0]);
      const cooperativeId = toBigInt(values[2]);
      const materialId = toBigInt(values[3]);
      const row = stock.get(keyFor(cooperativeId, materialId));

      if (!row) {
        return [];
      }

      row.totalCollectedKg = row.totalCollectedKg.plus(amount);
      row.currentStockKg = row.currentStockKg.plus(amount);
      return [cloneStock(row)];
    }

    throw new Error(`Unexpected fake query SQL: ${sql}`);
  }

  const tx = {
    $executeRaw,
    $queryRaw,
    cooperative: {
      findUnique: async ({ where }: { where: { cooperativeId: bigint } }) =>
        cooperatives.has(where.cooperativeId) ? { cooperativeId: where.cooperativeId } : null,
    },
    materials: {
      findUnique: async ({ where }: { where: { materialId: bigint } }) =>
        materials.has(where.materialId) ? { materialId: where.materialId } : null,
    },
    workers: {
      findUnique: async ({ where }: { where: { workerId: bigint } }) =>
        workers.get(where.workerId) ?? null,
    },
    devices: {
      findUnique: async ({ where }: { where: { deviceId: bigint } }) =>
        devices.get(where.deviceId) ?? null,
    },
    stock: {
      findFirst: async ({
        where,
      }: {
        where: { cooperative: bigint; material: bigint };
      }) => {
        const row = stock.get(keyFor(where.cooperative, where.material));
        return row ? { stockId: row.stockId } : null;
      },
    },
    measurments: {
      create: async ({
        data,
      }: {
        data: {
          weightKg: string;
          timeStamp: Date;
          wastepicker: bigint;
          material: bigint;
          device: bigint;
          bagFilled: boolean;
        };
      }) => {
        const created = {
          weightingId: nextMeasurementId,
          weightKg: new Prisma.Decimal(data.weightKg),
          timeStamp: data.timeStamp,
          wastepicker: data.wastepicker,
          material: data.material,
          device: data.device,
          bagFilled: data.bagFilled,
        };
        nextMeasurementId += BigInt(1);
        measurements.push(created);
        return created;
      },
    },
    materialBagState: {
      update: async ({
        where,
        data,
      }: {
        where: {
          cooperativeId_materialId: {
            cooperativeId: bigint;
            materialId: bigint;
          };
        };
        data: {
          isBegun: boolean;
          currentKg: string;
          lastUpdated: Date;
        };
      }) => {
        const ids = where.cooperativeId_materialId;
        const bag = bagStates.get(keyFor(ids.cooperativeId, ids.materialId));
        assert.ok(bag, 'bag state must exist before update');
        bag.isBegun = data.isBegun;
        bag.currentKg = new Prisma.Decimal(data.currentKg);
        bag.lastUpdated = data.lastUpdated;
        return bag;
      },
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    calls,
    measurements,
    getBag: (cooperativeId: bigint, materialId: bigint) =>
      bagStates.get(keyFor(cooperativeId, materialId)),
    getStock: (cooperativeId: bigint, materialId: bigint) =>
      stock.get(keyFor(cooperativeId, materialId)),
  };
}

test('insertMaterial request parsing enforces worker role, worker scope and required fields', () => {
  const parsed = parseInsertMaterialRequest(
    {
      materialId: 7,
      amount: '5.75',
      bagFull: 'false',
      measuredAt: '2026-05-13T09:05:00Z',
      deviceId: 3,
    },
    workerSession,
  );

  assert.equal(parsed.workerId, BigInt(20));
  assert.equal(parsed.cooperativeId, BigInt(100));
  assert.equal(formatDecimal(parsed.amountKg), '5.75');
  assert.equal(parsed.bagFull, false);
  assert.equal(parsed.measuredAt.toISOString(), '2026-05-13T09:05:00.000Z');

  assert.throws(
    () =>
      parseInsertMaterialRequest(
        {
          materialId: 7,
          amount: '1.00',
          measuredAt: '2026-05-13T09:05:00Z',
          deviceId: 3,
        },
        managerSession,
      ),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'WORKER_ROLE_REQUIRED' &&
      error.status === 403,
  );

  assert.throws(
    () =>
      parseInsertMaterialRequest(
        {
          materialId: 7,
          workerId: 21,
          amount: '1.00',
          measuredAt: '2026-05-13T09:05:00Z',
          deviceId: 3,
        },
        workerSession,
      ),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'WORKER_SCOPE_DENIED' &&
      error.status === 403,
  );

  assert.throws(
    () =>
      parseInsertMaterialRequest(
        { amount: '1.00', measuredAt: '2026-05-13T09:05:00Z', deviceId: 3 },
        workerSession,
      ),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'INVALID_MATERIAL_MEASUREMENT' &&
      error.status === 400,
  );

  assert.throws(
    () =>
      parseInsertMaterialRequest(
        null as unknown as Parameters<typeof parseInsertMaterialRequest>[0],
        workerSession,
      ),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'INVALID_MATERIAL_MEASUREMENT' &&
      error.status === 400,
  );
});

test('recordMaterialWeighing writes measurement delta, bag state and stock in one transaction', async () => {
  const store = createFakeTx();

  const first = await recordMaterialWeighing(store.tx, {
    cooperativeId: BigInt(100),
    materialId: BigInt(7),
    workerId: BigInt(20),
    amountKg: new Prisma.Decimal('5.75'),
    bagFull: false,
    measuredAt: new Date('2026-05-13T09:10:00Z'),
    deviceId: BigInt(3),
  });

  assert.equal(formatDecimal(first.collectedDeltaKg), '1.50');
  assert.equal(formatDecimal(first.measurement.weightKg), '1.50');
  assert.equal(first.measurement.bagFilled, false);
  assert.equal(store.getBag(BigInt(100), BigInt(7))?.isBegun, true);
  assert.equal(formatDecimal(store.getBag(BigInt(100), BigInt(7))!.currentKg), '5.75');
  assert.equal(
    store.getBag(BigInt(100), BigInt(7))!.lastUpdated.toISOString(),
    '2026-05-13T09:10:00.000Z',
  );
  assert.equal(formatDecimal(store.getStock(BigInt(100), BigInt(7))!.currentStockKg), '11.50');

  const second = await recordMaterialWeighing(store.tx, {
    cooperativeId: BigInt(100),
    materialId: BigInt(7),
    workerId: BigInt(20),
    amountKg: new Prisma.Decimal('8.00'),
    bagFull: true,
    measuredAt: new Date('2026-05-13T09:20:00Z'),
    deviceId: BigInt(3),
  });

  assert.equal(formatDecimal(second.collectedDeltaKg), '2.25');
  assert.equal(formatDecimal(second.measurement.weightKg), '2.25');
  assert.equal(second.measurement.bagFilled, true);
  assert.equal(store.getBag(BigInt(100), BigInt(7))?.isBegun, false);
  assert.equal(formatDecimal(store.getBag(BigInt(100), BigInt(7))!.currentKg), '0.00');
  assert.equal(
    store.getBag(BigInt(100), BigInt(7))!.lastUpdated.toISOString(),
    '2026-05-13T09:20:00.000Z',
  );
  assert.equal(formatDecimal(store.getStock(BigInt(100), BigInt(7))!.currentStockKg), '13.75');
  assert.ok(store.calls.some((sql) => /FOR UPDATE/.test(sql)));
});

test('recordMaterialWeighing rejects regressive bag readings without resetting state', async () => {
  const store = createFakeTx();

  await assert.rejects(
    () =>
      recordMaterialWeighing(store.tx, {
        cooperativeId: BigInt(100),
        materialId: BigInt(7),
        workerId: BigInt(20),
        amountKg: new Prisma.Decimal('4.00'),
        bagFull: false,
        measuredAt: new Date('2026-05-13T09:10:00Z'),
        deviceId: BigInt(3),
      }),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'INVALID_MATERIAL_MEASUREMENT' &&
      error.status === 422,
  );

  assert.equal(store.measurements.length, 0);
  assert.equal(formatDecimal(store.getBag(BigInt(100), BigInt(7))!.currentKg), '4.25');
  assert.equal(formatDecimal(store.getStock(BigInt(100), BigInt(7))!.currentStockKg), '10.00');
});

test('recordMaterialWeighing rejects stale non-full readings captured before a full-bag reset', async () => {
  const store = createFakeTx();

  const reset = await recordMaterialWeighing(store.tx, {
    cooperativeId: BigInt(100),
    materialId: BigInt(7),
    workerId: BigInt(20),
    amountKg: new Prisma.Decimal('8.00'),
    bagFull: true,
    measuredAt: new Date('2026-05-13T09:20:00Z'),
    deviceId: BigInt(3),
  });

  assert.equal(formatDecimal(reset.collectedDeltaKg), '3.75');
  assert.equal(formatDecimal(store.getBag(BigInt(100), BigInt(7))!.currentKg), '0.00');

  await assert.rejects(
    () =>
      recordMaterialWeighing(store.tx, {
        cooperativeId: BigInt(100),
        materialId: BigInt(7),
        workerId: BigInt(20),
        amountKg: new Prisma.Decimal('6.00'),
        bagFull: false,
        measuredAt: new Date('2026-05-13T09:19:59Z'),
        deviceId: BigInt(3),
      }),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'INVALID_MATERIAL_MEASUREMENT' &&
      error.status === 422,
  );

  assert.equal(store.measurements.length, 1);
  assert.equal(formatDecimal(store.getBag(BigInt(100), BigInt(7))!.currentKg), '0.00');
  assert.equal(
    store.getBag(BigInt(100), BigInt(7))!.lastUpdated.toISOString(),
    '2026-05-13T09:20:00.000Z',
  );
  assert.equal(formatDecimal(store.getStock(BigInt(100), BigInt(7))!.currentStockKg), '13.75');
});

test('recordMaterialWeighing rejects out-of-scope device and missing stock before mutating', async () => {
  const deviceStore = createFakeTx();
  await assert.rejects(
    () =>
      recordMaterialWeighing(deviceStore.tx, {
        cooperativeId: BigInt(100),
        materialId: BigInt(7),
        workerId: BigInt(20),
        amountKg: new Prisma.Decimal('5.00'),
        bagFull: false,
        measuredAt: new Date('2026-05-13T09:10:00Z'),
        deviceId: BigInt(4),
      }),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'DEVICE_SCOPE_DENIED' &&
      error.status === 403,
  );
  assert.equal(deviceStore.measurements.length, 0);

  const stockStore = createFakeTx();
  await assert.rejects(
    () =>
      recordMaterialWeighing(stockStore.tx, {
        cooperativeId: BigInt(100),
        materialId: BigInt(8),
        workerId: BigInt(20),
        amountKg: new Prisma.Decimal('5.00'),
        bagFull: false,
        measuredAt: new Date('2026-05-13T09:10:00Z'),
        deviceId: BigInt(3),
      }),
    (error) =>
      error instanceof MaterialDomainError &&
      error.code === 'STOCK_MISSING' &&
      error.status === 422,
  );
  assert.equal(stockStore.measurements.length, 0);
});

test('invalid JSON bodies map to 400-compatible API request errors', async () => {
  await assert.rejects(
    () =>
      readJsonBody(
        new Request('http://localhost/api/stock', {
          method: 'POST',
          body: '{',
          headers: { 'content-type': 'application/json' },
        }),
      ),
    (error) =>
      error instanceof ApiRequestError &&
      error.code === 'INVALID_JSON_BODY' &&
      error.status === 400,
  );

  await assert.rejects(
    () =>
      readJsonBody(
        new Request('http://localhost/api/stock', {
          method: 'POST',
          body: 'null',
          headers: { 'content-type': 'application/json' },
        }),
      ),
    (error) =>
      error instanceof ApiRequestError &&
      error.code === 'INVALID_JSON_BODY' &&
      error.status === 400,
  );

  const response = apiRequestErrorResponse(
    new ApiRequestError('Corpo JSON inválido', 'INVALID_JSON_BODY', 400),
    'req-json',
  );
  assert.equal(response?.status, 400);
  assert.equal(response?.headers.get('x-request-id'), 'req-json');
  assert.deepEqual(await response?.json(), {
    error: 'Corpo JSON inválido',
    message: 'Corpo JSON inválido',
    code: 'INVALID_JSON_BODY',
    requestId: 'req-json',
  });
});

test('manual stock add creates missing rows and increments existing rows through ON CONFLICT', async () => {
  const store = createFakeTx();

  const created = await addManualStock(store.tx, {
    cooperativeId: BigInt(100),
    materialId: BigInt(8),
    amountKg: '2.50',
  });

  assert.equal(formatDecimal(created.stockSnapshot.totalCollectedKg), '2.50');
  assert.equal(formatDecimal(created.stockSnapshot.currentStockKg), '2.50');

  const updated = await addManualStock(store.tx, {
    cooperativeId: BigInt(100),
    materialId: BigInt(8),
    amountKg: '1.25',
  });

  assert.equal(formatDecimal(updated.stockSnapshot.totalCollectedKg), '3.75');
  assert.equal(formatDecimal(updated.stockSnapshot.currentStockKg), '3.75');
  assert.ok(store.calls.some((sql) => /ON CONFLICT \("Cooperative", "Material"\)/.test(sql)));
});

test('material and stock route source exposes expected API and concurrency contracts', () => {
  const insertRoute = readFileSync(path.resolve('src/app/api/insertMaterial/route.ts'), 'utf8');
  const stockRoute = readFileSync(path.resolve('src/app/api/stock/route.ts'), 'utf8');
  const helper = readFileSync(path.resolve('src/lib/materials/measurements.ts'), 'utf8');

  assert.match(insertRoute, /export async function POST/);
  assert.match(insertRoute, /requireAuth/);
  assert.match(insertRoute, /readJsonBody/);
  assert.match(insertRoute, /parseInsertMaterialRequest/);
  assert.match(stockRoute, /export async function POST/);
  assert.match(stockRoute, /requireManagerOrAdmin/);
  assert.match(stockRoute, /readJsonBody/);
  assert.match(stockRoute, /addManualStock/);
  assert.match(helper, /FOR UPDATE/);
  assert.match(helper, /ON CONFLICT \("cooperative_id", "material_id"\) DO NOTHING/);
  assert.match(helper, /createIfMissing: false/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { AuthSession } from '../src/lib/auth/shared';
import {
  MaterialDomainError,
  parseInsertMaterialRequest,
  parseManagedCollectionRequest,
  recordManagedCollection,
  resolveCooperativeDevice,
} from '../src/lib/materials/measurements';

const managerSession: AuthSession = {
  workerId: '1',
  cooperativeId: '100',
  role: 'manager',
  userType: 0,
  name: 'Gerente',
};

const workerSession: AuthSession = {
  workerId: '20',
  cooperativeId: '100',
  role: 'worker',
  userType: 1,
  name: 'Catador',
};

type FakeWorker = {
  workerId: bigint;
  workerName: string;
  cooperative: bigint;
  userType: string;
  exitDate: Date | null;
};

function toBigInt(value: unknown) {
  return typeof value === 'bigint' ? value : BigInt(String(value));
}

function toDecimal(value: unknown) {
  return Prisma.Decimal.isDecimal(value) ? value : new Prisma.Decimal(String(value));
}

function keyFor(cooperativeId: bigint, materialId: bigint) {
  return `${cooperativeId.toString()}:${materialId.toString()}`;
}

function createFakeTx() {
  let nextDeviceId = BigInt(10);
  let nextMeasurementId = BigInt(1);
  const workers = new Map<bigint, FakeWorker>([
    [BigInt(20), { workerId: BigInt(20), workerName: 'Ana', cooperative: BigInt(100), userType: '1', exitDate: null }],
    [BigInt(21), { workerId: BigInt(21), workerName: 'Bia', cooperative: BigInt(200), userType: '1', exitDate: null }],
    [BigInt(22), { workerId: BigInt(22), workerName: 'Caio', cooperative: BigInt(100), userType: 'W', exitDate: new Date('2026-01-31') }],
    [BigInt(23), { workerId: BigInt(23), workerName: 'Dora', cooperative: BigInt(100), userType: 'M', exitDate: null }],
    [BigInt(24), { workerId: BigInt(24), workerName: 'Eli', cooperative: BigInt(100), userType: 'X', exitDate: null }],
    [BigInt(30), { workerId: BigInt(30), workerName: 'Fabi', cooperative: BigInt(300), userType: '1', exitDate: null }],
  ]);
  const devices = new Map<bigint, { deviceId: bigint; cooperativeId: bigint }>([
    [BigInt(3), { deviceId: BigInt(3), cooperativeId: BigInt(100) }],
  ]);
  const deviceCreates: bigint[] = [];
  const bagStates = new Map<string, { bagStateId: bigint; isBegun: boolean; currentKg: Prisma.Decimal; lastUpdated: Date }>([
    [keyFor(BigInt(100), BigInt(7)), {
      bagStateId: BigInt(1),
      isBegun: true,
      currentKg: new Prisma.Decimal('4.25'),
      lastUpdated: new Date('2026-05-13T09:00:00Z'),
    }],
  ]);
  const stock = new Map<string, { stockId: bigint; totalCollectedKg: Prisma.Decimal; totalSoldKg: Prisma.Decimal; currentStockKg: Prisma.Decimal }>([
    [keyFor(BigInt(100), BigInt(7)), {
      stockId: BigInt(1),
      totalCollectedKg: new Prisma.Decimal('10.00'),
      totalSoldKg: new Prisma.Decimal('0.00'),
      currentStockKg: new Prisma.Decimal('10.00'),
    }],
  ]);
  const measurements: Array<{ weightingId: bigint; weightKg: Prisma.Decimal; wastepicker: bigint; material: bigint; device: bigint; bagFilled: boolean; timeStamp: Date }> = [];

  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (/INSERT INTO "material_bag_state"/.test(sql)) {
        const key = keyFor(toBigInt(values[0]), toBigInt(values[1]));
        if (!bagStates.has(key)) {
          bagStates.set(key, {
            bagStateId: BigInt(bagStates.size + 1),
            isBegun: false,
            currentKg: new Prisma.Decimal(0),
            lastUpdated: new Date('1970-01-01T00:00:00Z'),
          });
        }
        return 1;
      }
      throw new Error(`Unexpected execute: ${sql}`);
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (/FROM "material_bag_state"/.test(sql)) {
        const bag = bagStates.get(keyFor(toBigInt(values[0]), toBigInt(values[1])));
        return bag ? [bag] : [];
      }
      if (/INSERT INTO "Stock"/.test(sql)) {
        const key = keyFor(toBigInt(values[0]), toBigInt(values[1]));
        const amount = toDecimal(values[2]);
        const existing = stock.get(key);
        if (existing) {
          existing.totalCollectedKg = existing.totalCollectedKg.plus(amount);
          existing.currentStockKg = existing.currentStockKg.plus(amount);
          return [{ ...existing }];
        }
        const created = {
          stockId: BigInt(stock.size + 1),
          totalCollectedKg: amount,
          totalSoldKg: new Prisma.Decimal(0),
          currentStockKg: amount,
        };
        stock.set(key, created);
        return [{ ...created }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    materials: {
      findUnique: async ({ where }: { where: { materialId: bigint } }) =>
        [BigInt(7), BigInt(8)].includes(where.materialId) ? { materialId: where.materialId } : null,
    },
    workers: {
      findUnique: async ({ where }: { where: { workerId: bigint } }) => workers.get(where.workerId) ?? null,
    },
    devices: {
      findUnique: async ({ where }: { where: { deviceId: bigint } }) => devices.get(where.deviceId) ?? null,
      findFirst: async ({ where }: { where: { cooperativeId: bigint } }) =>
        Array.from(devices.values()).find((device) => device.cooperativeId === where.cooperativeId) ?? null,
      create: async ({ data }: { data: { cooperativeId: bigint } }) => {
        const created = { deviceId: nextDeviceId, cooperativeId: data.cooperativeId };
        nextDeviceId += BigInt(1);
        devices.set(created.deviceId, created);
        deviceCreates.push(created.deviceId);
        return created;
      },
    },
    measurments: {
      create: async ({ data }: { data: { weightKg: string; timeStamp: Date; wastepicker: bigint; material: bigint; device: bigint; bagFilled: boolean } }) => {
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
      update: async ({ where, data }: { where: { cooperativeId_materialId: { cooperativeId: bigint; materialId: bigint } }; data: { isBegun: boolean; currentKg: string; lastUpdated: Date } }) => {
        const ids = where.cooperativeId_materialId;
        const bag = bagStates.get(keyFor(ids.cooperativeId, ids.materialId));
        assert.ok(bag);
        bag.isBegun = data.isBegun;
        bag.currentKg = new Prisma.Decimal(data.currentKg);
        bag.lastUpdated = data.lastUpdated;
        return bag;
      },
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    measurements,
    deviceCreates,
    getBag: (cooperativeId: bigint, materialId: bigint) => bagStates.get(keyFor(cooperativeId, materialId)),
    getStock: (cooperativeId: bigint, materialId: bigint) => stock.get(keyFor(cooperativeId, materialId)),
  };
}

function expectDomainError(fn: () => unknown | Promise<unknown>, code: string, status: number) {
  return assert.rejects(
    async () => fn(),
    (error: unknown) => error instanceof MaterialDomainError && error.code === code && error.status === status,
    `expected ${code} ${status}`,
  );
}

test('parseManagedCollectionRequest accepts manager input and defaults measuredAt to now', () => {
  const before = Date.now();
  const parsed = parseManagedCollectionRequest(
    { worker_id: '20', material_id: 7, amount: '5.75', bag_full: 'false' },
    managerSession,
    BigInt(100),
  );

  assert.equal(parsed.cooperativeId, BigInt(100));
  assert.equal(parsed.workerId, BigInt(20));
  assert.equal(parsed.materialId, BigInt(7));
  assert.equal(parsed.amountKg.toFixed(2), '5.75');
  assert.equal(parsed.bagFull, false);
  assert.ok(parsed.measuredAt.getTime() >= before);
  assert.ok(parsed.measuredAt.getTime() <= Date.now() + 1000);

  const backdated = parseManagedCollectionRequest(
    { worker_id: '20', material_id: 7, amount: '5.75', measured_at: '2026-05-01' },
    managerSession,
    BigInt(100),
  );
  assert.equal(backdated.measuredAt.toISOString(), '2026-05-01T00:00:00.000Z');
});

test('parseManagedCollectionRequest rejects workers, missing worker ids and future dates', async () => {
  await expectDomainError(
    () => parseManagedCollectionRequest({ worker_id: '20', material_id: 7, amount: '5' }, workerSession, BigInt(100)),
    'MANAGER_ROLE_REQUIRED',
    403,
  );
  await expectDomainError(
    () => parseManagedCollectionRequest({ material_id: 7, amount: '5' }, managerSession, BigInt(100)),
    'INVALID_MATERIAL_MEASUREMENT',
    400,
  );
  await expectDomainError(
    () => parseManagedCollectionRequest(
      { worker_id: '20', material_id: 7, amount: '5', measured_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      managerSession,
      BigInt(100),
    ),
    'INVALID_MATERIAL_MEASUREMENT',
    400,
  );
  await expectDomainError(
    () => parseManagedCollectionRequest({ worker_id: '20', material_id: 7, amount: '0' }, managerSession, BigInt(100)),
    'INVALID_MATERIAL_MEASUREMENT',
    400,
  );
});

test('recordManagedCollection keeps cumulative bag semantics and reuses the cooperative device', async () => {
  const fake = createFakeTx();
  const result = await recordManagedCollection(fake.tx, {
    cooperativeId: BigInt(100),
    workerId: BigInt(20),
    materialId: BigInt(7),
    amountKg: new Prisma.Decimal('5.75'),
    bagFull: false,
    measuredAt: new Date('2026-05-14T10:00:00Z'),
  });

  assert.equal(result.workerName, 'Ana');
  assert.equal(result.collectedDeltaKg.toFixed(2), '1.50');
  assert.equal(result.measurement.device, BigInt(3));
  assert.equal(fake.measurements.length, 1);
  assert.equal(fake.measurements[0].weightKg.toFixed(2), '1.50');
  assert.equal(fake.getBag(BigInt(100), BigInt(7))?.currentKg.toFixed(2), '5.75');
  assert.equal(fake.getStock(BigInt(100), BigInt(7))?.currentStockKg.toFixed(2), '11.50');
  assert.equal(fake.deviceCreates.length, 0);
});

test('recordManagedCollection rejects workers outside the cooperative, exited workers and non-wastepickers', async () => {
  const base = {
    cooperativeId: BigInt(100),
    materialId: BigInt(7),
    amountKg: new Prisma.Decimal('9.00'),
    bagFull: false,
    measuredAt: new Date('2026-05-14T10:00:00Z'),
  };

  await expectDomainError(() => recordManagedCollection(createFakeTx().tx, { ...base, workerId: BigInt(21) }), 'WORKER_SCOPE_DENIED', 403);
  await expectDomainError(() => recordManagedCollection(createFakeTx().tx, { ...base, workerId: BigInt(22) }), 'WORKER_INACTIVE', 422);
  await expectDomainError(() => recordManagedCollection(createFakeTx().tx, { ...base, workerId: BigInt(23) }), 'WORKER_ROLE_REQUIRED', 422);
  await expectDomainError(() => recordManagedCollection(createFakeTx().tx, { ...base, workerId: BigInt(24) }), 'WORKER_ROLE_REQUIRED', 422);
  await expectDomainError(() => recordManagedCollection(createFakeTx().tx, { ...base, workerId: BigInt(99) }), 'WORKER_NOT_FOUND', 422);
});

test('recordManagedCollection creates a cooperative device once when none exists', async () => {
  const fake = createFakeTx();
  const input = {
    cooperativeId: BigInt(300),
    workerId: BigInt(30),
    materialId: BigInt(7),
    amountKg: new Prisma.Decimal('3.00'),
    bagFull: false,
    measuredAt: new Date('2026-05-14T10:00:00Z'),
  };

  const first = await recordManagedCollection(fake.tx, input);
  assert.equal(fake.deviceCreates.length, 1);
  assert.equal(first.measurement.device, fake.deviceCreates[0]);
  assert.equal(first.collectedDeltaKg.toFixed(2), '3.00');
  assert.equal(fake.getStock(BigInt(300), BigInt(7))?.currentStockKg.toFixed(2), '3.00');

  const second = await recordManagedCollection(fake.tx, {
    ...input,
    amountKg: new Prisma.Decimal('4.50'),
    bagFull: true,
    measuredAt: new Date('2026-05-14T11:00:00Z'),
  });
  assert.equal(fake.deviceCreates.length, 1, 'device must be reused');
  assert.equal(second.collectedDeltaKg.toFixed(2), '1.50');
  assert.equal(fake.getBag(BigInt(300), BigInt(7))?.currentKg.toFixed(2), '0.00');
  assert.equal(fake.getBag(BigInt(300), BigInt(7))?.isBegun, false);

  assert.equal(await resolveCooperativeDevice(fake.tx, BigInt(100)), BigInt(3));
});

test('recordManagedCollection rejects regressive readings without bag full through the shared ledger', async () => {
  const fake = createFakeTx();
  await expectDomainError(
    () => recordManagedCollection(fake.tx, {
      cooperativeId: BigInt(100),
      workerId: BigInt(20),
      materialId: BigInt(7),
      amountKg: new Prisma.Decimal('2.00'),
      bagFull: false,
      measuredAt: new Date('2026-05-14T10:00:00Z'),
    }),
    'INVALID_MATERIAL_MEASUREMENT',
    422,
  );
  assert.equal(fake.measurements.length, 0);
});

test('worker self-service path is unchanged: managers still cannot use insertMaterial', () => {
  assert.throws(
    () => parseInsertMaterialRequest(
      { materialId: 7, amount: '5.75', measuredAt: '2026-05-14T10:00:00Z', deviceId: 3 },
      managerSession,
    ),
    (error: unknown) => error instanceof MaterialDomainError && error.code === 'WORKER_ROLE_REQUIRED',
  );
});

test('collections routes enforce manager scope and reuse the managed collection helpers', () => {
  const route = readFileSync(path.resolve('src/app/api/collections/route.ts'), 'utf8');
  const bagStateRoute = readFileSync(path.resolve('src/app/api/collections/bag-state/route.ts'), 'utf8');

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /requireManagerOrAdmin/);
  assert.match(route, /readJsonBody/);
  assert.match(route, /requireScopedPermission\(session, 'stock', 'create', 'cooperative'\)/);
  assert.match(route, /requireScopedPermission\(session, 'stock', 'read', 'cooperative'\)/);
  assert.match(route, /determineTargetCooperative\([\s\S]*required: true/);
  assert.match(route, /recordManagedCollection/);
  assert.match(route, /parseManagedCollectionRequest/);
  assert.match(route, /wastepickerRef: \{ cooperative: cooperativeId \}/);
  assert.doesNotMatch(route, /requireAdmin\(/);

  assert.match(bagStateRoute, /requireManagerOrAdmin/);
  assert.match(bagStateRoute, /requireScopedPermission\(session, 'stock', 'read', 'cooperative'\)/);
  assert.match(bagStateRoute, /materialBagState\.findUnique/);
});

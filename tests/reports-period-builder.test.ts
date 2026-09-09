import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import {
  PeriodReportError,
  buildPeriodReportData,
  serializePeriodReport,
  type PeriodReportDbClient,
} from '../src/lib/reports/period-report';

type Measurement = { wastepicker: bigint; material: bigint; timeStamp: Date; weightKg: Prisma.Decimal };

type MeasurementWhere = {
  timeStamp?: { gte?: Date; lt?: Date };
  weightKg?: { gt?: number };
  wastepickerRef?: { cooperative?: bigint };
  wastepicker?: bigint;
  material?: { in?: bigint[] };
};

function day(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

function createFakeDb() {
  const workers = new Map<bigint, { workerId: bigint; workerName: string; cooperative: bigint }>([
    [BigInt(20), { workerId: BigInt(20), workerName: 'Ana', cooperative: BigInt(100) }],
    [BigInt(21), { workerId: BigInt(21), workerName: 'Bia', cooperative: BigInt(100) }],
    [BigInt(30), { workerId: BigInt(30), workerName: 'Outra coop', cooperative: BigInt(200) }],
  ]);
  const materials = new Map<bigint, { materialId: bigint; materialName: string; group: { groupName: string } | null }>([
    [BigInt(7), { materialId: BigInt(7), materialName: 'Papelão', group: { groupName: 'Papel' } }],
    [BigInt(8), { materialId: BigInt(8), materialName: 'PET', group: { groupName: 'Plástico' } }],
  ]);
  const measurements: Measurement[] = [
    { wastepicker: BigInt(20), material: BigInt(7), timeStamp: day('2026-09-01'), weightKg: new Prisma.Decimal('10.00') },
    { wastepicker: BigInt(20), material: BigInt(8), timeStamp: day('2026-09-01'), weightKg: new Prisma.Decimal('5.00') },
    { wastepicker: BigInt(20), material: BigInt(7), timeStamp: day('2026-09-02'), weightKg: new Prisma.Decimal('2.50') },
    { wastepicker: BigInt(21), material: BigInt(7), timeStamp: day('2026-09-02'), weightKg: new Prisma.Decimal('7.50') },
    { wastepicker: BigInt(21), material: BigInt(8), timeStamp: day('2026-09-03'), weightKg: new Prisma.Decimal('0.00') },
    { wastepicker: BigInt(30), material: BigInt(7), timeStamp: day('2026-09-02'), weightKg: new Prisma.Decimal('99.00') },
    { wastepicker: BigInt(20), material: BigInt(7), timeStamp: day('2026-10-01'), weightKg: new Prisma.Decimal('40.00') },
  ];
  const capturedWheres: MeasurementWhere[] = [];

  function matches(row: Measurement, where: MeasurementWhere) {
    if (where.timeStamp?.gte && row.timeStamp < where.timeStamp.gte) return false;
    if (where.timeStamp?.lt && row.timeStamp >= where.timeStamp.lt) return false;
    if (where.weightKg?.gt !== undefined && !row.weightKg.greaterThan(where.weightKg.gt)) return false;
    if (where.wastepickerRef?.cooperative !== undefined) {
      const worker = workers.get(row.wastepicker);
      if (!worker || worker.cooperative !== where.wastepickerRef.cooperative) return false;
    }
    if (where.wastepicker !== undefined && row.wastepicker !== where.wastepicker) return false;
    if (where.material?.in && !where.material.in.includes(row.material)) return false;
    return true;
  }

  const db = {
    cooperative: {
      findUnique: async ({ where }: { where: { cooperativeId: bigint } }) =>
        where.cooperativeId === BigInt(100)
          ? { cooperativeId: BigInt(100), cooperativeName: 'Cooperativa São João' }
          : null,
    },
    workers: {
      findFirst: async ({ where }: { where: { workerId: bigint; cooperative: bigint } }) => {
        const worker = workers.get(where.workerId);
        return worker && worker.cooperative === where.cooperative
          ? { workerId: worker.workerId, workerName: worker.workerName }
          : null;
      },
      findMany: async ({ where }: { where: { workerId: { in: bigint[] }; cooperative: bigint } }) =>
        where.workerId.in
          .map((id) => workers.get(id))
          .filter((worker): worker is NonNullable<typeof worker> => Boolean(worker) && worker!.cooperative === where.cooperative)
          .map((worker) => ({ workerId: worker.workerId, workerName: worker.workerName })),
    },
    measurments: {
      groupBy: async ({ by, where }: { by: Array<'material' | 'wastepicker' | 'timeStamp'>; where: MeasurementWhere }) => {
        capturedWheres.push(where);
        const groups = new Map<string, Record<string, unknown> & { _sum: { weightKg: Prisma.Decimal }; _count: { _all: number } }>();
        measurements.filter((row) => matches(row, where)).forEach((row) => {
          const key = by.map((field) => (row[field] instanceof Date ? (row[field] as Date).toISOString() : String(row[field]))).join('|');
          const entry = groups.get(key) ?? {
            ...Object.fromEntries(by.map((field) => [field, row[field]])),
            _sum: { weightKg: new Prisma.Decimal(0) },
            _count: { _all: 0 },
          };
          entry._sum.weightKg = entry._sum.weightKg.plus(row.weightKg);
          entry._count._all += 1;
          groups.set(key, entry);
        });
        return Array.from(groups.values());
      },
    },
    materials: {
      findMany: async ({ where }: { where: { materialId: { in: bigint[] } } }) =>
        where.materialId.in.map((id) => materials.get(id)).filter(Boolean),
    },
    sales: {
      findMany: async ({ where }: { where: { cooperativeId: bigint; date: { gte: Date; lt: Date } } }) =>
        where.cooperativeId === BigInt(100) && where.date.gte <= day('2026-09-05') && where.date.lt > day('2026-09-05')
          ? [{
            saleId: BigInt(9),
            date: day('2026-09-05'),
            weight: new Prisma.Decimal('12.00'),
            priceKg: new Prisma.Decimal('1.50'),
            materialRef: { materialName: 'Papelão' },
            buyerRef: { buyerName: 'Comprador A' },
          }]
          : [],
    },
    stock: {
      findMany: async ({ where }: { where: { cooperative: bigint } }) =>
        where.cooperative === BigInt(100)
          ? [
            {
              material: BigInt(7),
              currentStockKg: new Prisma.Decimal('30.00'),
              totalCollectedKg: new Prisma.Decimal('50.00'),
              totalSoldKg: new Prisma.Decimal('20.00'),
              materialRef: { materialName: 'Papelão', group: { groupName: 'Papel' } },
            },
            {
              material: BigInt(8),
              currentStockKg: new Prisma.Decimal('5.00'),
              totalCollectedKg: new Prisma.Decimal('5.00'),
              totalSoldKg: new Prisma.Decimal('0.00'),
              materialRef: { materialName: 'PET', group: { groupName: 'Plástico' } },
            },
          ]
          : [],
    },
  } as unknown as PeriodReportDbClient;

  return { db, capturedWheres };
}

const september = {
  cooperativeId: BigInt(100),
  from: day('2026-09-01'),
  toExclusive: day('2026-10-01'),
  yearMonth: '2026-09',
  periodLabel: 'setembro de 2026',
  now: new Date('2026-09-09T15:00:00Z'),
  generatedBy: { name: 'Gerente UAT', role: 'manager' },
};

test('buildPeriodReportData aggregates collections, sales and stock for the cooperative', async () => {
  const { db, capturedWheres } = createFakeDb();
  const data = await buildPeriodReportData(db, september);

  assert.equal(data.kind, 'period');
  assert.equal(data.cooperative.name, 'Cooperativa São João');
  assert.equal(data.period.label, 'setembro de 2026');
  assert.equal(data.period.toInclusive.toISOString(), '2026-09-30T00:00:00.000Z');

  assert.deepEqual(data.summary, {
    collectedKg: 25,
    collectionsCount: 4,
    activeWorkers: 2,
    workedDays: 2,
    soldKg: 12,
    salesCount: 1,
    revenueBrl: 18,
    stockKg: 35,
  });

  assert.deepEqual(data.byMaterial.map((row) => [row.materialName, row.groupName, row.kg, row.sharePct, row.collectionsCount]), [
    ['Papelão', 'Papel', 20, 80, 3],
    ['PET', 'Plástico', 5, 20, 1],
  ]);
  assert.deepEqual(data.byWorker.map((row) => [row.wastepickerId, row.workerName, row.kg, row.collectionsCount, row.workedDays]), [
    ['WP020', 'Ana', 17.5, 3, 2],
    ['WP021', 'Bia', 7.5, 1, 1],
  ]);
  assert.deepEqual(data.daily.map((row) => [row.date.toISOString().slice(0, 10), row.kg, row.collectionsCount]), [
    ['2026-09-01', 15, 2],
    ['2026-09-02', 10, 2],
  ]);
  assert.equal(data.sales.length, 1);
  assert.equal(data.sales[0].totalBrl, 18);
  assert.equal(data.stock.length, 2);
  assert.equal(data.workerDaily.length, 0);

  for (const where of capturedWheres) {
    assert.deepEqual(where.weightKg, { gt: 0 });
    assert.deepEqual(where.wastepickerRef, { cooperative: BigInt(100) });
    assert.equal(where.timeStamp?.gte?.toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(where.timeStamp?.lt?.toISOString(), '2026-10-01T00:00:00.000Z');
  }
});

test('buildPeriodReportData worker variant drops sales and other workers and adds the daily breakdown', async () => {
  const { db, capturedWheres } = createFakeDb();
  const data = await buildPeriodReportData(db, { ...september, workerId: BigInt(20) });

  assert.equal(data.kind, 'worker-period');
  assert.deepEqual(data.filters.worker, { id: BigInt(20), wastepickerId: 'WP020', name: 'Ana' });
  assert.equal(data.summary.collectedKg, 17.5);
  assert.equal(data.summary.collectionsCount, 3);
  assert.equal(data.summary.workedDays, 2);
  assert.equal(data.summary.salesCount, 0);
  assert.deepEqual(data.sales, []);
  assert.equal(data.byWorker.length, 1);
  assert.deepEqual(data.workerDaily.map((row) => [row.date.toISOString().slice(0, 10), row.materialName, row.kg]), [
    ['2026-09-01', 'Papelão', 10],
    ['2026-09-01', 'PET', 5],
    ['2026-09-02', 'Papelão', 2.5],
  ]);
  assert.ok(capturedWheres.every((where) => where.wastepicker === BigInt(20)));
});

test('buildPeriodReportData honours material filters and empty groups', async () => {
  const { db } = createFakeDb();
  const pet = await buildPeriodReportData(db, { ...september, materialIds: [BigInt(8)], materialLabel: 'Material 8' });
  assert.equal(pet.summary.collectedKg, 5);
  assert.equal(pet.byMaterial.length, 1);
  assert.equal(pet.filters.materialLabel, 'Material 8');

  const empty = await buildPeriodReportData(db, { ...september, materialIds: [], materialLabel: 'Grupo Vidro' });
  assert.equal(empty.summary.collectedKg, 0);
  assert.equal(empty.byMaterial.length, 0);
  assert.equal(empty.byWorker.length, 0);
});

test('buildPeriodReportData rejects unknown cooperatives, foreign workers and oversized ranges', async () => {
  const { db } = createFakeDb();

  await assert.rejects(
    () => buildPeriodReportData(db, { ...september, cooperativeId: BigInt(999) }),
    (error: unknown) => error instanceof PeriodReportError && error.code === 'COOPERATIVE_NOT_FOUND' && error.status === 404,
  );
  await assert.rejects(
    () => buildPeriodReportData(db, { ...september, workerId: BigInt(30) }),
    (error: unknown) => error instanceof PeriodReportError && error.code === 'WORKER_NOT_FOUND' && error.status === 404,
  );
  await assert.rejects(
    () => buildPeriodReportData(db, { ...september, toExclusive: day('2028-01-01') }),
    (error: unknown) => error instanceof PeriodReportError && error.code === 'INVALID_PERIOD_RANGE' && error.status === 400,
  );
});

test('serializePeriodReport emits strings for ids, date keys and never personal documents', async () => {
  const { db } = createFakeDb();
  const data = await buildPeriodReportData(db, september);
  const json = serializePeriodReport(data);

  assert.equal(json.cooperative.id, '100');
  assert.equal(json.period.from, '2026-09-01');
  assert.equal(json.period.to, '2026-09-30');
  assert.equal(json.by_worker[0].worker_id, '20');
  assert.equal(json.by_worker[0].wastepicker_id, 'WP020');
  assert.equal(json.daily[0].date, '2026-09-01');
  assert.equal(json.sales[0].sale_id, '9');

  const serialized = JSON.stringify(json);
  assert.doesNotMatch(serialized, /"cpf"|"rg"|"pis"|"email"|"phone"/i);
  assert.doesNotMatch(serialized, /bigint/i);
});

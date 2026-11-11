import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { deleteCollection, CollectionDeletionError, parseCollectionDeletion } from '../src/lib/materials/delete-collection';
import { recordMaterialWeighing } from '../src/lib/materials/measurements';
import { recordImportedCollectionEffects } from '../src/lib/materials/collection-effect';
import { addHistoricalCollected, addToStock } from '../src/lib/stock/ledger';
import type { AuthSession } from '../src/lib/auth/shared';

const url = process.env.COLLECTION_TEST_DATABASE_URL;
const safe = (() => {
  try { const parsed = new URL(url ?? ''); return ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/dms_collection_delete_test'; } catch { return false; }
})();
const db = safe ? new PrismaClient({ datasources: { db: { url } } }) : null;
after(async () => { await db?.$disconnect(); });

async function fixture(full = false) {
  assert.ok(db);
  const coop = await db.cooperative.create({ data: { cooperativeName: 'Deletion test' } });
  const material = await db.materials.create({ data: { materialName: `Deletion ${coop.cooperativeId}` } });
  const device = await db.devices.create({ data: { cooperativeId: coop.cooperativeId } });
  const worker = await db.workers.create({ data: {
    cooperative: coop.cooperativeId, workerName: 'Deletion worker', userType: '1',
    cpf: Buffer.from(`test-${coop.cooperativeId}`), birthDate: new Date('2000-01-01'),
    enterDate: new Date('2020-01-01'), pis: Buffer.from('0'), rg: Buffer.from('0'),
    password: Buffer.from('unused'), email: 'deletion@example.test',
  } });
  await db.materialBagState.create({ data: { cooperativeId: coop.cooperativeId, materialId: material.materialId,
    isBegun: false, currentKg: '0.00', lastUpdated: new Date('1970-01-01') } });
  await db.stock.create({ data: { cooperative: coop.cooperativeId, material: material.materialId,
    totalCollectedKg: '11.75', totalSoldKg: '4.00', currentStockKg: '7.75' } });
  const record = (amount: string, date: string, bagFull: boolean) => db!.$transaction(tx => recordMaterialWeighing(tx, {
    cooperativeId: coop.cooperativeId, materialId: material.materialId, workerId: worker.workerId,
    deviceId: device.deviceId, amountKg: new Prisma.Decimal(amount),
    measuredAt: new Date(date), bagFull,
  }));
  const earlier = (await record('5.00', '2026-11-10T12:00:00Z', false)).measurement;
  const target = (await record('8.25', '2026-11-11T12:00:00Z', full)).measurement;
  const session: AuthSession = { workerId: worker.workerId.toString(), cooperativeId: coop.cooperativeId.toString(),
    role: 'manager', userType: 0, name: 'Manager test' };
  const input = { cooperativeId: coop.cooperativeId, collectionId: target.weightingId, reason: 'Registro duplicado por engano', session };
  const run = (change: Partial<typeof input> = {}) => db!.$transaction(tx => deleteCollection(tx, { ...input, ...change }));
  const stock = () => db!.stock.findUniqueOrThrow({ where: { cooperative_material: { cooperative: coop.cooperativeId, material: material.materialId } } });
  const bag = () => db!.materialBagState.findUniqueOrThrow({ where: { cooperativeId_materialId: { cooperativeId: coop.cooperativeId, materialId: material.materialId } } });
  const cleanup = async () => {
    await db!.$executeRaw`DELETE FROM measurement_effect WHERE cooperative_id = ${coop.cooperativeId}`;
    await db!.$executeRaw`DELETE FROM collection_deletion_audit WHERE cooperative_id = ${coop.cooperativeId}`;
    await db!.workerContributions.deleteMany({ where: { cooperative: coop.cooperativeId } });
    await db!.measurments.deleteMany({ where: { wastepicker: worker.workerId } });
    await db!.materialBagState.deleteMany({ where: { cooperativeId: coop.cooperativeId } });
    await db!.stock.deleteMany({ where: { cooperative: coop.cooperativeId } });
    await db!.workers.delete({ where: { workerId: worker.workerId } });
    await db!.devices.delete({ where: { deviceId: device.deviceId } });
    await db!.materials.delete({ where: { materialId: material.materialId } });
    await db!.cooperative.delete({ where: { cooperativeId: coop.cooperativeId } });
  };
  return { coop, material, device, worker, earlier, target, input, run, stock, bag, cleanup, record };
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof CollectionDeletionError && error.code === code;
}

test('deletion validates a positive ID and a required bounded reason', () => {
  assert.deepEqual(parseCollectionDeletion('42', { reason: '  Pesagem duplicada  ' }), { collectionId: BigInt(42), reason: 'Pesagem duplicada' });
  for (const id of ['-1', '0', '1.5', 'x', '']) assert.throws(() => parseCollectionDeletion(id, { reason: 'Duplicada' }));
  for (const body of [null, [], {}, { reason: ' ' }, { reason: 'xx' }, { reason: 'x'.repeat(501) }]) {
    assert.throws(() => parseCollectionDeletion('42', body));
  }
});

test('deletion reverses exactly the recorded delta, updates contribution and keeps an audit', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await db!.$executeRaw`INSERT INTO "Worker_contributions" ("Wastepicker","Material",cooperative,"Period","Weight_KG") VALUES (${f.worker.workerId},${f.material.materialId},${f.coop.cooperativeId},daterange('2026-11-09','2026-11-16','[)'),'8.25')`;
    await f.run();
    assert.equal(await db!.measurments.findUnique({ where: { weightingId: f.target.weightingId } }), null);
    assert.ok(await db!.measurments.findUnique({ where: { weightingId: f.earlier.weightingId } }));
    const stock = await f.stock();
    assert.equal(stock.totalCollectedKg.toFixed(2), '16.75');
    assert.equal(stock.currentStockKg.toFixed(2), '12.75');
    assert.equal(stock.totalSoldKg.toFixed(2), '4.00');
    const bag = await f.bag();
    assert.equal(bag.currentKg.toFixed(2), '5.00');
    assert.equal(bag.lastUpdated.toISOString(), '2026-11-11T12:00:00.000Z');
    const contributions = await db!.workerContributions.findMany({ where: { cooperative: f.coop.cooperativeId } });
    assert.equal(contributions[0].weightKg.toFixed(2), '5.00');
    const audits = await db!.$queryRaw<Array<{ reason: string; actor_worker_id: bigint; measurement: { weight_kg: string } }>>`SELECT reason,actor_worker_id,measurement FROM collection_deletion_audit WHERE measurement_id=${f.target.weightingId}`;
    assert.equal(audits.length, 1);
    assert.equal(audits[0].reason, 'Registro duplicado por engano');
    assert.equal(audits[0].actor_worker_id, f.worker.workerId);
    assert.equal(audits[0].measurement.weight_kg, '3.25');
  } finally { await f.cleanup(); }
});

test('deleting a bag closing restores only the previous open bag', { skip: !safe }, async () => {
  const f = await fixture(true);
  try {
    await db!.measurments.create({ data: { wastepicker: f.worker.workerId, material: f.material.materialId,
      device: f.device.deviceId, weightKg: '99.00', timeStamp: new Date('2026-11-09'), bagFilled: true } });
    await f.run();
    assert.equal((await f.bag()).currentKg.toFixed(2), '5.00');
    assert.equal((await f.bag()).isBegun, true);
  } finally { await f.cleanup(); }
});

test('historical deletion preserves a later cumulative bag reading', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await f.run({ collectionId: f.earlier.weightingId });
    assert.equal((await f.bag()).currentKg.toFixed(2), '8.25');
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '11.00');
  } finally { await f.cleanup(); }
});

test('insufficient available stock rolls back measurement, bag and audit', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await db!.stock.updateMany({ where: { cooperative: f.coop.cooperativeId }, data: { currentStockKg: '2.00' } });
    await assert.rejects(f.run(), errorCode('INSUFFICIENT_STOCK'));
    assert.ok(await db!.measurments.findUnique({ where: { weightingId: f.target.weightingId } }));
    assert.equal((await f.bag()).currentKg.toFixed(2), '8.25');
    assert.equal((await f.stock()).totalCollectedKg.toFixed(2), '20.00');
    const audit = await db!.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM collection_deletion_audit WHERE measurement_id=${f.target.weightingId}`;
    assert.equal(audit[0].n, BigInt(0));
  } finally { await f.cleanup(); }
});

test('workers and managers from a different cooperative cannot delete', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.run({ session: { ...f.input.session, role: 'worker' } }));
    await assert.rejects(f.run({ session: { ...f.input.session, cooperativeId: '999999999' } }));
    await assert.rejects(f.run({ cooperativeId: BigInt(999999999), session: { ...f.input.session, cooperativeId: '999999999' } }), errorCode('COLLECTION_NOT_FOUND'));
    assert.ok(await db!.measurments.findUnique({ where: { weightingId: f.target.weightingId } }));
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '16.00');
  } finally { await f.cleanup(); }
});

test('concurrent repeated deletion reverses stock only once', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled([f.run(), f.run()]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '12.75');
    assert.equal((await f.bag()).currentKg.toFixed(2), '5.00');
    const audits = await db!.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM collection_deletion_audit WHERE measurement_id=${f.target.weightingId}`;
    assert.equal(audits[0].n, BigInt(1));
  } finally { await f.cleanup(); }
});

test('a divergent latest bag is rejected without removing data', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await db!.materialBagState.updateMany({ where: { cooperativeId: f.coop.cooperativeId }, data: { currentKg: '1.00' } });
    await assert.rejects(f.run(), errorCode('BAG_STATE_CONFLICT'));
    assert.ok(await db!.measurments.findUnique({ where: { weightingId: f.target.weightingId } }));
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '16.00');
  } finally { await f.cleanup(); }
});

async function importCollectedOnly(f: Awaited<ReturnType<typeof fixture>>) {
  return db!.$transaction(async tx => {
    const row = await tx.measurments.create({ data: { wastepicker: f.worker.workerId, material: f.material.materialId,
      device: f.device.deviceId, weightKg: '100.00', timeStamp: new Date('2026-11-09'), bagFilled: false } });
    await recordImportedCollectionEffects(tx, { measurementIds: [row.weightingId], cooperativeId: f.coop.cooperativeId, includeCurrent: false });
    await addHistoricalCollected(tx, { cooperativeId: f.coop.cooperativeId, materialId: f.material.materialId, amountKg: '100.00' });
    return row;
  });
}

test('collected-only import deletion preserves unrelated physical stock', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    const imported = await importCollectedOnly(f);
    await f.run({ collectionId: imported.weightingId });
    assert.equal((await f.stock()).totalCollectedKg.toFixed(2), '20.00');
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '16.00');
    assert.equal((await f.bag()).currentKg.toFixed(2), '8.25');
  } finally { await f.cleanup(); }
});

test('closing reversal restores captured state despite imports and historical deletion', { skip: !safe }, async () => {
  const f = await fixture(true);
  try {
    await importCollectedOnly(f);
    await f.run({ collectionId: f.earlier.weightingId });
    await f.run();
    assert.equal((await f.bag()).currentKg.toFixed(2), '5.00');
    assert.equal((await f.stock()).totalCollectedKg.toFixed(2), '111.75');
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '7.75');
  } finally { await f.cleanup(); }
});

test('consecutive latest deletions restore exact bag states across dates', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await f.run();
    await f.run({ collectionId: f.earlier.weightingId });
    assert.equal((await f.bag()).currentKg.toFixed(2), '0.00');
    assert.equal((await f.bag()).isBegun, false);
    assert.equal((await f.bag()).lastUpdated.toISOString(), '2026-11-11T12:00:00.000Z');
    assert.equal((await f.stock()).totalCollectedKg.toFixed(2), '11.75');
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '7.75');
  } finally { await f.cleanup(); }
});

test('unknown legacy effects require assisted correction without touching data', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await db!.$executeRaw`DELETE FROM measurement_effect WHERE measurement_id=${f.target.weightingId}`;
    await assert.rejects(f.run(), errorCode('LEGACY_COLLECTION_UNSUPPORTED'));
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '16.00');
    assert.ok(await db!.measurments.findUnique({ where: { weightingId: f.target.weightingId } }));
  } finally { await f.cleanup(); }
});

test('deletion concurrent with a real weighing preserves bag and exact ledger totals', { skip: !safe }, async () => {
  const f = await fixture();
  try {
    await Promise.all([f.run(), f.record('10.00','2026-11-11T13:00:00Z',false)]);
    const rows = await db!.measurments.findMany({ where: { wastepicker: f.worker.workerId } });
    const sum = rows.reduce((n,row) => n.plus(row.weightKg), new Prisma.Decimal(0));
    const stock = await f.stock();
    assert.equal(stock.totalCollectedKg.toFixed(2), sum.plus('11.75').toFixed(2));
    assert.equal(stock.currentStockKg.toFixed(2), sum.plus('7.75').toFixed(2));
    assert.equal((await f.bag()).currentKg.toFixed(2), '10.00');
    assert.equal((await f.bag()).lastUpdated.toISOString(), '2026-11-11T13:00:00.000Z');
  } finally { await f.cleanup(); }
});

test('a historically deleted closing remains a physical barrier when older entries are deleted', { skip: !safe }, async () => {
  const f = await fixture(true);
  try {
    const historicalClosing = (await f.record('7.00','2026-11-11T13:00:00Z',true)).measurement;
    const latestClosing = (await f.record('2.00','2026-11-11T14:00:00Z',true)).measurement;
    await f.run({ collectionId: historicalClosing.weightingId });
    await f.run({ collectionId: latestClosing.weightingId });
    await f.run();
    assert.equal((await f.bag()).currentKg.toFixed(2), '0.00');
    assert.equal((await f.bag()).isBegun, false);
  } finally { await f.cleanup(); }
});


test('a current-stock import does not replace the latest live bag transition', { skip: !safe }, async () => {
  const f = await fixture(true);
  try {
    const imported = await db!.$transaction(async tx => {
      const row = await tx.measurments.create({ data: { wastepicker: f.worker.workerId, material: f.material.materialId,
        device: f.device.deviceId, weightKg: '100.00', timeStamp: new Date('2026-11-11'), bagFilled: false } });
      await recordImportedCollectionEffects(tx, { measurementIds: [row.weightingId], cooperativeId: f.coop.cooperativeId, includeCurrent: true });
      await addToStock(tx, { cooperativeId: f.coop.cooperativeId, materialId: f.material.materialId, amountKg: '100.00' });
      return row;
    });
    await f.run();
    assert.equal((await f.bag()).currentKg.toFixed(2), '5.00');
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '112.75');
    await f.run({ collectionId: imported.weightingId });
    assert.equal((await f.bag()).currentKg.toFixed(2), '5.00');
    assert.equal((await f.stock()).currentStockKg.toFixed(2), '12.75');
    assert.equal((await f.stock()).totalCollectedKg.toFixed(2), '16.75');
  } finally { await f.cleanup(); }
});

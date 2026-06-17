import assert from 'node:assert/strict';
import test from 'node:test';
import {
  processMeasurementDeltas,
  sumDailyWorkerMaterialDeltas,
} from '../src/lib/analytics/measurement-deltas';

test('processMeasurementDeltas treats Weight_KG as an already-collected delta', () => {
  const rows = processMeasurementDeltas([
    {
      weight: 350,
      timestamp: new Date('2026-06-17T10:00:00Z'),
      materialId: BigInt(7),
      bagFilled: false,
    },
    {
      weight: 25,
      timestamp: new Date('2026-06-17T10:10:00Z'),
      materialId: BigInt(7),
      bagFilled: true,
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].netContribution, 350);
  assert.equal(rows[1].netContribution, 25);
});

test('sumDailyWorkerMaterialDeltas sums deltas by worker, material and day', () => {
  const rows = sumDailyWorkerMaterialDeltas([
    {
      workerId: BigInt(20),
      materialId: BigInt(7),
      timestamp: new Date('2026-06-17T10:00:00Z'),
      weight: 10,
      bagFilled: false,
    },
    {
      workerId: BigInt(20),
      materialId: BigInt(7),
      timestamp: new Date('2026-06-17T11:00:00Z'),
      weight: 3.75,
      bagFilled: true,
    },
    {
      workerId: BigInt(20),
      materialId: BigInt(8),
      timestamp: new Date('2026-06-17T12:00:00Z'),
      weight: 2,
      bagFilled: false,
    },
  ]);

  assert.deepEqual(
    rows.map((row) => ({
      workerId: row.workerId.toString(),
      materialId: row.materialId.toString(),
      date: row.date,
      weight: row.weight,
    })),
    [
      { workerId: '20', materialId: '7', date: '2026-06-17', weight: 13.75 },
      { workerId: '20', materialId: '8', date: '2026-06-17', weight: 2 },
    ],
  );
});

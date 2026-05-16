import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import {
  decimalToJsonNumber,
  formatDecimal,
  parsePositiveDecimal2,
  serializeBigIntDecimal,
} from '../src/lib/decimal';
import {
  StockDomainError,
  StockSnapshot,
  addToStock,
  adjustStock,
  applyStockSnapshotDelta,
  calculateBagStateDelta,
  recordSale,
} from '../src/lib/stock/ledger';

type FakeStockRow = StockSnapshot & {
  cooperative: bigint;
  material: bigint;
};

function stockSnapshot(values: {
  collected: string;
  sold: string;
  current: string;
}): StockSnapshot {
  return {
    stockId: BigInt(1),
    totalCollectedKg: new Prisma.Decimal(values.collected),
    totalSoldKg: new Prisma.Decimal(values.sold),
    currentStockKg: new Prisma.Decimal(values.current),
  };
}

function toDecimal(value: unknown) {
  if (Prisma.Decimal.isDecimal(value)) {
    return value;
  }

  return new Prisma.Decimal(String(value));
}

function toBigInt(value: unknown) {
  return BigInt(String(value));
}

function keyFor(cooperative: bigint, material: bigint) {
  return `${cooperative.toString()}:${material.toString()}`;
}

function createFakeStockTx(
  rows: Array<{
    cooperative: bigint;
    material: bigint;
    collected: string;
    sold: string;
    current: string;
  }> = [],
) {
  let nextStockId = BigInt(1);
  const stock = new Map<string, FakeStockRow>();
  const calls: string[] = [];

  for (const row of rows) {
    stock.set(keyFor(row.cooperative, row.material), {
      cooperative: row.cooperative,
      material: row.material,
      stockId: nextStockId,
      totalCollectedKg: new Prisma.Decimal(row.collected),
      totalSoldKg: new Prisma.Decimal(row.sold),
      currentStockKg: new Prisma.Decimal(row.current),
    });
    nextStockId += BigInt(1);
  }

  function clone(row: FakeStockRow) {
    return {
      stockId: row.stockId,
      totalCollectedKg: row.totalCollectedKg,
      totalSoldKg: row.totalSoldKg,
      currentStockKg: row.currentStockKg,
    };
  }

  function get(cooperative: bigint, material: bigint) {
    const row = stock.get(keyFor(cooperative, material));
    return row ? clone(row) : null;
  }

  async function $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join('?');
    calls.push(sql);

    if (/INSERT INTO "Stock"/.test(sql)) {
      assert.match(sql, /ON CONFLICT \("Cooperative", "Material"\)/);
      assert.match(sql, /"Current_stock_KG" = "Stock"\."Current_stock_KG" \+ EXCLUDED\."Current_stock_KG"/);

      const cooperative = toBigInt(values[0]);
      const material = toBigInt(values[1]);
      const amount = toDecimal(values[2]);
      const stockKey = keyFor(cooperative, material);
      const existing = stock.get(stockKey);

      if (existing) {
        existing.totalCollectedKg = existing.totalCollectedKg.plus(amount);
        existing.currentStockKg = existing.currentStockKg.plus(amount);
        return [clone(existing)];
      }

      const created = {
        cooperative,
        material,
        stockId: nextStockId,
        totalCollectedKg: amount,
        totalSoldKg: new Prisma.Decimal(0),
        currentStockKg: amount,
      };
      nextStockId += BigInt(1);
      stock.set(stockKey, created);
      return [clone(created)];
    }

    if (
      /UPDATE "Stock"/.test(sql) &&
      /"Total_collected_KG" = "Total_collected_KG" \+/.test(sql)
    ) {
      assert.match(sql, /"Current_stock_KG" = "Current_stock_KG" \+/);

      const amount = toDecimal(values[0]);
      const cooperative = toBigInt(values[2]);
      const material = toBigInt(values[3]);
      const row = stock.get(keyFor(cooperative, material));
      if (!row) {
        return [];
      }

      row.totalCollectedKg = row.totalCollectedKg.plus(amount);
      row.currentStockKg = row.currentStockKg.plus(amount);
      return [clone(row)];
    }

    if (
      /UPDATE "Stock"/.test(sql) &&
      /"Total_sold_KG" = "Total_sold_KG" \+/.test(sql)
    ) {
      assert.match(sql, /"Current_stock_KG" = "Current_stock_KG" -/);
      assert.match(sql, /"Current_stock_KG" >=/);

      const amount = toDecimal(values[0]);
      const cooperative = toBigInt(values[2]);
      const material = toBigInt(values[3]);
      const required = toDecimal(values[4]);
      const row = stock.get(keyFor(cooperative, material));
      if (!row || row.currentStockKg.lessThan(required)) {
        return [];
      }

      row.totalSoldKg = row.totalSoldKg.plus(amount);
      row.currentStockKg = row.currentStockKg.minus(amount);
      return [clone(row)];
    }

    if (
      /UPDATE "Stock"/.test(sql) &&
      /SET "Current_stock_KG" = "Current_stock_KG" -/.test(sql)
    ) {
      assert.match(sql, /\? > \? AND "Current_stock_KG" >= \?/);
      assert.match(sql, /"Current_stock_KG" - \? <= "Total_collected_KG" - "Total_sold_KG"/);

      const delta = toDecimal(values[0]);
      const cooperative = toBigInt(values[1]);
      const material = toBigInt(values[2]);
      const row = stock.get(keyFor(cooperative, material));
      if (!row) {
        return [];
      }

      if (delta.greaterThan(0) && row.currentStockKg.lessThan(delta)) {
        return [];
      }

      const nextCurrentStockKg = row.currentStockKg.minus(delta);
      const physicalAvailableKg = row.totalCollectedKg.minus(row.totalSoldKg);
      if (delta.lessThanOrEqualTo(0) && nextCurrentStockKg.greaterThan(physicalAvailableKg)) {
        return [];
      }

      row.currentStockKg = nextCurrentStockKg;
      return [clone(row)];
    }

    if (/SELECT/.test(sql) && /FROM "Stock"/.test(sql)) {
      const cooperative = toBigInt(values[0]);
      const material = toBigInt(values[1]);
      const row = stock.get(keyFor(cooperative, material));
      return row ? [clone(row)] : [];
    }

    throw new Error(`Unexpected fake SQL: ${sql}`);
  }

  return {
    tx: { $queryRaw } as unknown as Prisma.TransactionClient,
    calls,
    get,
  };
}

test('decimal helpers keep Prisma Decimal at the domain edge', () => {
  const decimal = parsePositiveDecimal2('12.30', 'weight_sold');

  assert.equal(formatDecimal(decimal), '12.30');
  assert.equal(decimalToJsonNumber(decimal), 12.3);
  assert.deepEqual(
    serializeBigIntDecimal({
      id: BigInt(10),
      weight: new Prisma.Decimal('1.20'),
    }),
    {
      id: '10',
      weight: '1.2',
    },
  );

  assert.throws(
    () => parsePositiveDecimal2(0.30000000000000004, 'weight_sold'),
    /no máximo 2 casas decimais/,
  );
  assert.throws(
    () => parsePositiveDecimal2('0.00', 'weight_sold'),
    /maior que zero/,
  );
});

test('bag state delta mirrors the Java accumulated measurement rule', () => {
  const inProgress = calculateBagStateDelta({
    previousCurrentKg: '4.25',
    reportedCurrentKg: '5.75',
    previousUpdatedAt: '2026-05-13T09:00:00Z',
    reportedAt: '2026-05-13T09:10:00Z',
    bagFull: false,
  });

  assert.equal(formatDecimal(inProgress.collectedDeltaKg), '1.50');
  assert.equal(formatDecimal(inProgress.nextCurrentKg), '5.75');
  assert.equal(inProgress.isBegun, true);

  const completed = calculateBagStateDelta({
    previousCurrentKg: '5.75',
    reportedCurrentKg: '8.00',
    previousUpdatedAt: '2026-05-13T09:10:00Z',
    reportedAt: '2026-05-13T09:20:00Z',
    bagFull: true,
  });

  assert.equal(formatDecimal(completed.collectedDeltaKg), '2.25');
  assert.equal(formatDecimal(completed.nextCurrentKg), '0.00');
  assert.equal(completed.isBegun, false);

  assert.throws(
    () =>
      calculateBagStateDelta({
        previousCurrentKg: '8.00',
        reportedCurrentKg: '7.50',
        previousUpdatedAt: '2026-05-13T09:20:00Z',
        reportedAt: '2026-05-13T09:30:00Z',
        bagFull: false,
      }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INVALID_BAG_READING',
  );

  const resetFromLowerReading = calculateBagStateDelta({
    previousCurrentKg: '8.00',
    reportedCurrentKg: '7.50',
    previousUpdatedAt: '2026-05-13T09:20:00Z',
    reportedAt: '2026-05-13T09:30:00Z',
    bagFull: true,
  });

  assert.equal(formatDecimal(resetFromLowerReading.collectedDeltaKg), '0.00');
  assert.equal(formatDecimal(resetFromLowerReading.nextCurrentKg), '0.00');
  assert.equal(resetFromLowerReading.isBegun, false);

  assert.throws(
    () =>
      calculateBagStateDelta({
        previousCurrentKg: '0.00',
        reportedCurrentKg: '6.00',
        previousUpdatedAt: '2026-05-13T09:20:00Z',
        reportedAt: '2026-05-13T09:19:59Z',
        bagFull: false,
      }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INVALID_BAG_READING',
  );
});

test('stock snapshot deltas block concurrent-style double sale debits', () => {
  const initial = stockSnapshot({
    collected: '10.00',
    sold: '0.00',
    current: '10.00',
  });

  const firstDebit = applyStockSnapshotDelta(initial, {
    currentDeltaKg: '-7.00',
    totalSoldDeltaKg: '7.00',
    requireCurrentAtLeastKg: '7.00',
  });

  assert.equal(formatDecimal(firstDebit.currentStockKg), '3.00');
  assert.equal(formatDecimal(firstDebit.totalSoldKg), '7.00');

  assert.throws(
    () => applyStockSnapshotDelta(firstDebit, {
      currentDeltaKg: '-7.00',
      totalSoldDeltaKg: '7.00',
      requireCurrentAtLeastKg: '7.00',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INSUFFICIENT_STOCK',
  );
});

test('stock snapshot deltas reject negative invariants instead of clamping', () => {
  const initial = stockSnapshot({
    collected: '20.00',
    sold: '3.00',
    current: '17.00',
  });

  assert.throws(
    () => applyStockSnapshotDelta(initial, {
      totalSoldDeltaKg: '-4.00',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'STOCK_INVARIANT_VIOLATION',
  );

  assert.throws(
    () => applyStockSnapshotDelta(initial, {
      currentDeltaKg: '0.01',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'STOCK_INVARIANT_VIOLATION',
  );
});

test('stock ledger wraps invalid decimal scale as a stock domain error', () => {
  const initial = stockSnapshot({
    collected: '20.00',
    sold: '0.00',
    current: '20.00',
  });

  assert.throws(
    () => applyStockSnapshotDelta(initial, {
      currentDeltaKg: '-1.234',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INVALID_STOCK_DECIMAL',
  );
});

test('recordSale helper updates stock atomically and rejects missing or insufficient stock', async () => {
  const store = createFakeStockTx([
    {
      cooperative: BigInt(42),
      material: BigInt(7),
      collected: '10.00',
      sold: '0.00',
      current: '10.00',
    },
  ]);

  const result = await recordSale(store.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    amountKg: '4.25',
  });

  assert.equal(formatDecimal(result.currentStockKg), '5.75');
  assert.equal(formatDecimal(result.totalSoldKg), '4.25');
  assert.equal(formatDecimal(store.get(BigInt(42), BigInt(7))!.currentStockKg), '5.75');

  await assert.rejects(
    () => recordSale(store.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(7),
      amountKg: '9.00',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INSUFFICIENT_STOCK' &&
      formatDecimal((error.details as { availableKg: string }).availableKg) === '5.75',
  );

  await assert.rejects(
    () => recordSale(store.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(99),
      amountKg: '1.00',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'STOCK_MISSING',
  );
});

test('recordSale helper blocks concurrent-style double debit through the conditional update path', async () => {
  const store = createFakeStockTx([
    {
      cooperative: BigInt(42),
      material: BigInt(7),
      collected: '10.00',
      sold: '0.00',
      current: '10.00',
    },
  ]);

  const results = await Promise.allSettled([
    recordSale(store.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(7),
      amountKg: '7.00',
    }),
    recordSale(store.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(7),
      amountKg: '7.00',
    }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(formatDecimal(store.get(BigInt(42), BigInt(7))!.currentStockKg), '3.00');
  assert.equal(formatDecimal(store.get(BigInt(42), BigInt(7))!.totalSoldKg), '7.00');
});

test('adjustStock helper reserves, releases and rejects unavailable stock', async () => {
  const store = createFakeStockTx([
    {
      cooperative: BigInt(42),
      material: BigInt(7),
      collected: '8.00',
      sold: '0.00',
      current: '8.00',
    },
  ]);

  const reserved = await adjustStock(store.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    deltaKg: '3.00',
  });
  assert.equal(formatDecimal(reserved.currentStockKg), '5.00');

  const released = await adjustStock(store.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    deltaKg: '-1.25',
  });
  assert.equal(formatDecimal(released.currentStockKg), '6.25');

  await assert.rejects(
    () => adjustStock(store.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(7),
      deltaKg: '10.00',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INSUFFICIENT_STOCK',
  );

  const unchanged = await adjustStock(store.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    deltaKg: '0.00',
  });
  assert.equal(formatDecimal(unchanged.currentStockKg), '6.25');
});

test('adjustStock helper rejects over-release beyond physical available stock', async () => {
  const store = createFakeStockTx([
    {
      cooperative: BigInt(42),
      material: BigInt(7),
      collected: '10.00',
      sold: '0.00',
      current: '8.00',
    },
  ]);

  await assert.rejects(
    () => adjustStock(store.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(7),
      deltaKg: '-5.00',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INSUFFICIENT_STOCK',
  );
  assert.equal(formatDecimal(store.get(BigInt(42), BigInt(7))!.currentStockKg), '8.00');

  const reserved = await adjustStock(store.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    deltaKg: '2.00',
  });
  assert.equal(formatDecimal(reserved.currentStockKg), '6.00');

  const released = await adjustStock(store.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    deltaKg: '-2.00',
  });
  assert.equal(formatDecimal(released.currentStockKg), '8.00');

  const repeatStore = createFakeStockTx([
    {
      cooperative: BigInt(42),
      material: BigInt(7),
      collected: '10.00',
      sold: '0.00',
      current: '10.00',
    },
  ]);

  await adjustStock(repeatStore.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    deltaKg: '2.00',
  });
  await adjustStock(repeatStore.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    deltaKg: '-2.00',
  });
  assert.equal(formatDecimal(repeatStore.get(BigInt(42), BigInt(7))!.currentStockKg), '10.00');

  await assert.rejects(
    () => adjustStock(repeatStore.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(7),
      deltaKg: '-0.01',
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'INSUFFICIENT_STOCK',
  );
  assert.equal(formatDecimal(repeatStore.get(BigInt(42), BigInt(7))!.currentStockKg), '10.00');
});

test('addToStock helper creates or updates stock according to createIfMissing', async () => {
  const createStore = createFakeStockTx();
  const created = await addToStock(createStore.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    amountKg: '2.50',
  });

  assert.equal(formatDecimal(created.totalCollectedKg), '2.50');
  assert.equal(formatDecimal(created.currentStockKg), '2.50');
  assert.ok(createStore.calls.some((sql) => /ON CONFLICT \("Cooperative", "Material"\)/.test(sql)));

  const updated = await addToStock(createStore.tx, {
    cooperativeId: BigInt(42),
    materialId: BigInt(7),
    amountKg: '1.25',
    createIfMissing: false,
  });
  assert.equal(formatDecimal(updated.totalCollectedKg), '3.75');
  assert.equal(formatDecimal(updated.currentStockKg), '3.75');

  const noCreateStore = createFakeStockTx();
  await assert.rejects(
    () => addToStock(noCreateStore.tx, {
      cooperativeId: BigInt(42),
      materialId: BigInt(7),
      amountKg: '1.00',
      createIfMissing: false,
    }),
    (error) =>
      error instanceof StockDomainError &&
      error.code === 'STOCK_MISSING',
  );
});

test('transactional stock ledger exposes conditional helpers for production mutations', () => {
  const source = readFileSync(path.resolve('src/lib/stock/ledger.ts'), 'utf8');
  const salesRoute = readFileSync(path.resolve('src/app/api/sales/route.ts'), 'utf8');
  const saleDetailRoute = readFileSync(path.resolve('src/app/api/sales/[id]/route.ts'), 'utf8');

  assert.match(source, /export async function addToStock/);
  assert.match(source, /export async function recordSale/);
  assert.match(source, /export async function adjustStock/);
  assert.match(source, /"Current_stock_KG" >= \$\{amountKg\}/);
  assert.match(source, /ON CONFLICT \("Cooperative", "Material"\)/);
  assert.match(salesRoute, /parsePositiveDecimal2\(body\.weight_sold/);
  // complete route debits stock via recordSale; PUT no longer mutates stock
  const completeRoute = readFileSync(path.resolve('src/app/api/sales/[id]/complete/route.ts'), 'utf8');
  assert.match(completeRoute, /recordSale/);
  assert.doesNotMatch(saleDetailRoute, /lockStockAggregateForUpdate/);
});

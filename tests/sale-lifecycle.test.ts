import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  getActiveSaleMutationGuard,
  getLegacyStockMutationGuard,
  getSaleLifecycleStatus,
  isSaleStockConsolidated,
  SOLD_SALE_WHERE,
  summarizeSoldSales,
} from '../src/lib/sales/lifecycle';

test('sale lifecycle derives operational status from terminal timestamps', () => {
  assert.equal(getSaleLifecycleStatus({ soldAt: null, cancelledAt: null }), 'ACTIVE');
  assert.equal(getSaleLifecycleStatus({ soldAt: new Date(), cancelledAt: null }), 'SOLD');
  assert.equal(getSaleLifecycleStatus({ soldAt: null, cancelledAt: new Date() }), 'CANCELLED');
});

test('legacy stock mutation is allowed only for already sold sales', () => {
  assert.deepEqual(
    getLegacyStockMutationGuard({ soldAt: null, cancelledAt: null }),
    { allowed: false, status: 'ACTIVE' },
  );
  assert.deepEqual(
    getLegacyStockMutationGuard({ soldAt: null, cancelledAt: new Date() }),
    { allowed: false, status: 'CANCELLED' },
  );
  assert.deepEqual(
    getLegacyStockMutationGuard({ soldAt: new Date(), cancelledAt: null }),
    { allowed: true, status: 'SOLD' },
  );
});

test('sales summaries count only stock-consolidated sold sales', () => {
  assert.equal(isSaleStockConsolidated({ soldAt: new Date(), cancelledAt: null }), true);
  assert.equal(isSaleStockConsolidated({ soldAt: null, cancelledAt: null }), false);
  assert.equal(isSaleStockConsolidated({ soldAt: null, cancelledAt: new Date() }), false);

  assert.deepEqual(
    summarizeSoldSales([
      {
        soldAt: new Date('2026-05-01T12:00:00Z'),
        cancelledAt: null,
        weight_sold: 10,
        'price/kg': 2,
      },
      {
        soldAt: null,
        cancelledAt: null,
        weight_sold: 99,
        'price/kg': 99,
      },
      {
        soldAt: null,
        cancelledAt: new Date('2026-05-02T12:00:00Z'),
        weight_sold: 50,
        'price/kg': 5,
      },
    ]),
    {
      totalSoldSales: 1,
      totalWeight: 10,
      totalValue: 20,
    },
  );
});

test('sold sale Prisma where contract excludes active and cancelled records', () => {
  assert.deepEqual(SOLD_SALE_WHERE, {
    soldAt: { not: null },
    cancelledAt: null,
  });
});

test('analytics routes use sold sales and direct cooperative scope', () => {
  const routeFiles = [
    'src/app/api/earnings-comparison/route.ts',
    'src/app/api/price-fluctuation/route.ts',
  ];

  for (const routeFile of routeFiles) {
    const source = readFileSync(path.resolve(routeFile), 'utf8');
    assert.match(source, /SOLD_SALE_WHERE/);
    assert.match(source, /cooperativeId:\s*BigInt\(targetCooperativeId\)/);
    assert.doesNotMatch(source, /responsibleRef:\s*\{/);
  }
});

test('active sale mutation guard allows only ACTIVE sales for update', () => {
  assert.deepEqual(
    getActiveSaleMutationGuard({ soldAt: null, cancelledAt: null }),
    { allowed: true, status: 'ACTIVE' },
  );
  assert.deepEqual(
    getActiveSaleMutationGuard({ soldAt: new Date(), cancelledAt: null }),
    { allowed: false, status: 'SOLD' },
  );
  assert.deepEqual(
    getActiveSaleMutationGuard({ soldAt: null, cancelledAt: new Date() }),
    { allowed: false, status: 'CANCELLED' },
  );
});

test('sale update route uses active guard and complete/cancel routes expose idempotent lifecycle transitions', () => {
  const updateRoute = readFileSync(path.resolve('src/app/api/sales/[id]/route.ts'), 'utf8');
  const completeRoute = readFileSync(path.resolve('src/app/api/sales/[id]/complete/route.ts'), 'utf8');
  const cancelRoute = readFileSync(path.resolve('src/app/api/sales/[id]/cancel/route.ts'), 'utf8');

  assert.match(updateRoute, /getActiveSaleMutationGuard/);
  assert.match(updateRoute, /SALE_LIFECYCLE_LOCKED/);
  assert.match(updateRoute, /status:\s*409/);

  assert.match(completeRoute, /export async function PATCH/);
  assert.match(completeRoute, /recordSale/);
  assert.match(completeRoute, /already_completed/);
  assert.match(completeRoute, /INSUFFICIENT_STOCK/);

  assert.match(cancelRoute, /export async function PATCH/);
  assert.match(cancelRoute, /already_cancelled/);
  assert.match(cancelRoute, /SALE_ALREADY_SOLD/);
});

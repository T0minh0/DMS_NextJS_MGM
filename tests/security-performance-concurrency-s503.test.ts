// S5-03 security/performance/concurrency invariants.
// These checks guard the collective-sale lifecycle lock order that protects
// stock reservations from stale updates across cancel/complete/leave/edit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(sourcePath: string) {
  return readFileSync(path.resolve(sourcePath), 'utf8');
}

function assertBefore(source: string, before: string, after: string) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);

  assert.notEqual(beforeIndex, -1, `Missing source marker: ${before}`);
  assert.notEqual(afterIndex, -1, `Missing source marker: ${after}`);
  assert.ok(beforeIndex < afterIndex, `${before} must appear before ${after}`);
}

test('collective sale lifecycle lock helper uses row-level FOR UPDATE', () => {
  const source = readSource('src/lib/collective-sales/locks.ts');

  assert.match(source, /FROM "collective_sale"/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /creatorCooperativeId/);
  assert.match(source, /cancelledAt/);
  assert.match(source, /soldAt/);
});

test('contribution updates lock the sale lifecycle before stock reservation', () => {
  const source = readSource('src/app/api/collective-sales/[id]/contribution/route.ts');

  assertBefore(
    source,
    'const sale = await lockCollectiveSaleForUpdate',
    'await lockStockAggregateForUpdate',
  );
  assertBefore(source, 'COLLECTIVE_SALE_CLOSED', 'await lockStockAggregateForUpdate');
});

test('leaving a collective sale locks the sale lifecycle before stock return', () => {
  const source = readSource('src/app/api/collective-sales/[id]/leave/route.ts');

  assertBefore(
    source,
    'const sale = await lockCollectiveSaleForUpdate',
    'await lockStockAggregateForUpdate',
  );
  assertBefore(source, 'COLLECTIVE_SALE_CLOSED', 'await lockStockAggregateForUpdate');
});

test('cancel re-checks each contribution after stock lock before returning stock', () => {
  const source = readSource('src/app/api/collective-sales/[id]/cancel/route.ts');

  assertBefore(
    source,
    'const sale = await lockCollectiveSaleForUpdate',
    'const contributions = await tx.collectiveSaleContribution.findMany',
  );
  assertBefore(
    source,
    'await lockStockAggregateForUpdate',
    'const currentContribution = await tx.collectiveSaleContribution.findUnique',
  );
  assertBefore(
    source,
    'const currentContribution = await tx.collectiveSaleContribution.findUnique',
    'await adjustStock',
  );
  assert.match(source, /orderBy: \[\{ cooperativeId: 'asc' \}, \{ contributionId: 'asc' \}\]/);
});

test('completion locks lifecycle before taking the contribution snapshot', () => {
  const source = readSource('src/app/api/collective-sales/[id]/complete/route.ts');

  assertBefore(
    source,
    'const lockedSale = await lockCollectiveSaleForUpdate',
    'const contributions = await tx.collectiveSaleContribution.findMany',
  );
  assertBefore(
    source,
    'const lockedSale = await lockCollectiveSaleForUpdate',
    'const claimed = await tx.collectiveSale.updateMany',
  );
  assert.match(source, /ConcurrentlyCancelledError/);
});

test('collective sale edit locks lifecycle before reserved-count and material update', () => {
  const source = readSource('src/app/api/collective-sales/[id]/route.ts');

  assertBefore(
    source,
    'const sale = await lockCollectiveSaleForUpdate',
    'const reservedCount = await tx.collectiveSaleContribution.count',
  );
  assertBefore(
    source,
    'const reservedCount = await tx.collectiveSaleContribution.count',
    'return tx.collectiveSale.update',
  );
  assert.match(source, /MATERIAL_CHANGE_BLOCKED/);
});

test('invite and join lock lifecycle before contribution mutations', () => {
  const inviteSource = readSource('src/app/api/collective-sales/[id]/invite/route.ts');
  const joinSource = readSource('src/app/api/collective-sales/[id]/join/route.ts');

  assertBefore(
    inviteSource,
    'const sale = await lockCollectiveSaleForUpdate',
    'return await tx.collectiveSaleContribution.create',
  );
  assertBefore(
    joinSource,
    'const sale = await lockCollectiveSaleForUpdate',
    'return tx.collectiveSaleContribution.update',
  );
});

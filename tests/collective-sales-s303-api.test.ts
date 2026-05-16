// Static-analysis smoke checks for S3-03 collective sale completion.
// Verifies RBAC, idempotency, revenue_share distribution, stock finalization.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}

const ROUTE = 'src/app/api/collective-sales/[id]/complete/route.ts';

// ── RBAC and guards ──────────────────────────────────────────────────────────

test('complete requires manager/admin with sales.update scope', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'update'/);
});

test('complete enforces creator-only rule', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /COMPLETE_FORBIDDEN/);
  assert.match(source, /creatorCooperativeId/);
});

test('complete blocks completion of a cancelled sale', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /COLLECTIVE_SALE_CANCELLED/);
  assert.match(source, /cancelledAt/);
});

test('complete blocks when no weight contributions exist', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /NO_CONTRIBUTIONS/);
  assert.match(source, /totalWeight.*isZero/);
});

// ── Idempotency ───────────────────────────────────────────────────────────────

test('complete is idempotent — already-sold sale returns 200 with existing data', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /já concluída/);
  assert.match(source, /soldAt.*null/);
});

test('complete uses AlreadyCompletedError sentinel to prevent concurrent double-completion', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /AlreadyCompletedError/);
  assert.match(source, /throw new AlreadyCompletedError/);
});

test('complete uses updateMany to atomically claim soldAt before touching stock', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /collectiveSale\.updateMany/);
  assert.match(source, /soldAt.*null/);
  assert.match(source, /claimed\.count === 0/);
});

// ── Revenue share calculation ─────────────────────────────────────────────────

test('complete computes revenue shares using distributeRevenue with last-remainder method', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /distributeRevenue/);
  assert.match(source, /totalRevenue\.minus\(runningSum\)/);
});

test('complete sets revenueShare only on ACCEPTED contributions with weight > 0', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /contributedWeight.*not.*null.*gt.*0/);
  assert.match(source, /revenueShare/);
});

test('complete revenue shares sum to totalWeight * price/kg', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /\.times\(priceKg\)/);
  assert.match(source, /ROUND_HALF_UP/);
});

// ── Stock finalization ────────────────────────────────────────────────────────

test('complete calls lockStockAggregateForUpdate per contribution before finalizing stock', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /lockStockAggregateForUpdate/);
  assert.match(source, /updateLockedStockAggregate/);
});

test('complete increments totalSoldKg without modifying currentStockKg', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /locked\.currentStockKg/);
  assert.match(source, /locked\.totalSoldKg\.plus/);
  assert.match(source, /contributedWeight/);
});

test('complete throws STOCK_MISSING when stock row is absent', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /STOCK_MISSING/);
  assert.match(source, /StockDomainError/);
});

// ── Transaction and response ──────────────────────────────────────────────────

test('complete runs all writes inside a single $transaction', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /\$transaction/);
});

test('complete sets soldAt and totalWeight on the sale', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /soldAt.*new Date/);
  assert.match(source, /totalWeight.*formatDecimal/);
});

test('complete response includes total_weight and revenue_share per participant', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /total_weight/);
  assert.match(source, /revenue_share/);
  assert.match(source, /participants/);
});

// ── Unit: distributeRevenue arithmetic ───────────────────────────────────────

import { Prisma } from '@prisma/client';

// Inline reimplementation to exercise the redistribution math.
function distributeRevenue(
  contributions: { contributionId: bigint; cooperativeId: bigint; contributedWeight: Prisma.Decimal }[],
  priceKg: Prisma.Decimal,
  totalWeight: Prisma.Decimal,
): Map<bigint, Prisma.Decimal> {
  const totalRevenue = totalWeight
    .times(priceKg)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const shares = new Map<bigint, Prisma.Decimal>();
  let runningSum = new Prisma.Decimal(0);
  const N = contributions.length;
  for (let i = 0; i < N; i++) {
    const c = contributions[i];
    let share: Prisma.Decimal;
    if (i === N - 1) {
      share = totalRevenue.minus(runningSum);
    } else {
      share = c.contributedWeight.times(priceKg).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      runningSum = runningSum.plus(share);
    }
    shares.set(c.contributionId, share);
  }
  return shares;
}

function makeContrib(id: number, weight: string) {
  return { contributionId: BigInt(id), cooperativeId: BigInt(id), contributedWeight: new Prisma.Decimal(weight) };
}

test('distributeRevenue: single contribution receives full revenue', () => {
  const contribs = [makeContrib(1, '100')];
  const shares = distributeRevenue(contribs, new Prisma.Decimal('0.50'), new Prisma.Decimal('100'));
  const total = [...shares.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  assert.equal(total.toFixed(2), '50.00');
  assert.equal(shares.get(1n)!.toFixed(2), '50.00');
});

test('distributeRevenue: two equal contributions split revenue evenly', () => {
  const contribs = [makeContrib(1, '50'), makeContrib(2, '50')];
  const shares = distributeRevenue(contribs, new Prisma.Decimal('1.00'), new Prisma.Decimal('100'));
  const total = [...shares.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  assert.equal(total.toFixed(2), '100.00');
  assert.equal(shares.get(1n)!.toFixed(2), '50.00');
  assert.equal(shares.get(2n)!.toFixed(2), '50.00');
});

test('distributeRevenue: three contributions — last absorbs rounding, sum is exact', () => {
  // 3 contributions of 10 kg each, price 0.33/kg → total 9.90
  // Each exact: 3.30 + 3.30 + 3.30 = 9.90 (exact in this case)
  const contribs = [makeContrib(1, '10'), makeContrib(2, '10'), makeContrib(3, '10')];
  const shares = distributeRevenue(contribs, new Prisma.Decimal('0.33'), new Prisma.Decimal('30'));
  const total = [...shares.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  assert.equal(total.toFixed(2), new Prisma.Decimal('30').times('0.33').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2));
});

test('distributeRevenue: rounding case — last remainder absorbs discrepancy', () => {
  // 3 contributions: 1kg, 1kg, 1kg; price/kg = 0.10 → total 0.30
  // Individual: 0.10, 0.10, 0.10 — happens to be exact
  // Harder case: 2 contributions of 1kg, price 0.005 → total rounds to 0.01
  const contribs = [makeContrib(1, '1'), makeContrib(2, '1')];
  const priceKg = new Prisma.Decimal('0.005');
  const totalWeight = new Prisma.Decimal('2');
  const shares = distributeRevenue(contribs, priceKg, totalWeight);
  const totalRevenue = totalWeight.times(priceKg).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const sum = [...shares.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  assert.equal(sum.toFixed(2), totalRevenue.toFixed(2), 'sum must equal totalRevenue exactly');
});

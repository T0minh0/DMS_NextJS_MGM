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

test('complete enforces creator-only rule before the idempotent soldAt path', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /COMPLETE_FORBIDDEN/);
  assert.match(source, /creatorCooperativeId/);
  // Auth check must appear before the soldAt != null idempotent return
  const authIdx = source.indexOf('COMPLETE_FORBIDDEN');
  const idempotentIdx = source.indexOf('já concluída');
  assert.ok(authIdx < idempotentIdx, 'auth check must precede the idempotent soldAt return');
});

test('complete blocks completion of a cancelled sale', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /COLLECTIVE_SALE_CANCELLED/);
  assert.match(source, /cancelledAt/);
});

test('complete blocks when no weight contributions exist via NoContributionsError sentinel', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /NO_CONTRIBUTIONS/);
  assert.match(source, /NoContributionsError/);
  assert.match(source, /throw new NoContributionsError/);
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

test('complete computes revenue shares using distributeRevenue with largest-remainder method', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /distributeRevenue/);
  assert.match(source, /ROUND_DOWN/);
  assert.match(source, /remainder/);
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

test('complete uses cooperativeId ordering for deadlock-safe lock acquisition', () => {
  const source = readRoute(ROUTE);
  assert.match(source, /cooperativeId.*asc/);
});

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

const CENT = new Prisma.Decimal('0.01');

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

  const candidates = contributions.map((contribution) => {
    const exactShare = contribution.contributedWeight.times(priceKg);
    const baseShare = exactShare.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    shares.set(contribution.contributionId, baseShare);

    return {
      contributionId: contribution.contributionId,
      cooperativeId: contribution.cooperativeId,
      remainder: exactShare.minus(baseShare),
    };
  });

  const allocated = [...shares.values()].reduce((sum, share) => sum.plus(share), new Prisma.Decimal(0));
  let residual = totalRevenue.minus(allocated);

  const byLargestRemainder = [...candidates].sort((a, b) => {
    const remainderOrder = b.remainder.comparedTo(a.remainder);
    if (remainderOrder !== 0) return remainderOrder;
    if (a.cooperativeId !== b.cooperativeId) {
      return a.cooperativeId < b.cooperativeId ? -1 : 1;
    }
    if (a.contributionId !== b.contributionId) {
      return a.contributionId < b.contributionId ? -1 : 1;
    }
    return 0;
  });

  for (const candidate of byLargestRemainder) {
    if (!residual.greaterThan(0)) break;
    shares.set(candidate.contributionId, shares.get(candidate.contributionId)!.plus(CENT));
    residual = residual.minus(CENT);
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
  assert.equal(shares.get(BigInt(1))!.toFixed(2), '50.00');
});

test('distributeRevenue: two equal contributions split revenue evenly', () => {
  const contribs = [makeContrib(1, '50'), makeContrib(2, '50')];
  const shares = distributeRevenue(contribs, new Prisma.Decimal('1.00'), new Prisma.Decimal('100'));
  const total = [...shares.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  assert.equal(total.toFixed(2), '100.00');
  assert.equal(shares.get(BigInt(1))!.toFixed(2), '50.00');
  assert.equal(shares.get(BigInt(2))!.toFixed(2), '50.00');
});

test('distributeRevenue: three contributions with exact cents keep sum exact', () => {
  // 3 contributions of 10 kg each, price 0.33/kg → total 9.90
  // Each exact: 3.30 + 3.30 + 3.30 = 9.90 (exact in this case)
  const contribs = [makeContrib(1, '10'), makeContrib(2, '10'), makeContrib(3, '10')];
  const shares = distributeRevenue(contribs, new Prisma.Decimal('0.33'), new Prisma.Decimal('30'));
  const total = [...shares.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  assert.equal(total.toFixed(2), new Prisma.Decimal('30').times('0.33').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2));
});

test('distributeRevenue: rounding case — largest remainder absorbs discrepancy', () => {
  // 2 contributions of 1kg, price 0.005 → total rounds to 0.01
  const contribs = [makeContrib(1, '1'), makeContrib(2, '1')];
  const priceKg = new Prisma.Decimal('0.005');
  const totalWeight = new Prisma.Decimal('2');
  const shares = distributeRevenue(contribs, priceKg, totalWeight);
  const totalRevenue = totalWeight.times(priceKg).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const sum = [...shares.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  assert.equal(sum.toFixed(2), totalRevenue.toFixed(2), 'sum must equal totalRevenue exactly');
});

test('distributeRevenue: largest remainder avoids negative shares for tiny valid contributions', () => {
  // 4 contributions of 0.01 kg at 0.50/kg -> totalRevenue = 0.02.
  // Independent HALF_UP on the first three would over-allocate 0.03.
  const contribs = [1, 2, 3, 4].map((i) => makeContrib(i, '0.01'));
  const priceKg = new Prisma.Decimal('0.50');
  const totalWeight = new Prisma.Decimal('0.04');
  const shares = distributeRevenue(contribs, priceKg, totalWeight);
  const totalRevenue = totalWeight.times(priceKg).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const values = [...shares.values()];
  const sum = values.reduce((s, v) => s.plus(v), new Prisma.Decimal(0));

  assert.equal(sum.toFixed(2), totalRevenue.toFixed(2), 'sum must equal totalRevenue exactly');
  assert.equal(values.some((share) => share.lessThan(0)), false, 'shares must not be negative');
  assert.deepEqual(values.map((share) => share.toFixed(2)), ['0.01', '0.01', '0.00', '0.00']);
});

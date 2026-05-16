// Static-analysis smoke checks for S3-04 sales report routes.
// Verifies RBAC, data fields, scoping, and contract compatibility.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}

const NORMAL = 'src/app/api/reports/sales/normal/[saleId]/route.ts';
const COLLECTIVE = 'src/app/api/reports/sales/collective/[saleId]/route.ts';

// ── Normal sale report ────────────────────────────────────────────────────────

test('normal report requires manager/admin with sales.read scope', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'read'/);
});

test('normal report scopes access by cooperative for manager role', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /cooperativeId.*session\.cooperativeId/);
  assert.match(source, /admin/);
});

test('normal report returns SALE_NOT_FOUND for out-of-scope sales', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /SALE_NOT_FOUND/);
});

test('normal report includes material_name, worker_name, buyer_name', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /material_name/);
  assert.match(source, /worker_name/);
  assert.match(source, /buyer_name/);
});

test('normal report includes cooperative_id and cooperative_name', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /cooperative_id/);
  assert.match(source, /cooperative_name/);
});

test('normal report includes total_revenue as price * weight', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /total_revenue/);
  assert.match(source, /times/);
});

test('normal report includes lifecycle status field', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /getSaleLifecycleStatus/);
  assert.match(source, /status/);
});

test('normal report includes all timestamps: date, created_at, sold_at, cancelled_at', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /date:/);
  assert.match(source, /created_at/);
  assert.match(source, /sold_at/);
  assert.match(source, /cancelled_at/);
});

test('normal report uses decimalToJsonNumber for price/kg, weight and revenue', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /decimalToJsonNumber/);
  assert.match(source, /price\/kg/);
  assert.match(source, /weight_sold/);
});

test('normal report wraps result in report: field', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /report:/);
  assert.match(source, /_id:/);
});

// ── Collective sale report ────────────────────────────────────────────────────

test('collective report requires manager/admin with sales.read scope', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'read'/);
});

test('collective report hides sale from managers not creator or participant', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /isCreator/);
  assert.match(source, /isParticipant/);
  assert.match(source, /COLLECTIVE_SALE_NOT_FOUND/);
});

test('collective report exposes my_participation for manager scope', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /my_participation/);
  assert.match(source, /myContribution/);
});

test('collective report includes contributions with cooperative, weight and revenue_share', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /contributions/);
  assert.match(source, /contributed_weight/);
  assert.match(source, /revenue_share/);
  assert.match(source, /cooperative_name/);
});

test('collective report computes total_revenue from totalWeight * priceKg', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /total_revenue/);
  assert.match(source, /totalWeight.*times.*priceKg|priceKg.*times|\.times\(/);
});

test('collective report includes status: ACTIVE, SOLD or CANCELLED', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /ACTIVE/);
  assert.match(source, /SOLD/);
  assert.match(source, /CANCELLED/);
  assert.match(source, /computeStatus/);
});

test('collective report includes creator_cooperative_id and creator_cooperative_name', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /creator_cooperative_id/);
  assert.match(source, /creator_cooperative_name/);
});

test('collective report includes all lifecycle timestamps', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /sold_at/);
  assert.match(source, /cancelled_at/);
  assert.match(source, /created_at/);
});

test('collective report wraps result in report: field with _id', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /report:/);
  assert.match(source, /_id:/);
});

test('collective report allows admin to see any sale without coop filter', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /isAdmin/);
  // admin path skips the isCreator/isParticipant check
  const adminIdx = source.indexOf('isAdmin');
  const participantIdx = source.indexOf('isParticipant');
  assert.ok(adminIdx < participantIdx, 'isAdmin check must precede participant scoping');
});

// Static-analysis smoke checks for multiplier routes and random-multiplier job (S2-04).
// Same pattern as sale-lifecycle.test.ts, observability.test.ts, analytics-parity.test.ts:
// verifies structural invariants by reading source files, not invoking handlers at runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}

test('multipliers route requires manager/admin — workers are blocked', () => {
  const source = readRoute('src/app/api/multipliers/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.doesNotMatch(source, /requireAuth\(\)/);
});

test('multipliers route uses upsert with composite unique key cooperativeId_materialId', () => {
  const source = readRoute('src/app/api/multipliers/route.ts');
  assert.match(source, /cooperativeMaterialMultiplier\.upsert/);
  assert.match(source, /cooperativeId_materialId/);
});

test('multipliers route validates cooperative ownership — POST uses reports.manage not reports.read', () => {
  const source = readRoute('src/app/api/multipliers/route.ts');
  assert.match(source, /determineTargetCooperative/);
  assert.match(source, /requireScopedPermission/);
  assert.match(source, /'reports',\s*'manage'/);
});

test('multipliers route validates multiplier_value — rejects NaN, Infinity and out-of-range', () => {
  const source = readRoute('src/app/api/multipliers/route.ts');
  assert.match(source, /INVALID_MULTIPLIER_VALUE/);
  assert.match(source, /Number\.isFinite\(multiplierRaw\)/);
  assert.match(source, /multiplierRaw > 99\.999/);
});

test('multipliers route returns material_id as BigInt-safe string', () => {
  const source = readRoute('src/app/api/multipliers/route.ts');
  assert.match(source, /material_id:\s*row\.materialId\.toString\(\)/);
  assert.doesNotMatch(source, /material_id:\s*Number\(/);
});

test('multipliers/single route requires manager/admin', () => {
  const source = readRoute('src/app/api/multipliers/single/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.doesNotMatch(source, /requireAuth\(\)/);
});

test('multipliers/single route uses findUnique with composite key', () => {
  const source = readRoute('src/app/api/multipliers/single/route.ts');
  assert.match(source, /cooperativeMaterialMultiplier\.findUnique/);
  assert.match(source, /cooperativeId_materialId/);
});

test('multipliers/single route returns default multiplier_value of 1 when not found', () => {
  const source = readRoute('src/app/api/multipliers/single/route.ts');
  assert.match(source, /multiplier_value:\s*1\.0/);
  assert.match(source, /found:\s*false/);
});

test('random-multiplier job route requires job authorization header', () => {
  const source = readRoute('src/app/api/jobs/random-multiplier/route.ts');
  assert.match(source, /verifyJobAuthorizationHeader/);
  assert.match(source, /JOB_UNAUTHORIZED/);
});

test('random-multiplier job uses runIdempotentJob with monthly-random-multiplier key', () => {
  const source = readRoute('src/app/api/jobs/random-multiplier/route.ts');
  assert.match(source, /runIdempotentJob/);
  assert.match(source, /buildJobRunKey/);
  assert.match(source, /monthly-random-multiplier/);
});

test('random-multiplier job uses InMemoryJobRunLedger for within-process idempotency', () => {
  const source = readRoute('src/app/api/jobs/random-multiplier/route.ts');
  assert.match(source, /InMemoryJobRunLedger/);
  assert.match(source, /ledger/);
});

test('random-multiplier job skips cooperatives already updated this period (DB-level idempotency)', () => {
  const source = readRoute('src/app/api/jobs/random-multiplier/route.ts');
  assert.match(source, /cooperativeRandomMultiplier\.findFirst/);
  assert.match(source, /lastUpdated/);
  assert.match(source, /gte.*periodStart/);
  assert.match(source, /skippedCount/);
  assert.match(source, /cooperativeRandomMultiplier\.upsert/);
});

test('random-multiplier job returns skipped status when already running', () => {
  const source = readRoute('src/app/api/jobs/random-multiplier/route.ts');
  assert.match(source, /status.*skipped/);
  assert.match(source, /status.*completed/);
});

test('random-multiplier job uses period key based on year-month', () => {
  const source = readRoute('src/app/api/jobs/random-multiplier/route.ts');
  assert.match(source, /buildPeriodKey/);
  assert.match(source, /getUTCFullYear/);
  assert.match(source, /getUTCMonth/);
});

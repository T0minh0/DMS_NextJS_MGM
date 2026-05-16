// Static-analysis smoke checks for analytics parity (S2-03).
// Same pattern as sale-lifecycle.test.ts and observability.test.ts:
// verifies structural invariants (SOLD_SALE_WHERE usage, auth calls, filter validation)
// by reading source files, not invoking handlers at runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}

test('revenue route requires manager/admin — workers are blocked', () => {
  const source = readRoute('src/app/api/revenue/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.doesNotMatch(source, /requireAuth\(\)/);
});

test('revenue route uses SOLD_SALE_WHERE for concluded-sale semantics', () => {
  const source = readRoute('src/app/api/revenue/route.ts');
  assert.match(source, /SOLD_SALE_WHERE/);
  assert.match(source, /from '@\/lib\/sales\/lifecycle'/);
});

test('revenue route validates start_date and end_date filters', () => {
  const source = readRoute('src/app/api/revenue/route.ts');
  assert.match(source, /INVALID_START_DATE/);
  assert.match(source, /INVALID_END_DATE/);
});

test('revenue route validates material_id filter and handles group_ prefix', () => {
  const source = readRoute('src/app/api/revenue/route.ts');
  assert.match(source, /INVALID_MATERIAL/);
  assert.match(source, /group_/);
});

test('revenue route respects cooperative scope via determineTargetCooperative', () => {
  const source = readRoute('src/app/api/revenue/route.ts');
  assert.match(source, /determineTargetCooperative/);
  assert.match(source, /requireScopedPermission/);
});

test('cooperative/lastsales route requires manager/admin', () => {
  const source = readRoute('src/app/api/cooperative/lastsales/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.doesNotMatch(source, /requireAuth\(\)/);
});

test('cooperative/lastsales route uses SOLD_SALE_WHERE', () => {
  const source = readRoute('src/app/api/cooperative/lastsales/route.ts');
  assert.match(source, /SOLD_SALE_WHERE/);
});

test('cooperative/lastsales route clamps limit to prevent over-fetching', () => {
  const source = readRoute('src/app/api/cooperative/lastsales/route.ts');
  assert.match(source, /MAX_LIMIT/);
  assert.match(source, /Math\.min/);
});

test('cooperative/materials route requires manager/admin', () => {
  const source = readRoute('src/app/api/cooperative/materials/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.doesNotMatch(source, /requireAuth\(\)/);
});

test('cooperative/materials route returns stock_kg from Stock table', () => {
  const source = readRoute('src/app/api/cooperative/materials/route.ts');
  assert.match(source, /stock_kg/);
  assert.match(source, /currentStockKg/);
});

test('existing analytics routes (earnings-comparison, price-fluctuation) use SOLD_SALE_WHERE', () => {
  const routes = [
    'src/app/api/earnings-comparison/route.ts',
    'src/app/api/price-fluctuation/route.ts',
  ];
  for (const routeFile of routes) {
    const source = readRoute(routeFile);
    assert.match(source, /SOLD_SALE_WHERE/, `${routeFile} must use SOLD_SALE_WHERE`);
    assert.match(source, /requireManagerOrAdmin/, `${routeFile} must block workers`);
  }
});

test('worker-collections route requires manager/admin (workers blocked for aggregate view)', () => {
  const source = readRoute('src/app/api/worker-collections/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
});

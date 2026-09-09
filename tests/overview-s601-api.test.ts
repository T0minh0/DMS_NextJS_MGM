import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LOW_STOCK_KG, classifyStockLevel } from '../src/lib/stock/thresholds';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const SCOPED_ROUTES = [
  'src/app/api/stock/route.ts',
  'src/app/api/earnings-comparison/route.ts',
  'src/app/api/worker-collections/route.ts',
  'src/app/api/birthdays/route.ts',
  'src/app/api/users/route.ts',
];

test('overview analytics routes accept an explicit cooperative_id so admins see the session cooperative', () => {
  for (const routeFile of SCOPED_ROUTES) {
    const source = readSource(routeFile);
    assert.match(
      source,
      /determineTargetCooperative\(session, searchParams\.get\('cooperative_id'\)\)/,
      `${routeFile} must scope by cooperative_id`,
    );
    assert.match(source, /requireManagerOrAdmin/, `${routeFile} must block workers`);
  }
});

test('birthdays only list active wastepickers', () => {
  const source = readSource('src/app/api/birthdays/route.ts');
  assert.match(source, /exitDate: null/);
});

test('earnings comparison uses calendar weeks aligned with worker collections', () => {
  const earnings = readSource('src/app/api/earnings-comparison/route.ts');
  const collections = readSource('src/app/api/worker-collections/route.ts');

  assert.match(earnings, /currentWeekStart\.setDate\(now\.getDate\(\) - now\.getDay\(\)\)/);
  assert.match(earnings, /end\.setHours\(23, 59, 59, 999\)/);
  assert.match(collections, /start\.setDate\(now\.getDate\(\) - now\.getDay\(\)\)/);
  assert.doesNotMatch(earnings, /start\.setDate\(end\.getDate\(\) - 6\)/);
});

test('stock thresholds are shared between the overview and the materials page', () => {
  assert.equal(LOW_STOCK_KG, 25);
  assert.equal(classifyStockLevel(0), 'empty');
  assert.equal(classifyStockLevel(-1), 'empty');
  assert.equal(classifyStockLevel(Number.NaN), 'empty');
  assert.equal(classifyStockLevel(25), 'critical');
  assert.equal(classifyStockLevel(25.01), 'stable');

  const materialsPage = readSource('src/app/materials/page.tsx');
  assert.match(materialsPage, /@\/lib\/stock\/thresholds/);
  assert.doesNotMatch(materialsPage, /const LOW_STOCK_KG = 25/);
});

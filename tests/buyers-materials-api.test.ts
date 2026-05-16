import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}

test('materials route returns material_id as BigInt-safe string, not Number()', () => {
  const source = readRoute('src/app/api/materials/route.ts');
  assert.doesNotMatch(source, /material_id:\s*Number\(/);
  assert.match(source, /material_id:\s*material\.materialId\.toString\(\)/);
});

test('materials [id] route returns material_id as BigInt-safe string', () => {
  const source = readRoute('src/app/api/materials/[id]/route.ts');
  assert.doesNotMatch(source, /material_id:\s*Number\(/);
  assert.match(source, /material_id:\s*material\.materialId\.toString\(\)/);
});

test('materials page interface uses string material_id to match API', () => {
  const source = readRoute('src/app/materials/page.tsx');
  assert.match(source, /material_id:\s*string/);
  assert.doesNotMatch(source, /material_id:\s*number/);
});

test('buyers canonical route exposes structured objects with _id and name', () => {
  const source = readRoute('src/app/api/buyers/route.ts');
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /_id:\s*b\.buyerId\.toString\(\)/);
  assert.match(source, /name:\s*b\.buyerName/);
});

test('buyers canonical route handles P2002 race condition on create', () => {
  const source = readRoute('src/app/api/buyers/route.ts');
  assert.match(source, /P2002/);
  assert.match(source, /PrismaClientKnownRequestError/);
  assert.match(source, /BUYER_NAME_CONFLICT/);
});

test('sales/buyers legacy route handles P2002 and returns 409 on duplicate', () => {
  const source = readRoute('src/app/api/sales/buyers/route.ts');
  assert.match(source, /P2002/);
  assert.match(source, /status:\s*409/);
  assert.match(source, /BUYER_NAME_CONFLICT/);
});

test('cooperatives route returns IDs as strings in _id and cooperative_id fields', () => {
  const source = readRoute('src/app/api/cooperatives/route.ts');
  assert.match(source, /cooperative_id:\s*id/);
  assert.match(source, /_id:\s*id/);
  assert.match(source, /\.toString\(\)/);
});

test('buyers canonical route uses apiInternalErrorResponse for server errors', () => {
  const source = readRoute('src/app/api/buyers/route.ts');
  assert.match(source, /apiInternalErrorResponse/);
  assert.doesNotMatch(source, /NextResponse\.json\(.*[45]\d\d/);
});

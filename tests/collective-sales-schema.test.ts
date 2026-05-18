import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const schema = readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
const s102Migration = readFileSync(
  path.resolve('prisma/migrations/20260513233000_s1_02_collective_sales/migration.sql'),
  'utf8',
);
const seedSource = readFileSync(path.resolve('prisma/seed.ts'), 'utf8');
const materialDeleteRoute = readFileSync(
  path.resolve('src/app/api/materials/[id]/route.ts'),
  'utf8',
);

test('S1-02 Prisma schema maps collective sale tables and relationships', () => {
  assert.match(schema, /model CollectiveSale \{/);
  assert.match(schema, /@@map\("collective_sale"\)/);
  assert.match(schema, /creatorCooperativeId\s+BigInt\s+@map\("creator_cooperative_id"\)/);
  assert.match(schema, /totalWeight\s+Decimal\?\s+@map\("total_weight"\)\s+@db\.Decimal\(10, 2\)/);
  assert.match(schema, /priceKg\s+Decimal\s+@map\("price_kg"\)\s+@db\.Decimal\(10, 2\)/);
  assert.match(schema, /contributions\s+CollectiveSaleContribution\[\]/);
  assert.match(schema, /creatorCooperative\s+Cooperative\s+@relation/);
  assert.match(schema, /material\s+Materials\s+@relation/);
  assert.match(schema, /buyer\s+Buyers\s+@relation/);
});

test('S1-02 Prisma schema maps collective contribution contract', () => {
  assert.match(schema, /model CollectiveSaleContribution \{/);
  assert.match(schema, /@@map\("collective_sale_contribution"\)/);
  assert.match(schema, /contributedWeight\s+Decimal\?\s+@map\("contributed_weight"\)\s+@db\.Decimal\(10, 2\)/);
  assert.match(schema, /revenueShare\s+Decimal\?\s+@map\("revenue_share"\)\s+@db\.Decimal\(10, 2\)/);
  assert.match(schema, /status\s+String\s+@default\("ACCEPTED"\)\s+@db\.VarChar\(20\)/);
  assert.match(
    schema,
    /@@unique\(\[collectiveSaleId, cooperativeId\], map: "collective_sale_contribution_sale_cooperative_key"\)/,
  );
});

test('S1-02 migration creates collective sale tables with current physical FKs', () => {
  assert.match(s102Migration, /^BEGIN;/m);
  assert.match(s102Migration, /^COMMIT;/m);
  assert.match(s102Migration, /CREATE TABLE "collective_sale"/);
  assert.match(s102Migration, /CREATE TABLE "collective_sale_contribution"/);
  assert.match(s102Migration, /REFERENCES "Buyers"\("Buyer_id"\)/);
  assert.match(s102Migration, /REFERENCES "Materials"\("Material_id"\)/);
  assert.match(s102Migration, /REFERENCES "Cooperative"\("cooperative_id"\)/);
  assert.doesNotMatch(s102Migration, /REFERENCES public\.buyers/);
  assert.doesNotMatch(s102Migration, /REFERENCES public\.materials/);
  assert.doesNotMatch(s102Migration, /REFERENCES public\.cooperative/);
});

test('S1-02 migration encodes lifecycle, decimal and status invariants', () => {
  assert.match(s102Migration, /collective_sale_lifecycle_terminal_check/);
  assert.match(s102Migration, /CHECK \("sold_at" IS NULL OR "cancelled_at" IS NULL\)/);
  assert.match(s102Migration, /collective_sale_positive_price_check/);
  assert.match(s102Migration, /CHECK \("price_kg" > 0\)/);
  assert.match(s102Migration, /collective_sale_sold_requires_total_weight_check/);
  assert.match(s102Migration, /CHECK \("sold_at" IS NULL OR "total_weight" IS NOT NULL\)/);
  assert.match(s102Migration, /CHECK \("status" IN \('INVITED', 'ACCEPTED', 'LEFT'\)\)/);
  assert.match(s102Migration, /CHECK \("contributed_weight" IS NULL OR "contributed_weight" >= 0\)/);
  assert.match(s102Migration, /CHECK \("revenue_share" IS NULL OR "revenue_share" >= 0\)/);
  assert.match(s102Migration, /UNIQUE \("collective_sale_id", "cooperative_id"\)/);
});

test('S1-02 seed persists collective UAT fixtures without reserving stock yet', () => {
  assert.match(seedSource, /"collective_sale_contribution", "collective_sale"/);
  assert.match(seedSource, /Cooperativa UAT Norte/);
  assert.match(seedSource, /cooperativeNorte/);
  assert.match(seedSource, /prisma\.collectiveSale\.create/);
  assert.match(seedSource, /collectiveOpenTwoCoops/);
  assert.match(seedSource, /collectiveContributionPending/);
  assert.match(seedSource, /status: 'INVITED'/);
  assert.match(seedSource, /contributedWeight: '0\.00'/);
});

test('S1-02 material deletion guard accounts for collective sales FK usage', () => {
  assert.match(materialDeleteRoute, /prisma\.collectiveSale\.count\(\{ where: \{ materialId: id \} \}\)/);
  assert.match(materialDeleteRoute, /collectiveSaleUsage > 0/);
  assert.match(materialDeleteRoute, /PrismaClientKnownRequestError/);
  assert.match(materialDeleteRoute, /P2003/);
  assert.match(materialDeleteRoute, /vendas coletivas/);
});

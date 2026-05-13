import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const schema = readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
const s101Migration = readFileSync(
  path.resolve(
    'prisma/migrations/20260513224000_s1_01_core_sales_stock_bag_state/migration.sql',
  ),
  'utf8',
);

test('S1-01 Prisma schema exposes sales lifecycle and stock contracts', () => {
  assert.match(schema, /model Sales \{/);
  assert.match(schema, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
  assert.match(schema, /soldAt\s+DateTime\?\s+@map\("sold_at"\)/);
  assert.match(schema, /cancelledAt\s+DateTime\?\s+@map\("cancelled_at"\)/);
  assert.match(schema, /cooperativeId\s+BigInt\s+@map\("cooperative_id"\)/);
  assert.match(
    schema,
    /expectedSaleDate\s+DateTime\s+@default\(now\(\)\)\s+@map\("expected_sale_date"\)/,
  );
  assert.match(schema, /@@unique\(\[cooperative, material\], map: "Stock_cooperative_material_key"\)/);
});

test('S1-01 Prisma schema maps material_bag_state to current physical tables', () => {
  assert.match(schema, /model MaterialBagState \{/);
  assert.match(schema, /@@map\("material_bag_state"\)/);
  assert.match(schema, /cooperative\s+Cooperative\s+@relation/);
  assert.match(schema, /material\s+Materials\s+@relation/);
  assert.match(
    schema,
    /@@unique\(\[cooperativeId, materialId\], map: "material_bag_state_cooperative_material_key"\)/,
  );
});

test('S1-01 migration is guarded before sales backfill and stock unique constraint', () => {
  assert.match(s101Migration, /^BEGIN;/m);
  assert.match(s101Migration, /^COMMIT;/m);
  assert.match(s101Migration, /LOCK TABLE "Sales", "Stock", "Workers" IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(s101Migration, /duplicate Stock rows/);
  assert.match(s101Migration, /Stock contains negative totals/);
  assert.match(s101Migration, /Sales contains non-positive weight or price/);
  assert.match(s101Migration, /Sales contains rows without a valid responsible worker/);
  assert.match(s101Migration, /legacy Sales totals are not represented in Stock\.total_sold_kg/);
  assert.match(s101Migration, /UPDATE "Sales" s/);
  assert.match(s101Migration, /"cooperative_id" = COALESCE\(s\."cooperative_id", w\."Cooperative"\)/);
  assert.match(s101Migration, /ALTER COLUMN "cooperative_id" SET NOT NULL/);
  assert.match(s101Migration, /"Stock_cooperative_material_key" UNIQUE \("Cooperative", "Material"\)/);
});

test('S1-01 migration encodes lifecycle and material bag invariants', () => {
  assert.match(s101Migration, /"Sales_lifecycle_terminal_check"/);
  assert.match(s101Migration, /CHECK \("sold_at" IS NULL OR "cancelled_at" IS NULL\)/);
  assert.match(s101Migration, /"Sales_positive_weight_check"/);
  assert.match(s101Migration, /"Sales_positive_price_check"/);
  assert.match(s101Migration, /CREATE TABLE "material_bag_state"/);
  assert.match(s101Migration, /REFERENCES "Cooperative"\("cooperative_id"\)/);
  assert.match(s101Migration, /REFERENCES "Materials"\("Material_id"\)/);
  assert.match(s101Migration, /CHECK \("current_kg" >= 0\)/);
  assert.match(s101Migration, /CHECK \("is_begun" OR "current_kg" = 0\)/);
  assert.doesNotMatch(s101Migration, /REFERENCES public\.cooperative/);
  assert.doesNotMatch(s101Migration, /REFERENCES public\.materials/);
});

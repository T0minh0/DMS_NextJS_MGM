-- S1-01 core sales/stock/material_bag_state migration.
-- Classification: additive-only + guarded backfill + constraint contract.
-- Destructive changes: none. The migration aborts before changing schema when legacy data
-- violates the ADR-0002 backfill assumptions.

BEGIN;

LOCK TABLE "Sales", "Stock", "Workers" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Stock"
    GROUP BY "Cooperative", "Material"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'S1-01 preflight failed: duplicate Stock rows per (Cooperative, Material). Reconcile duplicates before applying unique constraint.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Stock"
    WHERE "Current_stock_KG" < 0
       OR "Total_sold_KG" < 0
       OR "Total_collected_KG" < 0
  ) THEN
    RAISE EXCEPTION 'S1-01 preflight failed: Stock contains negative totals.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Sales"
    WHERE "Weight" <= 0 OR "Price_Kg" <= 0
  ) THEN
    RAISE EXCEPTION 'S1-01 preflight failed: Sales contains non-positive weight or price.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Sales" s
    LEFT JOIN "Workers" w ON w."Worker_id" = s."Responsible"
    WHERE w."Worker_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'S1-01 preflight failed: Sales contains rows without a valid responsible worker.';
  END IF;

  IF EXISTS (
    WITH sale_totals AS (
      SELECT
        w."Cooperative" AS cooperative_id,
        s."Material" AS material_id,
        SUM(s."Weight") AS sold_weight
      FROM "Sales" s
      JOIN "Workers" w ON w."Worker_id" = s."Responsible"
      GROUP BY w."Cooperative", s."Material"
    )
    SELECT 1
    FROM sale_totals st
    LEFT JOIN "Stock" stock
      ON stock."Cooperative" = st.cooperative_id
     AND stock."Material" = st.material_id
    WHERE stock."Stock_id" IS NULL
       OR st.sold_weight > stock."Total_sold_KG" + 0.01
  ) THEN
    RAISE EXCEPTION 'S1-01 preflight failed: legacy Sales totals are not represented in Stock.total_sold_kg.';
  END IF;
END $$;

ALTER TABLE "Sales"
  ADD COLUMN "created_at" TIMESTAMP(6),
  ADD COLUMN "sold_at" TIMESTAMP(6),
  ADD COLUMN "cancelled_at" TIMESTAMP(6),
  ADD COLUMN "cooperative_id" BIGINT,
  ADD COLUMN "expected_sale_date" TIMESTAMP(6);

UPDATE "Sales" s
SET
  "created_at" = COALESCE(s."created_at", s."Date"::timestamp, now()),
  "sold_at" = COALESCE(s."sold_at", s."Date"::timestamp, COALESCE(s."created_at", now())),
  "cooperative_id" = COALESCE(s."cooperative_id", w."Cooperative"),
  "expected_sale_date" = COALESCE(
    s."expected_sale_date",
    s."Date"::timestamp,
    COALESCE(s."created_at", now())
  )
FROM "Workers" w
WHERE w."Worker_id" = s."Responsible";

ALTER TABLE "Sales"
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "cooperative_id" SET NOT NULL,
  ALTER COLUMN "expected_sale_date" SET NOT NULL,
  ALTER COLUMN "expected_sale_date" SET DEFAULT now();

ALTER TABLE "Sales"
  ADD CONSTRAINT "Sales_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Sales_lifecycle_terminal_check"
    CHECK ("sold_at" IS NULL OR "cancelled_at" IS NULL),
  ADD CONSTRAINT "Sales_positive_weight_check"
    CHECK ("Weight" > 0),
  ADD CONSTRAINT "Sales_positive_price_check"
    CHECK ("Price_Kg" > 0);

CREATE INDEX "Sales_cooperative_id_idx" ON "Sales"("cooperative_id");
CREATE INDEX "Sales_sold_at_idx" ON "Sales"("sold_at");
CREATE INDEX "Sales_cancelled_at_idx" ON "Sales"("cancelled_at");

ALTER TABLE "Stock"
  ADD CONSTRAINT "Stock_cooperative_material_key" UNIQUE ("Cooperative", "Material"),
  ADD CONSTRAINT "Stock_current_non_negative_check" CHECK ("Current_stock_KG" >= 0),
  ADD CONSTRAINT "Stock_sold_non_negative_check" CHECK ("Total_sold_KG" >= 0),
  ADD CONSTRAINT "Stock_collected_non_negative_check" CHECK ("Total_collected_KG" >= 0);

CREATE TABLE "material_bag_state" (
  "bag_state_id" BIGSERIAL NOT NULL,
  "cooperative_id" BIGINT NOT NULL,
  "material_id" BIGINT NOT NULL,
  "is_begun" BOOLEAN NOT NULL DEFAULT false,
  "current_kg" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "last_updated" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "material_bag_state_pkey" PRIMARY KEY ("bag_state_id"),
  CONSTRAINT "material_bag_state_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "material_bag_state_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "Materials"("Material_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "material_bag_state_cooperative_material_key"
    UNIQUE ("cooperative_id", "material_id"),
  CONSTRAINT "material_bag_state_current_non_negative_check"
    CHECK ("current_kg" >= 0),
  CONSTRAINT "material_bag_state_not_begun_is_empty_check"
    CHECK ("is_begun" OR "current_kg" = 0)
);

COMMIT;

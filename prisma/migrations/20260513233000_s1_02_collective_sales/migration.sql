-- S1-02 collective sales schema migration.
-- Classification: additive-only + constraint contract.
-- Destructive changes: none. Creates new lower-case snake_case tables that reference
-- the current physical legacy tables preserved by ADR-0001.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.collective_sale') IS NOT NULL
     OR to_regclass('public.collective_sale_contribution') IS NOT NULL THEN
    RAISE EXCEPTION 'S1-02 preflight failed: collective sale tables already exist. Review partial/manual schema before applying this migration.';
  END IF;
END $$;

CREATE TABLE "collective_sale" (
  "collective_sale_id" BIGSERIAL NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "sold_at" TIMESTAMP(6),
  "cancelled_at" TIMESTAMP(6),
  "buyer_id" BIGINT NOT NULL,
  "material_id" BIGINT NOT NULL,
  "total_weight" DECIMAL(10,2),
  "price_kg" DECIMAL(10,2) NOT NULL,
  "expected_sale_date" TIMESTAMP(6) NOT NULL,
  "creator_cooperative_id" BIGINT NOT NULL,

  CONSTRAINT "collective_sale_pkey" PRIMARY KEY ("collective_sale_id"),
  CONSTRAINT "collective_sale_buyer_id_fkey"
    FOREIGN KEY ("buyer_id") REFERENCES "Buyers"("Buyer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collective_sale_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "Materials"("Material_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collective_sale_creator_cooperative_id_fkey"
    FOREIGN KEY ("creator_cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collective_sale_lifecycle_terminal_check"
    CHECK ("sold_at" IS NULL OR "cancelled_at" IS NULL),
  CONSTRAINT "collective_sale_positive_price_check"
    CHECK ("price_kg" > 0),
  CONSTRAINT "collective_sale_total_weight_positive_check"
    CHECK ("total_weight" IS NULL OR "total_weight" > 0),
  CONSTRAINT "collective_sale_sold_requires_total_weight_check"
    CHECK ("sold_at" IS NULL OR "total_weight" IS NOT NULL)
);

CREATE TABLE "collective_sale_contribution" (
  "contribution_id" BIGSERIAL NOT NULL,
  "collective_sale_id" BIGINT NOT NULL,
  "cooperative_id" BIGINT NOT NULL,
  "contributed_weight" DECIMAL(10,2),
  "revenue_share" DECIMAL(10,2),
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED',

  CONSTRAINT "collective_sale_contribution_pkey" PRIMARY KEY ("contribution_id"),
  CONSTRAINT "collective_sale_contribution_sale_id_fkey"
    FOREIGN KEY ("collective_sale_id") REFERENCES "collective_sale"("collective_sale_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collective_sale_contribution_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collective_sale_contribution_sale_cooperative_key"
    UNIQUE ("collective_sale_id", "cooperative_id"),
  CONSTRAINT "collective_sale_contribution_status_check"
    CHECK ("status" IN ('INVITED', 'ACCEPTED', 'LEFT')),
  CONSTRAINT "collective_sale_contribution_weight_non_negative_check"
    CHECK ("contributed_weight" IS NULL OR "contributed_weight" >= 0),
  CONSTRAINT "collective_sale_contribution_revenue_non_negative_check"
    CHECK ("revenue_share" IS NULL OR "revenue_share" >= 0),
  CONSTRAINT "collective_sale_contribution_invited_empty_check"
    CHECK ("status" <> 'INVITED' OR ("contributed_weight" IS NULL AND "revenue_share" IS NULL)),
  CONSTRAINT "collective_sale_contribution_revenue_requires_weight_check"
    CHECK ("revenue_share" IS NULL OR ("contributed_weight" IS NOT NULL AND "contributed_weight" > 0))
);

CREATE INDEX "collective_sale_creator_cooperative_id_idx"
  ON "collective_sale"("creator_cooperative_id");
CREATE INDEX "collective_sale_material_id_idx"
  ON "collective_sale"("material_id");
CREATE INDEX "collective_sale_buyer_id_idx"
  ON "collective_sale"("buyer_id");
CREATE INDEX "collective_sale_sold_at_idx"
  ON "collective_sale"("sold_at");
CREATE INDEX "collective_sale_cancelled_at_idx"
  ON "collective_sale"("cancelled_at");
CREATE INDEX "collective_sale_contribution_cooperative_id_idx"
  ON "collective_sale_contribution"("cooperative_id");
CREATE INDEX "collective_sale_contribution_status_idx"
  ON "collective_sale_contribution"("status");

COMMIT;

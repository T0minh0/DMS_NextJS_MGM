-- Exact reversible effects, recorded by web, mobile and historical import writers.
-- Legacy rows deliberately remain unknown rather than inventing stock/bag history.
CREATE TABLE "measurement_effect" (
  "measurement_id" BIGINT PRIMARY KEY,
  "cooperative_id" BIGINT NOT NULL,
  "material_id" BIGINT NOT NULL,
  "collected_delta_kg" NUMERIC(65,2) NOT NULL CHECK ("collected_delta_kg" >= 0),
  "current_delta_kg" NUMERIC(65,2) NOT NULL CHECK ("current_delta_kg" >= 0),
  "bag_before" JSONB,
  "bag_after" JSONB,
  "source" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "measurement_effect_bag_pair_check" CHECK (("bag_before" IS NULL) = ("bag_after" IS NULL))
);
CREATE INDEX "measurement_effect_cooperative_material_idx" ON "measurement_effect" ("cooperative_id", "material_id");

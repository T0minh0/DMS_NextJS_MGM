-- S4-05 keeps random multipliers period-bound for leaderboard recomputation.

CREATE TABLE IF NOT EXISTS "cooperative_random_multiplier_history" (
  "cooperative_random_multiplier_history_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cooperative_id" bigint NOT NULL,
  "year_month" char(7) NOT NULL,
  "multiplier_value" numeric(5,3) NOT NULL,
  "updated_at" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cooperative_random_multiplier_history_pkey"
    PRIMARY KEY ("cooperative_random_multiplier_history_id"),
  CONSTRAINT "cooperative_random_multiplier_history_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cooperative_random_multiplier_history_cooperative_month_key"
    UNIQUE ("cooperative_id", "year_month"),
  CONSTRAINT "cooperative_random_multiplier_history_year_month_check"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "cooperative_random_multiplier_history_multiplier_range_check"
    CHECK ("multiplier_value" >= 0.800 AND "multiplier_value" <= 1.500)
);

CREATE INDEX IF NOT EXISTS "cooperative_random_multiplier_history_year_month_idx"
  ON "cooperative_random_multiplier_history"("year_month");

INSERT INTO "cooperative_random_multiplier_history" (
  "cooperative_random_multiplier_history_id",
  "cooperative_id",
  "year_month",
  "multiplier_value",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "cooperative_id",
  to_char("last_updated", 'YYYY-MM'),
  "multiplier_value",
  "last_updated"
FROM "cooperative_random_multiplier"
ON CONFLICT ("cooperative_id", "year_month")
DO UPDATE SET
  "multiplier_value" = EXCLUDED."multiplier_value",
  "updated_at" = EXCLUDED."updated_at";

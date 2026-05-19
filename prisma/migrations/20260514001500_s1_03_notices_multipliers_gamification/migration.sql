-- S1-03 notices, multipliers and gamification schema migration.
-- Classification: additive-only + tenant-aware FKs + fixed reference seeds.
-- Destructive changes: none. Creates new lower-case snake_case tables that
-- reference the current physical legacy tables preserved by ADR-0001.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Workers"
  ADD CONSTRAINT "Workers_worker_cooperative_key"
  UNIQUE ("Worker_id", "Cooperative");

DO $$
BEGIN
  IF to_regclass('public.notice_board') IS NOT NULL
     OR to_regclass('public.cooperative_material_multiplier') IS NOT NULL
     OR to_regclass('public.cooperative_random_multiplier') IS NOT NULL
     OR to_regclass('public.achievement_definition') IS NOT NULL
     OR to_regclass('public.achievement_xp_override') IS NOT NULL
     OR to_regclass('public.worker_achievement') IS NOT NULL
     OR to_regclass('public.leaderboard_snapshot') IS NOT NULL
     OR to_regclass('public.leaderboard_entry') IS NOT NULL
     OR to_regclass('public.level_definition') IS NOT NULL
     OR to_regclass('public.worker_level') IS NOT NULL THEN
    RAISE EXCEPTION 'S1-03 preflight failed: notices/multipliers/gamification tables already exist. Review partial/manual schema before applying this migration.';
  END IF;
END $$;

CREATE TABLE "level_definition" (
  "level_number" INTEGER NOT NULL,
  "level_name" TEXT NOT NULL,
  "xp_required" INTEGER NOT NULL,

  CONSTRAINT "level_definition_pkey" PRIMARY KEY ("level_number"),
  CONSTRAINT "level_definition_positive_level_check"
    CHECK ("level_number" > 0),
  CONSTRAINT "level_definition_non_negative_xp_check"
    CHECK ("xp_required" >= 0)
);

CREATE TABLE "achievement_definition" (
  "achievement_id" BIGSERIAL NOT NULL,
  "achievement_key" TEXT NOT NULL,
  "achievement_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(30) NOT NULL,
  "threshold_value" DECIMAL(15,2) NOT NULL,
  "base_xp_reward" INTEGER NOT NULL DEFAULT 100,
  "difficulty" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',

  CONSTRAINT "achievement_definition_pkey" PRIMARY KEY ("achievement_id"),
  CONSTRAINT "achievement_definition_key_key" UNIQUE ("achievement_key"),
  CONSTRAINT "achievement_definition_category_check"
    CHECK ("category" IN ('WEIGHT', 'DAYS_WORKED', 'ACHIEVEMENTS_COUNT')),
  CONSTRAINT "achievement_definition_difficulty_check"
    CHECK ("difficulty" IN ('EASY', 'MEDIUM', 'HARD')),
  CONSTRAINT "achievement_definition_threshold_positive_check"
    CHECK ("threshold_value" > 0),
  CONSTRAINT "achievement_definition_base_xp_positive_check"
    CHECK ("base_xp_reward" > 0),
  CONSTRAINT "achievement_definition_key_non_empty_check"
    CHECK (length(btrim("achievement_key")) > 0),
  CONSTRAINT "achievement_definition_name_non_empty_check"
    CHECK (length(btrim("achievement_name")) > 0)
);

CREATE TABLE "notice_board" (
  "notice_id" BIGSERIAL NOT NULL,
  "cooperative_id" BIGINT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "last_updated" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "created_by" BIGINT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMP(6),
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,

  CONSTRAINT "notice_board_pkey" PRIMARY KEY ("notice_id"),
  CONSTRAINT "notice_board_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notice_board_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "Workers"("Worker_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notice_board_created_by_cooperative_fkey"
    FOREIGN KEY ("created_by", "cooperative_id") REFERENCES "Workers"("Worker_id", "Cooperative")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notice_board_priority_check"
    CHECK ("priority" BETWEEN 1 AND 3),
  CONSTRAINT "notice_board_title_non_empty_check"
    CHECK (length(btrim("title")) > 0),
  CONSTRAINT "notice_board_content_non_empty_check"
    CHECK (length(btrim("content")) > 0),
  CONSTRAINT "notice_board_last_updated_after_created_check"
    CHECK ("last_updated" >= "created_at")
);

CREATE TABLE "cooperative_material_multiplier" (
  "cooperative_material_multiplier_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cooperative_id" BIGINT NOT NULL,
  "material_id" BIGINT NOT NULL,
  "multiplier_value" DECIMAL(5,3) NOT NULL,
  "last_updated" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "cooperative_material_multiplier_pkey" PRIMARY KEY ("cooperative_material_multiplier_id"),
  CONSTRAINT "cooperative_material_multiplier_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cooperative_material_multiplier_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "Materials"("Material_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cooperative_material_multiplier_cooperative_material_key"
    UNIQUE ("cooperative_id", "material_id"),
  CONSTRAINT "cooperative_material_multiplier_value_range_check"
    CHECK ("multiplier_value" >= 0.100 AND "multiplier_value" <= 10.000)
);

CREATE TABLE "cooperative_random_multiplier" (
  "cooperative_random_multiplier_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cooperative_id" BIGINT NOT NULL,
  "multiplier_value" DECIMAL(5,3) NOT NULL DEFAULT 1.000,
  "last_updated" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "cooperative_random_multiplier_pkey" PRIMARY KEY ("cooperative_random_multiplier_id"),
  CONSTRAINT "cooperative_random_multiplier_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cooperative_random_multiplier_cooperative_id_key"
    UNIQUE ("cooperative_id"),
  CONSTRAINT "cooperative_random_multiplier_value_range_check"
    CHECK ("multiplier_value" >= 0.800 AND "multiplier_value" <= 1.500)
);

CREATE TABLE "achievement_xp_override" (
  "override_id" BIGSERIAL NOT NULL,
  "cooperative_id" BIGINT NOT NULL,
  "achievement_id" BIGINT NOT NULL,
  "xp_reward_override" INTEGER NOT NULL,
  "updated_by" BIGINT NOT NULL,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "achievement_xp_override_pkey" PRIMARY KEY ("override_id"),
  CONSTRAINT "achievement_xp_override_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "achievement_xp_override_achievement_id_fkey"
    FOREIGN KEY ("achievement_id") REFERENCES "achievement_definition"("achievement_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "achievement_xp_override_updated_by_cooperative_fkey"
    FOREIGN KEY ("updated_by", "cooperative_id") REFERENCES "Workers"("Worker_id", "Cooperative")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "achievement_xp_override_cooperative_achievement_key"
    UNIQUE ("cooperative_id", "achievement_id"),
  CONSTRAINT "achievement_xp_override_positive_reward_check"
    CHECK ("xp_reward_override" > 0)
);

CREATE TABLE "worker_achievement" (
  "worker_achievement_id" BIGSERIAL NOT NULL,
  "worker_id" BIGINT NOT NULL,
  "achievement_id" BIGINT NOT NULL,
  "cooperative_id" BIGINT NOT NULL,
  "year_month" CHAR(7) NOT NULL,
  "unlocked_at" TIMESTAMP(6),
  "progress_value" DECIMAL(15,2) NOT NULL DEFAULT 0,

  CONSTRAINT "worker_achievement_pkey" PRIMARY KEY ("worker_achievement_id"),
  CONSTRAINT "worker_achievement_worker_cooperative_fkey"
    FOREIGN KEY ("worker_id", "cooperative_id") REFERENCES "Workers"("Worker_id", "Cooperative")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "worker_achievement_achievement_id_fkey"
    FOREIGN KEY ("achievement_id") REFERENCES "achievement_definition"("achievement_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "worker_achievement_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "worker_achievement_worker_achievement_cooperative_month_key"
    UNIQUE ("worker_id", "achievement_id", "cooperative_id", "year_month"),
  CONSTRAINT "worker_achievement_year_month_check"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "worker_achievement_progress_non_negative_check"
    CHECK ("progress_value" >= 0)
);

CREATE TABLE "worker_level" (
  "worker_id" BIGINT NOT NULL,
  "total_xp" INTEGER NOT NULL DEFAULT 0,
  "current_level" INTEGER NOT NULL DEFAULT 1,
  "last_updated" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "worker_level_pkey" PRIMARY KEY ("worker_id"),
  CONSTRAINT "worker_level_worker_id_fkey"
    FOREIGN KEY ("worker_id") REFERENCES "Workers"("Worker_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "worker_level_current_level_fkey"
    FOREIGN KEY ("current_level") REFERENCES "level_definition"("level_number")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "worker_level_total_xp_non_negative_check"
    CHECK ("total_xp" >= 0)
);

CREATE TABLE "leaderboard_snapshot" (
  "snapshot_id" BIGSERIAL NOT NULL,
  "cooperative_id" BIGINT NOT NULL,
  "year_month" CHAR(7) NOT NULL,
  "week_number" INTEGER NOT NULL,
  "computed_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "leaderboard_snapshot_pkey" PRIMARY KEY ("snapshot_id"),
  CONSTRAINT "leaderboard_snapshot_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "leaderboard_snapshot_cooperative_month_week_key"
    UNIQUE ("cooperative_id", "year_month", "week_number"),
  CONSTRAINT "leaderboard_snapshot_snapshot_cooperative_key"
    UNIQUE ("snapshot_id", "cooperative_id"),
  CONSTRAINT "leaderboard_snapshot_year_month_check"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "leaderboard_snapshot_week_number_check"
    CHECK ("week_number" BETWEEN 1 AND 4)
);

CREATE TABLE "leaderboard_entry" (
  "entry_id" BIGSERIAL NOT NULL,
  "snapshot_id" BIGINT NOT NULL,
  "cooperative_id" BIGINT NOT NULL,
  "rank_position" INTEGER NOT NULL,
  "worker_id" BIGINT NOT NULL,
  "worker_name" TEXT NOT NULL,
  "raw_xp" DECIMAL(15,2) NOT NULL,
  "final_xp" DECIMAL(15,2) NOT NULL,
  "random_mult" DECIMAL(5,3) NOT NULL,

  CONSTRAINT "leaderboard_entry_pkey" PRIMARY KEY ("entry_id"),
  CONSTRAINT "leaderboard_entry_snapshot_cooperative_fkey"
    FOREIGN KEY ("snapshot_id", "cooperative_id") REFERENCES "leaderboard_snapshot"("snapshot_id", "cooperative_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leaderboard_entry_worker_cooperative_fkey"
    FOREIGN KEY ("worker_id", "cooperative_id") REFERENCES "Workers"("Worker_id", "Cooperative")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "leaderboard_entry_snapshot_rank_key"
    UNIQUE ("snapshot_id", "rank_position"),
  CONSTRAINT "leaderboard_entry_snapshot_worker_key"
    UNIQUE ("snapshot_id", "worker_id"),
  CONSTRAINT "leaderboard_entry_rank_position_check"
    CHECK ("rank_position" BETWEEN 1 AND 3),
  CONSTRAINT "leaderboard_entry_raw_xp_non_negative_check"
    CHECK ("raw_xp" >= 0),
  CONSTRAINT "leaderboard_entry_final_xp_non_negative_check"
    CHECK ("final_xp" >= 0),
  CONSTRAINT "leaderboard_entry_random_mult_range_check"
    CHECK ("random_mult" >= 0.800 AND "random_mult" <= 1.500),
  CONSTRAINT "leaderboard_entry_worker_name_non_empty_check"
    CHECK (length(btrim("worker_name")) > 0)
);

CREATE INDEX "notice_board_cooperative_id_idx" ON "notice_board"("cooperative_id");
CREATE INDEX "notice_board_priority_idx" ON "notice_board"("priority");
CREATE INDEX "notice_board_expires_at_idx" ON "notice_board"("expires_at");
CREATE INDEX "cooperative_material_multiplier_material_id_idx" ON "cooperative_material_multiplier"("material_id");
CREATE INDEX "achievement_xp_override_achievement_id_idx" ON "achievement_xp_override"("achievement_id");
CREATE INDEX "achievement_xp_override_updated_by_idx" ON "achievement_xp_override"("updated_by");
CREATE INDEX "worker_achievement_achievement_id_idx" ON "worker_achievement"("achievement_id");
CREATE INDEX "worker_achievement_cooperative_id_idx" ON "worker_achievement"("cooperative_id");
CREATE INDEX "worker_achievement_year_month_idx" ON "worker_achievement"("year_month");
CREATE INDEX "worker_level_current_level_idx" ON "worker_level"("current_level");
CREATE INDEX "leaderboard_snapshot_year_month_idx" ON "leaderboard_snapshot"("year_month");
CREATE INDEX "leaderboard_entry_worker_id_idx" ON "leaderboard_entry"("worker_id");

INSERT INTO "level_definition" ("level_number", "level_name", "xp_required")
VALUES
  (1,  'Iniciante',     100),
  (2,  'Amador',      167),
  (3,  'Aprendiz',   278),
  (4,  'Coletor',    464),
  (5,  'Profissional', 774),
  (6,  'Especialista',       1291),
  (7,  'Mestre',       2154),
  (8,  'Elite',        3593),
  (9,  'Campeão',     5992),
  (10, 'Lenda',       10000)
ON CONFLICT ("level_number") DO UPDATE SET
  "level_name" = EXCLUDED."level_name",
  "xp_required" = EXCLUDED."xp_required";

INSERT INTO "achievement_definition"
  ("achievement_key", "achievement_name", "description", "category", "threshold_value", "base_xp_reward", "difficulty")
VALUES
  ('WEIGHT_50KG', 'Iniciante', 'Coletar 50 kg de materiais em um mês', 'WEIGHT', 50, 100, 'EASY'),
  ('WEIGHT_100KG', 'Amador', 'Coletar 100 kg of materiais em um mês', 'WEIGHT', 100, 200, 'EASY'),
  ('WEIGHT_250KG', 'Profissional', 'Coletar 250 kg de materiais em um mês', 'WEIGHT', 250, 400, 'MEDIUM'),
  ('WEIGHT_500KG', 'Mestre Coletor', 'Coletar 500 kg de materiais em um mês', 'WEIGHT', 500, 750, 'HARD'),
  ('WEIGHT_1000KG', 'Coletor Lendário', 'Coletar 1000 kg de materiais em um mês', 'WEIGHT', 1000, 1500, 'HARD'),
  ('DAYS_5', 'Primeiros Passos', 'Trabalhar pelo menos 5 dias em um mês', 'DAYS_WORKED', 5, 75, 'EASY'),
  ('DAYS_10', 'Em Ritmo Firme', 'Trabalhar pelo menos 10 dias em um mês', 'DAYS_WORKED', 10, 150, 'MEDIUM'),
  ('DAYS_15', 'Trabalhador Comprometido', 'Trabalhar pelo menos 15 dias em um mês', 'DAYS_WORKED', 15, 250, 'HARD'),
  ('DAYS_20', 'Trabalhador Dedicado', 'Trabalhar pelo menos 20 dias em um mês', 'DAYS_WORKED', 20, 400, 'HARD'),
  ('DAYS_25', 'Trabalhador Imparável', 'Trabalhar pelo menos 25 dias em um mês', 'DAYS_WORKED', 25, 600, 'HARD'),
  ('ACHIEVEMENTS_COUNT_3', 'Estrela Ascendente', 'Desbloquear 3 conquistas diferentes em um mês', 'ACHIEVEMENTS_COUNT', 3, 125, 'MEDIUM'),
  ('ACHIEVEMENTS_COUNT_5', 'Estrela Brilhante', 'Desbloquear 5 conquistas diferentes em um mês', 'ACHIEVEMENTS_COUNT', 5, 300, 'HARD'),
  ('ACHIEVEMENTS_COUNT_8', 'Superestrela', 'Desbloquear 8 conquistas diferentes em um mês', 'ACHIEVEMENTS_COUNT', 8, 500, 'HARD'),
  ('ACHIEVEMENTS_COUNT_10', 'Superestrela Lendária', 'Desbloquear 10 conquistas diferentes em um mês', 'ACHIEVEMENTS_COUNT', 10, 750, 'HARD')
ON CONFLICT ("achievement_key") DO UPDATE SET
  "achievement_name" = EXCLUDED."achievement_name",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "threshold_value" = EXCLUDED."threshold_value",
  "base_xp_reward" = EXCLUDED."base_xp_reward",
  "difficulty" = EXCLUDED."difficulty";

COMMIT;

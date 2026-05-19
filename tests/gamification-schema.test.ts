import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const schema = readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
const s103Migration = readFileSync(
  path.resolve(
    'prisma/migrations/20260514001500_s1_03_notices_multipliers_gamification/migration.sql',
  ),
  'utf8',
);
const seedSource = readFileSync(path.resolve('prisma/seed.ts'), 'utf8');

test('S1-03 Prisma schema maps notice, multiplier and gamification tables', () => {
  for (const model of [
    'NoticeBoard',
    'CooperativeMaterialMultiplier',
    'CooperativeRandomMultiplier',
    'AchievementDefinition',
    'AchievementXpOverride',
    'WorkerAchievement',
    'LeaderboardSnapshot',
    'LeaderboardEntry',
    'LevelDefinition',
    'WorkerLevel',
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }

  for (const table of [
    'notice_board',
    'cooperative_material_multiplier',
    'cooperative_random_multiplier',
    'achievement_definition',
    'achievement_xp_override',
    'worker_achievement',
    'leaderboard_snapshot',
    'leaderboard_entry',
    'level_definition',
    'worker_level',
  ]) {
    assert.match(schema, new RegExp(`@@map\\("${table}"\\)`));
  }
});

test('S1-03 migration creates current physical FKs and leaderboard cascade', () => {
  assert.match(s103Migration, /CREATE TABLE "notice_board"/);
  assert.match(s103Migration, /CREATE TABLE "leaderboard_entry"/);
  assert.match(s103Migration, /REFERENCES "Cooperative"\("cooperative_id"\)/);
  assert.match(s103Migration, /REFERENCES "Workers"\("Worker_id"\)/);
  assert.match(s103Migration, /REFERENCES "Materials"\("Material_id"\)/);
  assert.match(
    s103Migration,
    /FOREIGN KEY \("snapshot_id", "cooperative_id"\) REFERENCES "leaderboard_snapshot"\("snapshot_id", "cooperative_id"\)\r?\n    ON DELETE CASCADE/,
  );
  assert.doesNotMatch(s103Migration, /REFERENCES public\.cooperative/);
  assert.doesNotMatch(s103Migration, /REFERENCES public\.workers/);
  assert.doesNotMatch(s103Migration, /REFERENCES public\.materials/);
});

test('S1-03 migration encodes tenant-aware worker consistency constraints', () => {
  assert.match(
    schema,
    /@@unique\(\[workerId, cooperative\], map: "Workers_worker_cooperative_key"\)/,
  );
  assert.match(s103Migration, /UNIQUE \("Worker_id", "Cooperative"\)/);
  assert.match(
    s103Migration,
    /CONSTRAINT "notice_board_created_by_cooperative_fkey"\r?\n    FOREIGN KEY \("created_by", "cooperative_id"\) REFERENCES "Workers"\("Worker_id", "Cooperative"\)/,
  );
  assert.match(
    s103Migration,
    /CONSTRAINT "achievement_xp_override_updated_by_cooperative_fkey"\r?\n    FOREIGN KEY \("updated_by", "cooperative_id"\) REFERENCES "Workers"\("Worker_id", "Cooperative"\)/,
  );
  assert.match(
    s103Migration,
    /CONSTRAINT "worker_achievement_worker_cooperative_fkey"\r?\n    FOREIGN KEY \("worker_id", "cooperative_id"\) REFERENCES "Workers"\("Worker_id", "Cooperative"\)/,
  );
  assert.match(
    s103Migration,
    /CONSTRAINT "leaderboard_snapshot_snapshot_cooperative_key"\r?\n    UNIQUE \("snapshot_id", "cooperative_id"\)/,
  );
  assert.match(
    s103Migration,
    /CONSTRAINT "leaderboard_entry_worker_cooperative_fkey"\r?\n    FOREIGN KEY \("worker_id", "cooperative_id"\) REFERENCES "Workers"\("Worker_id", "Cooperative"\)/,
  );
});

test('S1-03 migration encodes uniqueness and value constraints', () => {
  assert.match(s103Migration, /UNIQUE \("cooperative_id", "material_id"\)/);
  assert.match(s103Migration, /UNIQUE \("cooperative_id"\)/);
  assert.match(s103Migration, /UNIQUE \("cooperative_id", "achievement_id"\)/);
  assert.match(
    s103Migration,
    /UNIQUE \("worker_id", "achievement_id", "cooperative_id", "year_month"\)/,
  );
  assert.match(s103Migration, /UNIQUE \("cooperative_id", "year_month", "week_number"\)/);
  assert.match(s103Migration, /UNIQUE \("snapshot_id", "cooperative_id"\)/);
  assert.match(s103Migration, /UNIQUE \("snapshot_id", "rank_position"\)/);
  assert.match(s103Migration, /CHECK \("priority" BETWEEN 1 AND 3\)/);
  assert.match(s103Migration, /CHECK \("week_number" BETWEEN 1 AND 4\)/);
  assert.match(s103Migration, /CHECK \("rank_position" BETWEEN 1 AND 3\)/);
  assert.match(s103Migration, /CHECK \("year_month" ~ '\^\[0-9\]\{4\}-/);
  assert.match(s103Migration, /CHECK \("multiplier_value" >= 0\.100 AND "multiplier_value" <= 10\.000\)/);
  assert.match(s103Migration, /CHECK \("multiplier_value" >= 0\.800 AND "multiplier_value" <= 1\.500\)/);
});

test('S1-03 migration seeds fixed levels and achievements idempotently', () => {
  assert.match(s103Migration, /INSERT INTO "level_definition"/);
  assert.match(s103Migration, /ON CONFLICT \("level_number"\) DO UPDATE SET/);
  assert.match(s103Migration, /'Legend',\s+10000/);
  assert.match(s103Migration, /INSERT INTO "achievement_definition"/);
  assert.match(s103Migration, /ON CONFLICT \("achievement_key"\) DO UPDATE SET/);
  assert.match(s103Migration, /'WEIGHT_50KG'/);
  assert.match(s103Migration, /'ACHIEVEMENTS_COUNT_10'/);
});

test('S1-03 UAT seed persists notices, multipliers and gamification fixtures', () => {
  assert.match(seedSource, /"leaderboard_entry", "leaderboard_snapshot"/);
  assert.match(seedSource, /LEVEL_DEFINITIONS/);
  assert.match(seedSource, /ACHIEVEMENT_DEFINITIONS/);
  assert.match(seedSource, /skipDuplicates: true/);
  assert.match(seedSource, /prisma\.noticeBoard\.createMany/);
  assert.match(seedSource, /sanitizeNoticeContent/);
  assert.match(seedSource, /prisma\.cooperativeMaterialMultiplier\.createMany/);
  assert.match(seedSource, /prisma\.cooperativeRandomMultiplier\.createMany/);
  assert.match(seedSource, /prisma\.workerAchievement\.createMany/);
  assert.match(seedSource, /prisma\.workerLevel\.createMany/);
  assert.match(seedSource, /prisma\.leaderboardSnapshot\.create/);
  assert.match(seedSource, /prisma\.leaderboardEntry\.createMany/);
});

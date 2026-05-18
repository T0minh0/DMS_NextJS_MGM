// S4-03 achievement API and evaluation job checks.
// Verifies auth, scoping, temporal parsing and idempotent upsert contracts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  currentDateKey,
  currentYearMonth,
  getAchievementProgress,
  getYearMonthDateRange,
  normalizeYearMonth,
  resolveUnlockedAt,
} from '../src/lib/achievements';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const SERVICE = 'src/lib/achievements/service.ts';
const LIST_ROUTE = 'src/app/api/achievements/route.ts';
const XP_ROUTE = 'src/app/api/achievements/[achievementId]/xp/route.ts';
const MONTH_ROUTE = 'src/app/api/achievements/workers/[workerId]/month/route.ts';
const TOP_MONTH_ROUTE = 'src/app/api/achievements/workers/[workerId]/top-month/route.ts';
const TOP_DAY_ROUTE = 'src/app/api/achievements/workers/[workerId]/top-day/route.ts';
const JOB_ROUTE = 'src/app/api/jobs/achievement-evaluation/route.ts';

test('achievement time helpers validate YYYY-MM and use Sao Paulo business dates', () => {
  assert.equal(normalizeYearMonth('2026-04'), '2026-04');
  assert.equal(currentYearMonth(new Date('2026-05-17T02:30:00Z')), '2026-05');
  assert.equal(currentDateKey(new Date('2026-05-17T02:30:00Z')), '2026-05-16');

  const range = getYearMonthDateRange('2026-04');
  assert.equal(range.start.toISOString(), '2026-04-01T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-05-01T00:00:00.000Z');

  assert.throws(() => normalizeYearMonth('2026-13'), /yearMonth/);
  assert.throws(() => normalizeYearMonth('202604'), /yearMonth/);
});

test('achievement progress maps Java categories to monthly metrics', () => {
  assert.equal(
    getAchievementProgress({
      category: 'WEIGHT',
      totalWeightKg: 123.45,
      daysWorked: 9,
      unlockedBaseAchievements: 4,
    }),
    123.45,
  );
  assert.equal(
    getAchievementProgress({
      category: 'DAYS_WORKED',
      totalWeightKg: 123.45,
      daysWorked: 9,
      unlockedBaseAchievements: 4,
    }),
    9,
  );
  assert.equal(
    getAchievementProgress({
      category: 'ACHIEVEMENTS_COUNT',
      totalWeightKg: 123.45,
      daysWorked: 9,
      unlockedBaseAchievements: 4,
    }),
    4,
  );
  assert.equal(
    getAchievementProgress({
      category: 'UNKNOWN',
      totalWeightKg: 123.45,
      daysWorked: 9,
      unlockedBaseAchievements: 4,
    }),
    null,
  );
});

test('unlock resolution preserves existing unlockedAt on reruns', () => {
  const firstUnlock = new Date('2026-04-10T10:00:00.000Z');
  const rerunCandidate = new Date('2026-04-11T10:00:00.000Z');

  assert.equal(resolveUnlockedAt(firstUnlock, rerunCandidate), firstUnlock);
  assert.equal(resolveUnlockedAt(null, rerunCandidate), rerunCandidate);
  assert.equal(resolveUnlockedAt(null, null), null);
});

test('achievement list route is authenticated and applies cooperative XP overrides', () => {
  const route = readSource(LIST_ROUTE);
  const service = readSource(SERVICE);

  assert.match(route, /requireAuth/);
  assert.match(route, /determineTargetCooperative/);
  assert.match(route, /'gamification',\s*'read'/);
  assert.match(route, /listAchievements/);
  assert.match(service, /xpOverrides:\s*{[\s\S]*where:\s*{\s*cooperativeId/);
  assert.match(service, /xpRewardOverride\s*\?\?\s*row\.baseXpReward/);
});

test('XP override route requires manager or admin and upserts per cooperative', () => {
  const route = readSource(XP_ROUTE);
  const service = readSource(SERVICE);

  assert.match(route, /requireManagerOrAdmin/);
  assert.match(route, /'gamification',\s*'update'/);
  assert.match(route, /determineTargetCooperative/);
  assert.match(route, /xpReward/);
  assert.match(route, /xpReward <= 0/);
  assert.match(route, /xpReward > 2147483647/);
  assert.match(route, /apiRequestErrorResponse/);
  assert.match(route, /targetCooperativeId !== session\.cooperativeId/);
  assert.match(route, /COOPERATIVE_SCOPE_DENIED/);
  assert.match(service, /achievementXpOverride\.upsert/);
  assert.match(service, /cooperativeId_achievementId/);
  assert.match(service, /updatedBy/);
  assert.match(service, /workers\.findFirst/);
  assert.match(service, /workerId:\s*updatedBy,\s*cooperative:\s*cooperativeId/);
  assert.match(service, /UPDATER_SCOPE_DENIED/);
});

test('worker achievement summary routes enforce worker self-scope and month parsing', () => {
  for (const filePath of [MONTH_ROUTE, TOP_MONTH_ROUTE, TOP_DAY_ROUTE]) {
    const route = readSource(filePath);
    assert.match(route, /requireAuth/);
    assert.match(route, /determineTargetWorker/);
    assert.match(route, /determineTargetCooperative/);
    assert.match(route, /session\.role === 'worker' \? 'self' : 'cooperative'/);
  }

  const monthRoute = readSource(MONTH_ROUTE);
  const topDayRoute = readSource(TOP_DAY_ROUTE);
  assert.match(monthRoute, /yearMonth/);
  assert.match(topDayRoute, /yearMonth/);
});

test('summary and top routes calculate total weight, days worked, XP and best day/month', () => {
  const service = readSource(SERVICE);

  assert.match(service, /getWorkerMonthMetrics/);
  assert.match(service, /measurments\.aggregate/);
  assert.match(service, /measurments\.groupBy/);
  assert.match(service, /achievementsUnlocked/);
  assert.match(service, /totalXpEarned/);
  assert.match(service, /getWorkerTopMonthThisYear/);
  assert.match(service, /yearMonth:\s*{\s*startsWith/);
  assert.match(service, /getWorkerTopDayInMonth/);
  assert.match(service, /totalsByDate/);
  assert.match(service, /bestDate/);
});

test('achievement evaluation job is authorized and idempotent per day and cooperative', () => {
  const route = readSource(JOB_ROUTE);

  assert.match(route, /verifyJobAuthorizationHeader/);
  assert.match(route, /runIdempotentJob/);
  assert.match(route, /buildJobRunKey/);
  assert.match(route, /jobName:\s*'achievement-evaluation'/);
  assert.match(route, /periodKey/);
  assert.match(route, /parseYearMonthInput/);
  assert.match(route, /cooperativeId:\s*cooperative\.cooperativeId\.toString\(\)/);
  assert.match(route, /evaluateAchievementsForCooperative/);
});

test('evaluation service uses worker_achievement ON CONFLICT and preserves unlock timestamp', () => {
  const service = readSource(SERVICE);

  assert.match(service, /INSERT INTO "worker_achievement"/);
  assert.match(service, /ON CONFLICT \("worker_id", "achievement_id", "cooperative_id", "year_month"\)/);
  assert.match(service, /"progress_value" = EXCLUDED\."progress_value"/);
  assert.match(service, /"worker_achievement"\."unlocked_at" IS NULL/);
  assert.match(service, /ELSE "worker_achievement"\."unlocked_at"/);
  assert.match(service, /achievement:\s*{[\s\S]*category:\s*{[\s\S]*not:\s*'ACHIEVEMENTS_COUNT'/);
});

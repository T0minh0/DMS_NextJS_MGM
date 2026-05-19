// S4-04 level API and recalculation checks.
// Verifies level math, auth/scoping, lazy worker_level upsert and job integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { scopedWorkerWhere } from '../src/lib/auth/scoped-queries';
import {
  calculateTotalWorkerXp,
  calculateXpToNext,
  formatWorkerLevel,
  getNextLevel,
  pickCurrentLevel,
  recalculateWorkerLevel,
} from '../src/lib/levels';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const LEVEL_SERVICE = 'src/lib/levels/service.ts';
const ACHIEVEMENT_SERVICE = 'src/lib/achievements/service.ts';
const LEVELS_ROUTE = 'src/app/api/levels/route.ts';
const WORKER_LEVEL_ROUTE = 'src/app/api/levels/worker/[workerId]/route.ts';

const levels = [
  { levelNumber: 1, levelName: 'Iniciante', xpRequired: 100 },
  { levelNumber: 2, levelName: 'Amador', xpRequired: 167 },
  { levelNumber: 3, levelName: 'Aprendiz', xpRequired: 278 },
  { levelNumber: 10, levelName: 'Lenda', xpRequired: 10000 },
];

test('level math keeps new workers at level 1 and never returns negative xpToNext', () => {
  const current = pickCurrentLevel(levels, 0);
  const next = getNextLevel(levels, current.levelNumber);

  assert.equal(current.levelNumber, 1);
  assert.equal(calculateXpToNext(0, next), 167);

  const formatted = formatWorkerLevel({
    workerId: BigInt(7),
    totalXp: 0,
    currentLevel: current,
    nextLevel: next,
  });

  assert.deepEqual(formatted, {
    levelNumber: 1,
    levelName: 'Iniciante',
    xpRequired: 100,
    xpToNext: 167,
    workerId: '7',
    totalXp: 0,
    currentLevel: true,
  });
});

test('level math selects intermediate level by highest xpRequired <= total XP', () => {
  const current = pickCurrentLevel(levels, 200);
  const next = getNextLevel(levels, current.levelNumber);

  assert.equal(current.levelNumber, 2);
  assert.equal(calculateXpToNext(200, next), 78);
});

test('level math treats max level as xpToNext zero even with excess XP', () => {
  const current = pickCurrentLevel(levels, 15000);
  const next = getNextLevel(levels, current.levelNumber);

  assert.equal(current.levelNumber, 10);
  assert.equal(next, null);
  assert.equal(calculateXpToNext(15000, next), 0);
});

test('levels list route requires auth and returns definitions ordered by level number', () => {
  const route = readSource(LEVELS_ROUTE);
  const service = readSource(LEVEL_SERVICE);

  assert.match(route, /requireAuth/);
  assert.match(route, /'gamification',\s*'read'/);
  assert.match(route, /listLevels/);
  assert.match(service, /levelDefinition\.findMany/);
  assert.match(service, /orderBy:\s*{\s*levelNumber:\s*'asc'\s*}/);
});

test('worker level route enforces worker self-scope and cooperative scoping', () => {
  const route = readSource(WORKER_LEVEL_ROUTE);

  assert.match(route, /requireAuth/);
  assert.match(route, /determineTargetWorker/);
  assert.match(route, /scopedWorkerWhere/);
  assert.match(route, /session\.role === 'worker' \? 'self' : 'cooperative'/);
  assert.match(route, /getWorkerLevel/);
  assert.match(route, /WORKER_NOT_FOUND/);
});

test('worker scoping creates an impossible query when a worker targets another worker', () => {
  const where = scopedWorkerWhere(
    {
      workerId: '7',
      cooperativeId: '2',
      role: 'worker',
      userType: 1,
      name: 'Worker Seven',
    },
    BigInt(9),
  );

  assert.deepEqual(where, {
    workerId: BigInt(7),
    cooperative: BigInt(2),
    AND: [{ workerId: BigInt(9) }],
  });
});

test('worker level recalculation lazily upserts worker_level and applies XP overrides', () => {
  const service = readSource(LEVEL_SERVICE);

  assert.match(service, /calculateTotalWorkerXp/);
  assert.match(service, /workerAchievement\.findMany/);
  assert.match(service, /unlockedAt:\s*{\s*not:\s*null\s*}/);
  assert.match(service, /achievementXpOverride\.findMany/);
  assert.match(service, /xpRewardOverride/);
  assert.match(service, /workerLevel\.upsert/);
  assert.match(service, /currentLevel:\s*currentLevel\.levelNumber/);
  assert.match(service, /lastUpdated:\s*now/);
});

test('total XP sums unlocked worker achievements using cooperative overrides', async () => {
  const calls: Record<string, unknown> = {};
  const db = {
    workerAchievement: {
      findMany: async (args: unknown) => {
        calls.workerAchievement = args;
        return [
          {
            achievementId: BigInt(1),
            achievement: { achievementId: BigInt(1), baseXpReward: 100 },
          },
          {
            achievementId: BigInt(2),
            achievement: { achievementId: BigInt(2), baseXpReward: 200 },
          },
        ];
      },
    },
    achievementXpOverride: {
      findMany: async (args: unknown) => {
        calls.overrides = args;
        return [
          { achievementId: BigInt(2), xpRewardOverride: 350 },
          { achievementId: BigInt(3), xpRewardOverride: 999 },
        ];
      },
    },
  };

  const totalXp = await calculateTotalWorkerXp({
    workerId: BigInt(7),
    cooperativeId: BigInt(2),
    db: db as never,
  });

  assert.equal(totalXp, 450);
  assert.deepEqual(calls.workerAchievement, {
    where: {
      workerId: BigInt(7),
      cooperativeId: BigInt(2),
      unlockedAt: { not: null },
    },
    include: {
      achievement: {
        select: {
          achievementId: true,
          baseXpReward: true,
        },
      },
    },
  });
  assert.deepEqual(calls.overrides, {
    where: { cooperativeId: BigInt(2) },
    select: { achievementId: true, xpRewardOverride: true },
  });
});

test('recalculateWorkerLevel uses scoped worker lookup and deterministic upsert payload', async () => {
  const now = new Date('2026-05-17T12:00:00.000Z');
  let upsertArgs: unknown;
  let workerLookupArgs: unknown;
  const db = {
    workers: {
      findFirst: async (args: unknown) => {
        workerLookupArgs = args;
        return { workerId: BigInt(7) };
      },
    },
    levelDefinition: {
      findMany: async () => levels,
    },
    workerAchievement: {
      findMany: async () => [
        {
          achievementId: BigInt(1),
          achievement: { achievementId: BigInt(1), baseXpReward: 100 },
        },
        {
          achievementId: BigInt(2),
          achievement: { achievementId: BigInt(2), baseXpReward: 200 },
        },
      ],
    },
    achievementXpOverride: {
      findMany: async () => [{ achievementId: BigInt(2), xpRewardOverride: 350 }],
    },
    workerLevel: {
      upsert: async (args: unknown) => {
        upsertArgs = args;
        return {
          workerId: BigInt(7),
          totalXp: 450,
          currentLevel: 3,
          lastUpdated: now,
        };
      },
    },
  };

  const result = await recalculateWorkerLevel({
    workerId: BigInt(7),
    cooperativeId: BigInt(2),
    now,
    db: db as never,
  });

  assert.deepEqual(workerLookupArgs, {
    where: { workerId: BigInt(7), cooperative: BigInt(2) },
    select: { workerId: true },
  });
  assert.deepEqual(upsertArgs, {
    where: { workerId: BigInt(7) },
    create: {
      workerId: BigInt(7),
      totalXp: 450,
      currentLevel: 3,
      lastUpdated: now,
    },
    update: {
      totalXp: 450,
      currentLevel: 3,
      lastUpdated: now,
    },
  });
  assert.equal(result.currentLevel.levelNumber, 3);
  assert.equal(result.nextLevel?.levelNumber, 10);
});

test('achievement evaluation recalculates worker levels after monthly achievements', () => {
  const service = readSource(ACHIEVEMENT_SERVICE);

  assert.match(service, /recalculateWorkerLevel/);
  assert.match(service, /await recalculateWorkerLevel\({[\s\S]*workerId:\s*worker\.workerId/);
  assert.match(service, /recalculatedLevelCount/);
});

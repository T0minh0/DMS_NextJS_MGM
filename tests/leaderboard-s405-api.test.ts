// S4-05 leaderboard API, snapshot job and calculation checks.
// Verifies week ranges, top-3 scoring, explicit empty responses and idempotent persistence contracts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import test from 'node:test';
import { InMemoryJobRunLedger, runIdempotentJob } from '../src/lib/jobs';
import {
  assertLeaderboardSnapshotPeriodClosed,
  calculateLeaderboardEntries,
  computeLeaderboardSnapshot,
  getCompletedWeeklyLeaderboardPeriod,
  getCurrentLeaderboardPeriod,
  getLeaderboardSnapshot,
  getLeaderboardWeekRange,
  LeaderboardDomainError,
} from '../src/lib/leaderboard';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const LEADERBOARD_SERVICE = 'src/lib/leaderboard/service.ts';
const LEADERBOARD_ROUTE = 'src/app/api/leaderboard/route.ts';
const LEADERBOARD_HISTORY_ROUTE = 'src/app/api/leaderboard/history/route.ts';
const JOB_SHARED_ROUTE = 'src/app/api/jobs/leaderboard-snapshot/_shared.ts';
const JOB_WEEKLY_ROUTE = 'src/app/api/jobs/leaderboard-snapshot-weekly/route.ts';
const JOB_MONTHLY_ROUTE = 'src/app/api/jobs/leaderboard-snapshot-monthly/route.ts';
const RANDOM_MULTIPLIER_JOB_ROUTE = 'src/app/api/jobs/random-multiplier/route.ts';
const SCHEMA = 'prisma/schema.prisma';
const S405_MIGRATION =
  'prisma/migrations/20260517033000_s4_05_random_multiplier_history/migration.sql';

test('week ranges follow the documented 1-4 monthly blocks', () => {
  const week1 = getLeaderboardWeekRange('2026-02', 1);
  const week4 = getLeaderboardWeekRange('2026-02', 4);

  assert.equal(week1.start.toISOString(), '2026-02-01T03:00:00.000Z');
  assert.equal(week1.endExclusive.toISOString(), '2026-02-08T03:00:00.000Z');
  assert.equal(week4.start.toISOString(), '2026-02-22T03:00:00.000Z');
  assert.equal(week4.endExclusive.toISOString(), '2026-03-01T03:00:00.000Z');
  assert.throws(() => getLeaderboardWeekRange('2026-02', 5), LeaderboardDomainError);
});

test('current leaderboard period mirrors Java display windows', () => {
  assert.deepEqual(
    getCurrentLeaderboardPeriod(new Date('2026-05-07T15:00:00Z')),
    { yearMonth: '2026-04', weekNumber: 4 },
  );
  assert.deepEqual(
    getCurrentLeaderboardPeriod(new Date('2026-05-08T15:00:00Z')),
    { yearMonth: '2026-05', weekNumber: 1 },
  );
  assert.deepEqual(
    getCurrentLeaderboardPeriod(new Date('2026-05-29T15:00:00Z')),
    { yearMonth: '2026-05', weekNumber: 4 },
  );
});

test('weekly job default resolves to the last completed weekly block for manual reruns', () => {
  assert.deepEqual(
    getCompletedWeeklyLeaderboardPeriod(new Date('2026-05-06T15:00:00Z')),
    { yearMonth: '2026-04', weekNumber: 4 },
  );
  assert.deepEqual(
    getCompletedWeeklyLeaderboardPeriod(new Date('2026-05-17T15:00:00Z')),
    { yearMonth: '2026-05', weekNumber: 2 },
  );
  assert.deepEqual(
    getCompletedWeeklyLeaderboardPeriod(new Date('2026-05-28T15:00:00Z')),
    { yearMonth: '2026-05', weekNumber: 3 },
  );
});

test('snapshot computation rejects open periods to avoid incomplete week 4 snapshots', () => {
  assert.throws(
    () =>
      assertLeaderboardSnapshotPeriodClosed({
        yearMonth: '2026-05',
        weekNumber: 4,
        now: new Date('2026-06-01T00:30:00Z'),
      }),
    /após o fim do período/,
  );
  assert.doesNotThrow(() =>
    assertLeaderboardSnapshotPeriodClosed({
      yearMonth: '2026-05',
      weekNumber: 4,
      now: new Date('2026-06-01T03:00:00Z'),
    }),
  );
});

test('snapshot jobs can rerun completed keys so recomputation reaches transactional replacement', async () => {
  const ledger = new InMemoryJobRunLedger();
  const key = 'leaderboard-snapshot-weekly:2026-05-W1:cooperative-42';
  let executions = 0;

  const first = await runIdempotentJob(
    ledger,
    key,
    async () => {
      executions += 1;
      return { entryCount: 3 };
    },
    { rerunCompleted: true },
  );
  const second = await runIdempotentJob(
    ledger,
    key,
    async () => {
      executions += 1;
      return { entryCount: 2 };
    },
    { rerunCompleted: true },
  );

  assert.equal(executions, 2);
  assert.deepEqual(first, { status: 'completed', key, result: { entryCount: 3 } });
  assert.deepEqual(second, { status: 'completed', key, result: { entryCount: 2 } });
});

test('leaderboard calculation adds weighted collection XP and achievement XP before random multiplier', () => {
  const entries = calculateLeaderboardEntries(
    [
      {
        workerId: BigInt(7),
        workerName: 'Maria',
        weightXp: '125.55',
        achievementXp: 110,
      },
      {
        workerId: BigInt(8),
        workerName: 'Ana',
        weightXp: '80.00',
        achievementXp: 0,
      },
      {
        workerId: BigInt(9),
        workerName: 'Joao',
        weightXp: '300.00',
        achievementXp: 0,
      },
      {
        workerId: BigInt(10),
        workerName: 'Bia',
        weightXp: '1.00',
        achievementXp: 0,
      },
    ],
    '1.100',
  );

  assert.deepEqual(entries.map((entry) => entry.workerId.toString()), ['9', '7', '8']);
  assert.equal(entries[1].rawXp.toFixed(2), '235.55');
  assert.equal(entries[1].finalXp.toFixed(2), '259.11');
  assert.equal(entries[1].randomMult.toFixed(3), '1.100');
});

test('leaderboard read returns explicit empty payload when snapshot does not exist', async () => {
  const db = {
    leaderboardSnapshot: {
      findUnique: async () => null,
    },
  };

  const result = await getLeaderboardSnapshot({
    cooperativeId: BigInt(42),
    yearMonth: '2026-05',
    weekNumber: 2,
    db: db as never,
  });

  assert.deepEqual(result, {
    yearMonth: '2026-05',
    weekNumber: 2,
    computedAt: null,
    snapshotFound: false,
    entries: [],
  });
});

test('leaderboard read formats persisted entries in rank order', async () => {
  const db = {
    leaderboardSnapshot: {
      findUnique: async () => ({
        yearMonth: '2026-05',
        weekNumber: 1,
        computedAt: new Date('2026-05-07T06:15:00Z'),
        entries: [
          {
            rankPosition: 1,
            workerId: BigInt(7),
            workerName: 'Maria',
            rawXp: new Prisma.Decimal('235.55'),
            finalXp: new Prisma.Decimal('259.11'),
            randomMult: new Prisma.Decimal('1.100'),
          },
        ],
      }),
    },
  };

  const result = await getLeaderboardSnapshot({
    cooperativeId: BigInt(42),
    yearMonth: '2026-05',
    weekNumber: 1,
    db: db as never,
  });

  assert.equal(result.snapshotFound, true);
  assert.equal(result.computedAt, '2026-05-07T06:15:00.000Z');
  assert.deepEqual(result.entries, [
    {
      rankPosition: 1,
      workerId: '7',
      workerName: 'Maria',
      rawXP: 235.55,
      finalXP: 259.11,
      randomMultiplier: 1.1,
    },
  ]);
});

test('leaderboard APIs require auth, gamification read and cooperative scoping', () => {
  const currentRoute = readSource(LEADERBOARD_ROUTE);
  const historyRoute = readSource(LEADERBOARD_HISTORY_ROUTE);

  for (const route of [currentRoute, historyRoute]) {
    assert.match(route, /requireAuth/);
    assert.match(route, /determineTargetCooperative/);
    assert.match(route, /'gamification',\s*'read'/);
    assert.match(route, /cooperativeId/);
    assert.match(route, /cooperative_id/);
  }

  assert.match(currentRoute, /getCurrentLeaderboard/);
  assert.match(historyRoute, /getLeaderboardSnapshot/);
  assert.match(historyRoute, /normalizeLeaderboardYearMonth/);
  assert.match(historyRoute, /parseLeaderboardWeekNumber/);
});

test('leaderboard snapshot persistence is transactional and replaces entries on rerun', () => {
  const service = readSource(LEADERBOARD_SERVICE);

  assert.match(service, /leaderboardSnapshot\.upsert/);
  assert.match(service, /cooperativeId_yearMonth_weekNumber/);
  assert.match(service, /leaderboardEntry\.deleteMany/);
  assert.match(service, /leaderboardEntry\.createMany/);
  assert.match(service, /snapshotId:\s*savedSnapshot\.snapshotId/);
  assert.match(service, /cooperativeId,/);
  assert.match(service, /\$transaction/);
});

test('computeLeaderboardSnapshot deletes stale entries before inserting deterministic top 3', async () => {
  const sequence: string[] = [];
  let createManyData: Array<Record<string, unknown>> = [];
  const tx = {
    leaderboardSnapshot: {
      upsert: async () => {
        sequence.push('upsert');
        return {
          snapshotId: BigInt(99),
          computedAt: new Date('2026-05-07T06:15:00Z'),
        };
      },
    },
    leaderboardEntry: {
      deleteMany: async () => {
        sequence.push('deleteMany');
      },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        sequence.push('createMany');
        createManyData = data;
      },
    },
  };
  const db = {
    cooperative: {
      findUnique: async () => ({ cooperativeId: BigInt(42) }),
    },
    cooperativeRandomMultiplierHistory: {
      findUnique: async () => ({ multiplierValue: new Prisma.Decimal('1.100') }),
    },
    cooperativeRandomMultiplier: {
      findUnique: async () => ({ multiplierValue: new Prisma.Decimal('1.100') }),
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join('');
      if (sql.includes('FROM "Workers"')) {
        return [
          { workerId: BigInt(7), workerName: 'Maria', weightXp: '125.55' },
          { workerId: BigInt(8), workerName: 'Ana', weightXp: '300.00' },
          { workerId: BigInt(9), workerName: 'Joao', weightXp: '80.00' },
          { workerId: BigInt(10), workerName: 'Bia', weightXp: '1.00' },
        ];
      }
      return [
        { workerId: BigInt(7), achievementXp: '110' },
        { workerId: BigInt(9), achievementXp: '25' },
      ];
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };

  const result = await computeLeaderboardSnapshot({
    cooperativeId: BigInt(42),
    yearMonth: '2026-05',
    weekNumber: 1,
    now: new Date('2026-05-08T03:00:00Z'),
    db: db as never,
  });

  assert.deepEqual(sequence, ['upsert', 'deleteMany', 'createMany']);
  assert.deepEqual(createManyData.map((row) => String(row.workerId)), ['8', '7', '9']);
  assert.equal(createManyData[1].rawXp, '235.55');
  assert.equal(createManyData[1].finalXp, '259.11');
  assert.equal(createManyData[1].randomMult, '1.100');
  assert.equal(result.entryCount, 3);
});

test('leaderboard calculation query applies material multipliers, random multiplier and worker filtering', () => {
  const service = readSource(LEADERBOARD_SERVICE);

  assert.match(service, /m\."Weight_KG"\s*\*\s*COALESCE\(cmm\."multiplier_value", 1\.0\)/);
  assert.match(service, /"cooperative_material_multiplier"/);
  assert.match(service, /cooperativeRandomMultiplierHistory\.findUnique/);
  assert.match(service, /cooperativeRandomMultiplier\.findUnique/);
  assert.match(service, /"User_type"\s+IN/);
  assert.match(service, /wa\."unlocked_at"\s+IS NOT NULL/);
  assert.match(service, /achievement_xp_override/);
});

test('random multiplier history is persisted by cooperative and yearMonth', () => {
  const schema = readSource(SCHEMA);
  const migration = readSource(S405_MIGRATION);
  const randomJob = readSource(RANDOM_MULTIPLIER_JOB_ROUTE);

  assert.match(schema, /model CooperativeRandomMultiplierHistory/);
  assert.match(schema, /@@unique\(\[cooperativeId, yearMonth\]/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "cooperative_random_multiplier_history"/);
  assert.match(migration, /UNIQUE \("cooperative_id", "year_month"\)/);
  assert.match(migration, /\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/);
  assert.match(migration, /CHECK \("multiplier_value" >= 0\.800 AND "multiplier_value" <= 1\.500\)/);
  assert.match(migration, /ON CONFLICT \("cooperative_id", "year_month"\)/);
  assert.match(randomJob, /cooperativeRandomMultiplierHistory\.createMany/);
  assert.match(randomJob, /skipDuplicates:\s*true/);
  assert.match(randomJob, /cooperativeRandomMultiplierHistory\.findUniqueOrThrow/);
  assert.doesNotMatch(randomJob, /cooperativeRandomMultiplierHistory\.upsert/);
  assert.match(randomJob, /yearMonth:\s*periodKey/);
});

test('leaderboard snapshot jobs are authorized, idempotent and use weekly/monthly keys', () => {
  const shared = readSource(JOB_SHARED_ROUTE);
  const weekly = readSource(JOB_WEEKLY_ROUTE);
  const monthly = readSource(JOB_MONTHLY_ROUTE);

  assert.match(shared, /verifyJobAuthorizationHeader/);
  assert.match(shared, /runIdempotentJob/);
  assert.match(shared, /rerunCompleted:\s*true/);
  assert.match(shared, /buildJobRunKey/);
  assert.doesNotMatch(shared, /body\.periodKey/);
  assert.match(
    shared,
    /const periodKey = `\$\{snapshotPeriod\.yearMonth\}-W\$\{snapshotPeriod\.weekNumber\}`/,
  );
  assert.match(shared, /computeLeaderboardSnapshot/);
  assert.match(shared, /cooperativeId/);
  assert.match(weekly, /runtime = 'nodejs'/);
  assert.match(weekly, /leaderboard-snapshot-weekly/);
  assert.match(weekly, /getCompletedWeeklyLeaderboardPeriod/);
  assert.match(monthly, /runtime = 'nodejs'/);
  assert.match(monthly, /leaderboard-snapshot-monthly/);
  assert.match(monthly, /getPreviousMonthFinalLeaderboardPeriod/);
});

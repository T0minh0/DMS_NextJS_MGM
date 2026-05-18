import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { decimalToJsonNumber, formatDecimal, toDecimal } from '@/lib/decimal';

type LeaderboardDbClient = typeof prisma | Prisma.TransactionClient;

export const LEADERBOARD_TIME_ZONE = 'America/Sao_Paulo';
// Workers also stores admin/manager accounts; leaderboards rank active collectors only.
const WORKER_USER_TYPES = ['1', 'C', 'W'];

export class LeaderboardDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'LeaderboardDomainError';
  }
}

export interface LeaderboardPeriod {
  yearMonth: string;
  weekNumber: number;
}

export interface LeaderboardScoreInput {
  workerId: bigint;
  workerName: string;
  weightXp: Prisma.Decimal | string | number;
  achievementXp?: Prisma.Decimal | string | number | null;
}

export interface LeaderboardEntryDraft {
  rankPosition: number;
  workerId: bigint;
  workerName: string;
  rawXp: Prisma.Decimal;
  finalXp: Prisma.Decimal;
  randomMult: Prisma.Decimal;
}

interface LeaderboardWeightRow {
  workerId: bigint;
  workerName: string;
  weightXp: string;
}

interface LeaderboardAchievementRow {
  workerId: bigint;
  achievementXp: string;
}

function formatDatePart(date: Date, timeZone = LEADERBOARD_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getTimeZoneOffsetMs(date: Date, timeZone = LEADERBOARD_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
}

function zonedMidnightUtc(year: number, monthIndex: number, day: number) {
  const guess = new Date(Date.UTC(year, monthIndex, day));
  const offset = getTimeZoneOffsetMs(guess);
  const candidate = new Date(guess.getTime() - offset);
  const candidateOffset = getTimeZoneOffsetMs(candidate);

  return candidateOffset === offset
    ? candidate
    : new Date(guess.getTime() - candidateOffset);
}

function yearMonthDate(yearMonth: string) {
  const [yearPart, monthPart] = normalizeLeaderboardYearMonth(yearMonth).split('-');
  return {
    year: Number(yearPart),
    monthIndex: Number(monthPart) - 1,
  };
}

function formatUtcYearMonth(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');

  return `${date.getUTCFullYear()}-${month}`;
}

export function normalizeLeaderboardYearMonth(yearMonth: string | null | undefined) {
  if (!yearMonth) {
    throw new LeaderboardDomainError(
      'yearMonth é obrigatório',
      'MISSING_YEAR_MONTH',
      400,
    );
  }

  const trimmed = yearMonth.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new LeaderboardDomainError(
      'yearMonth deve usar o formato YYYY-MM',
      'INVALID_YEAR_MONTH',
      400,
    );
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new LeaderboardDomainError(
      'yearMonth deve ter mês entre 01 e 12',
      'INVALID_YEAR_MONTH',
      400,
    );
  }

  return trimmed;
}

export function parseLeaderboardWeekNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    throw new LeaderboardDomainError(
      'weekNumber é obrigatório',
      'MISSING_WEEK_NUMBER',
      400,
    );
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    throw new LeaderboardDomainError(
      'weekNumber deve estar entre 1 e 4',
      'INVALID_WEEK_NUMBER',
      400,
    );
  }

  return parsed;
}

export function parsePositiveBigInt(value: string | number | bigint, field = 'ID') {
  try {
    const parsed = BigInt(value);
    if (parsed <= BigInt(0)) {
      throw new Error('non-positive');
    }
    return parsed;
  } catch {
    throw new LeaderboardDomainError(`${field} inválido`, 'INVALID_ID', 400);
  }
}

export function getLeaderboardWeekRange(yearMonth: string, weekNumber: number) {
  const normalizedWeek = parseLeaderboardWeekNumber(weekNumber);
  const { year, monthIndex } = yearMonthDate(yearMonth);

  const startDayByWeek: Record<number, number> = {
    1: 1,
    2: 8,
    3: 15,
    4: 22,
  };

  const start = zonedMidnightUtc(year, monthIndex, startDayByWeek[normalizedWeek]);
  const endExclusive =
    normalizedWeek === 4
      ? zonedMidnightUtc(year, monthIndex + 1, 1)
      : zonedMidnightUtc(year, monthIndex, startDayByWeek[normalizedWeek + 1]);

  return { start, endExclusive };
}

export function getCurrentLeaderboardPeriod(now = new Date()): LeaderboardPeriod {
  const dateKey = formatDatePart(now);
  const [yearPart, monthPart, dayPart] = dateKey.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const day = Number(dayPart);

  if (day <= 7) {
    return {
      yearMonth: formatUtcYearMonth(year, monthIndex - 1),
      weekNumber: 4,
    };
  }

  return {
    yearMonth: `${yearPart}-${monthPart}`,
    weekNumber: day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4,
  };
}

export function getCompletedWeeklyLeaderboardPeriod(now = new Date()): LeaderboardPeriod {
  const dateKey = formatDatePart(now);
  const [yearPart, monthPart] = dateKey.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const day = Number(dateKey.slice(8, 10));

  if (day <= 7) {
    return {
      yearMonth: formatUtcYearMonth(year, monthIndex - 1),
      weekNumber: 4,
    };
  }

  return {
    yearMonth: dateKey.slice(0, 7),
    weekNumber: day <= 14 ? 1 : day <= 21 ? 2 : 3,
  };
}

export function getPreviousMonthFinalLeaderboardPeriod(now = new Date()): LeaderboardPeriod {
  const dateKey = formatDatePart(now);
  const [yearPart, monthPart] = dateKey.split('-');

  return {
    yearMonth: formatUtcYearMonth(Number(yearPart), Number(monthPart) - 2),
    weekNumber: 4,
  };
}

export function assertLeaderboardSnapshotPeriodClosed({
  yearMonth,
  weekNumber,
  now = new Date(),
}: {
  yearMonth: string;
  weekNumber: number;
  now?: Date;
}) {
  const { endExclusive } = getLeaderboardWeekRange(yearMonth, weekNumber);

  if (now < endExclusive) {
    throw new LeaderboardDomainError(
      'Snapshot de leaderboard só pode ser calculado após o fim do período',
      'LEADERBOARD_PERIOD_OPEN',
      409,
    );
  }
}

export function calculateLeaderboardEntries(
  scores: LeaderboardScoreInput[],
  randomMultiplier: Prisma.Decimal | string | number,
  limit = 3,
): LeaderboardEntryDraft[] {
  const randomMult = toDecimal(randomMultiplier, 'randomMultiplier')
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

  return scores
    .map((score) => {
      const weightXp = toDecimal(score.weightXp, 'weightXp');
      const achievementXp = toDecimal(score.achievementXp ?? 0, 'achievementXp');
      const rawXp = weightXp
        .plus(achievementXp)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const finalXp = rawXp
        .times(randomMult)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      return {
        rankPosition: 0,
        workerId: score.workerId,
        workerName: score.workerName,
        rawXp,
        finalXp,
        randomMult,
      };
    })
    .sort((left, right) => {
      const byFinalXp = right.finalXp.comparedTo(left.finalXp);
      if (byFinalXp !== 0) return byFinalXp;

      const byRawXp = right.rawXp.comparedTo(left.rawXp);
      if (byRawXp !== 0) return byRawXp;

      return left.workerId < right.workerId ? -1 : left.workerId > right.workerId ? 1 : 0;
    })
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rankPosition: index + 1,
    }));
}

function formatLeaderboardEntry(entry: {
  rankPosition: number;
  workerId: bigint;
  workerName: string;
  rawXp: Prisma.Decimal;
  finalXp: Prisma.Decimal;
  randomMult: Prisma.Decimal;
}) {
  return {
    rankPosition: entry.rankPosition,
    workerId: entry.workerId.toString(),
    workerName: entry.workerName,
    rawXP: decimalToJsonNumber(entry.rawXp, 2, 'rawXP'),
    finalXP: decimalToJsonNumber(entry.finalXp, 2, 'finalXP'),
    randomMultiplier: decimalToJsonNumber(entry.randomMult, 3, 'randomMultiplier'),
  };
}

function formatLeaderboardSnapshot(input: {
  yearMonth: string;
  weekNumber: number;
  computedAt?: Date | null;
  entries: {
    rankPosition: number;
    workerId: bigint;
    workerName: string;
    rawXp: Prisma.Decimal;
    finalXp: Prisma.Decimal;
    randomMult: Prisma.Decimal;
  }[];
}) {
  return {
    yearMonth: input.yearMonth,
    weekNumber: input.weekNumber,
    computedAt: input.computedAt?.toISOString() ?? null,
    snapshotFound: Boolean(input.computedAt),
    entries: input.entries.map((entry) => formatLeaderboardEntry(entry)),
  };
}

async function fetchWeightScores({
  cooperativeId,
  yearMonth,
  weekNumber,
  db,
}: {
  cooperativeId: bigint;
  yearMonth: string;
  weekNumber: number;
  db: LeaderboardDbClient;
}) {
  const { start, endExclusive } = getLeaderboardWeekRange(yearMonth, weekNumber);

  return db.$queryRaw<LeaderboardWeightRow[]>`
    SELECT
      w."Worker_id" AS "workerId",
      w."Worker_name" AS "workerName",
      COALESCE(SUM(m."Weight_KG" * COALESCE(cmm."multiplier_value", 1.0)), 0)::text AS "weightXp"
    FROM "Workers" w
    LEFT JOIN "Measurments" m
      ON m."Wastepicker" = w."Worker_id"
      AND m."Time_stamp" >= ${start}
      AND m."Time_stamp" < ${endExclusive}
    LEFT JOIN "cooperative_material_multiplier" cmm
      ON cmm."cooperative_id" = w."Cooperative"
      AND cmm."material_id" = m."Material"
    WHERE w."Cooperative" = ${cooperativeId}
      AND w."Exit_date" IS NULL
      AND w."User_type" IN (${Prisma.join(WORKER_USER_TYPES)})
    GROUP BY w."Worker_id", w."Worker_name"
  `;
}

async function fetchAchievementXpByWorker({
  cooperativeId,
  yearMonth,
  db,
}: {
  cooperativeId: bigint;
  yearMonth: string;
  db: LeaderboardDbClient;
}) {
  const rows = await db.$queryRaw<LeaderboardAchievementRow[]>`
    SELECT
      wa."worker_id" AS "workerId",
      COALESCE(SUM(COALESCE(axo."xp_reward_override", ad."base_xp_reward")), 0)::text AS "achievementXp"
    FROM "worker_achievement" wa
    JOIN "achievement_definition" ad
      ON ad."achievement_id" = wa."achievement_id"
    LEFT JOIN "achievement_xp_override" axo
      ON axo."achievement_id" = wa."achievement_id"
      AND axo."cooperative_id" = ${cooperativeId}
    WHERE wa."cooperative_id" = ${cooperativeId}
      AND wa."year_month" = ${yearMonth}
      AND wa."unlocked_at" IS NOT NULL
    GROUP BY wa."worker_id"
  `;

  return new Map(rows.map((row) => [row.workerId.toString(), row.achievementXp]));
}

async function getRandomMultiplier({
  cooperativeId,
  yearMonth,
  db,
}: {
  cooperativeId: bigint;
  yearMonth: string;
  db: LeaderboardDbClient;
}) {
  const historical = await db.cooperativeRandomMultiplierHistory.findUnique({
    where: {
      cooperativeId_yearMonth: {
        cooperativeId,
        yearMonth,
      },
    },
    select: { multiplierValue: true },
  });

  if (historical) {
    return historical.multiplierValue;
  }

  const current = await db.cooperativeRandomMultiplier.findUnique({
    where: { cooperativeId },
    select: { multiplierValue: true, lastUpdated: true },
  });

  if (
    current &&
    formatUtcYearMonth(
      current.lastUpdated.getUTCFullYear(),
      current.lastUpdated.getUTCMonth(),
    ) === yearMonth
  ) {
    return current.multiplierValue;
  }

  return new Prisma.Decimal(1);
}

export async function computeLeaderboardSnapshot({
  cooperativeId,
  yearMonth,
  weekNumber,
  now = new Date(),
  db = prisma,
}: {
  cooperativeId: bigint;
  yearMonth: string;
  weekNumber: number;
  now?: Date;
  db?: LeaderboardDbClient;
}) {
  const normalizedYearMonth = normalizeLeaderboardYearMonth(yearMonth);
  const normalizedWeek = parseLeaderboardWeekNumber(weekNumber);
  assertLeaderboardSnapshotPeriodClosed({
    yearMonth: normalizedYearMonth,
    weekNumber: normalizedWeek,
    now,
  });

  const cooperative = await db.cooperative.findUnique({
    where: { cooperativeId },
    select: { cooperativeId: true },
  });

  if (!cooperative) {
    throw new LeaderboardDomainError(
      'Cooperativa não encontrada',
      'COOPERATIVE_NOT_FOUND',
      404,
    );
  }

  const [weightRows, achievementXpByWorker, randomMultiplier] = await Promise.all([
    fetchWeightScores({
      cooperativeId,
      yearMonth: normalizedYearMonth,
      weekNumber: normalizedWeek,
      db,
    }),
    fetchAchievementXpByWorker({
      cooperativeId,
      yearMonth: normalizedYearMonth,
      db,
    }),
    getRandomMultiplier({
      cooperativeId,
      yearMonth: normalizedYearMonth,
      db,
    }),
  ]);

  const entries = calculateLeaderboardEntries(
    weightRows.map((row) => ({
      workerId: row.workerId,
      workerName: row.workerName,
      weightXp: row.weightXp,
      achievementXp: achievementXpByWorker.get(row.workerId.toString()) ?? 0,
    })),
    randomMultiplier,
  );

  const persistSnapshot = async (tx: LeaderboardDbClient) => {
    const savedSnapshot = await tx.leaderboardSnapshot.upsert({
      where: {
        cooperativeId_yearMonth_weekNumber: {
          cooperativeId,
          yearMonth: normalizedYearMonth,
          weekNumber: normalizedWeek,
        },
      },
      create: {
        cooperativeId,
        yearMonth: normalizedYearMonth,
        weekNumber: normalizedWeek,
        computedAt: now,
      },
      update: {
        computedAt: now,
      },
    });

    await tx.leaderboardEntry.deleteMany({
      where: {
        snapshotId: savedSnapshot.snapshotId,
        cooperativeId,
      },
    });

    if (entries.length > 0) {
      await tx.leaderboardEntry.createMany({
        data: entries.map((entry) => ({
          snapshotId: savedSnapshot.snapshotId,
          cooperativeId,
          rankPosition: entry.rankPosition,
          workerId: entry.workerId,
          workerName: entry.workerName,
          rawXp: formatDecimal(entry.rawXp, 2, 'rawXp'),
          finalXp: formatDecimal(entry.finalXp, 2, 'finalXp'),
          randomMult: formatDecimal(entry.randomMult, 3, 'randomMult'),
        })),
      });
    }

    return savedSnapshot;
  };

  const snapshot = '$transaction' in db
    ? await db.$transaction((tx) => persistSnapshot(tx))
    : await persistSnapshot(db);

  return {
    cooperativeId: cooperativeId.toString(),
    yearMonth: normalizedYearMonth,
    weekNumber: normalizedWeek,
    snapshotId: snapshot.snapshotId.toString(),
    computedAt: snapshot.computedAt.toISOString(),
    entryCount: entries.length,
    entries: entries.map((entry) => formatLeaderboardEntry(entry)),
  };
}

export async function getLeaderboardSnapshot({
  cooperativeId,
  yearMonth,
  weekNumber,
  db = prisma,
}: {
  cooperativeId: bigint;
  yearMonth: string;
  weekNumber: number;
  db?: LeaderboardDbClient;
}) {
  const normalizedYearMonth = normalizeLeaderboardYearMonth(yearMonth);
  const normalizedWeek = parseLeaderboardWeekNumber(weekNumber);
  const snapshot = await db.leaderboardSnapshot.findUnique({
    where: {
      cooperativeId_yearMonth_weekNumber: {
        cooperativeId,
        yearMonth: normalizedYearMonth,
        weekNumber: normalizedWeek,
      },
    },
    include: {
      entries: {
        orderBy: { rankPosition: 'asc' },
      },
    },
  });

  if (!snapshot) {
    return formatLeaderboardSnapshot({
      yearMonth: normalizedYearMonth,
      weekNumber: normalizedWeek,
      computedAt: null,
      entries: [],
    });
  }

  return formatLeaderboardSnapshot({
    yearMonth: snapshot.yearMonth,
    weekNumber: snapshot.weekNumber,
    computedAt: snapshot.computedAt,
    entries: snapshot.entries,
  });
}

export async function getCurrentLeaderboard({
  cooperativeId,
  now = new Date(),
  db = prisma,
}: {
  cooperativeId: bigint;
  now?: Date;
  db?: LeaderboardDbClient;
}) {
  const period = getCurrentLeaderboardPeriod(now);

  return getLeaderboardSnapshot({
    cooperativeId,
    yearMonth: period.yearMonth,
    weekNumber: period.weekNumber,
    db,
  });
}

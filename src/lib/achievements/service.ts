import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { decimalToJsonNumber, formatDecimal } from '@/lib/decimal';

export const ACHIEVEMENT_TIME_ZONE = 'America/Sao_Paulo';

type AchievementDbClient = typeof prisma | Prisma.TransactionClient;

type AchievementDefinitionRow = {
  achievementId: bigint;
  achievementKey: string;
  achievementName: string;
  description: string;
  category: string;
  thresholdValue: Prisma.Decimal;
  baseXpReward: number;
  difficulty: string;
  xpOverrides?: { xpRewardOverride: number }[];
  workerAchievements?: { progressValue: Prisma.Decimal; unlockedAt: Date | null }[];
};

type EvaluationDefinition = Pick<
  AchievementDefinitionRow,
  'achievementId' | 'category' | 'thresholdValue'
>;

export class AchievementDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'AchievementDomainError';
  }
}

export interface WorkerMonthMetrics {
  totalWeightKg: number;
  daysWorked: number;
}

export interface AchievementProgressInput {
  category: string;
  totalWeightKg: number;
  daysWorked: number;
  unlockedBaseAchievements: number;
}

function formatDatePart(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function currentYearMonth(date = new Date(), timeZone = ACHIEVEMENT_TIME_ZONE) {
  return formatDatePart(date, timeZone).slice(0, 7);
}

export function currentDateKey(date = new Date(), timeZone = ACHIEVEMENT_TIME_ZONE) {
  return formatDatePart(date, timeZone);
}

export function normalizeYearMonth(
  yearMonth: string | null | undefined,
  now = new Date(),
  timeZone = ACHIEVEMENT_TIME_ZONE,
) {
  if (!yearMonth) {
    return currentYearMonth(now, timeZone);
  }

  const trimmed = yearMonth.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new AchievementDomainError(
      'yearMonth deve usar o formato YYYY-MM',
      'INVALID_YEAR_MONTH',
      400,
    );
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new AchievementDomainError(
      'yearMonth deve ter mês entre 01 e 12',
      'INVALID_YEAR_MONTH',
      400,
    );
  }

  return trimmed;
}

export function getYearMonthDateRange(yearMonth: string) {
  const normalized = normalizeYearMonth(yearMonth);
  const [yearPart, monthPart] = normalized.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;

  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

export function parsePositiveBigInt(value: string | number | bigint, field = 'ID') {
  try {
    const parsed = BigInt(value);
    if (parsed <= BigInt(0)) {
      throw new Error('non-positive');
    }
    return parsed;
  } catch {
    throw new AchievementDomainError(`${field} inválido`, 'INVALID_ID', 400);
  }
}

export function getAchievementProgress(input: AchievementProgressInput) {
  switch (input.category) {
    case 'WEIGHT':
      return input.totalWeightKg;
    case 'DAYS_WORKED':
      return input.daysWorked;
    case 'ACHIEVEMENTS_COUNT':
      return input.unlockedBaseAchievements;
    default:
      return null;
  }
}

export function resolveUnlockedAt(existing: Date | null, candidate: Date | null) {
  return existing ?? candidate;
}

function effectiveXp(row: Pick<AchievementDefinitionRow, 'baseXpReward' | 'xpOverrides'>) {
  return row.xpOverrides?.[0]?.xpRewardOverride ?? row.baseXpReward;
}

function formatAchievement(row: AchievementDefinitionRow) {
  const workerAchievement = row.workerAchievements?.[0] ?? null;
  const unlocked = Boolean(workerAchievement?.unlockedAt);

  return {
    achievementId: row.achievementId.toString(),
    achievementKey: row.achievementKey,
    achievementName: row.achievementName,
    description: row.description,
    category: row.category,
    thresholdValue: decimalToJsonNumber(row.thresholdValue),
    xpReward: effectiveXp(row),
    difficulty: row.difficulty,
    progressValue: workerAchievement
      ? decimalToJsonNumber(workerAchievement.progressValue)
      : 0,
    unlocked,
    unlockedAt: workerAchievement?.unlockedAt?.toISOString() ?? null,
  };
}

export async function listAchievements(cooperativeId: bigint, db: AchievementDbClient = prisma) {
  const rows = await db.achievementDefinition.findMany({
    include: {
      xpOverrides: {
        where: { cooperativeId },
        select: { xpRewardOverride: true },
        take: 1,
      },
    },
    orderBy: [{ category: 'asc' }, { thresholdValue: 'asc' }],
  });

  return rows.map((row) => formatAchievement(row));
}

export async function updateAchievementXpOverride({
  cooperativeId,
  achievementId,
  xpReward,
  updatedBy,
  db = prisma,
}: {
  cooperativeId: bigint;
  achievementId: bigint;
  xpReward: number;
  updatedBy: bigint;
  db?: AchievementDbClient;
}) {
  const [achievement, updater] = await Promise.all([
    db.achievementDefinition.findUnique({
      where: { achievementId },
      select: { achievementId: true },
    }),
    db.workers.findFirst({
      where: { workerId: updatedBy, cooperative: cooperativeId },
      select: { workerId: true },
    }),
  ]);

  if (!achievement) {
    throw new AchievementDomainError(
      'Achievement não encontrado',
      'ACHIEVEMENT_NOT_FOUND',
      404,
    );
  }

  if (!updater) {
    throw new AchievementDomainError(
      'Atualizador fora do escopo da cooperativa',
      'UPDATER_SCOPE_DENIED',
      403,
    );
  }

  return db.achievementXpOverride.upsert({
    where: {
      cooperativeId_achievementId: {
        cooperativeId,
        achievementId,
      },
    },
    create: {
      cooperativeId,
      achievementId,
      xpRewardOverride: xpReward,
      updatedBy,
    },
    update: {
      xpRewardOverride: xpReward,
      updatedBy,
      updatedAt: new Date(),
    },
  });
}

async function getWorkerOrThrow(
  db: AchievementDbClient,
  workerId: bigint,
  cooperativeId: bigint,
) {
  const worker = await db.workers.findFirst({
    where: { workerId, cooperative: cooperativeId },
    select: { workerId: true, workerName: true },
  });

  if (!worker) {
    throw new AchievementDomainError(
      'Trabalhador não encontrado na cooperativa',
      'WORKER_NOT_FOUND',
      404,
    );
  }

  return worker;
}

export async function getWorkerMonthMetrics(
  db: AchievementDbClient,
  workerId: bigint,
  yearMonth: string,
): Promise<WorkerMonthMetrics> {
  const { start, end } = getYearMonthDateRange(yearMonth);

  const [weightAggregate, dayRows] = await Promise.all([
    db.measurments.aggregate({
      where: {
        wastepicker: workerId,
        timeStamp: { gte: start, lt: end },
      },
      _sum: { weightKg: true },
    }),
    db.measurments.groupBy({
      by: ['timeStamp'],
      where: {
        wastepicker: workerId,
        timeStamp: { gte: start, lt: end },
      },
    }),
  ]);

  return {
    totalWeightKg: decimalToJsonNumber(weightAggregate._sum.weightKg ?? 0),
    daysWorked: dayRows.length,
  };
}

export async function getWorkerMonthSummary({
  workerId,
  cooperativeId,
  yearMonth,
  now = new Date(),
  db = prisma,
}: {
  workerId: bigint;
  cooperativeId: bigint;
  yearMonth?: string | null;
  now?: Date;
  db?: AchievementDbClient;
}) {
  const normalizedYearMonth = normalizeYearMonth(yearMonth, now);
  const worker = await getWorkerOrThrow(db, workerId, cooperativeId);
  const metrics = await getWorkerMonthMetrics(db, workerId, normalizedYearMonth);

  const rows = await db.achievementDefinition.findMany({
    include: {
      xpOverrides: {
        where: { cooperativeId },
        select: { xpRewardOverride: true },
        take: 1,
      },
      workerAchievements: {
        where: { workerId, cooperativeId, yearMonth: normalizedYearMonth },
        select: { progressValue: true, unlockedAt: true },
        take: 1,
      },
    },
    orderBy: [{ category: 'asc' }, { thresholdValue: 'asc' }],
  });

  const achievements = rows.map((row) => formatAchievement(row));
  const unlockedAchievements = achievements.filter((achievement) => achievement.unlocked);

  return {
    workerId: worker.workerId.toString(),
    workerName: worker.workerName,
    yearMonth: normalizedYearMonth,
    totalWeightKg: metrics.totalWeightKg,
    daysWorked: metrics.daysWorked,
    achievementsUnlocked: unlockedAchievements.length,
    totalXpEarned: unlockedAchievements.reduce(
      (sum, achievement) => sum + achievement.xpReward,
      0,
    ),
    achievements,
  };
}

export async function getWorkerTopMonthThisYear({
  workerId,
  cooperativeId,
  now = new Date(),
  db = prisma,
}: {
  workerId: bigint;
  cooperativeId: bigint;
  now?: Date;
  db?: AchievementDbClient;
}) {
  await getWorkerOrThrow(db, workerId, cooperativeId);

  const currentYear = currentYearMonth(now).slice(0, 4);
  const [workerAchievements, overrides] = await Promise.all([
    db.workerAchievement.findMany({
      where: {
        workerId,
        cooperativeId,
        yearMonth: { startsWith: `${currentYear}-` },
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
    }),
    db.achievementXpOverride.findMany({
      where: { cooperativeId },
      select: { achievementId: true, xpRewardOverride: true },
    }),
  ]);

  const overrideByAchievement = new Map(
    overrides.map((override) => [override.achievementId.toString(), override.xpRewardOverride]),
  );
  const xpByMonth = new Map<string, number>();

  for (const row of workerAchievements) {
    const xp =
      overrideByAchievement.get(row.achievementId.toString()) ??
      row.achievement.baseXpReward;
    xpByMonth.set(row.yearMonth, (xpByMonth.get(row.yearMonth) ?? 0) + xp);
  }

  let bestMonth: string | null = null;
  let bestXp = -1;
  for (const [month, xp] of xpByMonth) {
    if (xp > bestXp || (xp === bestXp && bestMonth !== null && month > bestMonth)) {
      bestMonth = month;
      bestXp = xp;
    }
  }

  return getWorkerMonthSummary({
    workerId,
    cooperativeId,
    yearMonth: bestMonth ?? currentYearMonth(now),
    now,
    db,
  });
}

export async function getWorkerTopDayInMonth({
  workerId,
  cooperativeId,
  yearMonth,
  now = new Date(),
  db = prisma,
}: {
  workerId: bigint;
  cooperativeId: bigint;
  yearMonth?: string | null;
  now?: Date;
  db?: AchievementDbClient;
}) {
  const normalizedYearMonth = normalizeYearMonth(yearMonth, now);
  await getWorkerOrThrow(db, workerId, cooperativeId);

  const { start, end } = getYearMonthDateRange(normalizedYearMonth);
  const rows = await db.measurments.findMany({
    where: {
      wastepicker: workerId,
      timeStamp: { gte: start, lt: end },
    },
    select: { timeStamp: true, weightKg: true },
  });

  const totalsByDate = new Map<string, number>();
  for (const row of rows) {
    const dateKey = row.timeStamp.toISOString().slice(0, 10);
    totalsByDate.set(
      dateKey,
      (totalsByDate.get(dateKey) ?? 0) + decimalToJsonNumber(row.weightKg),
    );
  }

  let bestDate: string | null = null;
  let totalKg = 0;
  for (const [dateKey, weight] of totalsByDate) {
    if (bestDate === null || weight > totalKg || (weight === totalKg && dateKey < bestDate)) {
      bestDate = dateKey;
      totalKg = weight;
    }
  }

  return {
    workerId: workerId.toString(),
    yearMonth: normalizedYearMonth,
    bestDate,
    totalKg: Number(totalKg.toFixed(2)),
  };
}

export async function upsertAchievementProgress(
  db: Prisma.TransactionClient,
  {
    workerId,
    achievementId,
    cooperativeId,
    yearMonth,
    progress,
    thresholdValue,
    now,
  }: {
    workerId: bigint;
    achievementId: bigint;
    cooperativeId: bigint;
    yearMonth: string;
    progress: number;
    thresholdValue: Prisma.Decimal;
    now: Date;
  },
) {
  const progressValue = new Prisma.Decimal(formatDecimal(progress));
  const unlockedAt = progressValue.greaterThanOrEqualTo(thresholdValue) ? now : null;

  await db.$executeRaw`
    INSERT INTO "worker_achievement"
      ("worker_id", "achievement_id", "cooperative_id", "year_month", "progress_value", "unlocked_at")
    VALUES
      (${workerId}, ${achievementId}, ${cooperativeId}, ${yearMonth}, ${progressValue}, ${unlockedAt})
    ON CONFLICT ("worker_id", "achievement_id", "cooperative_id", "year_month")
    DO UPDATE SET
      "progress_value" = EXCLUDED."progress_value",
      "unlocked_at" = CASE
        WHEN "worker_achievement"."unlocked_at" IS NULL
          AND EXCLUDED."unlocked_at" IS NOT NULL
        THEN EXCLUDED."unlocked_at"
        ELSE "worker_achievement"."unlocked_at"
      END
  `;
}

async function evaluateWorkerAchievements(
  db: Prisma.TransactionClient,
  {
    workerId,
    cooperativeId,
    yearMonth,
    definitions,
    now,
  }: {
    workerId: bigint;
    cooperativeId: bigint;
    yearMonth: string;
    definitions: EvaluationDefinition[];
    now: Date;
  },
) {
  const metrics = await getWorkerMonthMetrics(db, workerId, yearMonth);
  let updatedProgressCount = 0;

  for (const achievement of definitions) {
    const progress = getAchievementProgress({
      category: achievement.category,
      totalWeightKg: metrics.totalWeightKg,
      daysWorked: metrics.daysWorked,
      unlockedBaseAchievements: 0,
    });

    if (progress === null) {
      continue;
    }

    await upsertAchievementProgress(db, {
      workerId,
      achievementId: achievement.achievementId,
      cooperativeId,
      yearMonth,
      progress,
      thresholdValue: achievement.thresholdValue,
      now,
    });
    updatedProgressCount += 1;
  }

  const unlockedBaseAchievements = await db.workerAchievement.count({
    where: {
      workerId,
      cooperativeId,
      yearMonth,
      unlockedAt: { not: null },
      achievement: { category: { not: 'ACHIEVEMENTS_COUNT' } },
    },
  });

  for (const achievement of definitions) {
    if (achievement.category !== 'ACHIEVEMENTS_COUNT') {
      continue;
    }

    await upsertAchievementProgress(db, {
      workerId,
      achievementId: achievement.achievementId,
      cooperativeId,
      yearMonth,
      progress: unlockedBaseAchievements,
      thresholdValue: achievement.thresholdValue,
      now,
    });
    updatedProgressCount += 1;
  }

  return updatedProgressCount;
}

export async function evaluateAchievementsForCooperative({
  cooperativeId,
  yearMonth,
  now = new Date(),
}: {
  cooperativeId: bigint;
  yearMonth: string;
  now?: Date;
}) {
  const normalizedYearMonth = normalizeYearMonth(yearMonth, now);
  const [workers, definitions] = await Promise.all([
    prisma.workers.findMany({
      where: {
        cooperative: cooperativeId,
        exitDate: null,
        userType: { in: ['1', 'C', 'W'] },
      },
      select: { workerId: true },
      orderBy: { workerId: 'asc' },
    }),
    prisma.achievementDefinition.findMany({
      select: {
        achievementId: true,
        category: true,
        thresholdValue: true,
      },
      orderBy: [{ category: 'asc' }, { thresholdValue: 'asc' }],
    }),
  ]);

  let updatedProgressCount = 0;
  for (const worker of workers) {
    updatedProgressCount += await prisma.$transaction((tx) =>
      evaluateWorkerAchievements(tx, {
        workerId: worker.workerId,
        cooperativeId,
        yearMonth: normalizedYearMonth,
        definitions,
        now,
      }),
    );
  }

  return {
    cooperativeId: cooperativeId.toString(),
    yearMonth: normalizedYearMonth,
    evaluatedWorkers: workers.length,
    updatedProgressCount,
  };
}

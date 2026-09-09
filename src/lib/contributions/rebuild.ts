import { Prisma, type PrismaClient } from '@prisma/client';
import { decimalToNumber } from '@/lib/db-utils';
import {
  sumDailyWorkerMaterialDeltas,
  type WorkerMeasurementDeltaRecord,
} from '@/lib/analytics/measurement-deltas';

/**
 * Full rebuild of `Worker_contributions` from `Measurments`.
 *
 * Extracted from `POST /api/recalculate-contributions` so the historical
 * import can reuse it. The rebuild is GLOBAL (every cooperative) and
 * destructive (delete + reinsert). It runs inside a single transaction so a
 * failure never leaves the table half-empty. Week math is kept byte for byte
 * from the original route (pre-existing local-time behaviour).
 */

export type RebuildContributionsDbClient = Pick<PrismaClient, 'measurments' | 'workers' | '$transaction'>;

export interface RebuildContributionsStatistics {
  totalMeasurements: number;
  dailyContributions: number;
  weeklyContributions: number;
  totalWorkers: number;
  totalMaterials: number;
  totalWeight: number;
}

export interface RebuildContributionsResult {
  processed: number;
  statistics: RebuildContributionsStatistics | null;
  message: string;
}

type WeeklyContribution = {
  workerId: bigint;
  materialId: bigint;
  week: number;
  year: number;
  totalWeight: number;
  startDate: string;
  endDate: string;
};

export const CONTRIBUTIONS_REBUILD_TRANSACTION_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;
export const CONTRIBUTIONS_INSERT_CHUNK = 500;

export function calculateISOWeek(date: Date) {
  const target = new Date(date.valueOf());
  target.setHours(0, 0, 0, 0);
  const dayNumber = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return { week, year: target.getFullYear() };
}

export function getWeekRange(year: number, week: number) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const weekStart = new Date(simple);
  if (dayOfWeek <= 4) {
    weekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    weekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    startDate: weekStart.toISOString().split('T')[0],
    endDate: weekEnd.toISOString().split('T')[0],
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function rebuildWorkerContributions(
  db: RebuildContributionsDbClient,
): Promise<RebuildContributionsResult> {
  const prismaMeasurements = await db.measurments.findMany({
    select: {
      wastepicker: true,
      material: true,
      timeStamp: true,
      weightKg: true,
      bagFilled: true,
    },
  });

  if (prismaMeasurements.length === 0) {
    return { processed: 0, statistics: null, message: 'No measurements found' };
  }

  const measurements: WorkerMeasurementDeltaRecord[] = prismaMeasurements.map((measurement) => ({
    workerId: measurement.wastepicker,
    materialId: measurement.material,
    timestamp: measurement.timeStamp,
    weight: decimalToNumber(measurement.weightKg) ?? 0,
    bagFilled: Boolean(measurement.bagFilled),
  }));

  const dailyContributions = sumDailyWorkerMaterialDeltas(measurements);
  const weeklyMap = new Map<string, WeeklyContribution>();

  dailyContributions.forEach((contribution) => {
    const date = new Date(contribution.date);
    const { week, year } = calculateISOWeek(date);
    const { startDate, endDate } = getWeekRange(year, week);
    const key = `${contribution.workerId}|${contribution.materialId}|${year}|${week}`;
    const existing = weeklyMap.get(key);

    if (existing) {
      existing.totalWeight += contribution.weight;
    } else {
      weeklyMap.set(key, {
        workerId: contribution.workerId,
        materialId: contribution.materialId,
        week,
        year,
        totalWeight: contribution.weight,
        startDate,
        endDate,
      });
    }
  });

  const weeklyContributions = Array.from(weeklyMap.values());
  const workerIds = Array.from(new Set(weeklyContributions.map((entry) => entry.workerId)));
  const workers = await db.workers.findMany({
    where: { workerId: { in: workerIds } },
    select: { workerId: true, cooperative: true },
  });
  const cooperativeMap = new Map(workers.map((worker) => [worker.workerId, worker.cooperative]));
  const now = new Date();
  const insertable = weeklyContributions.filter((contribution) => cooperativeMap.has(contribution.workerId));

  await db.$transaction(async (tx) => {
    await tx.workerContributions.deleteMany();

    for (const batch of chunk(insertable, CONTRIBUTIONS_INSERT_CHUNK)) {
      const values = batch.map((contribution) => Prisma.sql`(
        ${contribution.workerId},
        ${contribution.materialId},
        ${cooperativeMap.get(contribution.workerId)},
        daterange(${contribution.startDate}::date, ${contribution.endDate}::date, '[]'),
        ${Number(contribution.totalWeight.toFixed(2))},
        ${now}
      )`);

      await tx.$executeRaw`
        INSERT INTO "Worker_contributions" ("Wastepicker", "Material", cooperative, "Period", "Weight_KG", "Last_updated")
        VALUES ${Prisma.join(values)}
      `;
    }
  }, CONTRIBUTIONS_REBUILD_TRANSACTION_OPTIONS);

  const totalWeight = weeklyContributions.reduce((sum, entry) => sum + entry.totalWeight, 0);

  return {
    processed: weeklyContributions.length,
    message: 'Worker contributions recalculated successfully',
    statistics: {
      totalMeasurements: measurements.length,
      dailyContributions: dailyContributions.length,
      weeklyContributions: weeklyContributions.length,
      totalWorkers: new Set(dailyContributions.map((contribution) => contribution.workerId)).size,
      totalMaterials: new Set(dailyContributions.map((contribution) => contribution.materialId)).size,
      totalWeight: Number(totalWeight.toFixed(2)),
    },
  };
}

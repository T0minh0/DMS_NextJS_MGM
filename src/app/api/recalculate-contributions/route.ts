import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decimalToNumber } from '@/lib/db-utils';

type MeasurementRecord = {
  workerId: bigint;
  materialId: bigint;
  timestamp: Date;
  weight: number;
  bagFilled: boolean;
};

type DailyContribution = {
  workerId: bigint;
  materialId: bigint;
  date: string;
  weight: number;
};

type WeeklyContribution = {
  workerId: bigint;
  materialId: bigint;
  week: number;
  year: number;
  totalWeight: number;
  startDate: string;
  endDate: string;
};

function calculateISOWeek(date: Date) {
  const target = new Date(date.valueOf());
  target.setHours(0, 0, 0, 0);
  const dayNumber = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return { week, year: target.getFullYear() };
}

function getWeekRange(year: number, week: number) {
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

function calculateDailyContributions(measurements: MeasurementRecord[]) {
  const grouped = new Map<string, MeasurementRecord[]>();

  measurements.forEach((measurement) => {
    const dateKey = measurement.timestamp.toISOString().split('T')[0];
    const key = `${measurement.workerId}|${measurement.materialId}|${dateKey}`;
    const list = grouped.get(key) ?? [];
    list.push(measurement);
    grouped.set(key, list);
  });

  const contributions: DailyContribution[] = [];

  grouped.forEach((list, key) => {
    const [workerIdStr, materialIdStr, date] = key.split('|');
    list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const filled = list.find((measurement) => measurement.bagFilled);
    const weight = filled ? filled.weight : Math.max(...list.map((measurement) => measurement.weight));

    if (weight > 0) {
      contributions.push({
        workerId: BigInt(workerIdStr),
        materialId: BigInt(materialIdStr),
        date,
        weight,
      });
    }
  });

  return contributions;
}

export async function POST() {
  try {
    const prismaMeasurements = await prisma.measurments.findMany({
      select: {
        wastepicker: true,
        material: true,
        timeStamp: true,
        weightKg: true,
        bagFilled: true,
      },
    });

    if (prismaMeasurements.length === 0) {
      return NextResponse.json({
        message: 'No measurements found',
        processed: 0,
      });
    }

    const measurements: MeasurementRecord[] = prismaMeasurements.map((measurement) => ({
      workerId: measurement.wastepicker,
      materialId: measurement.material,
      timestamp: measurement.timeStamp,
      weight: decimalToNumber(measurement.weightKg) ?? 0,
      bagFilled: Boolean(measurement.bagFilled),
    }));

    const dailyContributions = calculateDailyContributions(measurements);

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
    const workers = await prisma.workers.findMany({
      where: { workerId: { in: workerIds } },
      select: { workerId: true, cooperative: true },
    });
    const cooperativeMap = new Map(workers.map((worker) => [worker.workerId, worker.cooperative]));

    await prisma.workerContributions.deleteMany();

    const now = new Date();
    for (const contribution of weeklyContributions) {
      const cooperativeId = cooperativeMap.get(contribution.workerId);
      if (!cooperativeId) {
        continue;
      }

      await prisma.$executeRaw`
        INSERT INTO "Worker_contributions" ("Wastepicker", "Material", cooperative, "Period", "Weight_KG", "Last_updated")
        VALUES (${contribution.workerId}, ${contribution.materialId}, ${cooperativeId}, daterange(${contribution.startDate}::date, ${contribution.endDate}::date, '[]'), ${Number(contribution.totalWeight.toFixed(2))}, ${now})
      `;
    }

    const totalWeight = weeklyContributions.reduce((sum, entry) => sum + entry.totalWeight, 0);

    return NextResponse.json({
      message: 'Worker contributions recalculated successfully',
      statistics: {
        totalMeasurements: measurements.length,
        dailyContributions: dailyContributions.length,
        weeklyContributions: weeklyContributions.length,
        totalWorkers: new Set(dailyContributions.map((contribution) => contribution.workerId)).size,
        totalMaterials: new Set(dailyContributions.map((contribution) => contribution.materialId)).size,
        totalWeight: Number(totalWeight.toFixed(2)),
      },
      processed: weeklyContributions.length,
    });
  } catch (error) {
    console.error('Error recalculating contributions:', error);
    return NextResponse.json(
      {
        error: 'Failed to recalculate contributions',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

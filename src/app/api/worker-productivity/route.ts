import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decimalToNumber } from '@/lib/db-utils';

type MaterialContribution = {
  materialName: string;
  weight: number;
  measurements: Array<{
    date: string;
    weight: number;
    bag_filled: string;
    timestamp: string;
  }>;
};

type WeeklyContribution = {
  week: string;
  weekStart: string;
  weekEnd: string;
  materials: Record<string, MaterialContribution>;
  totalWeight: number;
};

type ProductivityStats = {
  totalWeeks: number;
  totalWeight: number;
  averageWeekly: number;
  bestWeek: {
    week: string;
    weight: number;
  };
  topMaterials: Array<{
    materialName: string;
    totalWeight: number;
  }>;
};

type MeasurementRecord = {
  weight: number;
  timestamp: Date;
  materialId: bigint;
  bagFilled: boolean;
};

type ProcessedMeasurement = {
  dateLabel: string;
  weight: number;
  bagFilled: string;
  timestamp: Date;
  netContribution: number;
  materialId: bigint;
};

function parseWorkerId(workerParam: string) {
  const digits = workerParam.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  try {
    return BigInt(digits);
  } catch {
    return null;
  }
}

function computeDateRange(weeks: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - weeks * 7);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate };
}

function getWeekKey(date: Date) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  return `${year}W${weekNumber.toString().padStart(2, '0')}`;
}

function getWeekRange(weekKey: string) {
  const [yearPart, weekPart] = weekKey.split('W');
  const year = Number(yearPart);
  const week = Number(weekPart);

  const firstDay = new Date(year, 0, 1);
  const firstMonday = new Date(firstDay);
  const dayOfWeek = firstDay.getDay();
  const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  firstMonday.setDate(firstDay.getDate() + daysToAdd);

  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 2) * 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    start: weekStart.toLocaleDateString('pt-BR'),
    end: weekEnd.toLocaleDateString('pt-BR'),
  };
}

function calculateNetContributions(measurements: MeasurementRecord[]) {
  const grouped = new Map<string, MeasurementRecord[]>();

  measurements.forEach((measurement) => {
    const dateKey = measurement.timestamp.toISOString().split('T')[0];
    const key = `${dateKey}-${measurement.materialId.toString()}`;
    const list = grouped.get(key) ?? [];
    list.push(measurement);
    grouped.set(key, list);
  });

  const processed: ProcessedMeasurement[] = [];

  grouped.forEach((list) => {
    list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let previousWeight = 0;

    list.forEach((measurement, index) => {
      let net = index === 0 ? measurement.weight : measurement.weight - previousWeight;
      if (measurement.bagFilled) {
        const initialWeight = list[0]?.weight ?? 0;
        net = measurement.weight - (index > 0 ? initialWeight : 0);
      }

      processed.push({
        dateLabel: measurement.timestamp.toLocaleDateString('pt-BR'),
        weight: measurement.weight,
        bagFilled: measurement.bagFilled ? 'S' : 'N',
        timestamp: measurement.timestamp,
        netContribution: Math.max(0, net),
        materialId: measurement.materialId,
      });

      previousWeight = measurement.weight;
    });
  });

  return processed;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workerParam = searchParams.get('worker_id');
    const weeks = Number(searchParams.get('weeks') ?? '12');

    if (!workerParam) {
      return NextResponse.json({ error: 'Worker ID is required' }, { status: 400 });
    }

    const workerId = parseWorkerId(workerParam);
    if (!workerId) {
      return NextResponse.json({ error: 'Invalid worker ID' }, { status: 400 });
    }

    const { startDate, endDate } = computeDateRange(weeks);

    const prismaMeasurements = await prisma.measurments.findMany({
      where: {
        wastepicker: workerId,
        timeStamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timeStamp: 'asc' },
      select: {
        weightKg: true,
        timeStamp: true,
        material: true,
        bagFilled: true,
      },
    });

    if (prismaMeasurements.length === 0) {
      return NextResponse.json({
        weeklyContributions: [],
        stats: {
          totalWeeks: 0,
          totalWeight: 0,
          averageWeekly: 0,
          bestWeek: { week: '', weight: 0 },
          topMaterials: [],
        },
      });
    }

    const measurements: MeasurementRecord[] = prismaMeasurements.map((measurement) => ({
      weight: decimalToNumber(measurement.weightKg) ?? 0,
      timestamp: measurement.timeStamp,
      materialId: measurement.material,
      bagFilled: Boolean(measurement.bagFilled),
    }));

    const materialIds = Array.from(new Set(measurements.map((measurement) => measurement.materialId)));
    const materials = await prisma.materials.findMany({
      where: { materialId: { in: materialIds } },
      select: { materialId: true, materialName: true },
    });

    const materialNameMap = new Map(materials.map((material) => [material.materialId, material.materialName]));

    const processed = calculateNetContributions(measurements);

    const weeklyMap = new Map<string, ProcessedMeasurement[]>();
    processed.forEach((measurement) => {
      const weekKey = getWeekKey(measurement.timestamp);
      const list = weeklyMap.get(weekKey) ?? [];
      list.push(measurement);
      weeklyMap.set(weekKey, list);
    });

    const weeklyContributions: WeeklyContribution[] = [];

    Array.from(weeklyMap.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .forEach(([weekKey, list]) => {
        const materialsMap = new Map<string, ProcessedMeasurement[]>();
        list.forEach((measurement) => {
          const materialKey = measurement.materialId.toString();
          const materialList = materialsMap.get(materialKey) ?? [];
          materialList.push(measurement);
          materialsMap.set(materialKey, materialList);
        });

        const contributions: Record<string, MaterialContribution> = {};
        let totalWeight = 0;

        materialsMap.forEach((materialMeasurements, materialKey) => {
          const name = materialNameMap.get(BigInt(materialKey)) ?? `Material ${materialKey}`;
          const weight = materialMeasurements.reduce((sum, measurement) => sum + measurement.netContribution, 0);
          totalWeight += weight;

          contributions[materialKey] = {
            materialName: name,
            weight: Number(weight.toFixed(2)),
            measurements: materialMeasurements.map((measurement) => ({
              date: measurement.dateLabel,
              weight: Number(measurement.weight.toFixed(2)),
              bag_filled: measurement.bagFilled,
              timestamp: measurement.timestamp.toISOString(),
            })),
          };
        });

        const { start, end } = getWeekRange(weekKey);

        weeklyContributions.push({
          week: weekKey,
          weekStart: start,
          weekEnd: end,
          materials: contributions,
          totalWeight: Number(totalWeight.toFixed(2)),
        });
      });

    const totalWeight = weeklyContributions.reduce((sum, week) => sum + week.totalWeight, 0);
    const totalWeeks = weeklyContributions.length;
    const averageWeekly = totalWeeks > 0 ? Number((totalWeight / totalWeeks).toFixed(2)) : 0;

    const bestWeekEntry =
      weeklyContributions.length > 0
        ? weeklyContributions.reduce((best, current) =>
            current.totalWeight > best.totalWeight ? current : best,
          weeklyContributions[0])
        : undefined;

    const materialTotals = new Map<string, number>();
    weeklyContributions.forEach((week) => {
      Object.values(week.materials).forEach((material) => {
        const current = materialTotals.get(material.materialName) ?? 0;
        materialTotals.set(material.materialName, current + material.weight);
      });
    });

    const topMaterials = Array.from(materialTotals.entries())
      .map(([materialName, total]) => ({
        materialName,
        totalWeight: Number(total.toFixed(2)),
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 5);

    const stats: ProductivityStats = {
      totalWeeks,
      totalWeight: Number(totalWeight.toFixed(2)),
      averageWeekly,
      bestWeek: {
        week: bestWeekEntry?.week ?? '',
        weight: Number((bestWeekEntry?.totalWeight ?? 0).toFixed(2)),
      },
      topMaterials,
    };

    return NextResponse.json({
      weeklyContributions: weeklyContributions.reverse(),
      stats,
    });
  } catch (error) {
    console.error('Error fetching worker productivity:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch worker productivity data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

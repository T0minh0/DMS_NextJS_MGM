import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { scopedWorkerWhere } from '@/lib/auth/scoped-queries';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';
import { decimalToNumber } from '@/lib/db-utils';
import {
  processMeasurementDeltas,
  type MeasurementDeltaRecord,
  type ProcessedDeltaMeasurement,
} from '@/lib/analytics/measurement-deltas';

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

type MeasurementRecord = MeasurementDeltaRecord;

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

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workerParam = searchParams.get('worker_id');
    const weeks = Number(searchParams.get('weeks') ?? '12');

    if (!workerParam) {
      return apiErrorResponse({
        message: 'Worker ID is required',
        code: 'REQUIRED_WORKER_ID',
        status: 400,
      });
    }

    const workerId = parseWorkerId(workerParam);
    if (!workerId) {
      return apiErrorResponse({
        message: 'Invalid worker ID',
        code: 'INVALID_WORKER_ID',
        status: 400,
      });
    }

    const worker = await prisma.workers.findFirst({
      where: scopedWorkerWhere(session, workerId),
      select: { cooperative: true },
    });

    if (!worker) {
      return apiErrorResponse({
        message: 'Worker not found',
        code: 'WORKER_NOT_FOUND',
        status: 404,
      });
    }

    requireScopedPermission(
      session,
      'gamification',
      'read',
      session.role === 'worker' ? 'self' : 'cooperative',
    );

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

    const processed: ProcessedDeltaMeasurement[] = processMeasurementDeltas(measurements);

    const weeklyMap = new Map<string, ProcessedDeltaMeasurement[]>();
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
        const materialsMap = new Map<string, ProcessedDeltaMeasurement[]>();
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
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Failed to fetch worker productivity data',
      code: 'WORKER_PRODUCTIVITY_READ_FAILED',
      route: '/api/worker-productivity',
      method: 'GET',
      request,
    });
  }
}

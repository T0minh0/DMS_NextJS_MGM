import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { decimalToNumber, formatWorkerId } from '@/lib/db-utils';

type PeriodType = 'weekly' | 'monthly' | 'yearly';

function getDateRange(periodType: PeriodType) {
  const now = new Date();
  if (periodType === 'weekly') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (periodType === 'yearly') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

async function resolveMaterialFilter(materialParam: string | null) {
  if (!materialParam) {
    return { ids: undefined };
  }

  if (materialParam.startsWith('group_')) {
    const groupName = materialParam.replace('group_', '').toLowerCase();
    const groupMaterials = await prisma.materials.findMany({
      where: {
        group: {
          groupName: {
            equals: groupName,
            mode: 'insensitive',
          },
        },
      },
      select: { materialId: true },
    });

    if (groupMaterials.length === 0) {
      return {
        error: NextResponse.json({
          noData: true,
          message: 'Não há materiais neste grupo',
        }),
      };
    }

    return { ids: groupMaterials.map((material) => material.materialId) };
  }

  try {
    return { ids: [BigInt(materialParam)] };
  } catch {
    return {
      error: NextResponse.json({ noData: true, message: 'Material inválido' }, { status: 400 }),
    };
  }
}

function parseWorkerId(workerParam: string | null) {
  if (!workerParam) {
    return undefined;
  }
  const digits = workerParam.replace(/\D/g, '');
  if (!digits) {
    return undefined;
  }
  try {
    return BigInt(digits);
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workerParam = searchParams.get('worker_id');
    const materialParam = searchParams.get('material_id');
    const periodType = (searchParams.get('period_type') as PeriodType) || 'monthly';

    const { start, end } = getDateRange(periodType);
    const materialFilter = await resolveMaterialFilter(materialParam);
    if (materialFilter.error) {
      return materialFilter.error;
    }
    const workerId = parseWorkerId(workerParam);

    const where: Prisma.MeasurmentsWhereInput = {
      timeStamp: {
        gte: start,
        lte: end,
      },
      ...(workerId ? { wastepicker: workerId } : {}),
      ...(materialFilter.ids ? { material: { in: materialFilter.ids } } : {}),
    };

    if (periodType === 'yearly' && !materialParam) {
      const topWorkers = await prisma.measurments.groupBy({
        where,
        by: ['wastepicker'],
        _sum: { weightKg: true },
        orderBy: { _sum: { weightKg: 'desc' } },
        take: 10,
      });

      if (topWorkers.length === 0) {
        return NextResponse.json({
          noData: true,
          message: 'Não há coletas disponíveis para este ano',
        });
      }

      const workerIds = topWorkers.map((item) => item.wastepicker);
      const workers = await prisma.workers.findMany({
        where: { workerId: { in: workerIds } },
        select: { workerId: true, workerName: true },
      });
      const workerNameMap = new Map(workers.map((worker) => [worker.workerId, worker.workerName]));

      const breakdown = await prisma.measurments.groupBy({
        where: {
          ...where,
          wastepicker: { in: workerIds },
        },
        by: ['wastepicker', 'material'],
        _sum: { weightKg: true },
      });

      const materialIds = Array.from(new Set(breakdown.map((entry) => entry.material)));
      const materials = await prisma.materials.findMany({
        where: { materialId: { in: materialIds } },
        select: { materialId: true, materialName: true },
      });
      const materialNameMap = new Map(materials.map((material) => [material.materialId, material.materialName]));

      const materialList = materialIds.map((id) => ({
        id: id.toString(),
        name: materialNameMap.get(id) ?? `Material ${id.toString()}`,
      }));

      const breakdownMap = new Map<string, number>();
      breakdown.forEach((entry) => {
        const key = `${entry.wastepicker}-${entry.material}`;
        breakdownMap.set(key, decimalToNumber(entry._sum.weightKg) ?? 0);
      });

      const formattedWorkers = topWorkers.map((item) => {
        const totalWeight = decimalToNumber(item._sum.weightKg) ?? 0;
        const workerData: Record<string, string | number> = {
          wastepicker_id: formatWorkerId(item.wastepicker),
          worker_name: workerNameMap.get(item.wastepicker) ?? 'Sem nome',
          totalWeight,
        };

        materialList.forEach((material) => {
          const key = `${item.wastepicker}-${material.id}`;
          workerData[material.id] = breakdownMap.get(key) ?? 0;
        });

        return workerData;
      });

      return NextResponse.json({
        grouped: true,
        workers: formattedWorkers,
        materials: materialList,
      });
    }

    const topWorkers = await prisma.measurments.groupBy({
      where,
      by: ['wastepicker'],
      _sum: { weightKg: true },
      orderBy: { _sum: { weightKg: 'desc' } },
      take: 10,
    });

    if (topWorkers.length === 0) {
      let periodMessage = 'este período';
      if (periodType === 'weekly') periodMessage = 'esta semana';
      else if (periodType === 'monthly') periodMessage = 'este mês';
      else if (periodType === 'yearly') periodMessage = 'este ano';

      return NextResponse.json({
        noData: true,
        message: materialParam
          ? `Não há coletas deste material em ${periodMessage}`
          : `Não há coletas disponíveis para ${periodMessage}`,
      });
    }

    const workerIds = topWorkers.map((item) => item.wastepicker);
    const workers = await prisma.workers.findMany({
      where: { workerId: { in: workerIds } },
      select: { workerId: true, workerName: true },
    });
    const workerNameMap = new Map(workers.map((worker) => [worker.workerId, worker.workerName]));

    const formatted = topWorkers.map((item) => ({
      wastepicker_id: formatWorkerId(item.wastepicker),
      worker_name: workerNameMap.get(item.wastepicker) ?? 'Sem nome',
      totalWeight: decimalToNumber(item._sum.weightKg) ?? 0,
    }));

    return NextResponse.json({
      grouped: false,
      data: formatted,
    });
  } catch (error) {
    console.error('Error fetching worker collections:', error);
    return NextResponse.json(
      {
        noData: true,
        message: 'Erro ao buscar dados de coletas. Por favor, tente novamente mais tarde.',
      },
      { status: 500 },
    );
  }
}

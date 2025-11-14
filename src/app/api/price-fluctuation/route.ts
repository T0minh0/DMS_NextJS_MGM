import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decimalToNumber } from '@/lib/db-utils';

type MaterialContext = {
  nameMap: Map<bigint, string>;
  groupMap: Map<string, bigint[]>;
};

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function loadMaterialContext(): Promise<MaterialContext> {
  const materials = await prisma.materials.findMany({
    include: { group: true },
  });

  const nameMap = new Map<bigint, string>();
  const groupMap = new Map<string, bigint[]>();

  materials.forEach((material) => {
    nameMap.set(material.materialId, material.materialName);
    if (material.group) {
      const key = material.group.groupName.toLowerCase();
      const list = groupMap.get(key) ?? [];
      list.push(material.materialId);
      groupMap.set(key, list);
    }
  });

  return { nameMap, groupMap };
}

function formatDateLabel(date: Date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTH_LABELS[date.getMonth()] ?? '';
  const year = date.getFullYear().toString().slice(-2);
  return `${day} ${month} ${year}`;
}


async function resolveMaterialIds(
  materialParam: string,
  context: MaterialContext,
): Promise<{ ids?: bigint[]; error?: NextResponse }> {
  if (materialParam.startsWith('group_')) {
    const groupName = materialParam.replace('group_', '').toLowerCase();
    const ids = context.groupMap.get(groupName);
    if (!ids || ids.length === 0) {
      return {
        error: NextResponse.json({ noData: true, message: 'Não há materiais neste grupo' }),
      };
    }
    return { ids };
  }

  try {
    return { ids: [BigInt(materialParam)] };
  } catch {
    return {
      error: NextResponse.json({ noData: true, message: 'Material inválido' }, { status: 400 }),
    };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialParam = searchParams.get('material_id');
    const context = await loadMaterialContext();

    if (materialParam) {
      const resolved = await resolveMaterialIds(materialParam, context);
      if (resolved.error) {
        return resolved.error;
      }
      const materialIds = resolved.ids!;

      const sales = await prisma.sales.findMany({
        where: { material: { in: materialIds } },
        orderBy: { date: 'desc' },
        take: materialIds.length > 1 ? 200 : 10,
        select: {
          date: true,
          material: true,
          priceKg: true,
        },
      });

      if (sales.length === 0) {
        return NextResponse.json({
          noData: true,
          message: materialIds.length > 1
            ? 'Não há histórico de preços para materiais neste grupo'
            : 'Não há histórico de preços para este material',
        });
      }

      if (materialIds.length === 1) {
        const materialId = materialIds[0];
        const materialName = context.nameMap.get(materialId) ?? `Material ${materialId.toString()}`;
        const formatted = sales
          .reverse()
          .map((sale) => ({
            date: sale.date,
            material: materialName,
            price: decimalToNumber(sale.priceKg) ?? 0,
            dateLabel: formatDateLabel(sale.date),
            timestamp: sale.date.getTime(),
          }));
        return NextResponse.json(formatted);
      }

      const byDate = new Map<
        string,
        { date: Date; prices: number[]; materialSet: Set<bigint> }
      >();

      sales.forEach((sale) => {
        const dateKey = sale.date.toISOString().split('T')[0];
        const entry =
          byDate.get(dateKey) ??
          { date: sale.date, prices: [], materialSet: new Set<bigint>() };
        entry.prices.push(decimalToNumber(sale.priceKg) ?? 0);
        entry.materialSet.add(sale.material);
        byDate.set(dateKey, entry);
      });

      const sorted = Array.from(byDate.values())
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(-10);

      const groupLabel = materialParam.replace('group_', '');
      const formatted = sorted.map((entry) => {
        const avgPrice =
          entry.prices.reduce((sum, value) => sum + value, 0) / entry.prices.length;
        return {
          date: entry.date,
          material: `Grupo: ${groupLabel}`,
          price: Number(avgPrice.toFixed(2)),
          dateLabel: formatDateLabel(entry.date),
          timestamp: entry.date.getTime(),
          materialsCount: entry.materialSet.size,
        };
      });

      return NextResponse.json(formatted);
    }

    const recentMaterials = await prisma.sales.groupBy({
      by: ['material'],
      _max: { date: true },
      orderBy: { _max: { date: 'desc' } },
      take: 5,
    });

    if (recentMaterials.length === 0) {
      return NextResponse.json({
        noData: true,
        message: 'Não há histórico de preços disponível',
      });
    }

    const priceSeriesByMaterial = await Promise.all(
      recentMaterials.map(async (entry) => {
        const materialId = entry.material;
        const materialSales = await prisma.sales.findMany({
          where: { material: materialId },
          orderBy: { date: 'desc' },
          take: 10,
          select: {
            date: true,
            priceKg: true,
          },
        });

        const sortedSales = materialSales.reverse();
        const series = sortedSales.map((sale) => ({
          dateLabel: formatDateLabel(sale.date),
          timestamp: sale.date.getTime(),
          price: decimalToNumber(sale.priceKg) ?? 0,
        }));

        const materialName =
          context.nameMap.get(materialId) ?? `Material ${materialId.toString()}`;

        return { materialId, materialName, series };
      }),
    );

    const uniqueLabels = new Map<string, number>();
    priceSeriesByMaterial.forEach((series) => {
      series.series.forEach((point) => {
        if (!uniqueLabels.has(point.dateLabel)) {
          uniqueLabels.set(point.dateLabel, point.timestamp);
        }
      });
    });

    const sortedLabels = Array.from(uniqueLabels.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label);

    const priceData = sortedLabels.map((label) => {
      const materials: Record<string, number> = {};
      priceSeriesByMaterial.forEach((series) => {
        const match = series.series.find((point) => point.dateLabel === label);
        if (match) {
          materials[series.materialName] = match.price;
        }
      });
      return {
        weekLabel: label,
        date: new Date(uniqueLabels.get(label)!),
        materials,
      };
    });

    return NextResponse.json({
      materials: priceSeriesByMaterial.map((series) => series.materialName),
      priceData,
    });
  } catch (error) {
    console.error('Error fetching price fluctuation:', error);
    return NextResponse.json(
      {
        noData: true,
        message: 'Erro ao buscar dados de preços',
      },
      { status: 500 },
    );
  }
}

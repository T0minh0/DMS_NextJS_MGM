import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decimalToNumber } from '@/lib/db-utils';

type PeriodType = 'weekly' | 'monthly' | 'yearly';

async function resolveMaterialIds(materialParam: string) {
  if (materialParam.startsWith('group_')) {
    const groupName = materialParam.replace('group_', '');
    const materials = await prisma.materials.findMany({
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

    if (materials.length === 0) {
      return { ids: null, error: NextResponse.json({ noData: true, message: 'Não há materiais neste grupo' }) };
    }
    return { ids: materials.map((m) => m.materialId) };
  }

  try {
    return { ids: [BigInt(materialParam)] };
  } catch {
    return { ids: null, error: NextResponse.json({ noData: true, message: 'Material inválido' }, { status: 400 }) };
  }
}

function formatPeriodLabel(periodType: PeriodType, start: Date, end: Date) {
  if (periodType === 'weekly') {
    const startStr = start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const endStr = end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${startStr} - ${endStr}`;
  }
  if (periodType === 'yearly') {
    return start.getFullYear().toString();
  }
  return start.toLocaleDateString('pt-BR', { month: 'short' });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialParam = searchParams.get('material_id');
    const periodType = (searchParams.get('period_type') as PeriodType) || 'monthly';

    const materialIds = materialParam ? await resolveMaterialIds(materialParam) : { ids: null };
    if ('error' in materialIds && materialIds.error) {
      return materialIds.error;
    }

    const now = new Date();
    const periods = [];
    const numberOfPeriods = 6;

    for (let i = numberOfPeriods - 1; i >= 0; i -= 1) {
      let start: Date;
      let end: Date;

      if (periodType === 'weekly') {
        end = new Date(now);
        end.setDate(end.getDate() - i * 7);
        start = new Date(end);
        start.setDate(end.getDate() - 6);
      } else if (periodType === 'yearly') {
        const year = now.getFullYear() - i;
        start = new Date(year, 0, 1);
        end = new Date(year, 11, 31, 23, 59, 59);
      } else {
        start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      }

      const sales = await prisma.sales.findMany({
        where: {
          date: {
            gte: start,
            lte: end,
          },
          ...(materialIds.ids
            ? {
              material: {
                in: materialIds.ids,
              },
            }
            : {}),
        },
        select: {
          priceKg: true,
          weight: true,
        },
      });

      const earnings = sales.reduce((sum, sale) => {
        const price = decimalToNumber(sale.priceKg) ?? 0;
        const weight = decimalToNumber(sale.weight) ?? 0;
        return sum + price * weight;
      }, 0);

      periods.push({
        period: formatPeriodLabel(periodType, start, end),
        earnings,
      });
    }

    if (periods.every((item) => item.earnings === 0)) {
      return NextResponse.json({
        noData: true,
        message: materialParam
          ? 'Não há vendas registradas para este material'
          : 'Não há dados de vendas disponíveis',
      });
    }

    return NextResponse.json(periods);
  } catch (error) {
    console.error('Error fetching earnings comparison:', error);
    return NextResponse.json(
      {
        noData: true,
        message: 'Erro ao buscar dados de vendas. Por favor, tente novamente mais tarde.',
      },
      { status: 500 },
    );
  }
}
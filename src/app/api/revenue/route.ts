import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToNumber } from '@/lib/db-utils';
import { createLogContext } from '@/lib/observability/logger';
import { SOLD_SALE_WHERE } from '@/lib/sales/lifecycle';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    const targetCooperativeId = determineTargetCooperative(session);
    requireScopedPermission(
      session,
      'reports',
      'read',
      targetCooperativeId ? 'cooperative' : 'global',
    );

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');
    const materialIdParam = searchParams.get('material_id');

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (startDateParam) {
      startDate = new Date(startDateParam);
      if (Number.isNaN(startDate.getTime())) {
        return apiErrorResponse({
          message: 'Data inicial inválida',
          code: 'INVALID_START_DATE',
          status: 400,
          requestId: context.requestId,
        });
      }
    }

    if (endDateParam) {
      endDate = new Date(endDateParam);
      if (Number.isNaN(endDate.getTime())) {
        return apiErrorResponse({
          message: 'Data final inválida',
          code: 'INVALID_END_DATE',
          status: 400,
          requestId: context.requestId,
        });
      }
    }

    let materialIds: bigint[] | undefined;
    if (materialIdParam) {
      if (materialIdParam.startsWith('group_')) {
        const groupName = materialIdParam.replace('group_', '');
        const groupMaterials = await prisma.materials.findMany({
          where: { group: { groupName: { equals: groupName, mode: 'insensitive' } } },
          select: { materialId: true },
        });
        if (groupMaterials.length === 0) {
          return NextResponse.json({ totalRevenue: 0, totalWeight: 0, salesCount: 0, avgPriceKg: 0, noData: true });
        }
        materialIds = groupMaterials.map((m) => m.materialId);
      } else {
        try {
          materialIds = [BigInt(materialIdParam)];
        } catch {
          return apiErrorResponse({
            message: 'Material inválido',
            code: 'INVALID_MATERIAL',
            status: 400,
            requestId: context.requestId,
          });
        }
      }
    }

    const sales = await prisma.sales.findMany({
      where: {
        ...SOLD_SALE_WHERE,
        ...(targetCooperativeId ? { cooperativeId: BigInt(targetCooperativeId) } : {}),
        ...(materialIds ? { material: { in: materialIds } } : {}),
        ...(startDate || endDate
          ? { soldAt: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
          : {}),
      },
      select: { priceKg: true, weight: true },
    });

    if (sales.length === 0) {
      return NextResponse.json({
        totalRevenue: 0,
        totalWeight: 0,
        salesCount: 0,
        avgPriceKg: 0,
        noData: true,
      });
    }

    let totalRevenue = 0;
    let totalWeight = 0;
    let totalWeightedPrice = 0;

    for (const sale of sales) {
      const price = decimalToNumber(sale.priceKg) ?? 0;
      const weight = decimalToNumber(sale.weight) ?? 0;
      totalRevenue += price * weight;
      totalWeight += weight;
      totalWeightedPrice += price * weight;
    }

    const avgPriceKg = totalWeight > 0 ? totalWeightedPrice / totalWeight : 0;

    return NextResponse.json({
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalWeight: Number(totalWeight.toFixed(2)),
      salesCount: sales.length,
      avgPriceKg: Number(avgPriceKg.toFixed(2)),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao calcular receita',
      code: 'REVENUE_READ_FAILED',
      context,
      event: 'revenue.read.failed',
      error,
    });
  }
}

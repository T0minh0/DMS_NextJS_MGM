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

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

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
    const rawLimit = Number.parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);

    const sales = await prisma.sales.findMany({
      where: {
        ...SOLD_SALE_WHERE,
        ...(targetCooperativeId ? { cooperativeId: BigInt(targetCooperativeId) } : {}),
      },
      include: {
        materialRef: true,
        buyerRef: true,
      },
      orderBy: { soldAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      sales: sales.map((sale) => {
        const weight = decimalToNumber(sale.weight) ?? 0;
        const priceKg = decimalToNumber(sale.priceKg) ?? 0;
        return {
          _id: sale.saleId.toString(),
          material: sale.materialRef.materialName,
          material_id: sale.material.toString(),
          cooperative_id: sale.cooperativeId.toString(),
          weight_kg: Number(weight.toFixed(2)),
          price_per_kg: Number(priceKg.toFixed(2)),
          total_value: Number((weight * priceKg).toFixed(2)),
          buyer: sale.buyerRef.buyerName,
          sold_at: sale.soldAt!.toISOString(),
          date: sale.date.toISOString(),
        };
      }),
      count: sales.length,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar últimas vendas',
      code: 'LASTSALES_READ_FAILED',
      context,
      event: 'cooperative.lastsales.failed',
      error,
    });
  }
}

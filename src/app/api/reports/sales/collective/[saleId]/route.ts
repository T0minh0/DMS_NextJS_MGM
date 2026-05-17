import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToJsonNumber } from '@/lib/decimal';
import { createLogContext } from '@/lib/observability/logger';
import { canReadFullCollectiveSaleReport } from '@/lib/reports/collective-access';

const INCLUDE_FULL = {
  buyer: { select: { buyerName: true } },
  material: { select: { materialName: true } },
  creatorCooperative: { select: { cooperativeName: true } },
  contributions: {
    include: { cooperative: { select: { cooperativeName: true } } },
    orderBy: { contributionId: 'asc' as const },
  },
} satisfies Prisma.CollectiveSaleInclude;

function computeStatus(sale: { soldAt: Date | null; cancelledAt: Date | null }) {
  if (sale.cancelledAt != null) return 'CANCELLED';
  if (sale.soldAt != null) return 'SOLD';
  return 'ACTIVE';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const { saleId: saleIdParam } = await params;
    let collectiveSaleId: bigint;
    try {
      collectiveSaleId = BigInt(saleIdParam);
    } catch {
      return apiErrorResponse({ message: 'ID de venda coletiva inválido', code: 'INVALID_COLLECTIVE_SALE_ID', status: 400, requestId: context.requestId });
    }

    const isAdmin = session.role === 'admin';
    const coopId = BigInt(session.cooperativeId);

    const sale = await prisma.collectiveSale.findUnique({
      where: { collectiveSaleId },
      include: INCLUDE_FULL,
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (!canReadFullCollectiveSaleReport({
      isAdmin,
      viewerCooperativeId: coopId,
      creatorCooperativeId: sale.creatorCooperativeId,
      contributions: sale.contributions,
    })) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    const myContribution = isAdmin
      ? null
      : sale.contributions.find((c) => c.cooperativeId === coopId);

    const totalRevenue =
      sale.totalWeight != null
        ? decimalToJsonNumber(sale.totalWeight.times(sale.priceKg))
        : null;

    return NextResponse.json({
      report: {
        _id: sale.collectiveSaleId.toString(),
        status: computeStatus(sale),
        material_id: sale.materialId.toString(),
        material_name: sale.material.materialName,
        creator_cooperative_id: sale.creatorCooperativeId.toString(),
        creator_cooperative_name: sale.creatorCooperative.cooperativeName,
        buyer_name: sale.buyer.buyerName,
        'price/kg': decimalToJsonNumber(sale.priceKg),
        total_weight: sale.totalWeight != null ? decimalToJsonNumber(sale.totalWeight) : null,
        total_revenue: totalRevenue,
        expected_sale_date: sale.expectedSaleDate.toISOString(),
        created_at: sale.createdAt.toISOString(),
        sold_at: sale.soldAt?.toISOString() ?? null,
        cancelled_at: sale.cancelledAt?.toISOString() ?? null,
        my_participation: myContribution?.status ?? null,
        contributions: sale.contributions.map((c) => ({
          cooperative_id: c.cooperativeId.toString(),
          cooperative_name: c.cooperative.cooperativeName,
          status: c.status,
          contributed_weight: c.contributedWeight != null ? decimalToJsonNumber(c.contributedWeight) : null,
          revenue_share: c.revenueShare != null ? decimalToJsonNumber(c.revenueShare) : null,
        })),
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao gerar relatório de venda coletiva',
      code: 'COLLECTIVE_SALE_REPORT_FAILED',
      context,
      event: 'reports.sales.collective.failed',
      error,
    });
  }
}

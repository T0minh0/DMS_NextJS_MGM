import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToJsonNumber } from '@/lib/decimal';
import { getSaleLifecycleStatus } from '@/lib/sales/lifecycle';
import { createLogContext } from '@/lib/observability/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const { saleId: saleIdParam } = await params;
    let saleId: bigint;
    try {
      saleId = BigInt(saleIdParam);
    } catch {
      return apiErrorResponse({ message: 'ID de venda inválido', code: 'INVALID_SALE_ID', status: 400, requestId: context.requestId });
    }

    const where =
      session.role === 'admin'
        ? { saleId }
        : { saleId, cooperativeId: BigInt(session.cooperativeId) };

    const sale = await prisma.sales.findFirst({
      where,
      include: {
        materialRef: { select: { materialName: true } },
        buyerRef: { select: { buyerName: true } },
        responsibleRef: { select: { workerName: true, workerId: true } },
        cooperativeRef: { select: { cooperativeName: true } },
      },
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda não encontrada', code: 'SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    const priceKg = decimalToJsonNumber(sale.priceKg);
    const weightSold = decimalToJsonNumber(sale.weight);
    const totalRevenue = decimalToJsonNumber(sale.priceKg.times(sale.weight));

    return NextResponse.json({
      report: {
        _id: sale.saleId.toString(),
        status: getSaleLifecycleStatus(sale),
        material_id: sale.material.toString(),
        material_name: sale.materialRef.materialName,
        cooperative_id: sale.cooperativeId.toString(),
        cooperative_name: sale.cooperativeRef.cooperativeName,
        worker_id: sale.responsible.toString(),
        worker_name: sale.responsibleRef.workerName,
        buyer_name: sale.buyerRef.buyerName,
        'price/kg': priceKg,
        weight_sold: weightSold,
        total_revenue: totalRevenue,
        date: sale.date.toISOString(),
        created_at: sale.createdAt.toISOString(),
        sold_at: sale.soldAt?.toISOString() ?? null,
        cancelled_at: sale.cancelledAt?.toISOString() ?? null,
        expected_sale_date: sale.expectedSaleDate.toISOString(),
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao gerar relatório de venda normal',
      code: 'NORMAL_SALE_REPORT_FAILED',
      context,
      event: 'reports.sales.normal.failed',
      error,
    });
  }
}

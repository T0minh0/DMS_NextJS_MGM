import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { adjustStock } from '@/lib/stock/ledger';
import { createLogContext, logInfo } from '@/lib/observability/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'update', 'cooperative');

    const { id: idParam } = await params;
    let collectiveSaleId: bigint;
    try {
      collectiveSaleId = BigInt(idParam);
    } catch {
      return apiErrorResponse({ message: 'ID de venda coletiva inválido', code: 'INVALID_COLLECTIVE_SALE_ID', status: 400, requestId: context.requestId });
    }

    const sale = await prisma.collectiveSale.findUnique({
      where: { collectiveSaleId },
      select: {
        creatorCooperativeId: true,
        soldAt: true,
        cancelledAt: true,
        materialId: true,
        contributions: {
          where: { status: 'ACCEPTED', contributedWeight: { not: null, gt: 0 } },
          select: { cooperativeId: true, contributedWeight: true },
        },
      },
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (sale.cancelledAt != null) {
      return NextResponse.json({ success: true, message: 'Venda coletiva já cancelada', status: 'CANCELLED' });
    }

    if (sale.soldAt != null) {
      return apiErrorResponse({ message: 'Venda coletiva já concluída', code: 'COLLECTIVE_SALE_SOLD', status: 409, requestId: context.requestId });
    }

    if (sale.creatorCooperativeId.toString() !== session.cooperativeId && session.role !== 'admin') {
      return apiErrorResponse({ message: 'Apenas o criador pode cancelar a venda coletiva', code: 'CANCEL_FORBIDDEN', status: 403, requestId: context.requestId });
    }

    const materialId = sale.materialId;
    const contributions = sale.contributions;

    await prisma.$transaction(async (tx) => {
      for (const c of contributions) {
        await adjustStock(tx, {
          cooperativeId: c.cooperativeId,
          materialId,
          deltaKg: c.contributedWeight!.negated(),
        });
      }

      await tx.collectiveSale.update({
        where: { collectiveSaleId },
        data: { cancelledAt: new Date() },
      });
    });

    logInfo('collective-sales.cancel.succeeded', context, {
      role: session.role,
      collectiveSaleId: collectiveSaleId.toString(),
      cooperativeId: session.cooperativeId,
      stockReturned: contributions.length,
    });

    return NextResponse.json({ success: true, message: 'Venda coletiva cancelada com sucesso' });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao cancelar venda coletiva',
      code: 'COLLECTIVE_SALE_CANCEL_FAILED',
      context,
      event: 'collective-sales.cancel.failed',
      error,
    });
  }
}

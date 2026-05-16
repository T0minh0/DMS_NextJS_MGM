import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { adjustStock, lockStockAggregateForUpdate } from '@/lib/stock/ledger';
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

    const coopId = BigInt(session.cooperativeId);

    const sale = await prisma.collectiveSale.findUnique({
      where: { collectiveSaleId },
      select: { creatorCooperativeId: true, soldAt: true, cancelledAt: true, materialId: true },
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (sale.soldAt != null || sale.cancelledAt != null) {
      return apiErrorResponse({ message: 'Venda coletiva já encerrada', code: 'COLLECTIVE_SALE_CLOSED', status: 409, requestId: context.requestId });
    }

    if (sale.creatorCooperativeId === coopId) {
      return apiErrorResponse({ message: 'O criador não pode sair da venda coletiva — use o cancelamento', code: 'LEAVE_CREATOR_FORBIDDEN', status: 403, requestId: context.requestId });
    }

    const materialId = sale.materialId;

    const result = await prisma.$transaction(async (tx) => {
      // Lock stock first to prevent TOCTOU race with concurrent contribution PATCH
      await lockStockAggregateForUpdate(tx, coopId, materialId);

      const contribution = await tx.collectiveSaleContribution.findUnique({
        where: { collectiveSaleId_cooperativeId: { collectiveSaleId, cooperativeId: coopId } },
      });

      if (!contribution) {
        return apiErrorResponse({ message: 'Cooperativa não é participante desta venda coletiva', code: 'NOT_A_PARTICIPANT', status: 404, requestId: context.requestId });
      }

      if (contribution.status === 'LEFT') {
        return { idempotent: true as const };
      }

      if (contribution.status !== 'ACCEPTED') {
        return apiErrorResponse({ message: 'Apenas participantes aceitos podem sair', code: 'CONTRIBUTION_NOT_ACCEPTED', status: 409, requestId: context.requestId });
      }

      if (contribution.contributedWeight != null && contribution.contributedWeight.greaterThan(0)) {
        await adjustStock(tx, {
          cooperativeId: coopId,
          materialId,
          deltaKg: contribution.contributedWeight.negated(),
        });
      }

      return tx.collectiveSaleContribution.update({
        where: { collectiveSaleId_cooperativeId: { collectiveSaleId, cooperativeId: coopId } },
        data: { status: 'LEFT' },
      });
    });

    if (result instanceof Response) return result;

    if ('idempotent' in result) {
      return NextResponse.json({ success: true, message: 'Cooperativa já saiu da venda coletiva', status: 'LEFT' });
    }

    logInfo('collective-sales.leave.succeeded', context, {
      role: session.role,
      collectiveSaleId: collectiveSaleId.toString(),
      cooperativeId: session.cooperativeId,
    });

    return NextResponse.json({
      success: true,
      message: 'Saída da venda coletiva confirmada',
      contribution: {
        collective_sale_id: collectiveSaleId.toString(),
        cooperative_id: coopId.toString(),
        status: 'LEFT',
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao sair da venda coletiva',
      code: 'COLLECTIVE_SALE_LEAVE_FAILED',
      context,
      event: 'collective-sales.leave.failed',
      error,
    });
  }
}

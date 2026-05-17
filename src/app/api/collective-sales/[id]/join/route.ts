import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { lockCollectiveSaleForUpdate } from '@/lib/collective-sales/locks';
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

    const result = await prisma.$transaction(async (tx) => {
      const sale = await lockCollectiveSaleForUpdate(tx, collectiveSaleId);

      if (!sale) {
        return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
      }

      if (sale.soldAt != null || sale.cancelledAt != null) {
        return apiErrorResponse({ message: 'Venda coletiva já encerrada', code: 'COLLECTIVE_SALE_CLOSED', status: 409, requestId: context.requestId });
      }

      const contribution = await tx.collectiveSaleContribution.findUnique({
        where: { collectiveSaleId_cooperativeId: { collectiveSaleId, cooperativeId: coopId } },
      });

      if (!contribution) {
        return apiErrorResponse({ message: 'Nenhum convite encontrado para esta cooperativa', code: 'INVITE_NOT_FOUND', status: 404, requestId: context.requestId });
      }

      if (contribution.status === 'ACCEPTED') {
        return { idempotent: true as const };
      }

      if (contribution.status !== 'INVITED') {
        return apiErrorResponse({ message: 'Convite não está pendente', code: 'INVITE_NOT_PENDING', status: 409, requestId: context.requestId });
      }

      return tx.collectiveSaleContribution.update({
        where: { collectiveSaleId_cooperativeId: { collectiveSaleId, cooperativeId: coopId } },
        data: { status: 'ACCEPTED' },
      });
    });

    if (result instanceof Response) return result;

    if ('idempotent' in result) {
      return NextResponse.json({ success: true, message: 'Cooperativa já é participante', status: 'ACCEPTED' });
    }

    logInfo('collective-sales.join.succeeded', context, {
      role: session.role,
      collectiveSaleId: collectiveSaleId.toString(),
      cooperativeId: session.cooperativeId,
      contributionId: result.contributionId.toString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Entrada na venda coletiva confirmada',
      contribution: {
        contribution_id: result.contributionId.toString(),
        collective_sale_id: collectiveSaleId.toString(),
        cooperative_id: coopId.toString(),
        status: result.status,
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao entrar na venda coletiva',
      code: 'COLLECTIVE_SALE_JOIN_FAILED',
      context,
      event: 'collective-sales.join.failed',
      error,
    });
  }
}

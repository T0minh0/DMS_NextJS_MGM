import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse, readJsonBody } from '@/lib/api/errors';
import { adjustStock, lockStockAggregateForUpdate } from '@/lib/stock/ledger';
import { decimalToJsonNumber, formatDecimal, parseNonNegativeDecimal2 } from '@/lib/decimal';
import { Prisma } from '@prisma/client';
import { createLogContext, logInfo } from '@/lib/observability/logger';

export async function PATCH(
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

    const body = await readJsonBody(request);
    const raw = body as Record<string, unknown>;

    let newWeight: Prisma.Decimal;
    try {
      newWeight = parseNonNegativeDecimal2(raw.contributed_weight as string | number | null | undefined, 'contributed_weight');
    } catch {
      return apiErrorResponse({ message: 'contributed_weight deve ser maior ou igual a zero', code: 'INVALID_CONTRIBUTED_WEIGHT', status: 400, requestId: context.requestId });
    }

    const coopId = BigInt(session.cooperativeId);

    const sale = await prisma.collectiveSale.findUnique({
      where: { collectiveSaleId },
      select: { soldAt: true, cancelledAt: true, materialId: true },
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (sale.soldAt != null || sale.cancelledAt != null) {
      return apiErrorResponse({ message: 'Venda coletiva já encerrada', code: 'COLLECTIVE_SALE_CLOSED', status: 409, requestId: context.requestId });
    }

    const materialId = sale.materialId;

    const updated = await prisma.$transaction(async (tx) => {
      await lockStockAggregateForUpdate(tx, coopId, materialId);

      const contribution = await tx.collectiveSaleContribution.findUnique({
        where: { collectiveSaleId_cooperativeId: { collectiveSaleId, cooperativeId: coopId } },
      });

      if (!contribution) {
        return apiErrorResponse({ message: 'Cooperativa não é participante desta venda coletiva', code: 'NOT_A_PARTICIPANT', status: 404, requestId: context.requestId });
      }

      if (contribution.status !== 'ACCEPTED') {
        return apiErrorResponse({ message: 'Apenas participantes aceitos podem atualizar contribuição', code: 'CONTRIBUTION_NOT_ACCEPTED', status: 409, requestId: context.requestId });
      }

      const oldWeight = contribution.contributedWeight ?? new Prisma.Decimal(0);
      const delta = newWeight.minus(oldWeight);

      if (!delta.isZero()) {
        await adjustStock(tx, {
          cooperativeId: coopId,
          materialId,
          deltaKg: delta,
        });
      }

      return tx.collectiveSaleContribution.update({
        where: { collectiveSaleId_cooperativeId: { collectiveSaleId, cooperativeId: coopId } },
        data: { contributedWeight: formatDecimal(newWeight) },
      });
    });

    if (updated instanceof Response) return updated;

    logInfo('collective-sales.contribution.updated', context, {
      role: session.role,
      collectiveSaleId: collectiveSaleId.toString(),
      cooperativeId: session.cooperativeId,
      contributedWeight: newWeight.toString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Contribuição atualizada com sucesso',
      contribution: {
        contribution_id: updated.contributionId.toString(),
        collective_sale_id: collectiveSaleId.toString(),
        cooperative_id: coopId.toString(),
        status: updated.status,
        contributed_weight: updated.contributedWeight != null ? decimalToJsonNumber(updated.contributedWeight) : null,
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao atualizar contribuição',
      code: 'COLLECTIVE_SALE_CONTRIBUTION_UPDATE_FAILED',
      context,
      event: 'collective-sales.contribution.update.failed',
      error,
    });
  }
}

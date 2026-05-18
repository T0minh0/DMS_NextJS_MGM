import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { scopedSaleWhere } from '@/lib/auth/scoped-queries';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';
import { getSaleLifecycleStatus } from '@/lib/sales/lifecycle';

type SaleLockRow = {
  saleId: bigint;
};

async function lockScopedSaleForUpdate(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  session: Awaited<ReturnType<typeof requireManagerOrAdmin>>,
  saleId: bigint,
) {
  if (session.role === 'admin') {
    const rows = await tx.$queryRaw<SaleLockRow[]>`
      SELECT "Sale_id" AS "saleId"
      FROM "Sales"
      WHERE "Sale_id" = ${saleId}
      FOR UPDATE
    `;
    return rows.length > 0;
  }

  const rows = await tx.$queryRaw<SaleLockRow[]>`
    SELECT s."Sale_id" AS "saleId"
    FROM "Sales" s
    WHERE s."Sale_id" = ${saleId}
      AND s."cooperative_id" = ${BigInt(session.cooperativeId)}
    FOR UPDATE
  `;
  return rows.length > 0;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = createLogContext(request, { domain: 'sales', route: '/api/sales/[id]/cancel' });

  try {
    const session = await requireManagerOrAdmin();

    const { id: idParam } = await params;
    let saleId: bigint;
    try {
      saleId = BigInt(idParam);
    } catch {
      return apiErrorResponse({
        message: 'ID de venda inválido',
        code: 'INVALID_SALE_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    const existingSale = await prisma.sales.findFirst({
      where: scopedSaleWhere(session, saleId),
    });

    if (!existingSale) {
      return apiErrorResponse({
        message: 'Venda não encontrada',
        code: 'SALE_NOT_FOUND',
        status: 404,
        requestId: context.requestId,
      });
    }

    requireScopedPermission(session, 'sales', 'update', 'cooperative');

    const transactionResult = await prisma.$transaction(async (tx) => {
      const locked = await lockScopedSaleForUpdate(tx, session, saleId);
      if (!locked) {
        return { status: 'not_found' as const };
      }

      const lockedSale = await tx.sales.findFirst({
        where: scopedSaleWhere(session, saleId),
      });

      if (!lockedSale) {
        return { status: 'not_found' as const };
      }

      const lifecycleStatus = getSaleLifecycleStatus(lockedSale);

      if (lifecycleStatus === 'CANCELLED') {
        // idempotent: already cancelled
        return { status: 'already_cancelled' as const, cooperativeId: lockedSale.cooperativeId };
      }

      if (lifecycleStatus === 'SOLD') {
        return { status: 'already_sold' as const };
      }

      const cancelledAt = new Date();
      await tx.sales.update({
        where: { saleId },
        data: { cancelledAt },
      });

      return {
        status: 'cancelled' as const,
        cooperativeId: lockedSale.cooperativeId,
        cancelledAt,
      };
    });

    if (transactionResult.status === 'not_found') {
      return apiErrorResponse({
        message: 'Venda não encontrada',
        code: 'SALE_NOT_FOUND',
        status: 404,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'already_sold') {
      logWarn('sales.cancel.already_sold', context, {
        saleId: saleId.toString(),
      });
      return apiErrorResponse({
        message: 'Venda já concluída não pode ser cancelada',
        code: 'SALE_ALREADY_SOLD',
        status: 409,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'already_cancelled') {
      logInfo('sales.cancel.idempotent', context, {
        saleId: saleId.toString(),
        cooperativeId: transactionResult.cooperativeId.toString(),
      });
      return NextResponse.json({ success: true, message: 'Venda já estava cancelada' });
    }

    logInfo('sales.cancel.succeeded', context, {
      role: session.role,
      saleId: saleId.toString(),
      cooperativeId: transactionResult.cooperativeId.toString(),
      cancelledAt: transactionResult.cancelledAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Venda cancelada com sucesso',
      cancelled_at: transactionResult.cancelledAt.toISOString(),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao cancelar venda',
      code: 'SALES_CANCEL_FAILED',
      context,
      event: 'sales.cancel.failed',
      error,
    });
  }
}

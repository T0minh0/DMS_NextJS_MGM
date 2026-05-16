import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import {
  lockStockAggregateForUpdate,
  updateLockedStockAggregate,
  StockDomainError,
} from '@/lib/stock/ledger';
import {
  decimalToJsonNumber,
  formatDecimal,
} from '@/lib/decimal';
import { createLogContext, logInfo } from '@/lib/observability/logger';

class AlreadyCompletedError extends Error {}
class NoContributionsError extends Error {}
// Thrown when the last revenue-share calculation produces a negative value,
// indicating that intermediate rounding (ROUND_HALF_UP) exceeded totalRevenue.
class RevenueShareArithmeticError extends Error {
  constructor(public readonly detail: object) {
    super('Revenue distribution produced negative last share');
  }
}

// Distributes revenue to N contributions using the "last remainder" method so
// that sum(revenueShare) == totalRevenue exactly (2 dp, ROUND_HALF_UP).
// Contributions must be ordered consistently (e.g. cooperativeId asc) before
// calling; the last entry absorbs any rounding residual.
function distributeRevenue(
  contributions: { contributionId: bigint; cooperativeId: bigint; contributedWeight: Prisma.Decimal }[],
  priceKg: Prisma.Decimal,
  totalWeight: Prisma.Decimal,
): Map<bigint, Prisma.Decimal> {
  const totalRevenue = totalWeight
    .times(priceKg)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const shares = new Map<bigint, Prisma.Decimal>();
  let runningSum = new Prisma.Decimal(0);
  const N = contributions.length;

  for (let i = 0; i < N; i++) {
    const c = contributions[i];
    let share: Prisma.Decimal;
    if (i === N - 1) {
      share = totalRevenue.minus(runningSum);
      if (share.lessThan(0)) {
        throw new RevenueShareArithmeticError({
          totalRevenue: totalRevenue.toFixed(2),
          runningSum: runningSum.toFixed(2),
          N,
          priceKg: priceKg.toString(),
        });
      }
    } else {
      share = c.contributedWeight
        .times(priceKg)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      runningSum = runningSum.plus(share);
    }
    shares.set(c.contributionId, share);
  }

  return shares;
}

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
        priceKg: true,
        totalWeight: true,
        contributions: {
          where: { status: 'ACCEPTED' },
          select: {
            contributionId: true,
            cooperativeId: true,
            contributedWeight: true,
            revenueShare: true,
            cooperative: { select: { cooperativeName: true } },
          },
          orderBy: { contributionId: 'asc' },
        },
      },
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (sale.cancelledAt != null) {
      return apiErrorResponse({ message: 'Venda coletiva cancelada não pode ser concluída', code: 'COLLECTIVE_SALE_CANCELLED', status: 409, requestId: context.requestId });
    }

    // Auth check before the idempotent path — the soldAt payload includes
    // financial data (revenue_share, contributed_weight) from all cooperatives,
    // which must not leak to unauthorized callers.
    if (sale.creatorCooperativeId.toString() !== session.cooperativeId && session.role !== 'admin') {
      return apiErrorResponse({ message: 'Apenas o criador pode concluir a venda coletiva', code: 'COMPLETE_FORBIDDEN', status: 403, requestId: context.requestId });
    }

    if (sale.soldAt != null) {
      return NextResponse.json({
        success: true,
        message: 'Venda coletiva já concluída',
        status: 'SOLD',
        collective_sale: {
          _id: collectiveSaleId.toString(),
          sold_at: sale.soldAt.toISOString(),
          total_weight: sale.totalWeight != null ? decimalToJsonNumber(sale.totalWeight) : null,
          participants: sale.contributions.map((c) => ({
            cooperative_id: c.cooperativeId.toString(),
            cooperative_name: c.cooperative.cooperativeName,
            contributed_weight: c.contributedWeight != null ? decimalToJsonNumber(c.contributedWeight) : null,
            revenue_share: c.revenueShare != null ? decimalToJsonNumber(c.revenueShare) : null,
          })),
        },
      });
    }

    const priceKg = sale.priceKg;
    const materialId = sale.materialId;

    await prisma.$transaction(async (tx) => {
      // orderBy cooperativeId for deterministic stock-lock ordering across
      // concurrent completions — prevents deadlock when multiple sales share
      // some of the same cooperative participants.
      const contributions = await tx.collectiveSaleContribution.findMany({
        where: {
          collectiveSaleId,
          status: 'ACCEPTED',
          contributedWeight: { not: null, gt: 0 },
        },
        select: { contributionId: true, cooperativeId: true, contributedWeight: true },
        orderBy: { cooperativeId: 'asc' },
      });

      const totalWeight = contributions.reduce(
        (sum, c) => sum.plus(c.contributedWeight!),
        new Prisma.Decimal(0),
      );

      if (totalWeight.isZero()) {
        throw new NoContributionsError();
      }

      // Atomically claim completion — concurrent callers get count=0 → AlreadyCompletedError.
      const claimed = await tx.collectiveSale.updateMany({
        where: { collectiveSaleId, soldAt: null, cancelledAt: null },
        data: {
          soldAt: new Date(),
          totalWeight: formatDecimal(totalWeight),
        },
      });

      if (claimed.count === 0) {
        throw new AlreadyCompletedError();
      }

      const revenueShares = distributeRevenue(
        contributions as { contributionId: bigint; cooperativeId: bigint; contributedWeight: Prisma.Decimal }[],
        priceKg,
        totalWeight,
      );

      for (const c of contributions) {
        const share = revenueShares.get(c.contributionId)!;

        await tx.collectiveSaleContribution.update({
          where: { contributionId: c.contributionId },
          data: { revenueShare: formatDecimal(share) },
        });

        // Finalize stock: reservation → sold.
        // adjustStock(+weight) already decremented currentStockKg at contribution time.
        // Incrementing totalSoldKg without touching currentStockKg preserves:
        //   currentStockKg <= totalCollectedKg - totalSoldKg
        const locked = await lockStockAggregateForUpdate(tx, c.cooperativeId, materialId);
        if (!locked) {
          throw new StockDomainError('STOCK_MISSING', 'Estoque não encontrado', {
            cooperativeId: c.cooperativeId,
            materialId,
          });
        }

        await updateLockedStockAggregate(tx, locked, {
          currentStockKg: locked.currentStockKg,
          totalSoldKg: locked.totalSoldKg.plus(c.contributedWeight!),
        });
      }
    });

    logInfo('collective-sales.complete.succeeded', context, {
      role: session.role,
      collectiveSaleId: collectiveSaleId.toString(),
      cooperativeId: session.cooperativeId,
    });

    const completed = await prisma.collectiveSale.findUnique({
      where: { collectiveSaleId },
      select: {
        soldAt: true,
        totalWeight: true,
        contributions: {
          where: { status: 'ACCEPTED' },
          select: {
            cooperativeId: true,
            contributedWeight: true,
            revenueShare: true,
            cooperative: { select: { cooperativeName: true } },
          },
          orderBy: { contributionId: 'asc' },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Venda coletiva concluída com sucesso',
      collective_sale: {
        _id: collectiveSaleId.toString(),
        sold_at: completed!.soldAt!.toISOString(),
        total_weight: completed!.totalWeight != null ? decimalToJsonNumber(completed!.totalWeight) : null,
        participants: completed!.contributions.map((c) => ({
          cooperative_id: c.cooperativeId.toString(),
          cooperative_name: c.cooperative.cooperativeName,
          contributed_weight: c.contributedWeight != null ? decimalToJsonNumber(c.contributedWeight) : null,
          revenue_share: c.revenueShare != null ? decimalToJsonNumber(c.revenueShare) : null,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AlreadyCompletedError) {
      return NextResponse.json({ success: true, message: 'Venda coletiva já concluída', status: 'SOLD' });
    }

    if (error instanceof NoContributionsError) {
      return apiErrorResponse({ message: 'Nenhuma contribuição de peso registrada', code: 'NO_CONTRIBUTIONS', status: 409, requestId: context.requestId });
    }

    if (error instanceof RevenueShareArithmeticError) {
      return apiInternalErrorResponse({
        message: 'Erro no cálculo de distribuição de receita',
        code: 'REVENUE_SHARE_ARITHMETIC_ERROR',
        context,
        event: 'collective-sales.complete.revenue-arithmetic-error',
        error,
        metadata: error.detail as Record<string, unknown>,
      });
    }

    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao concluir venda coletiva',
      code: 'COLLECTIVE_SALE_COMPLETE_FAILED',
      context,
      event: 'collective-sales.complete.failed',
      error,
    });
  }
}

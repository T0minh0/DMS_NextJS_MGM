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
import { lockCollectiveSaleForUpdate } from '@/lib/collective-sales/locks';
import {
  decimalToJsonNumber,
  formatDecimal,
} from '@/lib/decimal';
import { createLogContext, logInfo } from '@/lib/observability/logger';

class AlreadyCompletedError extends Error {}
class CollectiveSaleMissingDuringTransactionError extends Error {}
class ConcurrentlyCancelledError extends Error {}
class NoContributionsError extends Error {}

const CENT = new Prisma.Decimal('0.01');

// Distributes revenue using largest remainder in cents so that
// sum(revenueShare) == totalRevenue exactly without negative last shares.
function distributeRevenue(
  contributions: { contributionId: bigint; cooperativeId: bigint; contributedWeight: Prisma.Decimal }[],
  priceKg: Prisma.Decimal,
  totalWeight: Prisma.Decimal,
): Map<bigint, Prisma.Decimal> {
  const totalRevenue = totalWeight
    .times(priceKg)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const shares = new Map<bigint, Prisma.Decimal>();

  const candidates = contributions.map((contribution) => {
    const exactShare = contribution.contributedWeight.times(priceKg);
    const baseShare = exactShare.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    shares.set(contribution.contributionId, baseShare);

    return {
      contributionId: contribution.contributionId,
      cooperativeId: contribution.cooperativeId,
      remainder: exactShare.minus(baseShare),
    };
  });

  const allocated = [...shares.values()].reduce(
    (sum, share) => sum.plus(share),
    new Prisma.Decimal(0),
  );
  let residual = totalRevenue.minus(allocated);

  const byLargestRemainder = [...candidates].sort((a, b) => {
    const remainderOrder = b.remainder.comparedTo(a.remainder);
    if (remainderOrder !== 0) return remainderOrder;
    if (a.cooperativeId !== b.cooperativeId) {
      return a.cooperativeId < b.cooperativeId ? -1 : 1;
    }
    if (a.contributionId !== b.contributionId) {
      return a.contributionId < b.contributionId ? -1 : 1;
    }
    return 0;
  });

  for (const candidate of byLargestRemainder) {
    if (!residual.greaterThan(0)) break;

    shares.set(candidate.contributionId, shares.get(candidate.contributionId)!.plus(CENT));
    residual = residual.minus(CENT);
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

    await prisma.$transaction(async (tx) => {
      const lockedSale = await lockCollectiveSaleForUpdate(tx, collectiveSaleId);

      if (!lockedSale) {
        throw new CollectiveSaleMissingDuringTransactionError();
      }

      if (lockedSale?.cancelledAt != null) {
        throw new ConcurrentlyCancelledError();
      }

      if (lockedSale?.soldAt != null) {
        throw new AlreadyCompletedError();
      }

      const priceKg = lockedSale.priceKg;
      const materialId = lockedSale.materialId;

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

    if (error instanceof CollectiveSaleMissingDuringTransactionError) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (error instanceof ConcurrentlyCancelledError) {
      return apiErrorResponse({ message: 'Venda coletiva cancelada não pode ser concluída', code: 'COLLECTIVE_SALE_CANCELLED', status: 409, requestId: context.requestId });
    }

    if (error instanceof NoContributionsError) {
      return apiErrorResponse({ message: 'Nenhuma contribuição de peso registrada', code: 'NO_CONTRIBUTIONS', status: 409, requestId: context.requestId });
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

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  determineTargetWorker,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToNumber } from '@/lib/db-utils';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';
import { getSaleLifecycleStatus, summarizeSoldSales } from '@/lib/sales/lifecycle';
import { lockStockAggregateForUpdate, updateLockedStockAggregate } from '@/lib/stock/ledger';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('material_id');
    const cooperativeId = searchParams.get('cooperative_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = Number.parseInt(searchParams.get('limit') || '100', 10);

    const where: Prisma.SalesWhereInput = {};
    const targetCooperativeId = determineTargetCooperative(session, cooperativeId);
    requireScopedPermission(
      session,
      'sales',
      'read',
      targetCooperativeId ? 'cooperative' : 'global',
    );

    if (materialId) {
      try {
        where.material = BigInt(materialId);
      } catch {
        return apiErrorResponse({
          message: 'Material inválido',
          code: 'INVALID_MATERIAL',
          status: 400,
          requestId: context.requestId,
        });
      }
    }

    if (targetCooperativeId) {
      where.cooperativeId = BigInt(targetCooperativeId);
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const start = new Date(startDate);
        if (Number.isNaN(start.getTime())) {
          return apiErrorResponse({
            message: 'Data inicial inválida',
            code: 'INVALID_START_DATE',
            status: 400,
            requestId: context.requestId,
          });
        }
        where.date.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          return apiErrorResponse({
            message: 'Data final inválida',
            code: 'INVALID_END_DATE',
            status: 400,
            requestId: context.requestId,
          });
        }
        where.date.lte = end;
      }
    }

    const sales = await prisma.sales.findMany({
      where,
      include: {
        materialRef: true,
        buyerRef: true,
        responsibleRef: true,
      },
      orderBy: { date: 'desc' },
      take: Number.isNaN(limit) ? 100 : limit,
    });

    const formattedSales = sales.map((sale) => {
      const price = decimalToNumber(sale.priceKg) ?? 0;
      const weight = decimalToNumber(sale.weight) ?? 0;
      return {
        _id: sale.saleId.toString(),
        material_id: sale.material.toString(),
        cooperative_id: sale.cooperativeId.toString(),
        status: getSaleLifecycleStatus(sale),
        'price/kg': Number(price.toFixed(2)),
        weight_sold: Number(weight.toFixed(2)),
        date: sale.date.toISOString(),
        created_at: sale.createdAt.toISOString(),
        sold_at: sale.soldAt?.toISOString() ?? null,
        cancelled_at: sale.cancelledAt?.toISOString() ?? null,
        expected_sale_date: sale.expectedSaleDate.toISOString(),
        Buyer: sale.buyerRef.buyerName,
      };
    });

    const totalSales = formattedSales.length;
    const soldSummary = summarizeSoldSales(formattedSales);

    logInfo('sales.read.succeeded', context, {
      role: session.role,
      cooperativeId: targetCooperativeId,
      totalSales,
      totalSoldSales: soldSummary.totalSoldSales,
      totalWeight: soldSummary.totalWeight,
    });

    return NextResponse.json({
      sales: formattedSales,
      summary: {
        totalSales,
        totalSoldSales: soldSummary.totalSoldSales,
        totalWeight: soldSummary.totalWeight,
        totalValue: soldSummary.totalValue,
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Failed to fetch sales',
      code: 'SALES_READ_FAILED',
      context,
      event: 'sales.read.failed',
      error,
    });
  }
}

export async function POST(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    const body = await request.json();
    const targetCooperativeId = determineTargetCooperative(
      session,
      body.cooperative_id ?? session.cooperativeId,
      { required: true },
    );
    const targetWorkerId = determineTargetWorker(
      session,
      session.role === 'admin' ? body.responsible_worker_id ?? session.workerId : session.workerId,
      { required: true },
    );
    requireScopedPermission(session, 'sales', 'create', 'cooperative');

    const requiredFields = ['material_id', 'price/kg', 'weight_sold', 'date', 'Buyer'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return apiErrorResponse({
          message: `Campo obrigatório: ${field}`,
          code: 'REQUIRED_FIELD',
          status: 400,
          requestId: context.requestId,
        });
      }
    }

    let targetCooperativeBigInt: bigint;
    try {
      targetCooperativeBigInt = BigInt(targetCooperativeId);
    } catch {
      return apiErrorResponse({
        message: 'Cooperativa inválida',
        code: 'INVALID_COOPERATIVE',
        status: 400,
        requestId: context.requestId,
      });
    }

    let materialId: bigint;
    try {
      materialId = BigInt(body.material_id);
    } catch {
      return apiErrorResponse({
        message: 'Material inválido',
        code: 'INVALID_MATERIAL',
        status: 400,
        requestId: context.requestId,
      });
    }

    const pricePerKg = Number(body['price/kg']);
    const weightSold = Number(body.weight_sold);
    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
      return apiErrorResponse({
        message: 'Preço por kg deve ser maior que zero',
        code: 'INVALID_PRICE',
        status: 400,
        requestId: context.requestId,
      });
    }
    if (!Number.isFinite(weightSold) || weightSold <= 0) {
      return apiErrorResponse({
        message: 'Peso vendido deve ser maior que zero',
        code: 'INVALID_WEIGHT',
        status: 400,
        requestId: context.requestId,
      });
    }

    const saleDate = new Date(body.date);
    if (Number.isNaN(saleDate.getTime())) {
      return apiErrorResponse({
        message: 'Data inválida',
        code: 'INVALID_DATE',
        status: 400,
        requestId: context.requestId,
      });
    }

    const buyerName = body.Buyer?.trim();
    if (!buyerName) {
      return apiErrorResponse({
        message: 'Comprador é obrigatório',
        code: 'REQUIRED_BUYER',
        status: 400,
        requestId: context.requestId,
      });
    }

    const responsibleWorker = await prisma.workers.findUnique({
      where: { workerId: BigInt(targetWorkerId) },
      select: { workerId: true, cooperative: true },
    });

    if (!responsibleWorker || responsibleWorker.cooperative.toString() !== targetCooperativeId) {
      logWarn('sales.create.scope_denied', context, {
        role: session.role,
        cooperativeId: targetCooperativeId,
        targetWorkerId,
      });
      return apiErrorResponse({
        message: 'Responsável fora do escopo da cooperativa',
        code: 'RESPONSIBLE_SCOPE_DENIED',
        status: 403,
        requestId: context.requestId,
      });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const stockRecord = await lockStockAggregateForUpdate(
        tx,
        targetCooperativeBigInt,
        materialId,
      );

      if (!stockRecord) {
        return { status: 'stock_missing' as const };
      }

      const currentStock = stockRecord.currentStockKg;
      if (weightSold > currentStock) {
        return {
          status: 'insufficient_stock' as const,
          currentStock,
        };
      }

      let buyer = await tx.buyers.findFirst({
        where: {
          buyerName: {
            equals: buyerName,
            mode: 'insensitive',
          },
        },
      });

      if (!buyer) {
        buyer = await tx.buyers.create({
          data: {
            buyerName,
          },
        });
      }

      const sale = await tx.sales.create({
        data: {
          material: materialId,
          priceKg: pricePerKg.toFixed(2),
          weight: weightSold.toFixed(2),
          date: saleDate,
          buyer: buyer.buyerId,
          responsible: responsibleWorker.workerId,
          cooperativeId: targetCooperativeBigInt,
          expectedSaleDate: saleDate,
          soldAt: saleDate,
        },
      });

      const totalSold = stockRecord.totalSoldKg + weightSold;
      const newCurrentStock = currentStock - weightSold;

      await updateLockedStockAggregate(tx, stockRecord, {
        totalSoldKg: totalSold,
        currentStockKg: newCurrentStock,
      });

      return {
        status: 'created' as const,
        sale,
        buyerName: buyer.buyerName,
        newCurrentStock,
        duplicateStockRows: stockRecord.duplicateStockIds.length,
      };
    });

    if (transactionResult.status === 'stock_missing') {
      logWarn('sales.create.stock_missing', context, {
        cooperativeId: targetCooperativeId,
        materialId: materialId.toString(),
      });
      return apiErrorResponse({
        message: 'Não há estoque registrado para este material nesta cooperativa',
        code: 'STOCK_MISSING',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'insufficient_stock') {
      logWarn('sales.create.insufficient_stock', context, {
        cooperativeId: targetCooperativeId,
        materialId: materialId.toString(),
        requestedWeight: weightSold,
        availableWeight: Number(transactionResult.currentStock.toFixed(2)),
      });
      return apiErrorResponse({
        message: `Estoque insuficiente! Disponível: ${transactionResult.currentStock.toFixed(2)} kg`,
        code: 'INSUFFICIENT_STOCK',
        status: 400,
        requestId: context.requestId,
      });
    }

    logInfo('sales.create.succeeded', context, {
      role: session.role,
      saleId: transactionResult.sale.saleId.toString(),
      cooperativeId: targetCooperativeId,
      materialId: materialId.toString(),
      weightSold,
      newCurrentStock: Number(transactionResult.newCurrentStock.toFixed(2)),
      duplicateStockRows: transactionResult.duplicateStockRows,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Venda registrada com sucesso',
        sale: {
          _id: transactionResult.sale.saleId.toString(),
          material_id: transactionResult.sale.material.toString(),
          cooperative_id: targetCooperativeId,
          status: getSaleLifecycleStatus(transactionResult.sale),
          'price/kg': pricePerKg,
          weight_sold: weightSold,
          date: transactionResult.sale.date.toISOString(),
          created_at: transactionResult.sale.createdAt.toISOString(),
          sold_at: transactionResult.sale.soldAt?.toISOString() ?? null,
          cancelled_at: transactionResult.sale.cancelledAt?.toISOString() ?? null,
          expected_sale_date: transactionResult.sale.expectedSaleDate.toISOString(),
          Buyer: transactionResult.buyerName,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao registrar venda',
      code: 'SALES_CREATE_FAILED',
      context,
      event: 'sales.create.failed',
      error,
    });
  }
}

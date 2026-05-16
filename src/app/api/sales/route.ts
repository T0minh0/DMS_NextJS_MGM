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
import { decimalToJsonNumber, formatDecimal, parsePositiveDecimal2 } from '@/lib/decimal';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';
import { getSaleLifecycleStatus, summarizeSoldSales } from '@/lib/sales/lifecycle';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('material_id');
    const cooperativeId = searchParams.get('cooperative_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const statusFilter = searchParams.get('status');
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

    if (statusFilter === 'ACTIVE') {
      where.soldAt = null;
      where.cancelledAt = null;
    } else if (statusFilter === 'HISTORY') {
      where.soldAt = { not: null };
      where.cancelledAt = null;
    } else if (statusFilter === 'CANCELLED') {
      where.soldAt = null;
      where.cancelledAt = { not: null };
    } else if (statusFilter !== null && statusFilter !== undefined && statusFilter !== '') {
      return apiErrorResponse({
        message: 'Status inválido. Use ACTIVE, HISTORY ou CANCELLED',
        code: 'INVALID_STATUS_FILTER',
        status: 400,
        requestId: context.requestId,
      });
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
      if (body[field] === undefined || body[field] === null || body[field] === '') {
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

    let pricePerKg: Prisma.Decimal;
    try {
      pricePerKg = parsePositiveDecimal2(body['price/kg'], 'price/kg');
    } catch {
      return apiErrorResponse({
        message: 'Preço por kg deve ser maior que zero e ter no máximo 2 casas decimais',
        code: 'INVALID_PRICE',
        status: 400,
        requestId: context.requestId,
      });
    }

    let weightSold: Prisma.Decimal;
    try {
      weightSold = parsePositiveDecimal2(body.weight_sold, 'weight_sold');
    } catch {
      return apiErrorResponse({
        message: 'Peso vendido deve ser maior que zero e ter no máximo 2 casas decimais',
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

    const sale = await prisma.$transaction(async (tx) => {
      let buyer = await tx.buyers.findFirst({
        where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
      });

      if (!buyer) {
        try {
          buyer = await tx.buyers.create({ data: { buyerName } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            buyer = await tx.buyers.findFirst({
              where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
            });
            if (!buyer) throw e;
          } else {
            throw e;
          }
        }
      }

      return tx.sales.create({
        data: {
          material: materialId,
          priceKg: formatDecimal(pricePerKg),
          weight: formatDecimal(weightSold),
          date: saleDate,
          buyer: buyer.buyerId,
          responsible: responsibleWorker.workerId,
          cooperativeId: targetCooperativeBigInt,
          expectedSaleDate: saleDate,
        },
        include: { buyerRef: true },
      });
    });

    logInfo('sales.create.succeeded', context, {
      role: session.role,
      saleId: sale.saleId.toString(),
      cooperativeId: targetCooperativeId,
      materialId: materialId.toString(),
      weightSold: decimalToJsonNumber(weightSold),
      status: 'ACTIVE',
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Venda criada com sucesso',
        sale: {
          _id: sale.saleId.toString(),
          material_id: sale.material.toString(),
          cooperative_id: targetCooperativeId,
          status: getSaleLifecycleStatus(sale),
          'price/kg': decimalToJsonNumber(pricePerKg),
          weight_sold: decimalToJsonNumber(weightSold),
          date: sale.date.toISOString(),
          created_at: sale.createdAt.toISOString(),
          sold_at: sale.soldAt?.toISOString() ?? null,
          cancelled_at: sale.cancelledAt?.toISOString() ?? null,
          expected_sale_date: sale.expectedSaleDate.toISOString(),
          Buyer: sale.buyerRef.buyerName,
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

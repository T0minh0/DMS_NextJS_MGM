import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { scopedSaleWhere } from '@/lib/auth/scoped-queries';
import {
  decimalToJsonNumber,
  formatDecimal,
  parsePositiveDecimal2,
} from '@/lib/decimal';
import { createLogContext, logInfo } from '@/lib/observability/logger';
import { getActiveSaleMutationGuard } from '@/lib/sales/lifecycle';

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = createLogContext(request, { domain: 'sales' });

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
      include: {
        buyerRef: true,
      },
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

    const body = await request.json();

    const requiredFields = ['price/kg', 'weight_sold', 'date', 'Buyer'];
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

    let newMaterialId: bigint;
    try {
      newMaterialId = BigInt(body.material_id ?? existingSale.material.toString());
    } catch {
      return apiErrorResponse({
        message: 'Material inválido',
        code: 'INVALID_MATERIAL',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (newMaterialId !== existingSale.material) {
      return apiErrorResponse({
        message: 'Material da venda não pode ser alterado neste momento',
        code: 'SALE_MATERIAL_IMMUTABLE',
        status: 400,
        requestId: context.requestId,
      });
    }

    let pricePerKg: ReturnType<typeof parsePositiveDecimal2>;
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

    let weightSold: ReturnType<typeof parsePositiveDecimal2>;
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

    const transactionResult = await prisma.$transaction(async (tx) => {
      const locked = await lockScopedSaleForUpdate(tx, session, saleId);

      if (!locked) {
        return { status: 'not_found' as const };
      }

      const lockedSale = await tx.sales.findFirst({
        where: scopedSaleWhere(session, saleId),
        include: { buyerRef: true },
      });

      if (!lockedSale) {
        return { status: 'not_found' as const };
      }

      requireScopedPermission(session, 'sales', 'update', 'cooperative');

      if (newMaterialId !== lockedSale.material) {
        return { status: 'material_immutable' as const };
      }

      const lifecycleGuard = getActiveSaleMutationGuard(lockedSale);
      if (!lifecycleGuard.allowed) {
        return {
          status: 'lifecycle_locked' as const,
          lifecycleStatus: lifecycleGuard.status,
        };
      }

      let buyer = lockedSale.buyerRef;
      if (buyerName.toLowerCase() !== lockedSale.buyerRef.buyerName.toLowerCase()) {
        const existing = await tx.buyers.findFirst({
          where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
        });
        if (existing) {
          buyer = existing;
        } else {
          try {
            buyer = await tx.buyers.create({ data: { buyerName } });
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
              const raced = await tx.buyers.findFirst({
                where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
              });
              if (!raced) throw e;
              buyer = raced;
            } else {
              throw e;
            }
          }
        }
      }

      await tx.sales.update({
        where: { saleId },
        data: {
          priceKg: formatDecimal(pricePerKg),
          weight: formatDecimal(weightSold),
          date: saleDate,
          expectedSaleDate: saleDate,
          buyer: buyer.buyerId,
        },
      });

      return {
        status: 'updated' as const,
        cooperativeId: lockedSale.cooperativeId,
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

    if (transactionResult.status === 'material_immutable') {
      return apiErrorResponse({
        message: 'Material da venda não pode ser alterado neste momento',
        code: 'SALE_MATERIAL_IMMUTABLE',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'lifecycle_locked') {
      return apiErrorResponse({
        message: 'Apenas vendas ativas podem ser editadas. Use /complete ou /cancel para concluir ou cancelar.',
        code: 'SALE_LIFECYCLE_LOCKED',
        status: 409,
        requestId: context.requestId,
      });
    }

    logInfo('sales.update.succeeded', context, {
      role: session.role,
      saleId: saleId.toString(),
      cooperativeId: transactionResult.cooperativeId.toString(),
      weightSold: decimalToJsonNumber(weightSold),
    });

    return NextResponse.json({
      success: true,
      message: 'Venda atualizada com sucesso',
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao atualizar venda',
      code: 'SALES_UPDATE_FAILED',
      context,
      event: 'sales.update.failed',
      error,
    });
  }
}

export async function DELETE(
  request: NextRequest,
) {
  const context = createLogContext(request, { domain: 'sales' });
  const response = apiErrorResponse({
    message: 'Exclusão destrutiva de vendas foi removida. Use PATCH /api/sales/{id}/cancel para cancelar.',
    code: 'METHOD_NOT_ALLOWED',
    status: 405,
    requestId: context.requestId,
  });
  response.headers.set('Allow', 'GET, PUT, PATCH');
  return response;
}

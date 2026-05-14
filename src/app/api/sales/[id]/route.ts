import { NextRequest, NextResponse } from 'next/server';
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
  parseDecimal2,
  parsePositiveDecimal2,
} from '@/lib/decimal';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';
import { getLegacyStockMutationGuard } from '@/lib/sales/lifecycle';
import { lockStockAggregateForUpdate, updateLockedStockAggregate } from '@/lib/stock/ledger';

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
        include: {
          buyerRef: true,
        },
      });

      if (!lockedSale) {
        return { status: 'not_found' as const };
      }

      requireScopedPermission(session, 'sales', 'update', 'cooperative');

      if (newMaterialId !== lockedSale.material) {
        return { status: 'material_immutable' as const };
      }

      const lifecycleGuard = getLegacyStockMutationGuard(lockedSale);
      if (!lifecycleGuard.allowed) {
        return {
          status: 'lifecycle_locked' as const,
          lifecycleStatus: lifecycleGuard.status,
        };
      }

      const stockRecord = await lockStockAggregateForUpdate(
        tx,
        lockedSale.cooperativeId,
        lockedSale.material,
      );

      if (!stockRecord) {
        return {
          status: 'stock_missing' as const,
          cooperativeId: lockedSale.cooperativeId,
          materialId: lockedSale.material,
        };
      }

      const existingWeight = parseDecimal2(lockedSale.weight, 'existingSaleWeight');
      const currentStock = stockRecord.currentStockKg;
      const availableStock = currentStock.plus(existingWeight);

      if (weightSold.greaterThan(availableStock)) {
        return {
          status: 'insufficient_stock' as const,
          cooperativeId: lockedSale.cooperativeId,
          availableStock,
        };
      }

      let buyer = lockedSale.buyerRef;
      if (buyerName.toLowerCase() !== lockedSale.buyerRef.buyerName.toLowerCase()) {
        buyer = (await tx.buyers.findFirst({
          where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
        })) || (await tx.buyers.create({ data: { buyerName } }));
      }

      const updatedTotalSold =
        stockRecord.totalSoldKg.minus(existingWeight).plus(weightSold);
      const updatedCurrentStock = availableStock.minus(weightSold);

      if (updatedTotalSold.lessThan(0) || updatedCurrentStock.lessThan(0)) {
        return {
          status: 'stock_invariant_violation' as const,
          cooperativeId: lockedSale.cooperativeId,
        };
      }

      await tx.sales.update({
        where: { saleId },
        data: {
          priceKg: formatDecimal(pricePerKg),
          weight: formatDecimal(weightSold),
          date: saleDate,
          expectedSaleDate: saleDate,
          soldAt: lockedSale.soldAt ? saleDate : lockedSale.soldAt,
          buyer: buyer.buyerId,
        },
      });

      await updateLockedStockAggregate(tx, stockRecord, {
        totalSoldKg: updatedTotalSold,
        currentStockKg: updatedCurrentStock,
      });

      return {
        status: 'updated' as const,
        cooperativeId: lockedSale.cooperativeId,
        updatedCurrentStock,
        duplicateStockRows: stockRecord.duplicateStockIds.length,
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
        message: 'Venda ativa ou cancelada deve ser alterada pelos endpoints de lifecycle',
        code: 'SALE_LIFECYCLE_LOCKED',
        status: 409,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'stock_missing') {
      logWarn('sales.update.stock_missing', context, {
        saleId: saleId.toString(),
        cooperativeId: transactionResult.cooperativeId.toString(),
        materialId: transactionResult.materialId.toString(),
      });
      return apiErrorResponse({
        message: 'Não há estoque registrado para este material nesta cooperativa',
        code: 'STOCK_MISSING',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'insufficient_stock') {
      logWarn('sales.update.insufficient_stock', context, {
        saleId: saleId.toString(),
        cooperativeId: transactionResult.cooperativeId.toString(),
        requestedWeight: decimalToJsonNumber(weightSold),
        availableWeight: decimalToJsonNumber(transactionResult.availableStock),
      });
      return apiErrorResponse({
        message: `Estoque insuficiente! Disponível: ${formatDecimal(transactionResult.availableStock)} kg`,
        code: 'INSUFFICIENT_STOCK',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'stock_invariant_violation') {
      logWarn('sales.update.stock_invariant_violation', context, {
        saleId: saleId.toString(),
        cooperativeId: transactionResult.cooperativeId.toString(),
      });
      return apiErrorResponse({
        message: 'Inconsistência de estoque detectada para esta venda',
        code: 'STOCK_INVARIANT_VIOLATION',
        status: 409,
        requestId: context.requestId,
      });
    }

    logInfo('sales.update.succeeded', context, {
      role: session.role,
      saleId: saleId.toString(),
      cooperativeId: transactionResult.cooperativeId.toString(),
      weightSold: decimalToJsonNumber(weightSold),
      updatedCurrentStock: decimalToJsonNumber(transactionResult.updatedCurrentStock),
      duplicateStockRows: transactionResult.duplicateStockRows,
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
    });

    if (!existingSale) {
      return apiErrorResponse({
        message: 'Venda não encontrada',
        code: 'SALE_NOT_FOUND',
        status: 404,
        requestId: context.requestId,
      });
    }

    requireScopedPermission(session, 'sales', 'delete', 'cooperative');

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

      requireScopedPermission(session, 'sales', 'delete', 'cooperative');

      const lifecycleGuard = getLegacyStockMutationGuard(lockedSale);
      if (!lifecycleGuard.allowed) {
        return {
          status: 'lifecycle_locked' as const,
          lifecycleStatus: lifecycleGuard.status,
        };
      }

      const stockRecord = await lockStockAggregateForUpdate(
        tx,
        lockedSale.cooperativeId,
        lockedSale.material,
      );

      if (!stockRecord) {
        return {
          status: 'stock_missing' as const,
          cooperativeId: lockedSale.cooperativeId,
          materialId: lockedSale.material,
        };
      }

      const existingWeight = parseDecimal2(lockedSale.weight, 'existingSaleWeight');
      const updatedTotalSold = stockRecord.totalSoldKg.minus(existingWeight);
      const updatedCurrentStock = stockRecord.currentStockKg.plus(existingWeight);

      if (updatedTotalSold.lessThan(0)) {
        return {
          status: 'stock_invariant_violation' as const,
          cooperativeId: lockedSale.cooperativeId,
        };
      }

      await tx.sales.delete({
        where: { saleId },
      });

      await updateLockedStockAggregate(tx, stockRecord, {
        totalSoldKg: updatedTotalSold,
        currentStockKg: updatedCurrentStock,
      });

      return {
        status: 'deleted' as const,
        cooperativeId: lockedSale.cooperativeId,
        restoredWeight: existingWeight,
        updatedCurrentStock,
        duplicateStockRows: stockRecord.duplicateStockIds.length,
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

    if (transactionResult.status === 'lifecycle_locked') {
      return apiErrorResponse({
        message: 'Venda ativa ou cancelada deve ser alterada pelos endpoints de lifecycle',
        code: 'SALE_LIFECYCLE_LOCKED',
        status: 409,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'stock_missing') {
      logWarn('sales.delete.stock_missing', context, {
        saleId: saleId.toString(),
        cooperativeId: transactionResult.cooperativeId.toString(),
        materialId: transactionResult.materialId.toString(),
      });
      return apiErrorResponse({
        message: 'Não há estoque registrado para este material nesta cooperativa',
        code: 'STOCK_MISSING',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (transactionResult.status === 'stock_invariant_violation') {
      logWarn('sales.delete.stock_invariant_violation', context, {
        saleId: saleId.toString(),
        cooperativeId: transactionResult.cooperativeId.toString(),
      });
      return apiErrorResponse({
        message: 'Inconsistência de estoque detectada para esta venda',
        code: 'STOCK_INVARIANT_VIOLATION',
        status: 409,
        requestId: context.requestId,
      });
    }

    logInfo('sales.delete.succeeded', context, {
      role: session.role,
      saleId: saleId.toString(),
      cooperativeId: transactionResult.cooperativeId.toString(),
      restoredWeight: decimalToJsonNumber(transactionResult.restoredWeight),
      updatedCurrentStock: decimalToJsonNumber(transactionResult.updatedCurrentStock),
      duplicateStockRows: transactionResult.duplicateStockRows,
    });

    return NextResponse.json({
      success: true,
      message: 'Venda excluída com sucesso',
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao excluir venda',
      code: 'SALES_DELETE_FAILED',
      context,
      event: 'sales.delete.failed',
      error,
    });
  }
}

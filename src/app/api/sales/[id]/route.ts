import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { scopedSaleWhere } from '@/lib/auth/scoped-queries';
import { decimalToNumber } from '@/lib/db-utils';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';
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
    INNER JOIN "Workers" w ON w."Worker_id" = s."Responsible"
    WHERE s."Sale_id" = ${saleId}
      AND w."Cooperative" = ${BigInt(session.cooperativeId)}
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
        responsibleRef: true,
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
      if (!body[field]) {
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

    const transactionResult = await prisma.$transaction(async (tx) => {
      const locked = await lockScopedSaleForUpdate(tx, session, saleId);

      if (!locked) {
        return { status: 'not_found' as const };
      }

      const lockedSale = await tx.sales.findFirst({
        where: scopedSaleWhere(session, saleId),
        include: {
          buyerRef: true,
          responsibleRef: true,
        },
      });

      if (!lockedSale) {
        return { status: 'not_found' as const };
      }

      requireScopedPermission(session, 'sales', 'update', 'cooperative');

      if (newMaterialId !== lockedSale.material) {
        return { status: 'material_immutable' as const };
      }

      const stockRecord = await lockStockAggregateForUpdate(
        tx,
        lockedSale.responsibleRef.cooperative,
        lockedSale.material,
      );

      if (!stockRecord) {
        return {
          status: 'stock_missing' as const,
          cooperativeId: lockedSale.responsibleRef.cooperative,
          materialId: lockedSale.material,
        };
      }

      const existingWeight = decimalToNumber(lockedSale.weight) ?? 0;
      const currentStock = stockRecord.currentStockKg;
      const availableStock = currentStock + existingWeight;

      if (weightSold > availableStock) {
        return {
          status: 'insufficient_stock' as const,
          cooperativeId: lockedSale.responsibleRef.cooperative,
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
        stockRecord.totalSoldKg - existingWeight + weightSold;
      const updatedCurrentStock = availableStock - weightSold;

      await tx.sales.update({
        where: { saleId },
        data: {
          priceKg: pricePerKg.toFixed(2),
          weight: weightSold.toFixed(2),
          date: saleDate,
          buyer: buyer.buyerId,
        },
      });

      await updateLockedStockAggregate(tx, stockRecord, {
        totalSoldKg: updatedTotalSold,
        currentStockKg: updatedCurrentStock,
      });

      return {
        status: 'updated' as const,
        cooperativeId: lockedSale.responsibleRef.cooperative,
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
        requestedWeight: weightSold,
        availableWeight: Number(transactionResult.availableStock.toFixed(2)),
      });
      return apiErrorResponse({
        message: `Estoque insuficiente! Disponível: ${transactionResult.availableStock.toFixed(2)} kg`,
        code: 'INSUFFICIENT_STOCK',
        status: 400,
        requestId: context.requestId,
      });
    }

    logInfo('sales.update.succeeded', context, {
      role: session.role,
      saleId: saleId.toString(),
      cooperativeId: transactionResult.cooperativeId.toString(),
      weightSold,
      updatedCurrentStock: Number(transactionResult.updatedCurrentStock.toFixed(2)),
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
      include: {
        responsibleRef: true,
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

    requireScopedPermission(session, 'sales', 'delete', 'cooperative');

    const transactionResult = await prisma.$transaction(async (tx) => {
      const locked = await lockScopedSaleForUpdate(tx, session, saleId);

      if (!locked) {
        return { status: 'not_found' as const };
      }

      const lockedSale = await tx.sales.findFirst({
        where: scopedSaleWhere(session, saleId),
        include: {
          responsibleRef: true,
        },
      });

      if (!lockedSale) {
        return { status: 'not_found' as const };
      }

      requireScopedPermission(session, 'sales', 'delete', 'cooperative');

      const stockRecord = await lockStockAggregateForUpdate(
        tx,
        lockedSale.responsibleRef.cooperative,
        lockedSale.material,
      );

      if (!stockRecord) {
        return {
          status: 'stock_missing' as const,
          cooperativeId: lockedSale.responsibleRef.cooperative,
          materialId: lockedSale.material,
        };
      }

      const existingWeight = decimalToNumber(lockedSale.weight) ?? 0;
      const updatedTotalSold = stockRecord.totalSoldKg - existingWeight;
      const updatedCurrentStock = stockRecord.currentStockKg + existingWeight;

      await tx.sales.delete({
        where: { saleId },
      });

      await updateLockedStockAggregate(tx, stockRecord, {
        totalSoldKg: Math.max(updatedTotalSold, 0),
        currentStockKg: updatedCurrentStock,
      });

      return {
        status: 'deleted' as const,
        cooperativeId: lockedSale.responsibleRef.cooperative,
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

    logInfo('sales.delete.succeeded', context, {
      role: session.role,
      saleId: saleId.toString(),
      cooperativeId: transactionResult.cooperativeId.toString(),
      restoredWeight: transactionResult.restoredWeight,
      updatedCurrentStock: Number(transactionResult.updatedCurrentStock.toFixed(2)),
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

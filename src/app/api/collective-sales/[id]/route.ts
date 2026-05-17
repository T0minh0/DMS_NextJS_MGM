import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse, readJsonBody } from '@/lib/api/errors';
import { lockCollectiveSaleForUpdate } from '@/lib/collective-sales/locks';
import { decimalToJsonNumber, formatDecimal, parsePositiveDecimal2, type DecimalInput } from '@/lib/decimal';
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
    let newMaterialId: bigint | undefined;
    let newPriceKg: Prisma.Decimal | undefined;

    if (raw.material_id !== undefined) {
      try {
        newMaterialId = BigInt(raw.material_id as string);
      } catch {
        return apiErrorResponse({ message: 'material_id inválido', code: 'INVALID_MATERIAL_ID', status: 400, requestId: context.requestId });
      }
    }

    if (raw['price/kg'] !== undefined) {
      try {
        newPriceKg = parsePositiveDecimal2(raw['price/kg'] as DecimalInput | null | undefined, 'price/kg');
      } catch {
        return apiErrorResponse({ message: 'price/kg deve ser maior que zero', code: 'INVALID_PRICE', status: 400, requestId: context.requestId });
      }
    }

    if (newMaterialId === undefined && newPriceKg === undefined) {
      return apiErrorResponse({ message: 'Nenhum campo para atualizar', code: 'NO_UPDATE_FIELDS', status: 400, requestId: context.requestId });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const sale = await lockCollectiveSaleForUpdate(tx, collectiveSaleId);

      if (!sale) {
        return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
      }

      if (sale.soldAt != null || sale.cancelledAt != null) {
        return apiErrorResponse({ message: 'Venda coletiva já encerrada', code: 'COLLECTIVE_SALE_CLOSED', status: 409, requestId: context.requestId });
      }

      if (sale.creatorCooperativeId.toString() !== session.cooperativeId && session.role !== 'admin') {
        return apiErrorResponse({ message: 'Apenas o criador pode editar a venda coletiva', code: 'EDIT_FORBIDDEN', status: 403, requestId: context.requestId });
      }

      const updateData: Prisma.CollectiveSaleUpdateInput = {};

      if (newMaterialId !== undefined) {
        const reservedCount = await tx.collectiveSaleContribution.count({
          where: {
            collectiveSaleId,
            status: 'ACCEPTED',
            contributedWeight: { not: null, gt: 0 },
          },
        });

        if (reservedCount > 0) {
          return apiErrorResponse({ message: 'Não é possível alterar o material enquanto há contribuições de peso registradas', code: 'MATERIAL_CHANGE_BLOCKED', status: 409, requestId: context.requestId });
        }

        updateData.material = { connect: { materialId: newMaterialId } };
      }

      if (newPriceKg !== undefined) {
        updateData.priceKg = formatDecimal(newPriceKg);
      }

      return tx.collectiveSale.update({
        where: { collectiveSaleId },
        data: updateData,
        select: {
          collectiveSaleId: true,
          materialId: true,
          priceKg: true,
          expectedSaleDate: true,
          material: { select: { materialName: true } },
        },
      });
    });

    if (updated instanceof Response) return updated;

    logInfo('collective-sales.edit.succeeded', context, {
      role: session.role,
      collectiveSaleId: collectiveSaleId.toString(),
      cooperativeId: session.cooperativeId,
    });

    return NextResponse.json({
      success: true,
      message: 'Venda coletiva atualizada com sucesso',
      collective_sale: {
        _id: updated.collectiveSaleId.toString(),
        material_id: updated.materialId.toString(),
        material_name: updated.material.materialName,
        'price/kg': decimalToJsonNumber(updated.priceKg),
        expected_sale_date: updated.expectedSaleDate.toISOString(),
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return apiErrorResponse({ message: 'Material não encontrado', code: 'MATERIAL_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao editar venda coletiva',
      code: 'COLLECTIVE_SALE_EDIT_FAILED',
      context,
      event: 'collective-sales.edit.failed',
      error,
    });
  }
}

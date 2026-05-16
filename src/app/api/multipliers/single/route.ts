import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToNumber } from '@/lib/db-utils';
import { createLogContext } from '@/lib/observability/logger';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const cooperativeIdParam = searchParams.get('cooperative_id');
    const materialIdParam = searchParams.get('material_id');

    if (!materialIdParam) {
      return apiErrorResponse({
        message: 'material_id é obrigatório',
        code: 'MISSING_MATERIAL_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    const targetCooperativeId = determineTargetCooperative(
      session,
      cooperativeIdParam ?? undefined,
      { required: true },
    );
    requireScopedPermission(session, 'reports', 'read', 'cooperative');

    let materialId: bigint;
    try {
      materialId = BigInt(materialIdParam);
    } catch {
      return apiErrorResponse({
        message: 'material_id inválido',
        code: 'INVALID_MATERIAL_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    const row = await prisma.cooperativeMaterialMultiplier.findUnique({
      where: {
        cooperativeId_materialId: {
          cooperativeId: BigInt(targetCooperativeId),
          materialId,
        },
      },
      include: { material: { select: { materialName: true } } },
    });

    if (!row) {
      return NextResponse.json({ multiplier_value: 1.0, found: false });
    }

    return NextResponse.json({
      _id: row.cooperativeMaterialMultiplierId,
      cooperative_id: row.cooperativeId.toString(),
      material_id: row.materialId.toString(),
      material_name: row.material.materialName,
      multiplier_value: Number(decimalToNumber(row.multiplierValue)?.toFixed(3) ?? '1.000'),
      found: true,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao buscar multiplicador',
      code: 'MULTIPLIER_SINGLE_READ_FAILED',
      context,
      event: 'multipliers.single.read.failed',
      error,
    });
  }
}

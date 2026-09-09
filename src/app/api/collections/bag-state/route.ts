import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToJsonNumber } from '@/lib/decimal';
import { createLogContext } from '@/lib/observability/logger';

/**
 * Current bag state for a (cooperative, material) pair. Lets the collections
 * form explain what "leitura acumulada" means before the operator submits.
 */
export async function GET(request: Request) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/collections/bag-state' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const targetCooperativeId = determineTargetCooperative(
      session,
      searchParams.get('cooperative_id'),
      { required: true },
    );
    requireScopedPermission(session, 'stock', 'read', 'cooperative');

    const materialParam = searchParams.get('material_id');
    let materialId: bigint;
    try {
      if (!materialParam) {
        throw new Error('missing');
      }
      materialId = BigInt(materialParam);
    } catch {
      return apiErrorResponse({
        message: 'Material inválido',
        code: 'INVALID_MATERIAL',
        status: 400,
        requestId: context.requestId,
      });
    }

    const bagState = await prisma.materialBagState.findUnique({
      where: {
        cooperativeId_materialId: {
          cooperativeId: BigInt(targetCooperativeId),
          materialId,
        },
      },
      select: { isBegun: true, currentKg: true, lastUpdated: true },
    });

    return NextResponse.json({
      material_id: materialId.toString(),
      cooperative_id: targetCooperativeId,
      is_begun: bagState?.isBegun ?? false,
      current_kg: decimalToJsonNumber(bagState?.currentKg ?? 0),
      last_updated: bagState?.lastUpdated?.toISOString() ?? null,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao consultar o estado do saco',
      code: 'BAG_STATE_READ_FAILED',
      context,
      event: 'collection.bag_state.failed',
      error,
    });
  }
}

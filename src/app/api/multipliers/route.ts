import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse, readJsonBody } from '@/lib/api/errors';
import { decimalToNumber } from '@/lib/db-utils';
import { createLogContext } from '@/lib/observability/logger';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const cooperativeIdParam = searchParams.get('cooperative_id');
    const targetCooperativeId = determineTargetCooperative(
      session,
      cooperativeIdParam ?? undefined,
      { required: true },
    );
    requireScopedPermission(session, 'reports', 'read', 'cooperative');

    const rows = await prisma.cooperativeMaterialMultiplier.findMany({
      where: { cooperativeId: BigInt(targetCooperativeId) },
      include: { material: { select: { materialName: true } } },
      orderBy: { material: { materialName: 'asc' } },
    });

    return NextResponse.json({
      multipliers: rows.map((row) => ({
        _id: row.cooperativeMaterialMultiplierId,
        cooperative_id: row.cooperativeId.toString(),
        material_id: row.materialId.toString(),
        material_name: row.material.materialName,
        multiplier_value: Number(decimalToNumber(row.multiplierValue)?.toFixed(3) ?? '1.000'),
      })),
      count: rows.length,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao buscar multiplicadores',
      code: 'MULTIPLIERS_READ_FAILED',
      context,
      event: 'multipliers.read.failed',
      error,
    });
  }
}

export async function POST(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    const body = await readJsonBody(request);

    const cooperativeIdRaw = body.cooperative_id;
    const materialIdRaw = body.material_id;
    const multiplierRaw = body.multiplier_value;

    if (!cooperativeIdRaw || typeof cooperativeIdRaw !== 'string') {
      return apiErrorResponse({
        message: 'cooperative_id é obrigatório',
        code: 'MISSING_COOPERATIVE_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (!materialIdRaw || typeof materialIdRaw !== 'string') {
      return apiErrorResponse({
        message: 'material_id é obrigatório',
        code: 'MISSING_MATERIAL_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (typeof multiplierRaw !== 'number' || multiplierRaw <= 0) {
      return apiErrorResponse({
        message: 'multiplier_value deve ser um número positivo',
        code: 'INVALID_MULTIPLIER_VALUE',
        status: 400,
        requestId: context.requestId,
      });
    }

    let cooperativeId: bigint;
    let materialId: bigint;

    try {
      cooperativeId = BigInt(cooperativeIdRaw);
    } catch {
      return apiErrorResponse({
        message: 'cooperative_id inválido',
        code: 'INVALID_COOPERATIVE_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    try {
      materialId = BigInt(materialIdRaw);
    } catch {
      return apiErrorResponse({
        message: 'material_id inválido',
        code: 'INVALID_MATERIAL_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    const targetCooperativeId = determineTargetCooperative(session, cooperativeId, {
      required: true,
    });
    requireScopedPermission(session, 'reports', 'read', 'cooperative');

    if (targetCooperativeId !== cooperativeId.toString()) {
      return apiErrorResponse({
        message: 'Cooperativa fora do escopo da sessão',
        code: 'COOPERATIVE_SCOPE_DENIED',
        status: 403,
        requestId: context.requestId,
      });
    }

    const row = await prisma.cooperativeMaterialMultiplier.upsert({
      where: {
        cooperativeId_materialId: { cooperativeId, materialId },
      },
      create: { cooperativeId, materialId, multiplierValue: multiplierRaw },
      update: { multiplierValue: multiplierRaw },
      include: { material: { select: { materialName: true } } },
    });

    return NextResponse.json(
      {
        _id: row.cooperativeMaterialMultiplierId,
        cooperative_id: row.cooperativeId.toString(),
        material_id: row.materialId.toString(),
        material_name: row.material.materialName,
        multiplier_value: Number(decimalToNumber(row.multiplierValue)?.toFixed(3) ?? '1.000'),
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao salvar multiplicador',
      code: 'MULTIPLIER_UPSERT_FAILED',
      context,
      event: 'multipliers.upsert.failed',
      error,
    });
  }
}

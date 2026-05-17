import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToNumber } from '@/lib/db-utils';
import { createLogContext } from '@/lib/observability/logger';

const MATERIALS_QUERY_CEILING = 500;

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'stock' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const cooperativeIdParam = searchParams.get('cooperative_id');
    const targetCooperativeId = determineTargetCooperative(
      session,
      cooperativeIdParam ?? undefined,
    );
    requireScopedPermission(
      session,
      'reports',
      'read',
      targetCooperativeId ? 'cooperative' : 'global',
    );

    const stockWhere = targetCooperativeId ? { cooperative: BigInt(targetCooperativeId) } : undefined;
    const [stockRows, total] = await Promise.all([
      prisma.stock.findMany({
        where: stockWhere,
        take: MATERIALS_QUERY_CEILING,
        include: {
          materialRef: {
            include: { group: true },
          },
        },
        orderBy: { materialRef: { materialName: 'asc' } },
      }),
      prisma.stock.count({ where: stockWhere }),
    ]);
    const truncated = total > stockRows.length;

    return NextResponse.json({
      materials: stockRows.map((row) => ({
        material_id: row.material.toString(),
        name: row.materialRef.materialName,
        group: row.materialRef.group?.groupName ?? '',
        cooperative_id: row.cooperative.toString(),
        stock_kg: Number((decimalToNumber(row.currentStockKg) ?? 0).toFixed(2)),
        total_collected_kg: Number((decimalToNumber(row.totalCollectedKg) ?? 0).toFixed(2)),
        total_sold_kg: Number((decimalToNumber(row.totalSoldKg) ?? 0).toFixed(2)),
      })),
      count: stockRows.length,
      total,
      limit: MATERIALS_QUERY_CEILING,
      has_more: truncated,
      truncated,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar materiais da cooperativa',
      code: 'COOPERATIVE_MATERIALS_READ_FAILED',
      context,
      event: 'cooperative.materials.failed',
      error,
    });
  }
}

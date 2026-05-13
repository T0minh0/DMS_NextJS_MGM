import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, determineTargetCooperative, requireManagerOrAdmin, requireScopedPermission } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToNumber } from '@/lib/db-utils';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';

export async function GET(request: Request) {
  const context = createLogContext(request, { domain: 'stock' });

  try {
    const session = await requireManagerOrAdmin();
    const targetCooperativeId = determineTargetCooperative(session);
    requireScopedPermission(session, 'stock', 'read', targetCooperativeId ? 'cooperative' : 'global');
    const { searchParams } = new URL(request.url);
    const materialIdParam = searchParams.get('material_id');

    const materials = await prisma.materials.findMany({
      include: { group: true },
    });

    const materialNameById = new Map<bigint, string>();
    const materialIdByGroup = new Map<string, bigint[]>();
    materials.forEach((material) => {
      materialNameById.set(material.materialId, material.materialName);
      if (material.group) {
        const ids = materialIdByGroup.get(material.group.groupName) || [];
        ids.push(material.materialId);
        materialIdByGroup.set(material.group.groupName, ids);
      }
    });

    let materialFilter: bigint[] | null = null;

    if (materialIdParam) {
      if (materialIdParam.startsWith('group_')) {
        const groupName = materialIdParam.replace('group_', '');
        const ids = materialIdByGroup.get(groupName);
        if (!ids || ids.length === 0) {
          logInfo('stock.read.no_data', context, {
            role: session.role,
            cooperativeId: targetCooperativeId,
            filter: 'group',
          });
          return NextResponse.json({
            noData: true,
            message: 'Não há materiais neste grupo',
          });
        }
        materialFilter = ids;
      } else {
        try {
          materialFilter = [BigInt(materialIdParam)];
        } catch {
          logWarn('stock.read.invalid_filter', context, {
            role: session.role,
            cooperativeId: targetCooperativeId,
          });
          return apiErrorResponse({
            message: 'Material inválido',
            code: 'INVALID_MATERIAL_FILTER',
            status: 400,
            requestId: context.requestId,
          });
        }
      }
    }

    const stocks = await prisma.stock.findMany({
      where: {
        ...(materialFilter ? { material: { in: materialFilter } } : {}),
        ...(targetCooperativeId ? { cooperative: BigInt(targetCooperativeId) } : {}),
      },
      include: {
        materialRef: true,
        cooperativeRef: true,
      },
    });

    if (stocks.length === 0) {
      logInfo('stock.read.no_data', context, {
        role: session.role,
        cooperativeId: targetCooperativeId,
        materialFilterCount: materialFilter?.length ?? 0,
      });
      return NextResponse.json({
        noData: true,
        message: materialIdParam
          ? 'Não há estoque deste material ou foi totalmente vendido'
          : 'Não há estoque disponível ou todos os materiais foram vendidos',
      });
    }

    const formattedStock: Record<string, number> = {};

    stocks.forEach((stock) => {
      const name =
        materialNameById.get(stock.material) ||
        stock.materialRef?.materialName ||
        `Material ${stock.material.toString()}`;
      const current = decimalToNumber(stock.currentStockKg) ?? 0;
      formattedStock[name] = (formattedStock[name] || 0) + current;
    });

    logInfo('stock.read.succeeded', context, {
      role: session.role,
      cooperativeId: targetCooperativeId,
      stockRows: stocks.length,
      materialFilterCount: materialFilter?.length ?? 0,
    });

    return NextResponse.json(formattedStock);
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar dados de estoque. Por favor, tente novamente mais tarde.',
      code: 'STOCK_READ_FAILED',
      context,
      event: 'stock.read.failed',
      error,
    });
  }
}

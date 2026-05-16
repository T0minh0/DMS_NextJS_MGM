import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToJsonNumber } from '@/lib/decimal';
import { createLogContext } from '@/lib/observability/logger';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const coopId = BigInt(session.cooperativeId);

    const pending = await prisma.collectiveSaleContribution.findMany({
      where: {
        cooperativeId: coopId,
        status: 'PENDING',
        collectiveSale: { soldAt: null, cancelledAt: null },
      },
      include: {
        collectiveSale: {
          include: {
            buyer: { select: { buyerName: true } },
            material: { select: { materialName: true } },
            creatorCooperative: { select: { cooperativeName: true } },
          },
        },
      },
      orderBy: { contributionId: 'asc' },
    });

    return NextResponse.json({
      invitations: pending.map((c) => ({
        contribution_id: c.contributionId.toString(),
        collective_sale_id: c.collectiveSaleId.toString(),
        material_id: c.collectiveSale.materialId.toString(),
        material_name: c.collectiveSale.material.materialName,
        buyer_name: c.collectiveSale.buyer.buyerName,
        'price/kg': decimalToJsonNumber(c.collectiveSale.priceKg),
        expected_sale_date: c.collectiveSale.expectedSaleDate.toISOString(),
        created_at: c.collectiveSale.createdAt.toISOString(),
        creator_cooperative_id: c.collectiveSale.creatorCooperativeId.toString(),
        creator_cooperative_name: c.collectiveSale.creatorCooperative.cooperativeName,
        status: c.status,
      })),
      count: pending.length,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao listar convites',
      code: 'COLLECTIVE_SALE_INVITATIONS_READ_FAILED',
      context,
      event: 'collective-sales.invitations.read.failed',
      error,
    });
  }
}

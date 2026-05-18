import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse, readJsonBody } from '@/lib/api/errors';
import { decimalToJsonNumber, formatDecimal, parsePositiveDecimal2, type DecimalInput } from '@/lib/decimal';
import { createLogContext, logInfo } from '@/lib/observability/logger';

class MaterialNotFoundError extends Error {}

function formatSale(
  sale: {
    collectiveSaleId: bigint;
    createdAt: Date;
    soldAt: Date | null;
    cancelledAt: Date | null;
    buyerId: bigint;
    materialId: bigint;
    totalWeight: Prisma.Decimal | null;
    priceKg: Prisma.Decimal;
    expectedSaleDate: Date;
    creatorCooperativeId: bigint;
    buyer: { buyerName: string };
    material: { materialName: string };
    creatorCooperative: { cooperativeName: string };
    contributions: {
      contributionId: bigint;
      cooperativeId: bigint;
      status: string;
      contributedWeight: Prisma.Decimal | null;
      cooperative: { cooperativeName: string };
    }[];
  },
  viewerCooperativeId: bigint | null,
) {
  const status =
    sale.cancelledAt != null ? 'CANCELLED' : sale.soldAt != null ? 'SOLD' : 'ACTIVE';
  const myContribution = viewerCooperativeId
    ? sale.contributions.find((c) => c.cooperativeId === viewerCooperativeId)
    : null;

  return {
    _id: sale.collectiveSaleId.toString(),
    material_id: sale.materialId.toString(),
    material_name: sale.material.materialName,
    buyer_id: sale.buyerId.toString(),
    buyer_name: sale.buyer.buyerName,
    'price/kg': decimalToJsonNumber(sale.priceKg),
    total_weight: sale.totalWeight != null ? decimalToJsonNumber(sale.totalWeight) : null,
    expected_sale_date: sale.expectedSaleDate.toISOString(),
    created_at: sale.createdAt.toISOString(),
    sold_at: sale.soldAt?.toISOString() ?? null,
    cancelled_at: sale.cancelledAt?.toISOString() ?? null,
    status,
    creator_cooperative_id: sale.creatorCooperativeId.toString(),
    creator_cooperative_name: sale.creatorCooperative.cooperativeName,
    my_participation: myContribution?.status ?? null,
    participants: sale.contributions.map((c) => ({
      contribution_id: c.contributionId.toString(),
      cooperative_id: c.cooperativeId.toString(),
      cooperative_name: c.cooperative.cooperativeName,
      status: c.status,
      contributed_weight: c.contributedWeight != null ? decimalToJsonNumber(c.contributedWeight) : null,
    })),
  };
}

const INCLUDE_FULL = {
  buyer: { select: { buyerName: true } },
  material: { select: { materialName: true } },
  creatorCooperative: { select: { cooperativeName: true } },
  contributions: {
    include: { cooperative: { select: { cooperativeName: true } } },
    orderBy: { contributionId: 'asc' as const },
  },
} satisfies Prisma.CollectiveSaleInclude;

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    const coopId = BigInt(session.cooperativeId);
    const isAdmin = session.role === 'admin';

    let where: Prisma.CollectiveSaleWhereInput = {};

    if (statusFilter === 'ACTIVE') {
      where = { soldAt: null, cancelledAt: null };
    } else if (statusFilter === 'SOLD') {
      where = { soldAt: { not: null }, cancelledAt: null };
    } else if (statusFilter === 'CANCELLED') {
      where = { soldAt: null, cancelledAt: { not: null } };
    } else {
      where = { soldAt: null, cancelledAt: null };
    }

    if (!isAdmin) {
      where = {
        ...where,
        OR: [
          { creatorCooperativeId: coopId },
          { contributions: { some: { cooperativeId: coopId, status: 'ACCEPTED' } } },
        ],
      };
    }

    const sales = await prisma.collectiveSale.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      collective_sales: sales.map((s) => formatSale(s, isAdmin ? null : coopId)),
      count: sales.length,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao listar vendas coletivas',
      code: 'COLLECTIVE_SALES_READ_FAILED',
      context,
      event: 'collective-sales.read.failed',
      error,
    });
  }
}

export async function POST(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    const body = await readJsonBody(request);
    requireScopedPermission(session, 'sales', 'create', 'cooperative');

    const targetCooperativeId = determineTargetCooperative(
      session,
      (body as Record<string, unknown>).cooperative_id as string | undefined ?? session.cooperativeId,
      { required: true },
    );

    const raw = body as Record<string, unknown>;

    const materialIdRaw = raw.material_id;
    const buyerNameRaw = typeof raw.Buyer === 'string' ? raw.Buyer.trim() : '';
    const priceRaw = raw['price/kg'];
    const expectedDateRaw = raw.expected_sale_date;

    if (!materialIdRaw || typeof materialIdRaw !== 'string') {
      return apiErrorResponse({ message: 'material_id é obrigatório', code: 'MISSING_MATERIAL_ID', status: 400, requestId: context.requestId });
    }

    if (!buyerNameRaw) {
      return apiErrorResponse({ message: 'Buyer é obrigatório', code: 'MISSING_BUYER', status: 400, requestId: context.requestId });
    }

    if (!expectedDateRaw || typeof expectedDateRaw !== 'string') {
      return apiErrorResponse({ message: 'expected_sale_date é obrigatório', code: 'MISSING_EXPECTED_DATE', status: 400, requestId: context.requestId });
    }

    let materialId: bigint;
    try {
      materialId = BigInt(materialIdRaw);
    } catch {
      return apiErrorResponse({ message: 'material_id inválido', code: 'INVALID_MATERIAL_ID', status: 400, requestId: context.requestId });
    }

    let priceKg: Prisma.Decimal;
    try {
      priceKg = parsePositiveDecimal2(priceRaw as DecimalInput | null | undefined, 'price/kg');
    } catch {
      return apiErrorResponse({ message: 'price/kg deve ser maior que zero', code: 'INVALID_PRICE', status: 400, requestId: context.requestId });
    }

    const expectedDate = new Date(expectedDateRaw);
    if (Number.isNaN(expectedDate.getTime())) {
      return apiErrorResponse({ message: 'expected_sale_date inválida', code: 'INVALID_DATE', status: 400, requestId: context.requestId });
    }

    let creatorCoopId: bigint;
    try {
      creatorCoopId = BigInt(targetCooperativeId);
    } catch {
      return apiErrorResponse({ message: 'cooperative_id inválido', code: 'INVALID_COOPERATIVE_ID', status: 400, requestId: context.requestId });
    }

    const sale = await prisma.$transaction(async (tx) => {
      let buyer = await tx.buyers.findFirst({
        where: { buyerName: { equals: buyerNameRaw, mode: 'insensitive' } },
      });

      if (!buyer) {
        try {
          buyer = await tx.buyers.create({ data: { buyerName: buyerNameRaw } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            buyer = await tx.buyers.findFirst({
              where: { buyerName: { equals: buyerNameRaw, mode: 'insensitive' } },
            });
            if (!buyer) throw e;
          } else {
            throw e;
          }
        }
      }

      const created = await tx.collectiveSale.create({
        data: {
          materialId,
          buyerId: buyer.buyerId,
          priceKg: formatDecimal(priceKg),
          expectedSaleDate: expectedDate,
          creatorCooperativeId: creatorCoopId,
          contributions: {
            create: { cooperativeId: creatorCoopId, status: 'ACCEPTED' },
          },
        },
        include: INCLUDE_FULL,
      }).catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new MaterialNotFoundError();
        }
        throw e;
      });

      return created;
    });

    logInfo('collective-sales.create.succeeded', context, {
      role: session.role,
      collectiveSaleId: sale.collectiveSaleId.toString(),
      creatorCooperativeId: targetCooperativeId,
      materialId: materialId.toString(),
    });

    return NextResponse.json(
      { success: true, collective_sale: formatSale(sale, creatorCoopId) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MaterialNotFoundError) {
      return apiErrorResponse({ message: 'Material não encontrado', code: 'MATERIAL_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao criar venda coletiva',
      code: 'COLLECTIVE_SALE_CREATE_FAILED',
      context,
      event: 'collective-sales.create.failed',
      error,
    });
  }
}

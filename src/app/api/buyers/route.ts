import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireManagerOrAdmin, requireScopedPermission } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext, logInfo } from '@/lib/observability/logger';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const buyers = await prisma.buyers.findMany({
      orderBy: { buyerName: 'asc' },
    });

    return NextResponse.json({
      buyers: buyers.map((b) => ({
        _id: b.buyerId.toString(),
        name: b.buyerName,
      })),
      count: buyers.length,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar compradores',
      code: 'BUYERS_READ_FAILED',
      context,
      event: 'buyers.read.failed',
      error,
    });
  }
}

export async function POST(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'create', 'cooperative');

    const body = await request.json();
    const buyerName = body.name?.trim() || body.buyer?.trim();

    if (!buyerName) {
      return apiErrorResponse({
        message: 'Nome do comprador é obrigatório',
        code: 'REQUIRED_BUYER_NAME',
        status: 400,
        requestId: context.requestId,
      });
    }

    const existing = await prisma.buyers.findFirst({
      where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
    });

    if (existing) {
      return apiErrorResponse({
        message: 'Este comprador já existe na lista',
        code: 'BUYER_NAME_CONFLICT',
        status: 409,
        requestId: context.requestId,
      });
    }

    let buyer;
    try {
      buyer = await prisma.buyers.create({ data: { buyerName } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await prisma.buyers.findFirst({
          where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
        });
        if (!raced) throw e;
        return apiErrorResponse({
          message: 'Este comprador já existe na lista',
          code: 'BUYER_NAME_CONFLICT',
          status: 409,
          requestId: context.requestId,
        });
      }
      throw e;
    }

    logInfo('buyers.create.succeeded', context, {
      role: session.role,
      buyerId: buyer.buyerId.toString(),
      buyerName,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Comprador adicionado com sucesso',
        buyer: { _id: buyer.buyerId.toString(), name: buyer.buyerName },
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao criar comprador',
      code: 'BUYER_CREATE_FAILED',
      context,
      event: 'buyers.create.failed',
      error,
    });
  }
}

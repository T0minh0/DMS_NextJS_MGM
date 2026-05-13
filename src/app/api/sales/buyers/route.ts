import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireManagerOrAdmin, requireScopedPermission } from '@/lib/auth/server';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';

export async function GET(request: Request) {
  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const buyers = await prisma.buyers.findMany({
      orderBy: { buyerName: 'asc' },
    });

    const names = buyers.map((buyer) => buyer.buyerName);

    return NextResponse.json({
      buyers: names,
      count: names.length,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Failed to fetch buyers',
      code: 'BUYERS_READ_FAILED',
      route: '/api/sales/buyers',
      method: 'GET',
      request,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'create', 'cooperative');

    const { buyer } = await request.json();

    const buyerName = buyer?.trim();
    if (!buyerName) {
      return apiErrorResponse({
        message: 'Nome do comprador é obrigatório',
        code: 'REQUIRED_BUYER_NAME',
        status: 400,
      });
    }

    const existing = await prisma.buyers.findFirst({
      where: {
        buyerName: {
          equals: buyerName,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return apiErrorResponse({
        message: 'Este comprador já existe na lista',
        code: 'BUYER_NAME_CONFLICT',
        status: 400,
      });
    }

    await prisma.buyers.create({
      data: { buyerName },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Comprador adicionado com sucesso',
        buyer: buyerName,
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao adicionar comprador',
      code: 'BUYER_CREATE_FAILED',
      route: '/api/sales/buyers',
      method: 'POST',
      request,
    });
  }
}

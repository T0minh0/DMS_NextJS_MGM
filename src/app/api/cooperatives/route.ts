import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireAdmin,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';

function formatCooperative(cooperative: { cooperativeId: bigint; cooperativeName: string }) {
  const id = cooperative.cooperativeId.toString();
  return {
    _id: id,
    cooperative_id: id,
    name: cooperative.cooperativeName,
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireManagerOrAdmin();
    const targetCooperativeId = determineTargetCooperative(session);
    requireScopedPermission(session, 'cooperatives', 'read', targetCooperativeId ? 'cooperative' : 'global');

    const cooperatives = await prisma.cooperative.findMany({
      where: targetCooperativeId ? { cooperativeId: BigInt(targetCooperativeId) } : undefined,
      orderBy: { cooperativeName: 'asc' },
    });

    return NextResponse.json(cooperatives.map(formatCooperative));
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Failed to fetch cooperatives',
      code: 'COOPERATIVES_READ_FAILED',
      route: '/api/cooperatives',
      method: 'GET',
      request,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return apiErrorResponse({
        message: 'Nome da cooperativa é obrigatório',
        code: 'REQUIRED_COOPERATIVE_NAME',
        status: 400,
      });
    }

    const created = await prisma.cooperative.create({
      data: { cooperativeName: name },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Cooperativa criada com sucesso',
        cooperative: formatCooperative(created),
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
      message: 'Erro ao criar cooperativa',
      code: 'COOPERATIVE_CREATE_FAILED',
      route: '/api/cooperatives',
      method: 'POST',
      request,
    });
  }
}

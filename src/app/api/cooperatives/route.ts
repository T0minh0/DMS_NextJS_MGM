import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireAdmin,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';

function formatCooperative(cooperative: { cooperativeId: bigint; cooperativeName: string }) {
  const id = cooperative.cooperativeId.toString();
  return {
    _id: id,
    cooperative_id: id,
    name: cooperative.cooperativeName,
  };
}

export async function GET() {
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
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error('Error fetching cooperatives:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch cooperatives',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { error: 'Nome da cooperativa é obrigatório' },
        { status: 400 },
      );
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
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error('Error creating cooperative:', error);
    return NextResponse.json(
      {
        error: 'Erro ao criar cooperativa',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

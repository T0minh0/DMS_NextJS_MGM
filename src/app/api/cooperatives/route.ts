import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
    const cooperatives = await prisma.cooperative.findMany({
      orderBy: { cooperativeName: 'asc' },
    });

    return NextResponse.json(cooperatives.map(formatCooperative));
  } catch (error) {
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

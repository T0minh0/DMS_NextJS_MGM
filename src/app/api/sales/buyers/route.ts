import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const buyers = await prisma.buyers.findMany({
      orderBy: { buyerName: 'asc' },
    });

    const names = buyers.map((buyer) => buyer.buyerName);

    return NextResponse.json({
      buyers: names,
      count: names.length,
    });
  } catch (error) {
    console.error('Error fetching buyers:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch buyers',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { buyer } = await request.json();

    const buyerName = buyer?.trim();
    if (!buyerName) {
      return NextResponse.json({ error: 'Nome do comprador é obrigatório' }, { status: 400 });
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
      return NextResponse.json({ error: 'Este comprador já existe na lista' }, { status: 400 });
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
    console.error('Error adding buyer:', error);
    return NextResponse.json(
      {
        error: 'Erro ao adicionar comprador',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

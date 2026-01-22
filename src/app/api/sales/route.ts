import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { decimalToNumber } from '@/lib/db-utils';

const JWT_SECRET = process.env.JWT_SECRET || 'dms-dashboard-secret-key';

interface AuthTokenPayload {
  id: string;
  name: string;
  cpf: string;
  userType: number;
  iat?: number;
  exp?: number;
}

async function getAuthenticatedManager() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const workerId = BigInt(payload.id);
    const worker = await prisma.workers.findUnique({
      where: { workerId },
    });
    if (!worker) {
      return null;
    }
    return worker;
  } catch (error) {
    console.error('Failed to decode auth token:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('material_id');
    const cooperativeId = searchParams.get('cooperative_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = Number.parseInt(searchParams.get('limit') || '100', 10);

    const where: Prisma.SalesWhereInput = {};

    if (materialId) {
      try {
        where.material = BigInt(materialId);
      } catch {
        return NextResponse.json({ error: 'Material inválido' }, { status: 400 });
      }
    }

    if (cooperativeId) {
      try {
        where.responsibleRef = {
          cooperative: BigInt(cooperativeId),
        };
      } catch {
        return NextResponse.json({ error: 'Cooperativa inválida' }, { status: 400 });
      }
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const start = new Date(startDate);
        if (Number.isNaN(start.getTime())) {
          return NextResponse.json({ error: 'Data inicial inválida' }, { status: 400 });
        }
        where.date.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          return NextResponse.json({ error: 'Data final inválida' }, { status: 400 });
        }
        where.date.lte = end;
      }
    }

    const sales = await prisma.sales.findMany({
      where,
      include: {
        materialRef: true,
        buyerRef: true,
        responsibleRef: true,
      },
      orderBy: { date: 'desc' },
      take: Number.isNaN(limit) ? 100 : limit,
    });

    const formattedSales = sales.map((sale) => {
      const price = decimalToNumber(sale.priceKg) ?? 0;
      const weight = decimalToNumber(sale.weight) ?? 0;
      return {
        _id: sale.saleId.toString(),
        material_id: sale.material.toString(),
        cooperative_id: sale.responsibleRef.cooperative.toString(),
        'price/kg': Number(price.toFixed(2)),
        weight_sold: Number(weight.toFixed(2)),
        date: sale.date.toISOString(),
        Buyer: sale.buyerRef.buyerName,
      };
    });

    const totalSales = formattedSales.length;
    const totalWeight = formattedSales.reduce((sum, sale) => sum + sale.weight_sold, 0);
    const totalValue = formattedSales.reduce(
      (sum, sale) => sum + sale.weight_sold * sale['price/kg'],
      0,
    );

    return NextResponse.json({
      sales: formattedSales,
      summary: {
        totalSales,
        totalWeight: Number(totalWeight.toFixed(2)),
        totalValue: Number(totalValue.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch sales',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const manager = await getAuthenticatedManager();
    if (!manager) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();

    const requiredFields = ['material_id', 'price/kg', 'weight_sold', 'date', 'Buyer'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `Campo obrigatório: ${field}` }, { status: 400 });
      }
    }

    let materialId: bigint;
    try {
      materialId = BigInt(body.material_id);
    } catch {
      return NextResponse.json({ error: 'Material inválido' }, { status: 400 });
    }

    const pricePerKg = Number(body['price/kg']);
    const weightSold = Number(body.weight_sold);
    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
      return NextResponse.json({ error: 'Preço por kg deve ser maior que zero' }, { status: 400 });
    }
    if (!Number.isFinite(weightSold) || weightSold <= 0) {
      return NextResponse.json({ error: 'Peso vendido deve ser maior que zero' }, { status: 400 });
    }

    const saleDate = new Date(body.date);
    if (Number.isNaN(saleDate.getTime())) {
      return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    }

    const buyerName = body.Buyer?.trim();
    if (!buyerName) {
      return NextResponse.json({ error: 'Comprador é obrigatório' }, { status: 400 });
    }

    let buyer = await prisma.buyers.findFirst({
      where: {
        buyerName: {
          equals: buyerName,
          mode: 'insensitive',
        },
      },
    });

    if (!buyer) {
      buyer = await prisma.buyers.create({
        data: {
          buyerName,
        },
      });
    }

    const stockRecord = await prisma.stock.findFirst({
      where: {
        cooperative: manager.cooperative,
        material: materialId,
      },
    });

    if (!stockRecord) {
      return NextResponse.json(
        { error: 'Não há estoque registrado para este material nesta cooperativa' },
        { status: 400 },
      );
    }

    const currentStock = decimalToNumber(stockRecord.currentStockKg) ?? 0;
    if (weightSold > currentStock) {
      return NextResponse.json(
        { error: `Estoque insuficiente! Disponível: ${currentStock.toFixed(2)} kg` },
        { status: 400 },
      );
    }

    const sale = await prisma.sales.create({
      data: {
        material: materialId,
        priceKg: pricePerKg.toFixed(2),
        weight: weightSold.toFixed(2),
        date: saleDate,
        buyer: buyer.buyerId,
        responsible: manager.workerId,
      },
    });

    const totalSold = (decimalToNumber(stockRecord.totalSoldKg) ?? 0) + weightSold;
    const newCurrentStock = currentStock - weightSold;

    await prisma.stock.update({
      where: { stockId: stockRecord.stockId },
      data: {
        totalSoldKg: totalSold.toFixed(2),
        currentStockKg: newCurrentStock.toFixed(2),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Venda registrada com sucesso',
        sale: {
          _id: sale.saleId.toString(),
          material_id: sale.material.toString(),
          cooperative_id: manager.cooperative.toString(),
          'price/kg': pricePerKg,
          weight_sold: weightSold,
          date: sale.date.toISOString(),
          Buyer: buyer.buyerName,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating sale:', error);
    return NextResponse.json(
      {
        error: 'Erro ao registrar venda',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
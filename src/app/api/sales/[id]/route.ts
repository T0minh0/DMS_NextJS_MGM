import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
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
    const worker = await prisma.workers.findUnique({ where: { workerId } });
    return worker;
  } catch (error) {
    console.error('Failed to decode auth token:', error);
    return null;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const manager = await getAuthenticatedManager();
    if (!manager) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id: idParam } = await params;
    let saleId: bigint;
    try {
      saleId = BigInt(idParam);
    } catch {
      return NextResponse.json({ error: 'ID de venda inválido' }, { status: 400 });
    }

    const existingSale = await prisma.sales.findUnique({
      where: { saleId },
      include: {
        buyerRef: true,
        responsibleRef: true,
      },
    });

    if (!existingSale) {
      return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 });
    }

    if (existingSale.responsible !== manager.workerId) {
      return NextResponse.json(
        { error: 'Você não tem permissão para alterar esta venda' },
        { status: 403 },
      );
    }

    const body = await request.json();

    const requiredFields = ['price/kg', 'weight_sold', 'date', 'Buyer'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `Campo obrigatório: ${field}` }, { status: 400 });
      }
    }

    const newMaterialId = BigInt(body.material_id ?? existingSale.material.toString());
    if (newMaterialId !== existingSale.material) {
      return NextResponse.json(
        { error: 'Material da venda não pode ser alterado neste momento' },
        { status: 400 },
      );
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

    let buyer = existingSale.buyerRef;
    if (buyerName.toLowerCase() !== existingSale.buyerRef.buyerName.toLowerCase()) {
      buyer = (await prisma.buyers.findFirst({
        where: { buyerName: { equals: buyerName, mode: 'insensitive' } },
      })) || (await prisma.buyers.create({ data: { buyerName } }));
    }

    const stockRecord = await prisma.stock.findFirst({
      where: {
        cooperative: existingSale.responsibleRef.cooperative,
        material: existingSale.material,
      },
    });

    if (!stockRecord) {
      return NextResponse.json(
        { error: 'Não há estoque registrado para este material nesta cooperativa' },
        { status: 400 },
      );
    }

    const existingWeight = decimalToNumber(existingSale.weight) ?? 0;
    const currentStock = decimalToNumber(stockRecord.currentStockKg) ?? 0;
    const availableStock = currentStock + existingWeight;

    if (weightSold > availableStock) {
      return NextResponse.json(
        { error: `Estoque insuficiente! Disponível: ${availableStock.toFixed(2)} kg` },
        { status: 400 },
      );
    }

    const updatedTotalSold =
      (decimalToNumber(stockRecord.totalSoldKg) ?? 0) - existingWeight + weightSold;
    const updatedCurrentStock = availableStock - weightSold;

    await prisma.sales.update({
      where: { saleId },
      data: {
        priceKg: pricePerKg.toFixed(2),
        weight: weightSold.toFixed(2),
        date: saleDate,
        buyer: buyer.buyerId,
      },
    });

    await prisma.stock.update({
      where: { stockId: stockRecord.stockId },
      data: {
        totalSoldKg: updatedTotalSold.toFixed(2),
        currentStockKg: updatedCurrentStock.toFixed(2),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Venda atualizada com sucesso',
    });
  } catch (error) {
    console.error('Error updating sale:', error);
    return NextResponse.json(
      {
        error: 'Erro ao atualizar venda',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const manager = await getAuthenticatedManager();
    if (!manager) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id: idParam } = await params;
    let saleId: bigint;
    try {
      saleId = BigInt(idParam);
    } catch {
      return NextResponse.json({ error: 'ID de venda inválido' }, { status: 400 });
    }

    const existingSale = await prisma.sales.findUnique({
      where: { saleId },
      include: {
        responsibleRef: true,
      },
    });

    if (!existingSale) {
      return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 });
    }

    if (existingSale.responsible !== manager.workerId) {
      return NextResponse.json(
        { error: 'Você não tem permissão para excluir esta venda' },
        { status: 403 },
      );
    }

    const stockRecord = await prisma.stock.findFirst({
      where: {
        cooperative: existingSale.responsibleRef.cooperative,
        material: existingSale.material,
      },
    });

    if (!stockRecord) {
      return NextResponse.json(
        { error: 'Não há estoque registrado para este material nesta cooperativa' },
        { status: 400 },
      );
    }

    const existingWeight = decimalToNumber(existingSale.weight) ?? 0;
    const updatedTotalSold = (decimalToNumber(stockRecord.totalSoldKg) ?? 0) - existingWeight;
    const updatedCurrentStock = (decimalToNumber(stockRecord.currentStockKg) ?? 0) + existingWeight;

    await prisma.sales.delete({
      where: { saleId },
    });

    await prisma.stock.update({
      where: { stockId: stockRecord.stockId },
      data: {
        totalSoldKg: Math.max(updatedTotalSold, 0).toFixed(2),
        currentStockKg: updatedCurrentStock.toFixed(2),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Venda excluída com sucesso',
    });
  } catch (error) {
    console.error('Error deleting sale:', error);
    return NextResponse.json(
      {
        error: 'Erro ao excluir venda',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

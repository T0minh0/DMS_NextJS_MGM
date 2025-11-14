import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ message: 'ID do usuário é obrigatório' }, { status: 400 });
    }

    let workerId: bigint;
    try {
      workerId = BigInt(id);
    } catch {
      return NextResponse.json({ message: 'ID inválido' }, { status: 400 });
    }

    const existing = await prisma.workers.findUnique({
      where: { workerId },
    });

    if (!existing) {
      return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 });
    }

    const [salesUsage, measurementUsage, contributionsUsage] = await Promise.all([
      prisma.sales.count({ where: { responsible: workerId } }),
      prisma.measurments.count({ where: { wastepicker: workerId } }),
      prisma.workerContributions.count({ where: { wastepicker: workerId } }),
    ]);

    if (salesUsage > 0 || measurementUsage > 0 || contributionsUsage > 0) {
      return NextResponse.json(
        {
          message:
            'Não é possível excluir este usuário. Existem registros de vendas, medições ou contribuições associados.',
        },
        { status: 400 },
      );
    }

    await prisma.workers.delete({
      where: { workerId },
    });

    return NextResponse.json({ message: 'Usuário excluído com sucesso' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ message: 'Erro ao excluir usuário' }, { status: 500 });
  }
}

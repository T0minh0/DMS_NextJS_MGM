import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatWorkerId } from '@/lib/db-utils';

export async function POST() {
  try {
    const workers = await prisma.workers.findMany({
      orderBy: { workerName: 'asc' },
    });

    const assignments = workers.map((worker) => ({
      userId: worker.workerId.toString(),
      name: worker.workerName,
      wastepickerId: formatWorkerId(worker.workerId),
    }));

    return NextResponse.json({
      message: 'Os IDs de catadores são gerados automaticamente no banco SQL.',
      updated: 0,
      assignments,
    });
  } catch (error) {
    console.error('Error listing worker IDs:', error);
    return NextResponse.json(
      {
        error: 'Erro ao listar IDs de catadores',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

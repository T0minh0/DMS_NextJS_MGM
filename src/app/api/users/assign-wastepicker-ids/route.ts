import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, determineTargetCooperative, requireAdmin } from '@/lib/auth/server';
import { formatWorkerId } from '@/lib/db-utils';

export async function POST() {
  try {
    const session = await requireAdmin();
    const targetCooperativeId = determineTargetCooperative(session);
    const workers = await prisma.workers.findMany({
      where: targetCooperativeId ? { cooperative: BigInt(targetCooperativeId) } : undefined,
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
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

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

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, determineTargetCooperative, requireAdmin } from '@/lib/auth/server';
import { apiRouteErrorResponse } from '@/lib/api/errors';
import { formatWorkerId } from '@/lib/db-utils';

export async function POST(request: Request) {
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
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao listar IDs de catadores',
      code: 'WASTEPICKER_IDS_READ_FAILED',
      route: '/api/users/assign-wastepicker-ids',
      method: 'POST',
      request,
    });
  }
}

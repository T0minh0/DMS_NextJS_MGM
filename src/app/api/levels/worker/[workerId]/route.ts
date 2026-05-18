import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  determineTargetWorker,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { scopedWorkerWhere } from '@/lib/auth/scoped-queries';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import { getWorkerLevel, LevelDomainError } from '@/lib/levels';
import prisma from '@/lib/prisma';

function parsePositiveWorkerId(value: string) {
  try {
    const workerId = BigInt(value);
    return workerId > BigInt(0) ? workerId : null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireAuth();
    const { workerId: workerIdParam } = await params;
    const targetWorkerId = parsePositiveWorkerId(
      determineTargetWorker(session, workerIdParam, { required: true }),
    );

    if (targetWorkerId === null) {
      return apiErrorResponse({
        message: 'ID de trabalhador inválido',
        code: 'INVALID_WORKER_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    requireScopedPermission(
      session,
      'gamification',
      'read',
      session.role === 'worker' ? 'self' : 'cooperative',
    );

    const worker = await prisma.workers.findFirst({
      where: scopedWorkerWhere(session, targetWorkerId),
      select: { cooperative: true },
    });

    if (!worker) {
      return apiErrorResponse({
        message: 'Trabalhador não encontrado',
        code: 'WORKER_NOT_FOUND',
        status: 404,
        requestId: context.requestId,
      });
    }

    const level = await getWorkerLevel({
      workerId: targetWorkerId,
      cooperativeId: worker.cooperative,
    });

    return NextResponse.json(level);
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    if (error instanceof LevelDomainError) {
      return apiErrorResponse({
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: context.requestId,
      });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar nível do trabalhador',
      code: 'WORKER_LEVEL_READ_FAILED',
      context,
      event: 'levels.worker.read.failed',
      error,
    });
  }
}

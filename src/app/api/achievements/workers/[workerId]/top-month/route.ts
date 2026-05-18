import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  determineTargetCooperative,
  determineTargetWorker,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import {
  AchievementDomainError,
  getWorkerTopMonthThisYear,
  parsePositiveBigInt,
} from '@/lib/achievements';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireAuth();
    const { workerId: workerIdParam } = await params;
    const { searchParams } = new URL(request.url);
    const targetWorkerId = determineTargetWorker(session, workerIdParam, { required: true });
    const targetCooperativeId = determineTargetCooperative(
      session,
      searchParams.get('cooperativeId') ?? searchParams.get('cooperative_id') ?? undefined,
      { required: true },
    );

    requireScopedPermission(
      session,
      'gamification',
      'read',
      session.role === 'worker' ? 'self' : 'cooperative',
    );

    const summary = await getWorkerTopMonthThisYear({
      workerId: parsePositiveBigInt(targetWorkerId, 'Trabalhador'),
      cooperativeId: BigInt(targetCooperativeId),
    });

    return NextResponse.json(summary);
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    if (error instanceof AchievementDomainError) {
      return apiErrorResponse({
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: context.requestId,
      });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar melhor mês de achievements',
      code: 'ACHIEVEMENT_TOP_MONTH_FAILED',
      context,
      event: 'achievements.top.month.failed',
      error,
    });
  }
}

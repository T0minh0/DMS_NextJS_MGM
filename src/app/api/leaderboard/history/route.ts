import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import {
  getLeaderboardSnapshot,
  LeaderboardDomainError,
  normalizeLeaderboardYearMonth,
  parseLeaderboardWeekNumber,
} from '@/lib/leaderboard';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const targetCooperativeId = determineTargetCooperative(
      session,
      searchParams.get('cooperativeId') ?? searchParams.get('cooperative_id') ?? undefined,
      { required: true },
    );

    requireScopedPermission(
      session,
      'gamification',
      'read',
      session.role === 'admin'
        ? 'cooperative'
        : session.role === 'worker'
          ? 'self'
          : 'cooperative',
    );

    const leaderboard = await getLeaderboardSnapshot({
      cooperativeId: BigInt(targetCooperativeId),
      yearMonth: normalizeLeaderboardYearMonth(searchParams.get('yearMonth')),
      weekNumber: parseLeaderboardWeekNumber(searchParams.get('weekNumber')),
    });

    return NextResponse.json(leaderboard);
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    if (error instanceof LeaderboardDomainError) {
      return apiErrorResponse({
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: context.requestId,
      });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar histórico do leaderboard',
      code: 'LEADERBOARD_HISTORY_READ_FAILED',
      context,
      event: 'leaderboard.history.read.failed',
      error,
    });
  }
}

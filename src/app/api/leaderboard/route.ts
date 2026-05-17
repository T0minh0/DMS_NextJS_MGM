import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { isGamificationManagerView } from '@/lib/features/gamification';
import { createLogContext } from '@/lib/observability/logger';
import { getCurrentLeaderboard, LeaderboardDomainError } from '@/lib/leaderboard';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const managerView = isGamificationManagerView(searchParams);
    const targetCooperativeId = determineTargetCooperative(
      session,
      searchParams.get('cooperativeId') ?? searchParams.get('cooperative_id') ?? undefined,
      { required: true },
    );
    const readScope = managerView
      ? 'cooperative'
      : session.role === 'worker'
        ? 'self'
        : 'cooperative';

    requireScopedPermission(
      session,
      'gamification',
      'read',
      readScope,
    );

    const leaderboard = await getCurrentLeaderboard({
      cooperativeId: BigInt(targetCooperativeId),
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
      message: 'Erro ao buscar leaderboard',
      code: 'LEADERBOARD_READ_FAILED',
      context,
      event: 'leaderboard.read.failed',
      error,
    });
  }
}

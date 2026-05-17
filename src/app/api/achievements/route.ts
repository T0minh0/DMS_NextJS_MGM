import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import {
  AchievementDomainError,
  listAchievements,
} from '@/lib/achievements';

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

    const achievements = await listAchievements(BigInt(targetCooperativeId));
    return NextResponse.json(achievements);
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    if (error instanceof AchievementDomainError) {
      return NextResponse.json(
        {
          error: error.message,
          message: error.message,
          code: error.code,
          requestId: context.requestId,
        },
        { status: error.status, headers: { 'x-request-id': context.requestId } },
      );
    }

    return apiInternalErrorResponse({
      message: 'Erro ao buscar achievements',
      code: 'ACHIEVEMENTS_READ_FAILED',
      context,
      event: 'achievements.read.failed',
      error,
    });
  }
}

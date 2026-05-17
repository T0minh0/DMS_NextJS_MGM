import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import {
  apiErrorResponse,
  apiInternalErrorResponse,
  apiRequestErrorResponse,
  readJsonBody,
} from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import {
  AchievementDomainError,
  parsePositiveBigInt,
  updateAchievementXpOverride,
} from '@/lib/achievements';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ achievementId: string }> },
) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'gamification', 'update', 'cooperative');

    const { achievementId: achievementIdParam } = await params;
    const achievementId = parsePositiveBigInt(achievementIdParam, 'Achievement');
    const body = await readJsonBody(request);
    const { searchParams } = new URL(request.url);
    const targetCooperativeId = determineTargetCooperative(
      session,
      searchParams.get('cooperativeId') ?? searchParams.get('cooperative_id') ?? undefined,
      { required: true },
    );

    const xpReward = body.xpReward;
    if (
      typeof xpReward !== 'number' ||
      !Number.isInteger(xpReward) ||
      xpReward <= 0 ||
      xpReward > 2147483647
    ) {
      return apiErrorResponse({
        message: 'xpReward deve ser um inteiro entre 1 e 2147483647',
        code: 'INVALID_XP_REWARD',
        status: 400,
        requestId: context.requestId,
      });
    }

    if (targetCooperativeId !== session.cooperativeId) {
      return apiErrorResponse({
        message: 'Override de XP só pode ser ajustado pela cooperativa auditável do usuário autenticado',
        code: 'COOPERATIVE_SCOPE_DENIED',
        status: 403,
        requestId: context.requestId,
      });
    }

    const override = await updateAchievementXpOverride({
      cooperativeId: BigInt(targetCooperativeId),
      achievementId,
      xpReward,
      updatedBy: BigInt(session.workerId),
    });

    return NextResponse.json({
      achievementId: override.achievementId.toString(),
      cooperativeId: override.cooperativeId.toString(),
      xpReward: override.xpRewardOverride,
      updatedBy: override.updatedBy.toString(),
      updatedAt: override.updatedAt.toISOString(),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    const requestErrorResponse = apiRequestErrorResponse(error, context.requestId);
    if (requestErrorResponse) return requestErrorResponse;

    if (error instanceof AchievementDomainError) {
      return apiErrorResponse({
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: context.requestId,
      });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao atualizar XP do achievement',
      code: 'ACHIEVEMENT_XP_UPDATE_FAILED',
      context,
      event: 'achievements.xp.update.failed',
      error,
    });
  }
}

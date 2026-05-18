import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireAuth, requireScopedPermission } from '@/lib/auth/server';
import { apiInternalErrorResponse } from '@/lib/api/errors';
import { isGamificationManagerView } from '@/lib/features/gamification';
import { createLogContext } from '@/lib/observability/logger';
import { listLevels } from '@/lib/levels';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const managerView = isGamificationManagerView(searchParams);
    const readScope = managerView
      ? 'cooperative'
      : session.role === 'admin'
        ? 'global'
        : session.role === 'worker'
          ? 'self'
          : 'cooperative';

    requireScopedPermission(
      session,
      'gamification',
      'read',
      readScope,
    );

    const levels = await listLevels();
    return NextResponse.json(levels);
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao buscar níveis',
      code: 'LEVELS_READ_FAILED',
      context,
      event: 'levels.read.failed',
      error,
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireAuth, requireScopedPermission } from '@/lib/auth/server';
import { apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import { listLevels } from '@/lib/levels';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireAuth();
    requireScopedPermission(
      session,
      'gamification',
      'read',
      session.role === 'admin'
        ? 'global'
        : session.role === 'worker'
          ? 'self'
          : 'cooperative',
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

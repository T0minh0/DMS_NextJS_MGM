import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireAdmin, requireScopedPermission } from '@/lib/auth/server';
import { apiRouteErrorResponse } from '@/lib/api/errors';
import { rebuildWorkerContributions } from '@/lib/contributions/rebuild';

/**
 * Global, destructive rebuild of Worker_contributions. The heavy lifting
 * lives in `src/lib/contributions/rebuild.ts` (shared with the historical
 * import); the response shape is unchanged.
 */
export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    requireScopedPermission(session, 'reports', 'recalculate', 'global');

    const result = await rebuildWorkerContributions(prisma);

    if (!result.statistics) {
      return NextResponse.json({
        message: result.message,
        processed: result.processed,
      });
    }

    return NextResponse.json({
      message: result.message,
      statistics: result.statistics,
      processed: result.processed,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Failed to recalculate contributions',
      code: 'CONTRIBUTIONS_RECALCULATE_FAILED',
      route: '/api/recalculate-contributions',
      method: 'POST',
      request,
    });
  }
}

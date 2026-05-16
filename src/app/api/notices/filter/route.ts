import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import { formatNotice, buildScopeWhere, buildActiveWhere } from '../_shared';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'notices', 'read', 'cooperative');

    const { searchParams } = new URL(request.url);
    const priorityParam = searchParams.get('priority');

    if (priorityParam === null) {
      return apiErrorResponse({ message: 'Parâmetro priority é obrigatório', code: 'MISSING_PRIORITY', status: 400, requestId: context.requestId });
    }

    const priority = Number(priorityParam);
    if (!Number.isInteger(priority) || priority < 1) {
      return apiErrorResponse({ message: 'Prioridade deve ser um inteiro >= 1', code: 'INVALID_PRIORITY', status: 400, requestId: context.requestId });
    }

    const scopeWhere = buildScopeWhere(session);
    const activeWhere = buildActiveWhere();

    const notices = await prisma.noticeBoard.findMany({
      where: { AND: [{ priority }, scopeWhere, activeWhere] },
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({ notices: notices.map(formatNotice) });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao filtrar avisos',
      code: 'NOTICES_FILTER_FAILED',
      context,
      event: 'notices.filter.failed',
      error,
    });
  }
}

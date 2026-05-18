import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import { formatNotice, buildActiveWhere } from '../_shared';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'notices', 'read', 'cooperative');

    const activeWhere = buildActiveWhere();

    const notices = await prisma.noticeBoard.findMany({
      where: { AND: [{ cooperativeId: null }, activeWhere] },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ notices: notices.map(formatNotice) });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao listar avisos globais',
      code: 'NOTICES_GLOBAL_LIST_FAILED',
      context,
      event: 'notices.global.list.failed',
      error,
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext } from '@/lib/observability/logger';
import { sanitizeNoticeTitle, sanitizeNoticeContent } from '@/lib/notices/sanitize';
import { formatNotice, buildScopeWhere, buildActiveWhere } from './_shared';

export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'notices', 'read', 'cooperative');

    const scopeWhere = buildScopeWhere(session);
    const activeWhere = buildActiveWhere();

    const notices = await prisma.noticeBoard.findMany({
      where: { AND: [scopeWhere, activeWhere] },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ notices: notices.map(formatNotice) });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao listar avisos',
      code: 'NOTICES_LIST_FAILED',
      context,
      event: 'notices.list.failed',
      error,
    });
  }
}

export async function POST(request: NextRequest) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiErrorResponse({ message: 'Corpo da requisição inválido', code: 'INVALID_BODY', status: 400, requestId: context.requestId });
    }

    if (!body || typeof body !== 'object') {
      return apiErrorResponse({ message: 'Corpo da requisição inválido', code: 'INVALID_BODY', status: 400, requestId: context.requestId });
    }

    const { title, content, priority, expires_at, cooperative_id } = body as Record<string, unknown>;

    if (typeof title !== 'string' || !title.trim()) {
      return apiErrorResponse({ message: 'Título é obrigatório', code: 'MISSING_TITLE', status: 400, requestId: context.requestId });
    }

    if (typeof content !== 'string' || !content.trim()) {
      return apiErrorResponse({ message: 'Conteúdo é obrigatório', code: 'MISSING_CONTENT', status: 400, requestId: context.requestId });
    }

    const sanitizedTitle = sanitizeNoticeTitle(title);
    if (!sanitizedTitle) {
      return apiErrorResponse({ message: 'Título inválido após sanitização', code: 'INVALID_TITLE', status: 400, requestId: context.requestId });
    }

    const sanitizedContent = sanitizeNoticeContent(content);
    if (!sanitizedContent) {
      return apiErrorResponse({ message: 'Conteúdo inválido após sanitização', code: 'INVALID_CONTENT', status: 400, requestId: context.requestId });
    }

    const priorityNum = priority !== undefined ? Number(priority) : 1;
    if (!Number.isInteger(priorityNum) || priorityNum < 1 || priorityNum > 5) {
      return apiErrorResponse({ message: 'Prioridade deve ser um inteiro entre 1 e 5', code: 'INVALID_PRIORITY', status: 400, requestId: context.requestId });
    }

    let expiresAt: Date | null = null;
    if (expires_at !== undefined && expires_at !== null) {
      expiresAt = new Date(expires_at as string);
      if (isNaN(expiresAt.getTime())) {
        return apiErrorResponse({ message: 'Data de expiração inválida', code: 'INVALID_EXPIRES_AT', status: 400, requestId: context.requestId });
      }
      if (expiresAt <= new Date()) {
        return apiErrorResponse({ message: 'Data de expiração deve ser no futuro', code: 'EXPIRES_AT_NOT_FUTURE', status: 400, requestId: context.requestId });
      }
    }

    let cooperativeId: bigint | null = null;
    if (cooperative_id === null || cooperative_id === undefined) {
      requireScopedPermission(session, 'notices', 'create', 'global');
      cooperativeId = null;
    } else {
      requireScopedPermission(session, 'notices', 'create', 'cooperative');
      let requestedCoopId: bigint;
      try {
        requestedCoopId = BigInt(cooperative_id as string);
      } catch {
        return apiErrorResponse({ message: 'ID de cooperativa inválido', code: 'INVALID_COOPERATIVE_ID', status: 400, requestId: context.requestId });
      }
      if (session.role !== 'admin' && requestedCoopId !== BigInt(session.cooperativeId)) {
        return apiErrorResponse({ message: 'Sem permissão para criar aviso nesta cooperativa', code: 'FORBIDDEN', status: 403, requestId: context.requestId });
      }
      cooperativeId = requestedCoopId;
    }

    const notice = await prisma.noticeBoard.create({
      data: {
        cooperativeId,
        createdBy: BigInt(session.workerId),
        priority: priorityNum,
        expiresAt,
        title: sanitizedTitle,
        content: sanitizedContent,
      },
    });

    return NextResponse.json({ notice: formatNotice(notice) }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao criar aviso',
      code: 'NOTICE_CREATE_FAILED',
      context,
      event: 'notices.create.failed',
      error,
    });
  }
}

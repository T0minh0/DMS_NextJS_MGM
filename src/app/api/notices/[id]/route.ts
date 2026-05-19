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
import { formatNotice, buildScopeWhere } from '../_shared';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'notices', 'read', 'cooperative');

    const { id } = await params;
    let noticeId: bigint;
    try {
      noticeId = BigInt(id);
    } catch {
      return apiErrorResponse({ message: 'ID de aviso inválido', code: 'INVALID_NOTICE_ID', status: 400, requestId: context.requestId });
    }

    const scopeWhere = buildScopeWhere(session);

    const notice = await prisma.noticeBoard.findFirst({
      where: { AND: [{ noticeId }, scopeWhere] },
    });

    if (!notice) {
      return apiErrorResponse({ message: 'Aviso não encontrado', code: 'NOTICE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    return NextResponse.json({ notice: formatNotice(notice) });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao buscar aviso',
      code: 'NOTICE_GET_FAILED',
      context,
      event: 'notices.get.failed',
      error,
    });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'notices', 'update', 'cooperative');

    const { id } = await params;
    let noticeId: bigint;
    try {
      noticeId = BigInt(id);
    } catch {
      return apiErrorResponse({ message: 'ID de aviso inválido', code: 'INVALID_NOTICE_ID', status: 400, requestId: context.requestId });
    }

    const existing = await prisma.noticeBoard.findUnique({ where: { noticeId } });
    if (!existing) {
      return apiErrorResponse({ message: 'Aviso não encontrado', code: 'NOTICE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (session.role !== 'admin') {
      if (existing.cooperativeId === null) {
        return apiErrorResponse({ message: 'Sem permissão para editar aviso global', code: 'FORBIDDEN', status: 403, requestId: context.requestId });
      }
      if (existing.cooperativeId !== BigInt(session.cooperativeId)) {
        return apiErrorResponse({ message: 'Aviso não encontrado', code: 'NOTICE_NOT_FOUND', status: 404, requestId: context.requestId });
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiErrorResponse({ message: 'Corpo da requisição inválido', code: 'INVALID_BODY', status: 400, requestId: context.requestId });
    }

    if (!body || typeof body !== 'object') {
      return apiErrorResponse({ message: 'Corpo da requisição inválido', code: 'INVALID_BODY', status: 400, requestId: context.requestId });
    }

    const patch = body as Record<string, unknown>;
    const data: {
      title?: string;
      content?: string;
      priority?: number;
      expiresAt?: Date | null;
      lastUpdated: Date;
    } = { lastUpdated: new Date() };

    if ('title' in patch) {
      if (typeof patch.title !== 'string' || !patch.title.trim()) {
        return apiErrorResponse({ message: 'Título inválido', code: 'INVALID_TITLE', status: 400, requestId: context.requestId });
      }
      const sanitized = sanitizeNoticeTitle(patch.title);
      if (!sanitized) {
        return apiErrorResponse({ message: 'Título inválido após sanitização', code: 'INVALID_TITLE', status: 400, requestId: context.requestId });
      }
      data.title = sanitized;
    }

    if ('content' in patch) {
      if (typeof patch.content !== 'string' || !patch.content.trim()) {
        return apiErrorResponse({ message: 'Conteúdo inválido', code: 'INVALID_CONTENT', status: 400, requestId: context.requestId });
      }
      const sanitized = sanitizeNoticeContent(patch.content);
      if (!sanitized) {
        return apiErrorResponse({ message: 'Conteúdo inválido após sanitização', code: 'INVALID_CONTENT', status: 400, requestId: context.requestId });
      }
      data.content = sanitized;
    }

    if ('priority' in patch) {
      const p = Number(patch.priority);
      if (!Number.isInteger(p) || p < 1 || p > 5) {
        return apiErrorResponse({ message: 'Prioridade deve ser um inteiro entre 1 e 5', code: 'INVALID_PRIORITY', status: 400, requestId: context.requestId });
      }
      data.priority = p;
    }

    if ('expires_at' in patch) {
      if (patch.expires_at === null) {
        data.expiresAt = null;
      } else {
        if (typeof patch.expires_at !== 'string') {
          return apiErrorResponse({ message: 'Data de expiração deve ser string ISO', code: 'INVALID_EXPIRES_AT', status: 400, requestId: context.requestId });
        }
        const d = new Date(patch.expires_at);
        if (isNaN(d.getTime())) {
          return apiErrorResponse({ message: 'Data de expiração inválida', code: 'INVALID_EXPIRES_AT', status: 400, requestId: context.requestId });
        }
        if (d <= new Date()) {
          return apiErrorResponse({ message: 'Data de expiração deve ser no futuro', code: 'EXPIRES_AT_NOT_FUTURE', status: 400, requestId: context.requestId });
        }
        data.expiresAt = d;
      }
    }

    const updated = await prisma.noticeBoard.update({ where: { noticeId }, data });

    return NextResponse.json({ notice: formatNotice(updated) });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao atualizar aviso',
      code: 'NOTICE_UPDATE_FAILED',
      context,
      event: 'notices.update.failed',
      error,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = createLogContext(request, { domain: 'api' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'notices', 'delete', 'cooperative');

    const { id } = await params;
    let noticeId: bigint;
    try {
      noticeId = BigInt(id);
    } catch {
      return apiErrorResponse({ message: 'ID de aviso inválido', code: 'INVALID_NOTICE_ID', status: 400, requestId: context.requestId });
    }

    const existing = await prisma.noticeBoard.findUnique({ where: { noticeId } });
    if (!existing) {
      return apiErrorResponse({ message: 'Aviso não encontrado', code: 'NOTICE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (session.role !== 'admin') {
      if (existing.cooperativeId === null) {
        return apiErrorResponse({ message: 'Sem permissão para excluir aviso global', code: 'FORBIDDEN', status: 403, requestId: context.requestId });
      }
      if (existing.cooperativeId !== BigInt(session.cooperativeId)) {
        return apiErrorResponse({ message: 'Aviso não encontrado', code: 'NOTICE_NOT_FOUND', status: 404, requestId: context.requestId });
      }
    }

    await prisma.noticeBoard.delete({ where: { noticeId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao excluir aviso',
      code: 'NOTICE_DELETE_FAILED',
      context,
      event: 'notices.delete.failed',
      error,
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse, readJsonBody } from '@/lib/api/errors';
import { lockCollectiveSaleForUpdate } from '@/lib/collective-sales/locks';
import { createLogContext, logInfo } from '@/lib/observability/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'update', 'cooperative');

    const { id: idParam } = await params;
    let collectiveSaleId: bigint;
    try {
      collectiveSaleId = BigInt(idParam);
    } catch {
      return apiErrorResponse({ message: 'ID de venda coletiva inválido', code: 'INVALID_COLLECTIVE_SALE_ID', status: 400, requestId: context.requestId });
    }

    const body = await readJsonBody(request);
    const raw = body as Record<string, unknown>;
    const cooperativeIdRaw = raw.cooperative_id;

    if (!cooperativeIdRaw || typeof cooperativeIdRaw !== 'string') {
      return apiErrorResponse({ message: 'cooperative_id é obrigatório', code: 'MISSING_COOPERATIVE_ID', status: 400, requestId: context.requestId });
    }

    let invitedCoopId: bigint;
    try {
      invitedCoopId = BigInt(cooperativeIdRaw);
    } catch {
      return apiErrorResponse({ message: 'cooperative_id inválido', code: 'INVALID_COOPERATIVE_ID', status: 400, requestId: context.requestId });
    }

    const contribution = await prisma.$transaction(async (tx) => {
      const sale = await lockCollectiveSaleForUpdate(tx, collectiveSaleId);

      if (!sale) {
        return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
      }

      if (sale.soldAt != null || sale.cancelledAt != null) {
        return apiErrorResponse({ message: 'Venda coletiva já encerrada', code: 'COLLECTIVE_SALE_CLOSED', status: 409, requestId: context.requestId });
      }

      // Only the creator cooperative can invite others
      if (sale.creatorCooperativeId.toString() !== session.cooperativeId && session.role !== 'admin') {
        return apiErrorResponse({ message: 'Apenas o criador pode convidar cooperativas', code: 'INVITE_FORBIDDEN', status: 403, requestId: context.requestId });
      }

      // Cannot invite own cooperative (the creator)
      if (invitedCoopId === sale.creatorCooperativeId) {
        return apiErrorResponse({ message: 'Não é possível convidar a própria cooperativa criadora', code: 'INVITE_SELF_FORBIDDEN', status: 400, requestId: context.requestId });
      }

      try {
        return await tx.collectiveSaleContribution.create({
          data: {
            collectiveSaleId,
            cooperativeId: invitedCoopId,
            status: 'INVITED',
          },
          include: { cooperative: { select: { cooperativeName: true } } },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          return apiErrorResponse({ message: 'Cooperativa já convidada ou participante', code: 'INVITE_DUPLICATE', status: 409, requestId: context.requestId });
        }

        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2003'
        ) {
          return apiErrorResponse({ message: 'Cooperativa não encontrada', code: 'COOPERATIVE_NOT_FOUND', status: 404, requestId: context.requestId });
        }

        throw e;
      }
    });

    if (contribution instanceof Response) return contribution;

    logInfo('collective-sales.invite.succeeded', context, {
      role: session.role,
      collectiveSaleId: collectiveSaleId.toString(),
      invitedCooperativeId: invitedCoopId.toString(),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Convite enviado com sucesso',
        contribution: {
          contribution_id: contribution.contributionId.toString(),
          collective_sale_id: collectiveSaleId.toString(),
          cooperative_id: invitedCoopId.toString(),
          cooperative_name: contribution.cooperative.cooperativeName,
          status: contribution.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao enviar convite',
      code: 'COLLECTIVE_SALE_INVITE_FAILED',
      context,
      event: 'collective-sales.invite.failed',
      error,
    });
  }
}

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { scopedWorkerWhere } from '@/lib/auth/scoped-queries';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';
import { sanitizeDigits } from '@/lib/db-utils';

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const { id, full_name, email, PIS, RG } = await request.json();

    if (!id) {
      return apiErrorResponse({
        message: 'ID do usuário é obrigatório',
        code: 'REQUIRED_USER_ID',
        status: 400,
      });
    }

    let workerId: bigint;
    try {
      workerId = BigInt(id);
    } catch {
      return apiErrorResponse({
        message: 'ID inválido',
        code: 'INVALID_USER_ID',
        status: 400,
      });
    }

    const worker = await prisma.workers.findFirst({
      where: scopedWorkerWhere(session, workerId),
    });

    if (!worker) {
      return apiErrorResponse({
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND',
        status: 404,
      });
    }

    const isSelfUpdate = worker.workerId.toString() === session.workerId;
    determineTargetCooperative(session, worker.cooperative);
    requireScopedPermission(session, 'users', 'update', isSelfUpdate ? 'self' : 'cooperative');

    const updateData: Prisma.WorkersUpdateInput = {
      lastUpdate: new Date(),
    };

    if (full_name) {
      updateData.workerName = full_name.trim();
    }
    if (email) {
      updateData.email = email.trim();
    }
    if (PIS) {
      const pisDigits = sanitizeDigits(PIS);
      if (pisDigits) {
        updateData.pis = Buffer.from(pisDigits, 'utf8');
      }
    }
    if (RG) {
      const rgDigits = sanitizeDigits(RG);
      if (rgDigits) {
        updateData.rg = Buffer.from(rgDigits, 'utf8');
      }
    }

    await prisma.workers.update({
      where: { workerId },
      data: updateData,
    });

    return NextResponse.json({
      message: 'Perfil atualizado com sucesso',
      updated: true,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao atualizar perfil',
      code: 'USER_PROFILE_UPDATE_FAILED',
      route: '/api/user/update',
      method: 'POST',
      request,
    });
  }
}

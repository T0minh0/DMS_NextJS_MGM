import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetWorker,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/shared';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';
import { decodeBytes } from '@/lib/db-utils';

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const { id, currentPassword, newPassword } = await request.json();

    if (!id || !currentPassword || !newPassword) {
      return apiErrorResponse({
        message: 'Todos os campos são obrigatórios',
        code: 'REQUIRED_PASSWORD_FIELDS',
        status: 400,
      });
    }

    if (newPassword.length < 6) {
      return apiErrorResponse({
        message: 'A nova senha deve ter pelo menos 6 caracteres',
        code: 'PASSWORD_TOO_SHORT',
        status: 400,
      });
    }

    let workerId: bigint;
    try {
      workerId = BigInt(determineTargetWorker(session, id, { required: true }));
    } catch {
      return apiErrorResponse({
        message: 'ID inválido',
        code: 'INVALID_USER_ID',
        status: 400,
      });
    }

    if (workerId.toString() !== session.workerId) {
      throw new AuthError('Senha só pode ser alterada pelo próprio usuário', 403, 'SELF_PASSWORD_REQUIRED');
    }

    requireScopedPermission(session, 'users', 'update', 'self');

    const worker = await prisma.workers.findUnique({
      where: { workerId },
    });

    if (!worker) {
      return apiErrorResponse({
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND',
        status: 404,
      });
    }

    const storedPassword = decodeBytes(worker.password);
    if (!storedPassword) {
      return apiErrorResponse({
        message: 'Senha não configurada',
        code: 'PASSWORD_NOT_CONFIGURED',
        status: 400,
      });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, storedPassword);
    if (!isCurrentValid) {
      return apiErrorResponse({
        message: 'Senha atual incorreta',
        code: 'INVALID_CURRENT_PASSWORD',
        status: 401,
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.workers.update({
      where: { workerId },
      data: {
        password: Buffer.from(hashedPassword, 'utf8'),
        lastUpdate: new Date(),
      },
    });

    return NextResponse.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao atualizar senha',
      code: 'PASSWORD_UPDATE_FAILED',
      route: '/api/user/change-password',
      method: 'POST',
      request,
    });
  }
}

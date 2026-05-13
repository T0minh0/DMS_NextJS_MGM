import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireManagerOrAdmin } from '@/lib/auth/server';
import { scopedWorkerWhere } from '@/lib/auth/scoped-queries';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';

export async function POST(request: Request) {
  try {
    const session = await requireManagerOrAdmin();
    const { id } = await request.json();

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

    const existing = await prisma.workers.findFirst({
      where: scopedWorkerWhere(session, workerId),
    });

    if (!existing) {
      return apiErrorResponse({
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND',
        status: 404,
      });
    }

    const [salesUsage, measurementUsage, contributionsUsage] = await Promise.all([
      prisma.sales.count({ where: { responsible: workerId } }),
      prisma.measurments.count({ where: { wastepicker: workerId } }),
      prisma.workerContributions.count({ where: { wastepicker: workerId } }),
    ]);

    if (salesUsage > 0 || measurementUsage > 0 || contributionsUsage > 0) {
      return apiErrorResponse({
        message:
          'Não é possível excluir este usuário. Existem registros de vendas, medições ou contribuições associados.',
        code: 'USER_DELETE_HAS_DEPENDENCIES',
        status: 400,
      });
    }

    await prisma.workers.delete({
      where: { workerId },
    });

    return NextResponse.json({ message: 'Usuário excluído com sucesso' }, { status: 200 });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao excluir usuário',
      code: 'USER_DELETE_FAILED',
      route: '/api/users/delete',
      method: 'POST',
      request,
    });
  }
}

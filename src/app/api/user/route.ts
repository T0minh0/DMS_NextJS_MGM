import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  determineTargetWorker,
  requireAuth,
} from '@/lib/auth/server';
import { mapDatabaseUserTypeToRole, roleToUserType } from '@/lib/auth/shared';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';
import { decodeBytes, formatWorkerId } from '@/lib/db-utils';
import { digitsOnly } from '@/lib/privacy/pii';

function scopedWorkerWhere(
  session: Awaited<ReturnType<typeof requireAuth>>,
  where: Prisma.WorkersWhereInput,
) {
  if (session.role === 'admin') {
    return where;
  }

  if (session.role === 'worker') {
    return {
      ...where,
      workerId: BigInt(session.workerId),
      cooperative: BigInt(session.cooperativeId),
    };
  }

  return {
    ...where,
    cooperative: BigInt(session.cooperativeId),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    const cpfParam = searchParams.get('cpf');

    if (!idParam && !cpfParam) {
      return apiErrorResponse({
        message: 'ID ou CPF é obrigatório',
        code: 'REQUIRED_USER_LOOKUP',
        status: 400,
      });
    }

    let worker = null;

    if (idParam) {
      try {
        const workerId = BigInt(determineTargetWorker(session, idParam, { required: true }));
        worker = await prisma.workers.findFirst({
          where: scopedWorkerWhere(session, { workerId }),
          include: { cooperativeRef: true },
        });
      } catch {
        return apiErrorResponse({
          message: 'ID inválido',
          code: 'INVALID_USER_ID',
          status: 400,
        });
      }
    }

    if (!worker && cpfParam) {
      const sanitizedCpf = digitsOnly(cpfParam);
      if (!sanitizedCpf) {
        return apiErrorResponse({
          message: 'CPF inválido',
          code: 'INVALID_CPF',
          status: 400,
        });
      }

      worker = await prisma.workers.findFirst({
        where: scopedWorkerWhere(session, { cpf: Buffer.from(sanitizedCpf, 'utf8') }),
        include: { cooperativeRef: true },
      });
    }

    if (!worker) {
      return apiErrorResponse({
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND',
        status: 404,
      });
    }

    determineTargetWorker(session, worker.workerId);
    determineTargetCooperative(session, worker.cooperative);

    const role = mapDatabaseUserTypeToRole(worker.userType) ?? 'worker';
    const userType = roleToUserType(role);

    const cpfValue = decodeBytes(worker.cpf);
    const pisValue = decodeBytes(worker.pis);
    const rgValue = decodeBytes(worker.rg);
    const response = {
      id: worker.workerId.toString(),
      worker_id: Number(worker.workerId),
      wastepicker_id: formatWorkerId(worker.workerId),
      full_name: worker.workerName,
      name: worker.workerName,
      CPF: cpfValue,
      cpf: cpfValue,
      PIS: pisValue,
      pis: pisValue,
      RG: rgValue,
      rg: rgValue,
      role,
      userType,
      user_type: userType,
      email: worker.email,
      gender: worker.gender,
      birth_date: worker.birthDate?.toISOString().split('T')[0] ?? null,
      enter_date: worker.enterDate?.toISOString().split('T')[0] ?? null,
      exit_date: worker.exitDate?.toISOString().split('T')[0] ?? null,
      cooperative_id: worker.cooperative.toString(),
      cooperative_name: worker.cooperativeRef?.cooperativeName ?? null,
    };

    return NextResponse.json(response);
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao buscar dados do usuário',
      code: 'USER_READ_FAILED',
      route: '/api/user',
      method: 'GET',
      request,
    });
  }
}

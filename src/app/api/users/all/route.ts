import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireAdmin } from '@/lib/auth/server';
import { apiRouteErrorResponse } from '@/lib/api/errors';
import {
  decodeBytes,
  formatWorkerId,
  mapUserType,
} from '@/lib/db-utils';
import { maskCpf, maskPis, maskRg } from '@/lib/privacy/pii';

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const users = await prisma.workers.findMany({
      orderBy: { workerName: 'asc' },
    });

    const formattedUsers = users.map((user) => {
      const cpf = maskCpf(decodeBytes(user.cpf));
      const pis = decodeBytes(user.pis);
      const rg = decodeBytes(user.rg);
      const userType = mapUserType(user.userType);

      return {
        _id: user.workerId.toString(),
        id: user.workerId.toString(),
        worker_id: Number(user.workerId),
        user_id: Number(user.workerId),
        wastepicker_id: formatWorkerId(user.workerId),
        full_name: user.workerName,
        worker_name: user.workerName,
        userType,
        user_type: userType,
        cooperative: user.cooperative.toString(),
        cooperative_id: user.cooperative.toString(),
        CPF: cpf,
        cpf,
        PIS: maskPis(pis),
        pis: maskPis(pis),
        RG: maskRg(rg),
        rg: maskRg(rg),
        gender: user.gender,
        birthdate: user.birthDate,
        enter_date: user.enterDate,
        exit_date: user.exitDate,
        email: user.email,
        last_update: user.lastUpdate,
      };
    });

    return NextResponse.json(formattedUsers, { status: 200 });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Falha ao buscar usuários',
      code: 'USERS_ALL_READ_FAILED',
      route: '/api/users/all',
      method: 'GET',
      request,
    });
  }
}

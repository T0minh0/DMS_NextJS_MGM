import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, determineTargetCooperative, requireManagerOrAdmin } from '@/lib/auth/server';
import { apiRouteErrorResponse } from '@/lib/api/errors';
import {
  decodeBytes,
  formatWorkerId,
  mapUserType,
} from '@/lib/db-utils';
import { maskCpf, maskPis, maskRg } from '@/lib/privacy/pii';

export async function GET(request: Request) {
  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const gamificationView = searchParams.get('view') === 'gamification';
    const teamManagementView = searchParams.get('view') === 'team-management';
    const targetCooperativeId = determineTargetCooperative(session);
    const workers = await prisma.workers.findMany({
      where: targetCooperativeId ? { cooperative: BigInt(targetCooperativeId) } : undefined,
      orderBy: { workerName: 'asc' },
      include: { cooperativeRef: true },
    });

    const formattedWorkers = workers
      .filter((worker) => {
        const userType = mapUserType(worker.userType);

        if (gamificationView) {
          return userType === 1;
        }

        return teamManagementView || userType === 1;
      })
      .map((worker) => {
        const userType = mapUserType(worker.userType) ?? 1;

        if (gamificationView) {
          return {
            _id: worker.workerId.toString(),
            id: worker.workerId.toString(),
            wastepicker_id: formatWorkerId(worker.workerId),
            worker_id: Number(worker.workerId),
            user_id: Number(worker.workerId),
            user_type: userType,
            full_name: worker.workerName,
            worker_name: worker.workerName,
            cooperative: worker.cooperative.toString(),
            cooperative_id: worker.cooperative.toString(),
            cooperative_name: worker.cooperativeRef?.cooperativeName ?? null,
          };
        }

        const cpf = maskCpf(decodeBytes(worker.cpf));
        const pis = decodeBytes(worker.pis);
        const rg = decodeBytes(worker.rg);

        return {
          _id: worker.workerId.toString(),
          id: worker.workerId.toString(),
          wastepicker_id: formatWorkerId(worker.workerId),
          worker_id: Number(worker.workerId),
          user_id: Number(worker.workerId),
          user_type: userType,
          full_name: worker.workerName,
          worker_name: worker.workerName,
          cooperative: worker.cooperative.toString(),
          cooperative_id: worker.cooperative.toString(),
          cooperative_name: worker.cooperativeRef?.cooperativeName ?? null,
          CPF: cpf,
          cpf,
          PIS: maskPis(pis),
          pis: maskPis(pis),
          RG: maskRg(rg),
          rg: maskRg(rg),
          gender: worker.gender,
          birthdate: worker.birthDate,
          enter_date: worker.enterDate,
          exit_date: worker.exitDate,
          email: worker.email,
          last_update: worker.lastUpdate,
        };
      });

    return NextResponse.json(formattedWorkers);
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Failed to fetch users',
      code: 'USERS_READ_FAILED',
      route: '/api/users',
      method: 'GET',
      request,
    });
  }
}

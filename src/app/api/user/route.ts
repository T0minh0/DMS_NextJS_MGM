import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  determineTargetWorker,
  requireAuth,
} from '@/lib/auth/server';
import { mapDatabaseUserTypeToRole, roleToUserType } from '@/lib/auth/shared';
import { decodeBytes, formatWorkerId } from '@/lib/db-utils';

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    const cpfParam = searchParams.get('cpf');

    if (!idParam && !cpfParam) {
      return NextResponse.json({ message: 'ID ou CPF é obrigatório' }, { status: 400 });
    }

    let worker = null;

    if (idParam) {
      try {
        const workerId = BigInt(determineTargetWorker(session, idParam, { required: true }));
        worker = await prisma.workers.findUnique({
          where: { workerId },
          include: { cooperativeRef: true },
        });
      } catch {
        return NextResponse.json({ message: 'ID inválido' }, { status: 400 });
      }
    }

    if (!worker && cpfParam) {
      const sanitizedCpf = cpfParam.replace(/\D/g, '');
      worker = await prisma.workers.findFirst({
        where: { cpf: Buffer.from(sanitizedCpf, 'utf8') },
        include: { cooperativeRef: true },
      });
    }

    if (!worker) {
      return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 });
    }

    determineTargetWorker(session, worker.workerId);
    determineTargetCooperative(session, worker.cooperative);

    const role = mapDatabaseUserTypeToRole(worker.userType) ?? 'worker';
    const userType = roleToUserType(role);

    const cpfValue = decodeBytes(worker.cpf);
    const response = {
      id: worker.workerId.toString(),
      worker_id: Number(worker.workerId),
      wastepicker_id: formatWorkerId(worker.workerId),
      full_name: worker.workerName,
      cpf: cpfValue,
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
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error('Error fetching user:', error);
    return NextResponse.json({ message: 'Erro ao buscar dados do usuário' }, { status: 500 });
  }
}

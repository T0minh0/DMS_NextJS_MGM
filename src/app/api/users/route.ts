import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  decodeBytes,
  formatWorkerId,
  mapUserType,
  sanitizeDigits,
} from '@/lib/db-utils';

export async function GET() {
  try {
    const workers = await prisma.workers.findMany({
      orderBy: { workerName: 'asc' },
      include: { cooperativeRef: true },
    });

    const formattedWorkers = workers
      .filter((worker) => mapUserType(worker.userType) === 1)
      .map((worker) => {
        const cpf = sanitizeDigits(decodeBytes(worker.cpf));
        const pis = decodeBytes(worker.pis);
        const rg = decodeBytes(worker.rg);

        return {
          wastepicker_id: formatWorkerId(worker.workerId),
          worker_id: Number(worker.workerId),
          user_id: Number(worker.workerId),
          user_type: 1,
          full_name: worker.workerName,
          worker_name: worker.workerName,
          cooperative: worker.cooperative.toString(),
          cooperative_id: worker.cooperative.toString(),
          cooperative_name: worker.cooperativeRef?.cooperativeName ?? null,
          CPF: cpf,
          cpf,
          PIS: pis,
          pis,
          RG: rg,
          rg,
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
    console.error('Error fetching users:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch users',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

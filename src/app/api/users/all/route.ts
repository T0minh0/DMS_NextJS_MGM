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
    const users = await prisma.workers.findMany({
      orderBy: { workerName: 'asc' },
    });

    const formattedUsers = users.map((user) => {
      const cpf = sanitizeDigits(decodeBytes(user.cpf));
      const pis = decodeBytes(user.pis);
      const rg = decodeBytes(user.rg);
      const userType = mapUserType(user.userType);

      return {
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
        PIS: pis,
        pis,
        RG: rg,
        rg,
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
    console.error('Failed to fetch users:', error);
    return NextResponse.json(
      { message: 'Falha ao buscar usuários' },
      { status: 500 },
    );
  }
}

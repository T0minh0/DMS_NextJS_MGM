import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireAdmin } from '@/lib/auth/server';
import { formatWorkerId } from '@/lib/db-utils';
import { getDebugRouteDisabledResponse } from '@/lib/debug-routes';

const MODEL_LIST = [
  'Workers',
  'Materials',
  'Sales',
  'Measurments',
  'Stock',
  'WorkerContributions',
  'Buyers',
  'Cooperative',
  'Devices',
  'Groups',
];

export async function GET() {
  try {
    await requireAdmin();
    const disabledResponse = getDebugRouteDisabledResponse();
    if (disabledResponse) {
      return disabledResponse;
    }

    const [byId, byCpf] = await Promise.all([
      prisma.workers.findFirst({
        where: { workerId: BigInt(5) },
        select: {
          workerId: true,
          workerName: true,
          cooperative: true,
          userType: true,
        },
      }),
      prisma.workers.findFirst({
        where: { cpf: Buffer.from('56789012345', 'utf8') },
        select: {
          workerId: true,
          workerName: true,
          cooperative: true,
          userType: true,
        },
      }),
    ]);

    const response = {
      byWastepickerId: byId
        ? {
          workerId: byId.workerId.toString(),
          wastepicker_id: formatWorkerId(byId.workerId),
          workerName: byId.workerName,
          cooperative: byId.cooperative.toString(),
          userType: byId.userType,
        }
        : null,
      byCpf: byCpf
        ? {
          workerId: byCpf.workerId.toString(),
          wastepicker_id: formatWorkerId(byCpf.workerId),
          workerName: byCpf.workerName,
          cooperative: byCpf.cooperative.toString(),
          userType: byCpf.userType,
        }
        : null,
      models: MODEL_LIST,
      notes:
        'Resultados retornam null quando o cadastro ainda não existe na base SQL. Utilize o seed ou cadastre um novo trabalhador.',
    };

    return NextResponse.json(response);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error('Error in debug endpoint:', error);
    return NextResponse.json(
      { message: 'Error in debug endpoint', error: String(error) },
      { status: 500 },
    );
  }
}

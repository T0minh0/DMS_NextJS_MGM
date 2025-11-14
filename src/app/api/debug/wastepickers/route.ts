import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatWorkerId, decodeBytes } from '@/lib/db-utils';

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
    const [byId, byCpf] = await Promise.all([
      prisma.workers.findFirst({
        where: { workerId: 5n },
        select: {
          workerId: true,
          workerName: true,
          cpf: true,
          cooperative: true,
          userType: true,
        },
      }),
      prisma.workers.findFirst({
        where: { cpf: Buffer.from('56789012345', 'utf8') },
        select: {
          workerId: true,
          workerName: true,
          cpf: true,
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
            cpf: decodeBytes(byId.cpf),
            cooperative: byId.cooperative.toString(),
            userType: byId.userType,
          }
        : null,
      byCpf: byCpf
        ? {
            workerId: byCpf.workerId.toString(),
            wastepicker_id: formatWorkerId(byCpf.workerId),
            workerName: byCpf.workerName,
            cpf: decodeBytes(byCpf.cpf),
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
    console.error('Error in debug endpoint:', error);
    return NextResponse.json(
      { message: 'Error in debug endpoint', error: String(error) },
      { status: 500 },
    );
  }
}

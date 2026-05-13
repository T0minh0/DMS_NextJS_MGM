import { Prisma } from '@prisma/client';
import { AuthSession } from './shared';

export function scopedWorkerWhere(
  session: AuthSession,
  workerId: bigint,
): Prisma.WorkersWhereInput {
  if (session.role === 'admin') {
    return { workerId };
  }

  if (session.role === 'worker') {
    return {
      workerId: BigInt(session.workerId),
      cooperative: BigInt(session.cooperativeId),
      AND: [{ workerId }],
    };
  }

  return {
    workerId,
    cooperative: BigInt(session.cooperativeId),
  };
}

export function scopedSaleWhere(
  session: AuthSession,
  saleId: bigint,
): Prisma.SalesWhereInput {
  if (session.role === 'admin') {
    return { saleId };
  }

  return {
    saleId,
    responsibleRef: {
      cooperative: BigInt(session.cooperativeId),
    },
  };
}

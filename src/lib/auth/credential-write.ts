import type { PrismaClient } from '@prisma/client';
export async function writePasswordIfVersion(db: Pick<PrismaClient, 'workers'>, workerId: bigint, version: number, password: Buffer) {
  const changed = await db.workers.updateMany({where:{workerId,authVersion:version},data:{password:new Uint8Array(password),authVersion:{increment:1},lastUpdate:new Date()}});
  return changed.count === 1;
}

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { writePasswordIfVersion } from '../src/lib/auth/credential-write';
const url = process.env.AUTH_TEST_DATABASE_URL;
const safe = url === 'postgresql://cammis@127.0.0.1:55491/dms_auth_migration';
test('web conditional credential write rejects a concurrent password reset in PostgreSQL', {skip:!safe}, async () => {
  const db = new PrismaClient({datasources:{db:{url}}});
  const coop = await db.cooperative.create({data:{cooperativeName:'Web auth test'}});
  const worker = await db.workers.create({data:{workerName:'Web auth test',cooperative:coop.cooperativeId,cpf:Buffer.from('00000000999'),userType:'1',birthDate:new Date('2000-01-01'),enterDate:new Date('2020-01-01'),pis:Buffer.from('0'),rg:Buffer.from('0'),password:Buffer.from('old'),email:'x@example.test'}});
  try {
    await db.workers.update({where:{workerId:worker.workerId},data:{password:Buffer.from('recovered'),authVersion:{increment:1}}});
    assert.equal(await writePasswordIfVersion(db,worker.workerId,worker.authVersion,Buffer.from('stale')),false);
    const result = await db.workers.findUniqueOrThrow({where:{workerId:worker.workerId}}); assert.equal(Buffer.from(result.password).toString(),'recovered'); assert.equal(result.authVersion,1);
  } finally { await db.workers.delete({where:{workerId:worker.workerId}}); await db.cooperative.delete({where:{cooperativeId:coop.cooperativeId}}); await db.$disconnect(); }
});

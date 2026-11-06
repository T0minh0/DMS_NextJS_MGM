import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireAdmin } from '@/lib/auth/server';
import { getDebugRouteDisabledResponse } from '@/lib/debug-routes';
import { AuthError, mapDatabaseUserTypeToRole } from '@/lib/auth/shared';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';

const TEST_CPF = '00000000999';
const TEST_PASSWORD = 'test123';

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();

    const disabledResponse = getDebugRouteDisabledResponse({ allowProductionOverride: false });
    if (disabledResponse) {
      return disabledResponse;
    }

    const cooperative = await prisma.cooperative.findFirst();
    if (!cooperative) {
      return apiErrorResponse({
        message: 'Nenhuma cooperativa cadastrada. Execute o seed primeiro.',
        code: 'DEBUG_COOPERATIVE_REQUIRED',
        status: 400,
      });
    }

    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    const cpfBytes = Buffer.from(TEST_CPF, 'utf8');

    const existing = await prisma.workers.findFirst({
      where: { cpf: cpfBytes },
      select: { workerId: true, authVersion: true },
    });

    if (existing) {
      await prisma.$transaction(async tx => {
        const actorId = BigInt(session.workerId); const first = actorId < existing.workerId ? actorId : existing.workerId; const second = actorId < existing.workerId ? existing.workerId : actorId;
        await tx.$queryRaw`SELECT "Worker_id" FROM "Workers" WHERE "Worker_id" IN (${first}, ${second}) ORDER BY "Worker_id" FOR UPDATE`;
        const actor = await tx.workers.findUnique({where:{workerId:actorId},select:{authVersion:true,userType:true,cooperative:true}});
        if (!actor || actor.authVersion !== (session.authVersion ?? 0) || mapDatabaseUserTypeToRole(actor.userType) !== session.role || actor.cooperative.toString() !== session.cooperativeId) throw new AuthError('Sessão alterada', 401, 'SESSION_REVOKED');
        const changed = await tx.workers.updateMany({where:{workerId:existing.workerId,authVersion:existing.authVersion},data:{password:Buffer.from(hashedPassword,'utf8'),authVersion:{increment:1},lastUpdate:new Date()}});
        if (!changed.count) throw new AuthError('Credencial alterada',409,'CREDENTIAL_CHANGED');
      });

      return NextResponse.json({
        message: 'Test user updated successfully',
        credentials: {
          cpf: TEST_CPF,
          password: TEST_PASSWORD,
        },
      });
    }

    const now = new Date();
    await prisma.workers.create({
      data: {
        workerName: 'Test User',
        cooperative: cooperative.cooperativeId,
        cpf: cpfBytes,
        userType: '1',
        birthDate: new Date('1990-01-01'),
        enterDate: now,
        exitDate: null,
        pis: Buffer.from('90000000999', 'utf8'),
        rg: Buffer.from('990000999', 'utf8'),
        gender: 'Não informado',
        password: Buffer.from(hashedPassword, 'utf8'),
        email: 'test.user@example.com',
        lastUpdate: now,
      },
    });

    return NextResponse.json({
      message: 'Test user created successfully',
      credentials: {
        cpf: TEST_CPF,
        password: TEST_PASSWORD,
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Server error',
      code: 'DEBUG_TEST_USER_FAILED',
      route: '/api/debug/create-test-user',
      method: 'GET',
      request,
    });
  }
}

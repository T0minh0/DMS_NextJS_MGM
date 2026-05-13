import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireAdmin } from '@/lib/auth/server';
import { getDebugRouteDisabledResponse } from '@/lib/debug-routes';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';

const TEST_CPF = '12345678900';
const TEST_PASSWORD = 'test123';

export async function GET(request: Request) {
  try {
    await requireAdmin();

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
      select: { workerId: true },
    });

    if (existing) {
      await prisma.workers.update({
        where: { workerId: existing.workerId },
        data: {
          password: Buffer.from(hashedPassword, 'utf8'),
          lastUpdate: new Date(),
        },
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
        pis: Buffer.from('12345678901', 'utf8'),
        rg: Buffer.from('123456789', 'utf8'),
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

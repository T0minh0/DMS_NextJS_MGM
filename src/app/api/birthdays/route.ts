import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, determineTargetCooperative, requireManagerOrAdmin, requireScopedPermission } from '@/lib/auth/server';
import { apiRouteErrorResponse } from '@/lib/api/errors';

export async function GET(request: Request) {
  try {
    const session = await requireManagerOrAdmin();
    const targetCooperativeId = determineTargetCooperative(session);
    requireScopedPermission(session, 'notices', 'read', targetCooperativeId ? 'cooperative' : 'global');

    const now = new Date();
    const currentMonth = now.getMonth() + 1;

    const birthdays = await prisma.workers.findMany({
      where: {
        userType: { in: ['1', 'W', 'w', 'C', 'c'] },
        ...(targetCooperativeId ? { cooperative: BigInt(targetCooperativeId) } : {}),
      },
      select: {
        workerName: true,
        birthDate: true,
      },
      orderBy: { birthDate: 'asc' },
    });

    const formatted = birthdays.filter((item) => item.birthDate.getMonth() + 1 === currentMonth).map((item) => {
      const birthdate = new Date(item.birthDate);
      const day = birthdate.getDate().toString().padStart(2, '0');
      const month = (birthdate.getMonth() + 1).toString().padStart(2, '0');

      return {
        name: item.workerName,
        date: `${day}/${month}`,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Failed to fetch birthdays data',
      code: 'BIRTHDAYS_READ_FAILED',
      route: '/api/birthdays',
      method: 'GET',
      request,
    });
  }
}

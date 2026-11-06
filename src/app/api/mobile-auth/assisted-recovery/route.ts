import { apiErrorResponse } from '@/lib/api/errors';
import { NextResponse } from 'next/server';
import {
  requireManagerOrAdmin,
  requireScopedPermission,
  authErrorResponse,
} from '@/lib/auth/server';
import { callMobileAuth, sameOrigin } from '@/lib/mobile-auth-proxy';
import prisma from '@/lib/prisma';
import { decodeBytes } from '@/lib/db-utils';
import { mapDatabaseUserTypeToRole } from '@/lib/auth/shared';
export async function POST(request: Request) {
  if (
    !sameOrigin(
      request.headers.get('origin'),
      process.env.RECOVERY_WEB_URL ?? request.url,
    )
  )
    return apiErrorResponse({
      message: 'Origem não permitida.',
      code: 'RECOVERY_REQUEST_FAILED',
      status: 403,
    });
  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(
      session,
      'users',
      'update',
      session.role === 'admin' ? 'global' : 'cooperative',
    );
    const raw = await request.text();
    if (raw.length > 2048)
      return apiErrorResponse({
        message: 'Dados inválidos.',
        code: 'RECOVERY_REQUEST_FAILED',
        status: 400,
      });
    const input = JSON.parse(raw) as {
      workerId?: unknown;
      currentPassword?: unknown;
      reason?: unknown;
    };
    if (
      typeof input.workerId !== 'string' ||
      !/^\d+$/.test(input.workerId) ||
      typeof input.currentPassword !== 'string' ||
      !input.currentPassword ||
      input.currentPassword.length > 128 ||
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 3 ||
      input.reason.length > 500
    )
      return apiErrorResponse({
        message: 'Informe a pessoa, sua senha e o motivo do atendimento.',
        code: 'RECOVERY_REQUEST_FAILED',
        status: 400,
      });
    const [actor, target] = await Promise.all([
      prisma.workers.findUnique({
        where: { workerId: BigInt(session.workerId) },
        select: { cpf: true },
      }),
      prisma.workers.findUnique({
        where: { workerId: BigInt(input.workerId) },
        select: { cooperative: true, userType: true },
      }),
    ]);
    if (
      !actor ||
      !target ||
      String(target.cooperative) !== session.cooperativeId ||
      mapDatabaseUserTypeToRole(target.userType) !== 'worker'
    )
      return apiErrorResponse({
        message: 'Atendimento não permitido.',
        code: 'RECOVERY_REQUEST_FAILED',
        status: 403,
      });
    const reauth = await callMobileAuth('login', {
      cpf: decodeBytes(actor.cpf),
      password: input.currentPassword,
    });
    const user = reauth.body.user as
      { id?: string; userType?: string } | undefined;
    if (
      reauth.status !== 200 ||
      user?.id !== session.workerId ||
      user?.userType !== 'manager' ||
      typeof reauth.body.accessToken !== 'string'
    )
      return apiErrorResponse({
        message: 'Sua senha não confere. Tente novamente.',
        code: 'RECOVERY_REQUEST_FAILED',
        status: 401,
      });
    const result = await callMobileAuth(
      'assisted-recovery',
      {
        workerId: input.workerId,
        currentPassword: input.currentPassword,
        reason: input.reason.trim(),
      },
      reauth.body.accessToken,
    );
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return apiErrorResponse({
      message: 'Não foi possível iniciar a recuperação. Tente novamente.',
      code: 'RECOVERY_REQUEST_FAILED',
      status: 503,
    });
  }
}

export async function GET() {
  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'users', 'read', 'cooperative');
    const rows = await prisma.workers.findMany({
      where: { cooperative: BigInt(session.cooperativeId), exitDate: null },
      select: { workerId: true, workerName: true, userType: true },
      orderBy: { workerName: 'asc' },
    });
    return NextResponse.json(
      rows
        .filter((w) => mapDatabaseUserTypeToRole(w.userType) === 'worker')
        .map((w) => ({ id: String(w.workerId), name: w.workerName })),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return apiErrorResponse({
      message: 'Não foi possível carregar a equipe.',
      code: 'RECOVERY_REQUEST_FAILED',
      status: 503,
    });
  }
}

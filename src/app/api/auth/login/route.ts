import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { AUTH_COOKIE_NAME, AUTH_TOKEN_TTL_SECONDS, mapDatabaseUserTypeToRole, roleToUserType } from '@/lib/auth/shared';
import { signAuthToken } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import {
  clearLoginFailures,
  comparePasswordWithDummy,
  getLoginRateLimit,
  recordLoginFailure,
} from '@/lib/auth/login-guard';
import {
  decodeBytes,
  formatWorkerId,
  sanitizeDigits,
} from '@/lib/db-utils';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';

interface RawWorker {
  workerId: bigint;
  workerName: string;
  cooperative: bigint;
  cpf: Buffer;
  userType: string;
  birthDate: Date;
  enterDate: Date;
  exitDate: Date | null;
  pis: Buffer;
  rg: Buffer;
  gender: string | null;
  password: Buffer;
  email: string;
  lastUpdate: Date | null;
}

export async function POST(request: Request) {
  const context = createLogContext(request, { domain: 'auth' });

  try {
    const body = await request.json();
    const { cpf, password } = body as { cpf?: string; password?: string };

    if (!cpf || !password) {
      logWarn('auth.login.missing_credentials', context);
      return apiErrorResponse({
        message: 'CPF e senha são obrigatórios',
        code: 'LOGIN_MISSING_CREDENTIALS',
        status: 400,
        requestId: context.requestId,
      });
    }

    const normalizedCpf = sanitizeDigits(cpf);
    const rateLimit = getLoginRateLimit(request, normalizedCpf);
    if (rateLimit.limited) {
      logWarn('auth.login.rate_limited', context, {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return apiErrorResponse({
        message: 'Muitas tentativas de login. Tente novamente mais tarde.',
        code: 'TOO_MANY_LOGIN_ATTEMPTS',
        status: 429,
        requestId: context.requestId,
      });
    }

    const workers = await prisma.$queryRaw<RawWorker[]>`
      SELECT
        "Worker_id"   AS "workerId",
        "Worker_name" AS "workerName",
        "Cooperative" AS "cooperative",
        "CPF"         AS "cpf",
        "User_type"   AS "userType",
        "Birth_date"  AS "birthDate",
        "Enter_date"  AS "enterDate",
        "Exit_date"   AS "exitDate",
        "PIS"         AS "pis",
        "RG"          AS "rg",
        "Gender"      AS "gender",
        "Password"    AS "password",
        "Email"       AS "email",
        "Last_update" AS "lastUpdate"
      FROM "Workers"
      WHERE regexp_replace(encode("CPF", 'escape'), '\\D', '', 'g') = ${normalizedCpf}
      LIMIT 1;
    `;

    const worker = workers[0];
    const role = worker ? mapDatabaseUserTypeToRole(worker.userType) : null;
    const storedPassword = worker ? decodeBytes(worker.password) : null;
    const { passwordIsValid, usedLegacyPassword } = await comparePasswordWithDummy(
      password,
      storedPassword,
    );

    if (usedLegacyPassword && worker) {
      logWarn('auth.login.legacy_password_rejected', context, {
        workerId: worker.workerId.toString(),
        role: role ?? 'unknown',
      });
    }

    if (!worker || !passwordIsValid) {
      recordLoginFailure(request, normalizedCpf);
      logWarn('auth.login.invalid_credentials', context, {
        reason: worker ? 'password_mismatch' : 'user_not_found',
        workerId: worker?.workerId.toString(),
        role: role ?? undefined,
      });
      return apiErrorResponse({
        message: 'Credenciais inválidas',
        code: 'INVALID_CREDENTIALS',
        status: 401,
        requestId: context.requestId,
      });
    }

    if (!role) {
      recordLoginFailure(request, normalizedCpf);
      logWarn('auth.login.invalid_user_type', context, { workerId: worker.workerId.toString() });
      return apiErrorResponse({
        message: 'Tipo de usuário inválido',
        code: 'INVALID_USER_TYPE',
        status: 403,
        requestId: context.requestId,
      });
    }

    if (role === 'worker') {
      recordLoginFailure(request, normalizedCpf);
      logWarn('auth.login.web_role_denied', context, {
        role,
        workerId: worker.workerId.toString(),
        cooperativeId: worker.cooperative.toString(),
      });
      return apiErrorResponse({
        message: 'Acesso restrito apenas para gestores',
        code: 'WEB_ROLE_DENIED',
        status: 403,
        requestId: context.requestId,
      });
    }

    const fullName = worker.workerName || 'Usuário';
    const workerId = worker.workerId;
    const cooperative = await prisma.cooperative.findUnique({
      where: { cooperativeId: worker.cooperative },
      select: { cooperativeName: true },
    });
    const userType = roleToUserType(role);

    const token = signAuthToken({
      workerId: workerId.toString(),
      cooperativeId: worker.cooperative.toString(),
      cooperativeName: cooperative?.cooperativeName ?? null,
      role,
      userType,
      name: fullName,
      cpf: normalizedCpf,
    });

    const cookieStore = await cookies();
    cookieStore.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_TOKEN_TTL_SECONDS,
      sameSite: 'strict',
    });
    clearLoginFailures(request, normalizedCpf);

    logInfo('auth.login.succeeded', context, {
      workerId: workerId.toString(),
      cooperativeId: worker.cooperative.toString(),
      role,
    });

    return NextResponse.json({
      message: 'Login realizado com sucesso',
      user: {
        id: workerId.toString(),
        workerId: workerId.toString(),
        worker_id: Number(workerId),
        name: fullName,
        full_name: fullName,
        role,
        userType,
        user_type: userType,
        cooperativeId: worker.cooperative.toString(),
        cooperative_id: worker.cooperative.toString(),
        cooperative_name: cooperative?.cooperativeName ?? null,
        wastepicker_id: formatWorkerId(workerId),
      },
    });
  } catch (error) {
    return apiInternalErrorResponse({
      message: 'Erro no servidor',
      code: 'LOGIN_INTERNAL_ERROR',
      context,
      event: 'auth.login.failed',
      error,
    });
  }
}

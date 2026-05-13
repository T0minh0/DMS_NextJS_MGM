import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { AUTH_COOKIE_NAME, AUTH_TOKEN_TTL_SECONDS, mapDatabaseUserTypeToRole, roleToUserType } from '@/lib/auth/shared';
import { signAuthToken } from '@/lib/auth/server';
import {
  decodeBytes,
  formatWorkerId,
  sanitizeDigits,
} from '@/lib/db-utils';

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

function isBcryptHash(value: string) {
  return /^\$2[abxy]\$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cpf, password } = body as { cpf?: string; password?: string };

    if (!cpf || !password) {
      return NextResponse.json(
        { message: 'CPF e senha são obrigatórios' },
        { status: 400 },
      );
    }

    const normalizedCpf = sanitizeDigits(cpf);

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

    if (!worker) {
      return NextResponse.json(
        { message: 'Usuário não encontrado' },
        { status: 401 },
      );
    }

    const role = mapDatabaseUserTypeToRole(worker.userType);

    if (!role) {
      return NextResponse.json(
        { message: 'Tipo de usuário inválido' },
        { status: 403 },
      );
    }

    if (role === 'worker') {
      return NextResponse.json(
        { message: 'Acesso restrito apenas para gerentes' },
        { status: 403 },
      );
    }

    const storedPassword = decodeBytes(worker.password);

    let passwordIsValid = false;

    if (isBcryptHash(storedPassword)) {
      passwordIsValid = await bcrypt.compare(password, storedPassword);
    } else if (storedPassword) {
      console.warn('Rejected login for worker with non-bcrypt password hash');
    }

    if (!passwordIsValid) {
      return NextResponse.json(
        { message: 'Senha incorreta' },
        { status: 401 },
      );
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
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'Erro no servidor' },
      { status: 500 },
    );
  }
}

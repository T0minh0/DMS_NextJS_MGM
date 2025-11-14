import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import {
  decodeBytes,
  formatWorkerId,
  mapUserType,
  sanitizeDigits,
} from '@/lib/db-utils';

// JWT secret key - in production this should be stored in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'dms-dashboard-secret-key';

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

    const userType = mapUserType(worker.userType);

    if (userType !== 0) {
      return NextResponse.json(
        { message: 'Acesso restrito apenas para gerentes' },
        { status: 403 },
      );
    }

    const storedPassword = decodeBytes(worker.password);

    let passwordIsValid = false;

    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
      passwordIsValid = await bcrypt.compare(password, storedPassword);
    } else if (storedPassword) {
      passwordIsValid = password === storedPassword;
    }

    if (!passwordIsValid) {
      return NextResponse.json(
        { message: 'Senha incorreta' },
        { status: 401 },
      );
    }

    const fullName = worker.workerName || 'Usuário';
    const workerId = worker.workerId;

    const token = jwt.sign(
      {
        id: workerId.toString(),
        name: fullName,
        cpf: normalizedCpf,
        userType,
      },
      JWT_SECRET,
      { expiresIn: '8h' },
    );

    cookies().set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8,
      sameSite: 'strict',
    });

    return NextResponse.json({
      message: 'Login realizado com sucesso',
      user: {
        id: workerId.toString(),
        name: fullName,
        full_name: fullName,
        userType,
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

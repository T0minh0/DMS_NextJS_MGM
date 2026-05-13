import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authErrorResponse, determineTargetCooperative, requireManagerOrAdmin } from '@/lib/auth/server';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';
import { sanitizeDigits } from '@/lib/db-utils';

export async function POST(request: Request) {
  try {
    const session = await requireManagerOrAdmin();
    const {
      full_name,
      CPF,
      email,
      PIS,
      RG,
      user_type,
      password,
      birth_date,
      enter_date,
      exit_date,
      gender,
      cooperative_id,
    } = await request.json();

    if (!full_name || !CPF || !password || !birth_date || !enter_date || !cooperative_id || !PIS || !RG) {
      return apiErrorResponse({
        message: 'Nome, CPF, senha, datas, cooperativa, PIS e RG são obrigatórios',
        code: 'REQUIRED_USER_FIELDS',
        status: 400,
      });
    }

    const userTypeNumber = Number(user_type);
    if (!Number.isFinite(userTypeNumber) || (userTypeNumber !== 0 && userTypeNumber !== 1)) {
      return apiErrorResponse({
        message: 'Tipo de usuário inválido',
        code: 'INVALID_USER_TYPE',
        status: 400,
      });
    }

    const targetCooperativeId = determineTargetCooperative(session, cooperative_id, { required: true });
    let cooperativeBigInt: bigint;
    try {
      cooperativeBigInt = BigInt(targetCooperativeId);
    } catch {
      return apiErrorResponse({
        message: 'Cooperativa inválida',
        code: 'INVALID_COOPERATIVE',
        status: 400,
      });
    }

    const cpfDigits = sanitizeDigits(CPF);
    const pisDigits = sanitizeDigits(PIS);
    const rgDigits = sanitizeDigits(RG);

    if (!cpfDigits || !pisDigits || !rgDigits) {
      return apiErrorResponse({
        message: 'CPF, PIS e RG devem conter apenas números',
        code: 'INVALID_DOCUMENTS',
        status: 400,
      });
    }

    const birthDateObj = new Date(birth_date);
    const enterDateObj = new Date(enter_date);
    if (Number.isNaN(birthDateObj.getTime()) || Number.isNaN(enterDateObj.getTime())) {
      return apiErrorResponse({
        message: 'Datas inválidas',
        code: 'INVALID_DATES',
        status: 400,
      });
    }

    let exitDateObj: Date | null = null;
    if (exit_date) {
      exitDateObj = new Date(exit_date);
      if (Number.isNaN(exitDateObj.getTime())) {
        return apiErrorResponse({
          message: 'Data de saída inválida',
          code: 'INVALID_EXIT_DATE',
          status: 400,
        });
      }
    }

    const existing = await prisma.workers.findFirst({
      where: { cpf: Buffer.from(cpfDigits, 'utf8') },
      select: { workerId: true, cooperative: true },
    });

    if (existing) {
      return apiErrorResponse({
        message: 'Não foi possível concluir o cadastro com os dados informados',
        code: 'USER_CREATE_CONFLICT',
        status: 409,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    const created = await prisma.workers.create({
      data: {
        workerName: full_name.trim(),
        cooperative: cooperativeBigInt,
        cpf: Buffer.from(cpfDigits, 'utf8'),
        userType: String(userTypeNumber),
        birthDate: birthDateObj,
        enterDate: enterDateObj,
        exitDate: exitDateObj,
        pis: Buffer.from(pisDigits, 'utf8'),
        rg: Buffer.from(rgDigits, 'utf8'),
        gender: gender?.trim() || null,
        password: Buffer.from(passwordHash, 'utf8'),
        email: email?.trim() || 'sem-email@coop.local',
        lastUpdate: now,
      },
    });

    return NextResponse.json(
      {
        message: userTypeNumber === 1 ? 'Catador criado com sucesso!' : 'Usuário de gerência criado com sucesso!',
        user: {
          id: created.workerId.toString(),
          full_name: created.workerName,
          cooperative_id: created.cooperative.toString(),
          user_type: userTypeNumber,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao criar usuário',
      code: 'USER_CREATE_FAILED',
      route: '/api/users/create',
      method: 'POST',
      request,
    });
  }
}

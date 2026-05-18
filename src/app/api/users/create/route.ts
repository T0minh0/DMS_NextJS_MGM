import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';
import { normalizeCpfDigits, normalizePisDigits, normalizeRgDigits } from '@/lib/privacy/pii';

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
    requireScopedPermission(
      session,
      'users',
      'create',
      session.role === 'admin' && targetCooperativeId !== session.cooperativeId ? 'global' : 'cooperative',
    );

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

    const cpfDigits = normalizeCpfDigits(CPF);
    const pisDigits = normalizePisDigits(PIS);
    const rgDigits = normalizeRgDigits(RG);

    if (!cpfDigits || !pisDigits || !rgDigits) {
      return apiErrorResponse({
        message: 'CPF e PIS devem conter 11 dígitos; RG deve conter 8 ou 9 dígitos',
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

    const cpfBuffer = Buffer.from(cpfDigits, 'utf8');
    const pisBuffer = Buffer.from(pisDigits, 'utf8');
    const rgBuffer = Buffer.from(rgDigits, 'utf8');
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "Workers" IN SHARE ROW EXCLUSIVE MODE`;

      const existing = await tx.workers.findFirst({
        where: { cpf: cpfBuffer },
        select: { workerId: true },
      });

      if (existing) {
        return { created: null };
      }

      const now = new Date();

      const created = await tx.workers.create({
        data: {
          workerName: full_name.trim(),
          cooperative: cooperativeBigInt,
          cpf: cpfBuffer,
          userType: String(userTypeNumber),
          birthDate: birthDateObj,
          enterDate: enterDateObj,
          exitDate: exitDateObj,
          pis: pisBuffer,
          rg: rgBuffer,
          gender: gender?.trim() || null,
          password: Buffer.from(passwordHash, 'utf8'),
          email: email?.trim() || 'sem-email@coop.local',
          lastUpdate: now,
        },
      });

      return { created };
    });

    if (!result.created) {
      return apiErrorResponse({
        message: 'Não foi possível concluir o cadastro com os dados informados',
        code: 'USER_CREATE_CONFLICT',
        status: 409,
      });
    }

    return NextResponse.json(
      {
        message: userTypeNumber === 1 ? 'Integrante operacional cadastrado com sucesso!' : 'Usuário de gestão cadastrado com sucesso!',
        user: {
          id: result.created.workerId.toString(),
          full_name: result.created.workerName,
          cooperative_id: result.created.cooperative.toString(),
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

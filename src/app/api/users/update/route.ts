import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { scopedWorkerWhere } from '@/lib/auth/scoped-queries';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';
import { normalizePhoneValue, normalizePisDigits, normalizeRgDigits } from '@/lib/privacy/pii';
import { shouldBlockWorkerCooperativeTransfer } from '@/lib/users/dependencies';

function isMaskedDocument(value: unknown) {
  return typeof value === 'string' && value.includes('*');
}

export async function POST(request: Request) {
  try {
    const session = await requireManagerOrAdmin();
    const body = await request.json();
    const {
      id,
      full_name,
      email,
      phone,
      PIS,
      RG,
      user_type,
      password,
      birth_date,
      enter_date,
      exit_date,
      gender,
      cooperative_id,
    } = body;
    const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone');

    if (!id || !full_name || !birth_date || !enter_date || !cooperative_id) {
      return apiErrorResponse({
        message: 'ID, nome, datas e cooperativa são obrigatórios',
        code: 'REQUIRED_USER_FIELDS',
        status: 400,
      });
    }

    let workerId: bigint;
    try {
      workerId = BigInt(id);
    } catch {
      return apiErrorResponse({
        message: 'ID inválido',
        code: 'INVALID_USER_ID',
        status: 400,
      });
    }

    const existing = await prisma.workers.findFirst({
      where: scopedWorkerWhere(session, workerId),
    });

    if (!existing) {
      return apiErrorResponse({
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND',
        status: 404,
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
      'update',
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

    if (cooperativeBigInt !== existing.cooperative) {
      const [salesUsage, measurementUsage, contributionsUsage] = await Promise.all([
        prisma.sales.count({ where: { responsible: workerId } }),
        prisma.measurments.count({ where: { wastepicker: workerId } }),
        prisma.workerContributions.count({ where: { wastepicker: workerId } }),
      ]);

      if (
        shouldBlockWorkerCooperativeTransfer(existing.cooperative, cooperativeBigInt, {
          salesUsage,
          measurementUsage,
          contributionsUsage,
        })
      ) {
        return apiErrorResponse({
          message:
            'Não é possível alterar a cooperativa deste usuário. Existem registros de vendas, medições ou contribuições associados.',
          code: 'USER_TRANSFER_HAS_DEPENDENCIES',
          status: 409,
        });
      }
    }

    const pisDigits = typeof PIS === 'string' && !isMaskedDocument(PIS) ? normalizePisDigits(PIS) : null;
    const rgDigits = typeof RG === 'string' && !isMaskedDocument(RG) ? normalizeRgDigits(RG) : null;
    if (
      (typeof PIS === 'string' && !isMaskedDocument(PIS) && !pisDigits) ||
      (typeof RG === 'string' && !isMaskedDocument(RG) && !rgDigits)
    ) {
      return apiErrorResponse({
        message: 'PIS deve conter 11 dígitos; RG deve conter 8 ou 9 dígitos',
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

    const updateData: Prisma.WorkersUpdateInput = {
      workerName: full_name.trim(),
      email: email?.trim() || existing.email,
      userType: String(userTypeNumber),
      birthDate: birthDateObj,
      enterDate: enterDateObj,
      exitDate: exitDateObj,
      gender: gender?.trim() || null,
      cooperativeRef: {
        connect: {
          cooperativeId: cooperativeBigInt,
        },
      },
      lastUpdate: new Date(),
    };

    if (pisDigits) {
      updateData.pis = Buffer.from(pisDigits, 'utf8');
    }

    if (rgDigits) {
      updateData.rg = Buffer.from(rgDigits, 'utf8');
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateData.password = Buffer.from(passwordHash, 'utf8');
    }

    if (hasPhone) {
      updateData.phone = normalizePhoneValue(phone);
    }

    await prisma.workers.update({
      where: { workerId },
      data: updateData,
    });

    return NextResponse.json({ message: 'Usuário atualizado com sucesso' }, { status: 200 });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao atualizar usuário',
      code: 'USER_UPDATE_FAILED',
      route: '/api/users/update',
      method: 'POST',
      request,
    });
  }
}

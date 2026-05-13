import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  determineTargetWorker,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import { sanitizeDigits } from '@/lib/db-utils';

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const { id, full_name, email, PIS, RG } = await request.json();

    if (!id) {
      return NextResponse.json({ message: 'ID do usuário é obrigatório' }, { status: 400 });
    }

    let workerId: bigint;
    try {
      workerId = BigInt(determineTargetWorker(session, id, { required: true }));
    } catch {
      return NextResponse.json({ message: 'ID inválido' }, { status: 400 });
    }

    const worker = await prisma.workers.findUnique({
      where: { workerId },
    });

    if (!worker) {
      return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 });
    }

    const isSelfUpdate = worker.workerId.toString() === session.workerId;
    determineTargetCooperative(session, worker.cooperative);
    requireScopedPermission(session, 'users', 'update', isSelfUpdate ? 'self' : 'cooperative');

    const updateData: Prisma.WorkersUpdateInput = {
      lastUpdate: new Date(),
    };

    if (full_name) {
      updateData.workerName = full_name.trim();
    }
    if (email) {
      updateData.email = email.trim();
    }
    if (PIS) {
      const pisDigits = sanitizeDigits(PIS);
      if (pisDigits) {
        updateData.pis = Buffer.from(pisDigits, 'utf8');
      }
    }
    if (RG) {
      const rgDigits = sanitizeDigits(RG);
      if (rgDigits) {
        updateData.rg = Buffer.from(rgDigits, 'utf8');
      }
    }

    await prisma.workers.update({
      where: { workerId },
      data: updateData,
    });

    return NextResponse.json({
      message: 'Perfil atualizado com sucesso',
      updated: true,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error('Error updating user profile:', error);
    return NextResponse.json({ message: 'Erro ao atualizar perfil' }, { status: 500 });
  }
}

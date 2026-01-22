import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { sanitizeDigits } from '@/lib/db-utils';

export async function POST(request: Request) {
  try {
    const {
      id,
      full_name,
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

    if (!id || !full_name || !birth_date || !enter_date || !cooperative_id || !PIS || !RG) {
      return NextResponse.json(
        { message: 'ID, nome, datas, cooperativa, PIS e RG são obrigatórios' },
        { status: 400 },
      );
    }

    let workerId: bigint;
    try {
      workerId = BigInt(id);
    } catch {
      return NextResponse.json({ message: 'ID inválido' }, { status: 400 });
    }

    const existing = await prisma.workers.findUnique({
      where: { workerId },
    });

    if (!existing) {
      return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 });
    }

    const userTypeNumber = Number(user_type);
    if (!Number.isFinite(userTypeNumber) || (userTypeNumber !== 0 && userTypeNumber !== 1)) {
      return NextResponse.json({ message: 'Tipo de usuário inválido' }, { status: 400 });
    }

    let cooperativeBigInt: bigint;
    try {
      cooperativeBigInt = BigInt(cooperative_id);
    } catch {
      return NextResponse.json({ message: 'Cooperativa inválida' }, { status: 400 });
    }

    const pisDigits = sanitizeDigits(PIS);
    const rgDigits = sanitizeDigits(RG);
    if (!pisDigits || !rgDigits) {
      return NextResponse.json({ message: 'PIS e RG devem conter apenas números' }, { status: 400 });
    }

    const birthDateObj = new Date(birth_date);
    const enterDateObj = new Date(enter_date);
    if (Number.isNaN(birthDateObj.getTime()) || Number.isNaN(enterDateObj.getTime())) {
      return NextResponse.json({ message: 'Datas inválidas' }, { status: 400 });
    }

    let exitDateObj: Date | null = null;
    if (exit_date) {
      exitDateObj = new Date(exit_date);
      if (Number.isNaN(exitDateObj.getTime())) {
        return NextResponse.json({ message: 'Data de saída inválida' }, { status: 400 });
      }
    }

    const updateData: Prisma.WorkersUpdateInput = {
      workerName: full_name.trim(),
      email: email?.trim() || existing.email,
      pis: Buffer.from(pisDigits, 'utf8'),
      rg: Buffer.from(rgDigits, 'utf8'),
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

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateData.password = Buffer.from(passwordHash, 'utf8');
    }

    await prisma.workers.update({
      where: { workerId },
      data: updateData,
    });

    return NextResponse.json({ message: 'Usuário atualizado com sucesso' }, { status: 200 });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ message: 'Erro ao atualizar usuário' }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { sanitizeDigits } from '@/lib/db-utils';

export async function POST(request: Request) {
  try {
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
      return NextResponse.json(
        { message: 'Nome, CPF, senha, datas, cooperativa, PIS e RG são obrigatórios' },
        { status: 400 },
      );
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

    const cpfDigits = sanitizeDigits(CPF);
    const pisDigits = sanitizeDigits(PIS);
    const rgDigits = sanitizeDigits(RG);

    if (!cpfDigits || !pisDigits || !rgDigits) {
      return NextResponse.json({ message: 'CPF, PIS e RG devem conter apenas números' }, { status: 400 });
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

    const existing = await prisma.workers.findFirst({
      where: { cpf: Buffer.from(cpfDigits, 'utf8') },
    });

    if (existing) {
      return NextResponse.json({ message: 'Já existe um usuário com este CPF' }, { status: 409 });
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
          cpf: cpfDigits,
          cooperative_id: created.cooperative.toString(),
          user_type: userTypeNumber,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ message: 'Erro ao criar usuário' }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { decodeBytes } from '@/lib/db-utils';

export async function POST(request: Request) {
  try {
    const { id, currentPassword, newPassword } = await request.json();

    if (!id || !currentPassword || !newPassword) {
      return NextResponse.json({ message: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: 'A nova senha deve ter pelo menos 6 caracteres' },
        { status: 400 },
      );
    }

    let workerId: bigint;
    try {
      workerId = BigInt(id);
    } catch {
      return NextResponse.json({ message: 'ID inválido' }, { status: 400 });
    }

    const worker = await prisma.workers.findUnique({
      where: { workerId },
    });

    if (!worker) {
      return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 });
    }

    const storedPassword = decodeBytes(worker.password);
    if (!storedPassword) {
      return NextResponse.json({ message: 'Senha não configurada' }, { status: 400 });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, storedPassword);
    if (!isCurrentValid) {
      return NextResponse.json({ message: 'Senha atual incorreta' }, { status: 401 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.workers.update({
      where: { workerId },
      data: {
        password: Buffer.from(hashedPassword, 'utf8'),
        lastUpdate: new Date(),
      },
    });

    return NextResponse.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    console.error('Error updating password:', error);
    return NextResponse.json({ message: 'Erro ao atualizar senha' }, { status: 500 });
  }
}

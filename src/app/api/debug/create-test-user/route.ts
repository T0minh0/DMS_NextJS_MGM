import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

const TEST_CPF = '12345678900';
const TEST_PASSWORD = 'test123';

export async function GET() {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { message: 'This route is not available in production' },
        { status: 403 },
      );
    }

    const cooperative = await prisma.cooperative.findFirst();
    if (!cooperative) {
      return NextResponse.json(
        { message: 'Nenhuma cooperativa cadastrada. Execute o seed primeiro.' },
        { status: 400 },
      );
    }

    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    const cpfBytes = Buffer.from(TEST_CPF, 'utf8');

    const existing = await prisma.workers.findFirst({
      where: { cpf: cpfBytes },
      select: { workerId: true },
    });

    if (existing) {
      await prisma.workers.update({
        where: { workerId: existing.workerId },
        data: {
          password: Buffer.from(hashedPassword, 'utf8'),
          lastUpdate: new Date(),
        },
      });

      return NextResponse.json({
        message: 'Test user updated successfully',
        credentials: {
          cpf: TEST_CPF,
          password: TEST_PASSWORD,
        },
      });
    }

    const now = new Date();
    await prisma.workers.create({
      data: {
        workerName: 'Test User',
        cooperative: cooperative.cooperativeId,
        cpf: cpfBytes,
        userType: '1',
        birthDate: new Date('1990-01-01'),
        enterDate: now,
        exitDate: null,
        pis: Buffer.from('12345678901', 'utf8'),
        rg: Buffer.from('123456789', 'utf8'),
        gender: 'Não informado',
        password: Buffer.from(hashedPassword, 'utf8'),
        email: 'test.user@example.com',
        lastUpdate: now,
      },
    });

    return NextResponse.json({
      message: 'Test user created successfully',
      credentials: {
        cpf: TEST_CPF,
        password: TEST_PASSWORD,
      },
    });
  } catch (error) {
    console.error('Error creating test user:', error);
    return NextResponse.json(
      { message: 'Server error', error: String(error) },
      { status: 500 },
    );
  }
}

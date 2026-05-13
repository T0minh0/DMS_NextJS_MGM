import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/shared';

export async function POST() {
  try {
    // Clear the auth token cookie
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE_NAME);

    return NextResponse.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { message: 'Erro no servidor' },
      { status: 500 }
    );
  }
}

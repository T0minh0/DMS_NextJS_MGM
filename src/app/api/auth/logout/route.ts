import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/shared';
import { apiRouteErrorResponse } from '@/lib/api/errors';

export async function POST() {
  try {
    // Clear the auth token cookie
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE_NAME);

    return NextResponse.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    return apiRouteErrorResponse({
      error,
      message: 'Erro no servidor',
      code: 'LOGOUT_FAILED',
      route: '/api/auth/logout',
      method: 'POST',
    });
  }
}

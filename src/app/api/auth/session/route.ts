import { NextResponse } from 'next/server';
import { authErrorResponse, requireManagerOrAdmin } from '@/lib/auth/server';

export async function GET(request: Request) {
  try {
    const session = await requireManagerOrAdmin();

    return NextResponse.json({
      id: session.workerId,
      worker_id: Number(session.workerId),
      full_name: session.name,
      name: session.name,
      role: session.role,
      userType: session.userType,
      user_type: session.userType,
      cooperative_id: session.cooperativeId,
      cooperative_name: session.cooperativeName ?? null,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) return authResponse;

    throw error;
  }
}

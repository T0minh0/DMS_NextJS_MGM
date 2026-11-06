import { apiErrorResponse } from '@/lib/api/errors';
import { NextResponse } from 'next/server';
import {
  callMobileAuth,
  publicRecoveryPayload,
  sameOrigin,
  trustedClientIp,
} from '@/lib/mobile-auth-proxy';
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  if (
    !sameOrigin(
      request.headers.get('origin'),
      process.env.RECOVERY_WEB_URL ?? request.url,
    )
  )
    return apiErrorResponse({
      message: 'Origem não permitida.',
      code: 'RECOVERY_REQUEST_FAILED',
      status: 403,
    });
  const { action } = await context.params;
  let payload;
  try {
    const text = await request.text();
    if (text.length > 2048) throw new Error('Dados inválidos.');
    payload = publicRecoveryPayload(action, JSON.parse(text));
  } catch {
    return apiErrorResponse({
      message: 'Confira os dados preenchidos.',
      code: 'RECOVERY_REQUEST_FAILED',
      status: 400,
    });
  }
  try {
    const result = await callMobileAuth(
      action,
      payload,
      undefined,
      trustedClientIp(request),
    );
    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return apiErrorResponse({
      message:
        'O serviço está indisponível. Tente novamente ou peça ajuda à cooperativa.',
      code: 'RECOVERY_UNAVAILABLE',
      status: 503,
    });
  }
}

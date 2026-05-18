import { NextResponse } from 'next/server';
import { createLogContext, createRequestId, LogContext, logError } from '@/lib/observability/logger';

interface ApiErrorResponseOptions {
  message: string;
  code: string;
  status: number;
  requestId?: string;
}

interface ApiInternalErrorResponseOptions {
  message: string;
  code: string;
  status?: number;
  context: LogContext;
  event: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function apiErrorResponse({
  message,
  code,
  status,
  requestId = createRequestId(),
}: ApiErrorResponseOptions) {
  return NextResponse.json(
    {
      error: message,
      message,
      code,
      requestId,
    },
    {
      status,
      headers: {
        'x-request-id': requestId,
      },
    },
  );
}

export async function readJsonBody(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiRequestError('Corpo JSON inválido', 'INVALID_JSON_BODY', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiRequestError('Corpo JSON deve ser um objeto', 'INVALID_JSON_BODY', 400);
  }

  return body as Record<string, unknown>;
}

export function apiRequestErrorResponse(error: unknown, requestId?: string) {
  if (!(error instanceof ApiRequestError)) {
    return null;
  }

  return apiErrorResponse({
    message: error.message,
    code: error.code,
    status: error.status,
    requestId,
  });
}

export function apiInternalErrorResponse({
  message,
  code,
  status = 500,
  context,
  event,
  error,
  metadata,
}: ApiInternalErrorResponseOptions) {
  logError(event, context, error, metadata);

  return apiErrorResponse({
    message,
    code,
    status,
    requestId: context.requestId,
  });
}

export function apiRouteErrorResponse({
  error,
  message,
  code,
  route,
  method,
  request,
}: {
  error: unknown;
  message: string;
  code: string;
  route: string;
  method: string;
  request?: Request | null;
}) {
  const context = createLogContext(request ?? null, {
    domain: 'api',
    route,
    method,
  });

  return apiInternalErrorResponse({
    message,
    code,
    context,
    event: 'api.request.failed',
    error,
  });
}

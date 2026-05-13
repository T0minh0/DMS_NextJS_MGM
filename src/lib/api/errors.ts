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

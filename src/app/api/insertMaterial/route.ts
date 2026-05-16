import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireAuth,
  requireScopedPermission,
} from '@/lib/auth/server';
import {
  apiErrorResponse,
  apiInternalErrorResponse,
  apiRequestErrorResponse,
  readJsonBody,
} from '@/lib/api/errors';
import {
  MaterialDomainError,
  parseInsertMaterialRequest,
  recordMaterialWeighing,
  serializeMaterialWeighingResult,
} from '@/lib/materials/measurements';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';
import { StockDomainError } from '@/lib/stock/ledger';

function materialMutationErrorResponse(error: unknown, requestId: string) {
  if (error instanceof MaterialDomainError) {
    return apiErrorResponse({
      message: error.message,
      code: error.code,
      status: error.status,
      requestId,
    });
  }

  if (error instanceof StockDomainError) {
    return apiErrorResponse({
      message: error.message,
      code: error.code,
      status: error.code === 'INVALID_STOCK_DECIMAL' ? 400 : 422,
      requestId,
    });
  }

  return null;
}

export async function POST(request: Request) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/insertMaterial' });

  try {
    const session = await requireAuth();
    const body = await readJsonBody(request);
    const input = parseInsertMaterialRequest(body, session);
    requireScopedPermission(session, 'stock', 'create', 'self');

    const result = await prisma.$transaction((tx) => recordMaterialWeighing(tx, input));

    logInfo('material.insert.succeeded', context, {
      role: session.role,
      cooperativeId: input.cooperativeId.toString(),
      workerId: input.workerId.toString(),
      materialId: input.materialId.toString(),
      deviceId: input.deviceId.toString(),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Pesagem registrada com sucesso',
        ...serializeMaterialWeighingResult(result),
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    const domainResponse = materialMutationErrorResponse(error, context.requestId);
    if (domainResponse) {
      logWarn('material.insert.rejected', context, {
        code: error instanceof MaterialDomainError || error instanceof StockDomainError
          ? error.code
          : 'UNKNOWN_DOMAIN_ERROR',
        status: domainResponse.status,
      });
      return domainResponse;
    }

    const requestResponse = apiRequestErrorResponse(error, context.requestId);
    if (requestResponse) {
      logWarn('material.insert.rejected', context, {
        code: 'INVALID_JSON_BODY',
        status: requestResponse.status,
      });
      return requestResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao registrar pesagem de material',
      code: 'MATERIAL_INSERT_FAILED',
      context,
      event: 'material.insert.failed',
      error,
    });
  }
}

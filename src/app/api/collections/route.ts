import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  determineTargetCooperative,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import {
  apiErrorResponse,
  apiInternalErrorResponse,
  apiRequestErrorResponse,
  readJsonBody,
} from '@/lib/api/errors';
import { DAY_MS, dateRangeUtc, formatDateKey, parseIsoDateOnly } from '@/lib/analytics/period';
import { formatWorkerId } from '@/lib/db-utils';
import { decimalToJsonNumber } from '@/lib/decimal';
import {
  MaterialDomainError,
  parseManagedCollectionRequest,
  recordManagedCollection,
  serializeMaterialWeighingResult,
} from '@/lib/materials/measurements';
import { createLogContext, logInfo, logWarn } from '@/lib/observability/logger';
import { StockDomainError } from '@/lib/stock/ledger';

const DEFAULT_RANGE_DAYS = 7;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type CollectionsBody = {
  cooperative_id?: string | number | bigint | null;
  cooperativeId?: string | number | bigint | null;
};

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

function parseWorkerParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  try {
    return BigInt(digits);
  } catch {
    return null;
  }
}

function parseMaterialParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseLimit(value: string | null) {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function resolveRange(fromParam: string | null, toParam: string | null) {
  const todayKey = formatDateKey(new Date());
  const to = parseIsoDateOnly(toParam ?? todayKey);
  if (!to) {
    return null;
  }

  const from = fromParam
    ? parseIsoDateOnly(fromParam)
    : new Date(to.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if (!from || from.getTime() > to.getTime()) {
    return null;
  }

  return dateRangeUtc(from, to);
}

export async function GET(request: Request) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/collections' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const targetCooperativeId = determineTargetCooperative(
      session,
      searchParams.get('cooperative_id'),
      { required: true },
    );
    requireScopedPermission(session, 'stock', 'read', 'cooperative');

    const range = resolveRange(searchParams.get('from'), searchParams.get('to'));
    if (!range) {
      return apiErrorResponse({
        message: 'Período inválido. Use datas no formato AAAA-MM-DD com início anterior ao fim.',
        code: 'INVALID_PERIOD',
        status: 400,
        requestId: context.requestId,
      });
    }

    const workerId = parseWorkerParam(searchParams.get('worker_id'));
    if (workerId === null) {
      return apiErrorResponse({
        message: 'Catador inválido',
        code: 'INVALID_WORKER_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    const materialId = parseMaterialParam(searchParams.get('material_id'));
    if (materialId === null) {
      return apiErrorResponse({
        message: 'Material inválido',
        code: 'INVALID_MATERIAL',
        status: 400,
        requestId: context.requestId,
      });
    }

    const limit = parseLimit(searchParams.get('limit'));
    const cooperativeId = BigInt(targetCooperativeId);
    const where: Prisma.MeasurmentsWhereInput = {
      timeStamp: { gte: range.from, lt: range.toExclusive },
      wastepickerRef: { cooperative: cooperativeId },
      ...(workerId ? { wastepicker: workerId } : {}),
      ...(materialId ? { material: materialId } : {}),
    };

    const [rows, aggregate] = await Promise.all([
      prisma.measurments.findMany({
        where,
        include: {
          wastepickerRef: { select: { workerId: true, workerName: true } },
          materialRef: { select: { materialId: true, materialName: true } },
        },
        orderBy: [{ timeStamp: 'desc' }, { weightingId: 'desc' }],
        take: limit,
      }),
      prisma.measurments.aggregate({
        where,
        _count: { _all: true },
        _sum: { weightKg: true },
      }),
    ]);

    const collections = rows.map((row) => ({
      id: row.weightingId.toString(),
      worker_id: row.wastepicker.toString(),
      wastepicker_id: formatWorkerId(row.wastepicker),
      worker_name: row.wastepickerRef.workerName,
      material_id: row.material.toString(),
      material_name: row.materialRef.materialName,
      weight_kg: decimalToJsonNumber(row.weightKg),
      bag_full: row.bagFilled,
      date: formatDateKey(row.timeStamp),
    }));

    logInfo('collection.read.succeeded', context, {
      role: session.role,
      cooperativeId: targetCooperativeId,
      rows: collections.length,
      total: aggregate._count._all,
    });

    return NextResponse.json({
      collections,
      count: aggregate._count._all,
      total_weight_kg: decimalToJsonNumber(aggregate._sum.weightKg ?? 0),
      from: formatDateKey(range.from),
      to: formatDateKey(new Date(range.toExclusive.getTime() - DAY_MS)),
      limit,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) {
      return authResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao listar coletas. Por favor, tente novamente mais tarde.',
      code: 'COLLECTIONS_READ_FAILED',
      context,
      event: 'collection.read.failed',
      error,
    });
  }
}

export async function POST(request: Request) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/collections' });

  try {
    const session = await requireManagerOrAdmin();
    const body = await readJsonBody(request) as CollectionsBody;
    const targetCooperativeId = determineTargetCooperative(
      session,
      body.cooperative_id ?? body.cooperativeId ?? session.cooperativeId,
      { required: true },
    );
    requireScopedPermission(session, 'stock', 'create', 'cooperative');

    const input = parseManagedCollectionRequest(body, session, BigInt(targetCooperativeId));
    const result = await prisma.$transaction((tx) => recordManagedCollection(tx, input));

    logInfo('collection.create.succeeded', context, {
      role: session.role,
      cooperativeId: input.cooperativeId.toString(),
      workerId: input.workerId.toString(),
      materialId: input.materialId.toString(),
      bagFull: input.bagFull,
      collectedDeltaKg: decimalToJsonNumber(result.collectedDeltaKg),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Coleta registrada com sucesso',
        worker_name: result.workerName,
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
      logWarn('collection.create.rejected', context, {
        code: error instanceof MaterialDomainError || error instanceof StockDomainError
          ? error.code
          : 'UNKNOWN_DOMAIN_ERROR',
        status: domainResponse.status,
      });
      return domainResponse;
    }

    const requestResponse = apiRequestErrorResponse(error, context.requestId);
    if (requestResponse) {
      logWarn('collection.create.rejected', context, {
        code: 'INVALID_JSON_BODY',
        status: requestResponse.status,
      });
      return requestResponse;
    }

    return apiInternalErrorResponse({
      message: 'Erro ao registrar coleta',
      code: 'COLLECTION_CREATE_FAILED',
      context,
      event: 'collection.create.failed',
      error,
    });
  }
}

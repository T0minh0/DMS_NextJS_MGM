import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireScopedPermission, requireStrictAdmin } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { formatWorkerId } from '@/lib/db-utils';
import { mapDatabaseUserTypeToRole } from '@/lib/auth/shared';
import { buildReferenceCsv, buildTemplateCsv } from '@/lib/onboarding/contract';
import { createLogContext, logInfo } from '@/lib/observability/logger';

function csvResponse(body: string, filename: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Hidden admin-only download of the import template or the reference sheet
 * (collectors + materials of the target cooperative, without PII).
 */
export async function GET(request: Request) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/admin/onboarding/template' });

  try {
    const session = await requireStrictAdmin();
    requireScopedPermission(session, 'stock', 'manage', 'global');

    const { searchParams } = new URL(request.url);
    const cooperativeParam = searchParams.get('cooperative_id');
    let cooperativeId: bigint;
    try {
      if (!cooperativeParam) throw new Error('missing');
      cooperativeId = BigInt(cooperativeParam);
    } catch {
      return apiErrorResponse({
        message: 'Informe a cooperativa (cooperative_id).',
        code: 'ONBOARDING_COOPERATIVE_REQUIRED',
        status: 400,
        requestId: context.requestId,
      });
    }

    const cooperative = await prisma.cooperative.findUnique({
      where: { cooperativeId },
      select: { cooperativeId: true },
    });
    if (!cooperative) {
      return apiErrorResponse({
        message: 'Cooperativa não encontrada',
        code: 'COOPERATIVE_NOT_FOUND',
        status: 404,
        requestId: context.requestId,
      });
    }

    const kind = searchParams.get('kind') === 'referencia' ? 'referencia' : 'template';
    const suffix = cooperativeId.toString();

    if (kind === 'template') {
      logInfo('onboarding.template.served', context, { cooperativeId: suffix, kind });
      return csvResponse(buildTemplateCsv(), `modelo-importacao-historico-coop-${suffix}.csv`);
    }

    const [workers, materials] = await Promise.all([
      prisma.workers.findMany({
        where: { cooperative: cooperativeId },
        select: { workerId: true, workerName: true, userType: true, exitDate: true },
        orderBy: { workerName: 'asc' },
      }),
      prisma.materials.findMany({
        select: { materialId: true, materialName: true, group: { select: { groupName: true } } },
        orderBy: { materialName: 'asc' },
      }),
    ]);

    const body = buildReferenceCsv(
      workers
        .filter((worker) => mapDatabaseUserTypeToRole(worker.userType) === 'worker')
        .map((worker) => ({
          wastepickerId: formatWorkerId(worker.workerId),
          name: worker.workerName,
          exitDate: worker.exitDate ?? null,
        })),
      materials.map((material) => ({
        materialId: material.materialId.toString(),
        name: material.materialName,
        groupName: material.group?.groupName ?? null,
      })),
    );

    logInfo('onboarding.template.served', context, { cooperativeId: suffix, kind, workers: workers.length, materials: materials.length });
    return csvResponse(body, `referencia-coop-${suffix}.csv`);
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao gerar o modelo de importação',
      code: 'ONBOARDING_TEMPLATE_FAILED',
      context,
      event: 'onboarding.template.failed',
      error,
    });
  }
}

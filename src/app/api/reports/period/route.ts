import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireManagerOrAdmin } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext, logInfo } from '@/lib/observability/logger';
import {
  PeriodReportError,
  buildPeriodReportData,
  serializePeriodReport,
} from '@/lib/reports/period-report';
import { resolvePeriodReportRequest } from '@/lib/reports/period-request';

/**
 * Period report as JSON. Feeds the dashboards page; the PDF endpoints call
 * the same builder so every surface shows identical numbers.
 */
export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales', route: '/api/reports/period' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const resolution = await resolvePeriodReportRequest(prisma, session, searchParams);

    if (!resolution.ok) {
      return apiErrorResponse({ ...resolution.error, requestId: context.requestId });
    }

    const data = await buildPeriodReportData(prisma, resolution.input);

    logInfo('reports.period.succeeded', context, {
      role: session.role,
      cooperativeId: resolution.input.cooperativeId.toString(),
      kind: data.kind,
      collections: data.summary.collectionsCount,
    });

    return NextResponse.json({ report: serializePeriodReport(data) });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    if (error instanceof PeriodReportError) {
      return apiErrorResponse({
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: context.requestId,
      });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao gerar relatório do período',
      code: 'PERIOD_REPORT_FAILED',
      context,
      event: 'reports.period.failed',
      error,
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireManagerOrAdmin } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext, logInfo } from '@/lib/observability/logger';
import { PeriodReportError, buildPeriodReportData } from '@/lib/reports/period-report';
import { resolvePeriodReportRequest } from '@/lib/reports/period-request';
import {
  buildPdfDownloadHeaders,
  buildPeriodReportPdfFilename,
  renderPeriodReportPdfBuffer,
} from '@/lib/reports/pdf';

export const runtime = 'nodejs';

/** Consolidated cooperative report (PDF). Ignores any worker filter. */
export async function GET(request: NextRequest) {
  const context = createLogContext(request, { domain: 'sales', route: '/api/reports/pdf/period' });

  try {
    const session = await requireManagerOrAdmin();
    const { searchParams } = new URL(request.url);
    const resolution = await resolvePeriodReportRequest(prisma, session, searchParams, { ignoreWorker: true });

    if (!resolution.ok) {
      return apiErrorResponse({ ...resolution.error, requestId: context.requestId });
    }

    const data = await buildPeriodReportData(prisma, resolution.input);
    const pdfBuffer = await renderPeriodReportPdfBuffer(data);
    const filename = buildPeriodReportPdfFilename({
      cooperativeName: data.cooperative.name,
      yearMonth: data.period.yearMonth,
      from: data.period.from,
      toInclusive: data.period.toInclusive,
    });
    const headers = buildPdfDownloadHeaders(filename);

    logInfo('reports.pdf.period.succeeded', context, {
      role: session.role,
      cooperativeId: resolution.input.cooperativeId.toString(),
      bytes: pdfBuffer.byteLength,
    });

    return new NextResponse(pdfBuffer, { status: 200, headers });
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
      message: 'Erro ao gerar PDF do relatório do período',
      code: 'PERIOD_REPORT_PDF_FAILED',
      context,
      event: 'reports.pdf.period.failed',
      error,
    });
  }
}

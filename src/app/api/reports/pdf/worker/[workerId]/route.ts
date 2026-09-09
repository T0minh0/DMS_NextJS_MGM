import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireManagerOrAdmin } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext, logInfo } from '@/lib/observability/logger';
import { PeriodReportError, buildPeriodReportData } from '@/lib/reports/period-report';
import { resolvePeriodReportRequest } from '@/lib/reports/period-request';
import {
  buildPdfDownloadHeaders,
  buildWorkerReceiptPdfFilename,
  renderWorkerReceiptPdfBuffer,
} from '@/lib/reports/pdf';

export const runtime = 'nodejs';

/** Worker receipt (PDF): the wastepicker's own collections for the period. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const context = createLogContext(request, { domain: 'sales', route: '/api/reports/pdf/worker' });

  try {
    const session = await requireManagerOrAdmin();
    const { workerId } = await params;
    const { searchParams } = new URL(request.url);
    const resolution = await resolvePeriodReportRequest(prisma, session, searchParams, { workerIdParam: workerId });

    if (!resolution.ok) {
      return apiErrorResponse({ ...resolution.error, requestId: context.requestId });
    }

    if (!resolution.input.workerId) {
      return apiErrorResponse({
        message: 'Catador inválido',
        code: 'INVALID_WORKER_ID',
        status: 400,
        requestId: context.requestId,
      });
    }

    const data = await buildPeriodReportData(prisma, resolution.input);
    const pdfBuffer = await renderWorkerReceiptPdfBuffer(data);
    const filename = buildWorkerReceiptPdfFilename({
      wastepickerId: data.filters.worker?.wastepickerId ?? workerId,
      yearMonth: data.period.yearMonth,
      from: data.period.from,
      toInclusive: data.period.toInclusive,
    });
    const headers = buildPdfDownloadHeaders(filename);

    logInfo('reports.pdf.worker.succeeded', context, {
      role: session.role,
      cooperativeId: resolution.input.cooperativeId.toString(),
      workerId: resolution.input.workerId.toString(),
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
      message: 'Erro ao gerar comprovante do catador',
      code: 'WORKER_RECEIPT_PDF_FAILED',
      context,
      event: 'reports.pdf.worker.failed',
      error,
    });
  }
}

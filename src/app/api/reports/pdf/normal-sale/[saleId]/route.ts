import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToJsonNumber } from '@/lib/decimal';
import { getSaleLifecycleStatus } from '@/lib/sales/lifecycle';
import { createLogContext } from '@/lib/observability/logger';
import {
  renderReportPdfBuffer,
  buildReportPdfFilename,
  buildPdfDownloadHeaders,
  formatReportKg,
  formatReportCurrency,
} from '@/lib/reports/pdf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const { saleId: saleIdParam } = await params;
    let saleId: bigint;
    try {
      saleId = BigInt(saleIdParam);
    } catch {
      return apiErrorResponse({ message: 'ID de venda inválido', code: 'INVALID_SALE_ID', status: 400, requestId: context.requestId });
    }

    const where =
      session.role === 'admin'
        ? { saleId }
        : { saleId, cooperativeId: BigInt(session.cooperativeId) };

    const sale = await prisma.sales.findFirst({
      where,
      include: {
        materialRef: { select: { materialName: true } },
        buyerRef: { select: { buyerName: true } },
        responsibleRef: { select: { workerName: true } },
        cooperativeRef: { select: { cooperativeName: true } },
      },
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda não encontrada', code: 'SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    const priceKg = decimalToJsonNumber(sale.priceKg);
    const weightSold = decimalToJsonNumber(sale.weight);
    const totalRevenue = decimalToJsonNumber(sale.priceKg.times(sale.weight));
    const status = getSaleLifecycleStatus(sale);

    const locale = 'pt-BR';
    const formatDate = (d: Date | null | undefined) =>
      d
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: 'short',
            timeZone: 'America/Sao_Paulo',
          }).format(d)
        : '—';

    const pdfBuffer = await renderReportPdfBuffer({
      title: 'Relatório de Venda Normal',
      subtitle: `${sale.materialRef.materialName} — ${sale.cooperativeRef.cooperativeName}`,
      generatedAt: new Date(),
      locale,
      rows: [
        { label: 'ID da Venda', value: sale.saleId.toString() },
        { label: 'Status', value: status },
        { label: 'Material', value: sale.materialRef.materialName },
        { label: 'Cooperativa', value: sale.cooperativeRef.cooperativeName },
        { label: 'Responsável', value: sale.responsibleRef.workerName },
        { label: 'Comprador', value: sale.buyerRef.buyerName },
        { label: 'Data', value: formatDate(sale.date) },
        { label: 'Data prevista', value: formatDate(sale.expectedSaleDate) },
        { label: 'Criado em', value: formatDate(sale.createdAt) },
        ...(sale.soldAt ? [{ label: 'Vendido em', value: formatDate(sale.soldAt) }] : []),
        ...(sale.cancelledAt ? [{ label: 'Cancelado em', value: formatDate(sale.cancelledAt) }] : []),
      ],
      totals: [
        { label: 'Preço/kg', value: formatReportCurrency(priceKg, locale) },
        { label: 'Peso vendido', value: formatReportKg(weightSold, locale) },
        { label: 'Receita total', value: formatReportCurrency(totalRevenue, locale) },
      ],
    });

    const filename = buildReportPdfFilename('normal-sale', saleIdParam);
    const headers = buildPdfDownloadHeaders(filename);

    return new NextResponse(pdfBuffer, { status: 200, headers });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao gerar PDF de venda normal',
      code: 'NORMAL_SALE_PDF_FAILED',
      context,
      event: 'reports.pdf.normal.failed',
      error,
    });
  }
}

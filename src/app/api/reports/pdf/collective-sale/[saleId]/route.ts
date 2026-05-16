import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  authErrorResponse,
  requireManagerOrAdmin,
  requireScopedPermission,
} from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { decimalToJsonNumber } from '@/lib/decimal';
import { createLogContext } from '@/lib/observability/logger';
import {
  renderReportPdfBuffer,
  buildReportPdfFilename,
  buildPdfDownloadHeaders,
  formatReportKg,
  formatReportCurrency,
} from '@/lib/reports/pdf';

const INCLUDE_FULL = {
  buyer: { select: { buyerName: true } },
  material: { select: { materialName: true } },
  creatorCooperative: { select: { cooperativeName: true } },
  contributions: {
    include: { cooperative: { select: { cooperativeName: true } } },
    orderBy: { contributionId: 'asc' as const },
  },
} satisfies Prisma.CollectiveSaleInclude;

function computeStatus(sale: { soldAt: Date | null; cancelledAt: Date | null }) {
  if (sale.cancelledAt != null) return 'CANCELLED';
  if (sale.soldAt != null) return 'SOLD';
  return 'ACTIVE';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const context = createLogContext(request, { domain: 'sales' });

  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'sales', 'read', 'cooperative');

    const { saleId: saleIdParam } = await params;
    let collectiveSaleId: bigint;
    try {
      collectiveSaleId = BigInt(saleIdParam);
    } catch {
      return apiErrorResponse({ message: 'ID de venda coletiva inválido', code: 'INVALID_COLLECTIVE_SALE_ID', status: 400, requestId: context.requestId });
    }

    const isAdmin = session.role === 'admin';
    const coopId = BigInt(session.cooperativeId);

    const sale = await prisma.collectiveSale.findUnique({
      where: { collectiveSaleId },
      include: INCLUDE_FULL,
    });

    if (!sale) {
      return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
    }

    if (!isAdmin) {
      const isCreator = sale.creatorCooperativeId === coopId;
      const isParticipant = sale.contributions.some(
        (c) => c.cooperativeId === coopId && (c.status === 'ACCEPTED' || c.status === 'INVITED'),
      );
      if (!isCreator && !isParticipant) {
        return apiErrorResponse({ message: 'Venda coletiva não encontrada', code: 'COLLECTIVE_SALE_NOT_FOUND', status: 404, requestId: context.requestId });
      }
    }

    const status = computeStatus(sale);
    const locale = 'pt-BR';

    const formatDate = (d: Date | null | undefined) =>
      d
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: 'short',
            timeZone: 'America/Sao_Paulo',
          }).format(d)
        : '—';

    const totalRevenue =
      sale.totalWeight != null
        ? decimalToJsonNumber(sale.totalWeight.times(sale.priceKg))
        : null;

    const contributionRows = sale.contributions.map((c) => ({
      label: c.cooperative.cooperativeName,
      value: [
        c.status,
        c.contributedWeight != null ? formatReportKg(decimalToJsonNumber(c.contributedWeight), locale) : null,
        c.revenueShare != null ? formatReportCurrency(decimalToJsonNumber(c.revenueShare), locale) : null,
      ]
        .filter(Boolean)
        .join(' | '),
    }));

    const pdfBuffer = await renderReportPdfBuffer({
      title: 'Relatório de Venda Coletiva',
      subtitle: `${sale.material.materialName} — ${sale.creatorCooperative.cooperativeName}`,
      generatedAt: new Date(),
      locale,
      rows: [
        { label: 'ID', value: sale.collectiveSaleId.toString() },
        { label: 'Status', value: status },
        { label: 'Material', value: sale.material.materialName },
        { label: 'Criador', value: sale.creatorCooperative.cooperativeName },
        { label: 'Comprador', value: sale.buyer.buyerName },
        { label: 'Data prevista', value: formatDate(sale.expectedSaleDate) },
        { label: 'Criado em', value: formatDate(sale.createdAt) },
        ...(sale.soldAt ? [{ label: 'Vendido em', value: formatDate(sale.soldAt) }] : []),
        ...(sale.cancelledAt ? [{ label: 'Cancelado em', value: formatDate(sale.cancelledAt) }] : []),
        ...contributionRows,
      ],
      totals: [
        { label: 'Preço/kg', value: formatReportCurrency(decimalToJsonNumber(sale.priceKg), locale) },
        ...(sale.totalWeight != null
          ? [{ label: 'Peso total', value: formatReportKg(decimalToJsonNumber(sale.totalWeight), locale) }]
          : []),
        ...(totalRevenue != null
          ? [{ label: 'Receita total', value: formatReportCurrency(totalRevenue, locale) }]
          : []),
      ],
    });

    const filename = buildReportPdfFilename('collective-sale', saleIdParam);
    const headers = buildPdfDownloadHeaders(filename);

    return new NextResponse(pdfBuffer, { status: 200, headers });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao gerar PDF de venda coletiva',
      code: 'COLLECTIVE_SALE_PDF_FAILED',
      context,
      event: 'reports.pdf.collective.failed',
      error,
    });
  }
}

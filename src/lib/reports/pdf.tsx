import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { formatDateKey } from '@/lib/analytics/period';
import type { PeriodReportData } from '@/lib/reports/period-report';

export type ReportPdfKind = 'normal-sale' | 'collective-sale' | 'period' | 'worker-period';

export interface ReportPdfLineItem {
  label: string;
  value: string | number;
}

export interface ReportPdfSummary {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  locale?: string;
  currency?: string;
  rows: ReportPdfLineItem[];
  totals?: ReportPdfLineItem[];
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#F5F8FF',
    backgroundColor: '#0A0E1A',
  },
  header: {
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3441',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#C15079',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3C7',
  },
  meta: {
    marginTop: 6,
    fontSize: 9,
    color: '#94A3C7',
  },
  section: {
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3441',
    paddingVertical: 6,
  },
  label: {
    width: '38%',
    color: '#94A3C7',
    fontWeight: 700,
  },
  value: {
    width: '62%',
    color: '#F5F8FF',
  },
  totals: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#65708D',
    paddingTop: 8,
  },
});

const defaultLocale = 'pt-BR';
const fallbackPdfFilename = 'report.pdf';

function formatGeneratedAt(date: Date, locale = defaultLocale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function ReportPdfDocument({ report }: { report: ReportPdfSummary }) {
  return (
    <Document
      title={report.title}
      author="DMS"
      subject={report.subtitle ?? report.title}
      creator="DMS NextJS MGM"
      producer="DMS NextJS MGM"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{report.title}</Text>
          {report.subtitle ? <Text style={styles.subtitle}>{report.subtitle}</Text> : null}
          <Text style={styles.meta}>
            Gerado em {formatGeneratedAt(report.generatedAt, report.locale)}
          </Text>
        </View>

        <View style={styles.section}>
          {report.rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value}>{String(row.value)}</Text>
            </View>
          ))}
        </View>

        {report.totals?.length ? (
          <View style={styles.totals}>
            {report.totals.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value}>{String(row.value)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export function formatReportKg(value: string | number, locale = defaultLocale) {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))} kg`;
}

export function formatReportCurrency(
  value: string | number,
  locale = defaultLocale,
  currency = 'BRL',
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatReportPercent(value: string | number, locale = defaultLocale) {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value))}%`;
}

export function formatReportInteger(value: string | number, locale = defaultLocale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value));
}

/** Date-only columns are stored as UTC midnight; format them in UTC to avoid a one-day shift. */
export function formatReportDateOnly(date: Date, locale = defaultLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'UTC' }).format(date);
}

/** Timestamps (generated at, sold at) are shown in America/Sao_Paulo. */
export function formatReportDateTime(date: Date, locale = defaultLocale) {
  return formatGeneratedAt(date, locale);
}

export function buildReportPdfFilename(kind: ReportPdfKind, saleId: string | number) {
  return sanitizePdfFilename(`${kind}-report-${saleId}.pdf`);
}

export function slugifyForFilename(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'relatorio';
}

function periodSuffix(input: { yearMonth?: string | null; from: Date; toInclusive: Date }) {
  return input.yearMonth ?? `${formatDateKey(input.from)}-a-${formatDateKey(input.toInclusive)}`;
}

export function buildPeriodReportPdfFilename(input: {
  cooperativeName: string;
  yearMonth?: string | null;
  from: Date;
  toInclusive: Date;
}) {
  return sanitizePdfFilename(`relatorio-${slugifyForFilename(input.cooperativeName)}-${periodSuffix(input)}.pdf`);
}

export function buildWorkerReceiptPdfFilename(input: {
  wastepickerId: string;
  yearMonth?: string | null;
  from: Date;
  toInclusive: Date;
}) {
  return sanitizePdfFilename(`comprovante-${slugifyForFilename(input.wastepickerId)}-${periodSuffix(input)}.pdf`);
}

export function sanitizePdfFilename(filename: string) {
  const sanitized = filename
    .normalize('NFKD')
    .replace(/[\r\n"\\/:*?<>|]+/g, '-')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  const safeFilename = sanitized || fallbackPdfFilename;

  return safeFilename.toLowerCase().endsWith('.pdf')
    ? safeFilename
    : `${safeFilename}.pdf`;
}

export function buildPdfDownloadHeaders(filename: string) {
  const safeFilename = sanitizePdfFilename(filename);

  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
    'Cache-Control': 'no-store',
  };
}

export async function renderReportPdfBuffer(report: ReportPdfSummary) {
  return renderToBuffer(<ReportPdfDocument report={report} />);
}

// ---------------------------------------------------------------------------
// Period reports (consolidated cooperative report and worker receipt)
// Print-friendly palette built only from contract colors.
// ---------------------------------------------------------------------------

const periodColors = {
  page: '#F5F8FF',
  text: '#0A0E1A',
  muted: '#65708D',
  accent: '#C15079',
  headerBg: '#7A1C44',
  headerText: '#F5F8FF',
  zebra: '#F8EEF1',
  border: '#94A3C7',
};

const periodStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 48,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: periodColors.text,
    backgroundColor: periodColors.page,
  },
  header: {
    marginBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: periodColors.accent,
    paddingBottom: 10,
  },
  eyebrow: {
    fontSize: 8,
    color: periodColors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: periodColors.accent,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: periodColors.text,
  },
  meta: {
    marginTop: 4,
    fontSize: 8,
    color: periodColors.muted,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: periodColors.accent,
    marginBottom: 6,
  },
  sectionNote: {
    fontSize: 8,
    color: periodColors.muted,
    marginBottom: 6,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryItem: {
    width: '33.33%',
    paddingRight: 10,
    paddingBottom: 8,
  },
  summaryLabel: {
    fontSize: 8,
    color: periodColors.muted,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
    color: periodColors.text,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: periodColors.headerBg,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    color: periodColors.headerText,
    fontWeight: 700,
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: periodColors.border,
  },
  tableRowZebra: {
    backgroundColor: periodColors.zebra,
  },
  tableCell: {
    fontSize: 8.5,
    color: periodColors.text,
  },
  tableEmpty: {
    fontSize: 9,
    color: periodColors.muted,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  footer: {
    position: 'absolute',
    left: 36,
    right: 36,
    bottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: periodColors.border,
    paddingTop: 4,
    fontSize: 7.5,
    color: periodColors.muted,
  },
});

interface PdfColumn<Row> {
  key: string;
  header: string;
  width: string;
  align?: 'left' | 'right';
  value: (row: Row) => string;
}

interface PdfTableProps<Row> {
  columns: PdfColumn<Row>[];
  rows: Row[];
  emptyText: string;
  keyOf: (row: Row, index: number) => string;
}

function PdfTable<Row>({ columns, rows, emptyText, keyOf }: PdfTableProps<Row>) {
  return (
    <View>
      <View style={periodStyles.tableHeader} fixed>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[periodStyles.tableHeaderCell, { width: column.width, textAlign: column.align ?? 'left' }]}
          >
            {column.header}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={periodStyles.tableEmpty}>{emptyText}</Text>
      ) : (
        rows.map((row, index) => (
          <View
            key={keyOf(row, index)}
            style={index % 2 === 1 ? [periodStyles.tableRow, periodStyles.tableRowZebra] : periodStyles.tableRow}
            wrap={false}
          >
            {columns.map((column) => (
              <Text
                key={column.key}
                style={[periodStyles.tableCell, { width: column.width, textAlign: column.align ?? 'left' }]}
              >
                {column.value(row)}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function PdfSection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={periodStyles.section}>
      <View minPresenceAhead={40}>
        <Text style={periodStyles.sectionTitle}>{title}</Text>
        {note ? <Text style={periodStyles.sectionNote}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function SummaryGrid({ items }: { items: ReportPdfLineItem[] }) {
  return (
    <View style={periodStyles.summaryGrid}>
      {items.map((item) => (
        <View key={item.label} style={periodStyles.summaryItem}>
          <Text style={periodStyles.summaryLabel}>{item.label}</Text>
          <Text style={periodStyles.summaryValue}>{String(item.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfFooter({ text }: { text: string }) {
  return (
    <View style={periodStyles.footer} fixed>
      <Text>{text}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function PdfHeader({
  eyebrow,
  title,
  subtitle,
  data,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  data: PeriodReportData;
}) {
  return (
    <View style={periodStyles.header}>
      <Text style={periodStyles.eyebrow}>{eyebrow}</Text>
      <Text style={periodStyles.title}>{title}</Text>
      <Text style={periodStyles.subtitle}>{subtitle}</Text>
      <Text style={periodStyles.meta}>
        Período: {data.period.label} ({formatReportDateOnly(data.period.from)} a {formatReportDateOnly(data.period.toInclusive)})
        {data.filters.materialLabel ? ` · Filtro: ${data.filters.materialLabel}` : ''}
      </Text>
      <Text style={periodStyles.meta}>
        Gerado em {formatReportDateTime(data.generatedAt)} por {data.generatedBy.name}
      </Text>
    </View>
  );
}

const materialColumns: PdfColumn<PeriodReportData['byMaterial'][number]>[] = [
  { key: 'material', header: 'Material', width: '34%', value: (row) => row.materialName },
  { key: 'group', header: 'Grupo', width: '22%', value: (row) => row.groupName ?? '—' },
  { key: 'kg', header: 'Coletado', width: '16%', align: 'right', value: (row) => formatReportKg(row.kg) },
  { key: 'share', header: '% do total', width: '14%', align: 'right', value: (row) => formatReportPercent(row.sharePct) },
  { key: 'count', header: 'Coletas', width: '14%', align: 'right', value: (row) => formatReportInteger(row.collectionsCount) },
];

const workerColumns: PdfColumn<PeriodReportData['byWorker'][number]>[] = [
  { key: 'id', header: 'ID', width: '12%', value: (row) => row.wastepickerId },
  { key: 'name', header: 'Catador', width: '40%', value: (row) => row.workerName },
  { key: 'kg', header: 'Coletado', width: '18%', align: 'right', value: (row) => formatReportKg(row.kg) },
  { key: 'count', header: 'Coletas', width: '15%', align: 'right', value: (row) => formatReportInteger(row.collectionsCount) },
  { key: 'days', header: 'Dias', width: '15%', align: 'right', value: (row) => formatReportInteger(row.workedDays) },
];

const salesColumns: PdfColumn<PeriodReportData['sales'][number]>[] = [
  { key: 'date', header: 'Data', width: '14%', value: (row) => formatReportDateOnly(row.date) },
  { key: 'material', header: 'Material', width: '26%', value: (row) => row.materialName },
  { key: 'buyer', header: 'Comprador', width: '24%', value: (row) => row.buyerName },
  { key: 'kg', header: 'Peso', width: '12%', align: 'right', value: (row) => formatReportKg(row.kg) },
  { key: 'price', header: 'R$/kg', width: '12%', align: 'right', value: (row) => formatReportCurrency(row.priceKg) },
  { key: 'total', header: 'Total', width: '12%', align: 'right', value: (row) => formatReportCurrency(row.totalBrl) },
];

const stockColumns: PdfColumn<PeriodReportData['stock'][number]>[] = [
  { key: 'material', header: 'Material', width: '34%', value: (row) => row.materialName },
  { key: 'group', header: 'Grupo', width: '21%', value: (row) => row.groupName ?? '—' },
  { key: 'current', header: 'Estoque atual', width: '15%', align: 'right', value: (row) => formatReportKg(row.currentKg) },
  { key: 'collected', header: 'Total coletado', width: '15%', align: 'right', value: (row) => formatReportKg(row.totalCollectedKg) },
  { key: 'sold', header: 'Total vendido', width: '15%', align: 'right', value: (row) => formatReportKg(row.totalSoldKg) },
];

const workerDailyColumns: PdfColumn<PeriodReportData['workerDaily'][number]>[] = [
  { key: 'date', header: 'Data', width: '20%', value: (row) => formatReportDateOnly(row.date) },
  { key: 'material', header: 'Material', width: '44%', value: (row) => row.materialName },
  { key: 'kg', header: 'Coletado', width: '20%', align: 'right', value: (row) => formatReportKg(row.kg) },
  { key: 'count', header: 'Coletas', width: '16%', align: 'right', value: (row) => formatReportInteger(row.collectionsCount) },
];

export function PeriodReportPdfDocument({ data }: { data: PeriodReportData }) {
  const footer = `DMS · ${data.cooperative.name} · ${data.period.label}`;

  return (
    <Document
      title={`Relatório do período - ${data.cooperative.name} - ${data.period.label}`}
      author="DMS"
      subject="Relatório consolidado da cooperativa"
      creator="DMS NextJS MGM"
      producer="DMS NextJS MGM"
    >
      <Page size="A4" style={periodStyles.page}>
        <PdfHeader
          eyebrow="Relatório consolidado da cooperativa"
          title="Relatório do período"
          subtitle={data.cooperative.name}
          data={data}
        />

        <PdfSection title="Resumo">
          <SummaryGrid
            items={[
              { label: 'Total coletado', value: formatReportKg(data.summary.collectedKg) },
              { label: 'Coletas registradas', value: formatReportInteger(data.summary.collectionsCount) },
              { label: 'Catadores ativos', value: formatReportInteger(data.summary.activeWorkers) },
              { label: 'Total vendido', value: formatReportKg(data.summary.soldKg) },
              { label: 'Receita', value: formatReportCurrency(data.summary.revenueBrl) },
              { label: 'Estoque atual', value: formatReportKg(data.summary.stockKg) },
            ]}
          />
        </PdfSection>

        <PdfSection title="Coletas por material">
          <PdfTable
            columns={materialColumns}
            rows={data.byMaterial}
            emptyText="Nenhuma coleta registrada no período."
            keyOf={(row) => row.materialId.toString()}
          />
        </PdfSection>

        <PdfSection title="Coletas por catador" note="Apenas identificador e nome; sem documentos pessoais.">
          <PdfTable
            columns={workerColumns}
            rows={data.byWorker}
            emptyText="Nenhum catador com coletas no período."
            keyOf={(row) => row.workerId.toString()}
          />
        </PdfSection>

        <PdfSection title="Vendas do período" note="Somente vendas concluídas, pela data da venda.">
          <PdfTable
            columns={salesColumns}
            rows={data.sales}
            emptyText="Nenhuma venda concluída no período."
            keyOf={(row) => row.saleId.toString()}
          />
        </PdfSection>

        <PdfSection title={`Estoque atual por material (em ${formatReportDateTime(data.generatedAt)})`}>
          <PdfTable
            columns={stockColumns}
            rows={data.stock}
            emptyText="Nenhum estoque registrado para a cooperativa."
            keyOf={(row) => row.materialId.toString()}
          />
        </PdfSection>

        <PdfFooter text={footer} />
      </Page>
    </Document>
  );
}

export function WorkerReceiptPdfDocument({ data }: { data: PeriodReportData }) {
  const worker = data.filters.worker;
  const workerLabel = worker ? `${worker.name} (${worker.wastepickerId})` : 'Catador';
  const footer = `DMS · ${data.cooperative.name} · ${workerLabel} · ${data.period.label}`;

  return (
    <Document
      title={`Comprovante do catador - ${workerLabel} - ${data.period.label}`}
      author="DMS"
      subject="Comprovante de coletas do catador"
      creator="DMS NextJS MGM"
      producer="DMS NextJS MGM"
    >
      <Page size="A4" style={periodStyles.page}>
        <PdfHeader
          eyebrow={data.cooperative.name}
          title="Comprovante do catador"
          subtitle={workerLabel}
          data={data}
        />

        <PdfSection title="Resumo">
          <SummaryGrid
            items={[
              { label: 'Total coletado', value: formatReportKg(data.summary.collectedKg) },
              { label: 'Coletas registradas', value: formatReportInteger(data.summary.collectionsCount) },
              { label: 'Dias com coleta', value: formatReportInteger(data.summary.workedDays) },
            ]}
          />
        </PdfSection>

        <PdfSection title="Coletas por material">
          <PdfTable
            columns={materialColumns}
            rows={data.byMaterial}
            emptyText="Nenhuma coleta registrada no período."
            keyOf={(row) => row.materialId.toString()}
          />
        </PdfSection>

        <PdfSection title="Coletas por dia e material">
          <PdfTable
            columns={workerDailyColumns}
            rows={data.workerDaily}
            emptyText="Nenhuma coleta registrada no período."
            keyOf={(row) => `${formatDateKey(row.date)}-${row.materialId.toString()}`}
          />
        </PdfSection>

        <PdfFooter text={footer} />
      </Page>
    </Document>
  );
}

export async function renderPeriodReportPdfBuffer(data: PeriodReportData) {
  return renderToBuffer(<PeriodReportPdfDocument data={data} />);
}

export async function renderWorkerReceiptPdfBuffer(data: PeriodReportData) {
  return renderToBuffer(<WorkerReceiptPdfDocument data={data} />);
}

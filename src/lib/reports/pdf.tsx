import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

export type ReportPdfKind = 'normal-sale' | 'collective-sale';

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
    color: '#00D4FF',
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

export function buildReportPdfFilename(kind: ReportPdfKind, saleId: string | number) {
  return sanitizePdfFilename(`${kind}-report-${saleId}.pdf`);
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

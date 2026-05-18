// Static-analysis smoke checks for S3-05 PDF report routes.
// Verifies RBAC, headers, filename, locale and PDF lib usage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}
function readLib(libPath: string) {
  return readFileSync(path.resolve(libPath), 'utf8');
}

const NORMAL = 'src/app/api/reports/pdf/normal-sale/[saleId]/route.ts';
const COLLECTIVE = 'src/app/api/reports/pdf/collective-sale/[saleId]/route.ts';
const PDF_LIB = 'src/lib/reports/pdf.tsx';

// ── PDF library ───────────────────────────────────────────────────────────────

test('pdf lib exports renderReportPdfBuffer', () => {
  const source = readLib(PDF_LIB);
  assert.match(source, /renderReportPdfBuffer/);
  assert.match(source, /renderToBuffer/);
});

test('pdf lib exports buildPdfDownloadHeaders with Content-Disposition', () => {
  const source = readLib(PDF_LIB);
  assert.match(source, /buildPdfDownloadHeaders/);
  assert.match(source, /Content-Disposition/);
  assert.match(source, /attachment/);
});

test('pdf lib exports buildReportPdfFilename for both kinds', () => {
  const source = readLib(PDF_LIB);
  assert.match(source, /buildReportPdfFilename/);
  assert.match(source, /normal-sale/);
  assert.match(source, /collective-sale/);
});

test('pdf lib exports formatReportKg and formatReportCurrency for pt-BR', () => {
  const source = readLib(PDF_LIB);
  assert.match(source, /formatReportKg/);
  assert.match(source, /formatReportCurrency/);
  assert.match(source, /pt-BR/);
  assert.match(source, /BRL/);
});

test('pdf lib sanitizes filename (sanitizePdfFilename)', () => {
  const source = readLib(PDF_LIB);
  assert.match(source, /sanitizePdfFilename/);
});

test('pdf lib includes Cache-Control: no-store header', () => {
  const source = readLib(PDF_LIB);
  assert.match(source, /Cache-Control/);
  assert.match(source, /no-store/);
});

// ── Normal sale PDF route ─────────────────────────────────────────────────────

test('normal PDF route requires manager/admin with sales.read scope', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'read'/);
});

test('normal PDF route scopes access by cooperativeId for managers', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /cooperativeId.*session\.cooperativeId/);
  assert.match(source, /admin/);
});

test('normal PDF route returns SALE_NOT_FOUND for out-of-scope sale', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /SALE_NOT_FOUND/);
});

test('normal PDF route calls renderReportPdfBuffer', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /renderReportPdfBuffer/);
});

test('normal PDF route builds filename with buildReportPdfFilename', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /buildReportPdfFilename/);
  assert.match(source, /normal-sale/);
});

test('normal PDF route sets download headers via buildPdfDownloadHeaders', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /buildPdfDownloadHeaders/);
});

test('normal PDF route returns NextResponse with pdf buffer', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /new NextResponse.*pdfBuffer/);
});

test('normal PDF route formats weight and revenue in pt-BR', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /formatReportKg/);
  assert.match(source, /formatReportCurrency/);
  assert.match(source, /pt-BR/);
});

test('normal PDF route includes lifecycle status field', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /getSaleLifecycleStatus/);
  assert.match(source, /status/);
});

test('normal PDF route includes material_name, worker_name, buyer_name labels', () => {
  const source = readRoute(NORMAL);
  assert.match(source, /materialName/);
  assert.match(source, /workerName/);
  assert.match(source, /buyerName/);
});

// ── Collective sale PDF route ─────────────────────────────────────────────────

test('collective PDF route requires manager/admin with sales.read scope', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'read'/);
});

test('collective PDF route hides sale from managers not creator or accepted participant', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /canReadFullCollectiveSaleReport/);
  assert.doesNotMatch(source, /status\s*===\s*['"]INVITED['"]/);
  assert.match(source, /COLLECTIVE_SALE_NOT_FOUND/);
});

test('collective PDF route calls renderReportPdfBuffer', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /renderReportPdfBuffer/);
});

test('collective PDF route builds filename with buildReportPdfFilename collective-sale', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /buildReportPdfFilename/);
  assert.match(source, /collective-sale/);
});

test('collective PDF route sets download headers via buildPdfDownloadHeaders', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /buildPdfDownloadHeaders/);
});

test('collective PDF route includes contributions in PDF rows', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /contributions/);
  assert.match(source, /contributedWeight/);
  assert.match(source, /revenueShare/);
});

test('collective PDF route includes total_revenue computation', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /totalRevenue/);
  assert.match(source, /\.times\(/);
});

test('collective PDF route formats data in pt-BR locale', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /pt-BR/);
  assert.match(source, /formatReportKg/);
  assert.match(source, /formatReportCurrency/);
});

test('collective PDF route includes ACTIVE, SOLD, CANCELLED via computeStatus', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /ACTIVE/);
  assert.match(source, /SOLD/);
  assert.match(source, /CANCELLED/);
  assert.match(source, /computeStatus/);
});

test('collective PDF route allows admin to bypass coop filter', () => {
  const source = readRoute(COLLECTIVE);
  assert.match(source, /isAdmin/);
  const adminIdx = source.indexOf('const isAdmin');
  const participantIdx = source.indexOf('if (!canReadFullCollectiveSaleReport');
  assert.ok(adminIdx < participantIdx, 'isAdmin check must precede participant scoping');
});

// ── buildReportPdfFilename unit tests ─────────────────────────────────────────

import { buildReportPdfFilename, sanitizePdfFilename } from '../src/lib/reports/pdf';

test('buildReportPdfFilename produces normal-sale-report-123.pdf', () => {
  assert.equal(buildReportPdfFilename('normal-sale', '123'), 'normal-sale-report-123.pdf');
});

test('buildReportPdfFilename produces collective-sale-report-456.pdf', () => {
  assert.equal(buildReportPdfFilename('collective-sale', '456'), 'collective-sale-report-456.pdf');
});

test('sanitizePdfFilename removes path-traversal characters', () => {
  const result = sanitizePdfFilename('../../../etc/passwd.pdf');
  // Path separators are what enable traversal; dots alone in a filename are harmless.
  assert.ok(!result.includes('/'), 'must not contain /');
  assert.ok(!result.includes('\\'), 'must not contain \\');
  assert.ok(result.endsWith('.pdf'));
});

test('sanitizePdfFilename strips newlines and quotes', () => {
  const result = sanitizePdfFilename('report\n"evil".pdf');
  assert.ok(!result.includes('\n'));
  assert.ok(!result.includes('"'));
});

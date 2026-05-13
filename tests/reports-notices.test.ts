import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPdfDownloadHeaders,
  buildReportPdfFilename,
  formatReportCurrency,
  formatReportKg,
  renderReportPdfBuffer,
  sanitizePdfFilename,
} from '../src/lib/reports/pdf';
import {
  sanitizeNoticeContent,
  sanitizeNoticeTitle,
} from '../src/lib/notices/sanitize';

test('notice sanitizer strips stored XSS payloads while preserving safe formatting', () => {
  const title = sanitizeNoticeTitle(
    '<img src=x onerror=alert(1)> Reunião <script>alert(2)</script>',
  );
  const content = sanitizeNoticeContent(`
    <p>Coleta <strong>antecipada</strong></p>
    <img src=x onerror=alert(1)>
    <a href="javascript:alert(1)">clique</a>
    <script>alert(document.cookie)</script>
  `);

  assert.equal(title, 'Reunião');
  assert.match(content, /<p>Coleta <strong>antecipada<\/strong><\/p>/);
  assert.doesNotMatch(content, /script|onerror|javascript:|<img|<a/i);
});

test('notice sanitizer blocks entity-decoded option and textarea breakouts', () => {
  const payload = `
    <option>&lt;/option&gt;&lt;img src=x onerror=alert(1)&gt;</option>
    <textarea>&lt;/textarea&gt;&lt;svg onload=alert(1)&gt;</textarea>
  `;

  const content = sanitizeNoticeContent(payload);

  assert.equal(content, '');
  assert.doesNotMatch(content, /<img|<svg|onerror|onload|option|textarea/i);
});

test('notice sanitizer strips svg and attributes from otherwise allowed tags', () => {
  const content = sanitizeNoticeContent(`
    <svg onload="alert(1)">icone</svg>
    <p class="notice" style="color:red" onclick="alert(1)" onerror="alert(2)" onload="alert(3)">
      Aviso seguro
    </p>
    <blockquote data-anything="x">Sem atributos</blockquote>
  `);

  assert.match(content, /<p>\s*Aviso seguro\s*<\/p>/);
  assert.match(content, /<blockquote>Sem atributos<\/blockquote>/);
  assert.doesNotMatch(content, /<svg|onload|onclick|onerror|style=|class=|data-anything/i);
});

test('report PDF proof of concept renders PDF bytes and download headers', async () => {
  const filename = buildReportPdfFilename('normal-sale', 123);
  const headers = buildPdfDownloadHeaders(filename);
  const buffer = await renderReportPdfBuffer({
    title: 'Relatório de venda normal',
    subtitle: 'Venda #123',
    generatedAt: new Date('2026-04-27T12:00:00-03:00'),
    rows: [
      { label: 'Material', value: 'Papelão' },
      { label: 'Peso', value: formatReportKg('12.5') },
      { label: 'Preço por kg', value: formatReportCurrency('2.5') },
    ],
    totals: [
      { label: 'Receita total', value: formatReportCurrency('31.25') },
    ],
  });

  assert.equal(filename, 'normal-sale-report-123.pdf');
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(
    headers['Content-Disposition'],
    'attachment; filename="normal-sale-report-123.pdf"; filename*=UTF-8\'\'normal-sale-report-123.pdf',
  );
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString('utf8'), '%PDF-');
  assert.ok(buffer.byteLength > 1000);
});

test('report PDF download filenames are sanitized before reaching headers', () => {
  const filename = buildReportPdfFilename('collective-sale', '123"\r\nSet-Cookie:evil=1');
  const headers = buildPdfDownloadHeaders('../relatorio "abril"\r\nx.pdf');

  assert.equal(filename, 'collective-sale-report-123-Set-Cookie-evil-1.pdf');
  assert.equal(sanitizePdfFilename(''), 'report.pdf');
  assert.equal(sanitizePdfFilename('relatorio final'), 'relatorio-final.pdf');
  assert.doesNotMatch(headers['Content-Disposition'], /[\r\n]|Set-Cookie/i);
  assert.match(headers['Content-Disposition'], /^attachment; filename="relatorio-abril-x.pdf";/);
  assert.match(headers['Content-Disposition'], /filename\*=UTF-8''relatorio-abril-x.pdf$/);
});

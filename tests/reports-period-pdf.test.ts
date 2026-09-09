import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { PeriodReportData } from '../src/lib/reports/period-report';
import {
  buildPeriodReportPdfFilename,
  buildWorkerReceiptPdfFilename,
  formatReportDateOnly,
  renderPeriodReportPdfBuffer,
  renderWorkerReceiptPdfBuffer,
  slugifyForFilename,
} from '../src/lib/reports/pdf';

function fixture(workerCount = 2): PeriodReportData {
  const byWorker = Array.from({ length: workerCount }, (_, index) => ({
    workerId: BigInt(index + 1),
    wastepickerId: `WP${String(index + 1).padStart(3, '0')}`,
    workerName: `Catador ${index + 1}`,
    kg: 10 + index,
    collectionsCount: 3,
    workedDays: 2,
  }));

  return {
    kind: 'period',
    cooperative: { id: BigInt(100), name: 'Cooperativa São João' },
    period: {
      yearMonth: '2026-09',
      from: new Date('2026-09-01T00:00:00.000Z'),
      toInclusive: new Date('2026-09-30T00:00:00.000Z'),
      label: 'setembro de 2026',
    },
    generatedAt: new Date('2026-09-09T15:00:00Z'),
    generatedBy: { name: 'Gerente UAT', role: 'manager' },
    filters: { worker: null, materialIds: null, materialLabel: null },
    summary: {
      collectedKg: 25,
      collectionsCount: 4,
      activeWorkers: workerCount,
      workedDays: 2,
      soldKg: 12,
      salesCount: 1,
      revenueBrl: 18,
      stockKg: 35,
    },
    byMaterial: [
      { materialId: BigInt(7), materialName: 'Papelão', groupName: 'Papel', kg: 20, sharePct: 80, collectionsCount: 3 },
      { materialId: BigInt(8), materialName: 'PET', groupName: 'Plástico', kg: 5, sharePct: 20, collectionsCount: 1 },
    ],
    byWorker,
    daily: [
      { date: new Date('2026-09-01T00:00:00.000Z'), kg: 15, collectionsCount: 2 },
      { date: new Date('2026-09-02T00:00:00.000Z'), kg: 10, collectionsCount: 2 },
    ],
    sales: [
      { saleId: BigInt(9), date: new Date('2026-09-05T00:00:00.000Z'), materialName: 'Papelão', buyerName: 'Comprador A', kg: 12, priceKg: 1.5, totalBrl: 18 },
    ],
    stock: [
      { materialId: BigInt(7), materialName: 'Papelão', groupName: 'Papel', currentKg: 30, totalCollectedKg: 50, totalSoldKg: 20 },
    ],
    workerDaily: [],
  };
}

function workerFixture(): PeriodReportData {
  const base = fixture(1);
  return {
    ...base,
    kind: 'worker-period',
    filters: { worker: { id: BigInt(1), wastepickerId: 'WP001', name: 'Catador 1' }, materialIds: null, materialLabel: null },
    sales: [],
    workerDaily: [
      { date: new Date('2026-09-01T00:00:00.000Z'), materialId: BigInt(7), materialName: 'Papelão', kg: 10, collectionsCount: 1 },
      { date: new Date('2026-09-02T00:00:00.000Z'), materialId: BigInt(8), materialName: 'PET', kg: 5, collectionsCount: 1 },
    ],
  };
}

function countPages(buffer: Buffer) {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
}

test('period report PDF renders a valid document', async () => {
  const buffer = await renderPeriodReportPdfBuffer(fixture());
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.byteLength > 1000);
  assert.ok(countPages(buffer) >= 1);
});

test('period report PDF paginates long worker tables', async () => {
  const buffer = await renderPeriodReportPdfBuffer(fixture(80));
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(countPages(buffer) >= 2, `expected multiple pages, got ${countPages(buffer)}`);
});

test('worker receipt PDF renders a valid document without sales', async () => {
  const buffer = await renderWorkerReceiptPdfBuffer(workerFixture());
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.byteLength > 1000);
});

test('period report filenames are slugged, sanitized and distinct per document', () => {
  const range = { from: new Date('2026-09-01T00:00:00.000Z'), toInclusive: new Date('2026-09-15T00:00:00.000Z') };

  assert.equal(slugifyForFilename('Cooperativa São João'), 'cooperativa-sao-joao');
  assert.equal(slugifyForFilename('   '), 'relatorio');
  assert.equal(
    buildPeriodReportPdfFilename({ cooperativeName: 'Cooperativa São João', yearMonth: '2026-09', ...range }),
    'relatorio-cooperativa-sao-joao-2026-09.pdf',
  );
  assert.equal(
    buildPeriodReportPdfFilename({ cooperativeName: 'Coop "X"\r\n', yearMonth: null, ...range }),
    'relatorio-coop-x-2026-09-01-a-2026-09-15.pdf',
  );
  assert.equal(
    buildWorkerReceiptPdfFilename({ wastepickerId: 'WP005', yearMonth: '2026-09', ...range }),
    'comprovante-wp005-2026-09.pdf',
  );
});

test('date-only values are formatted in UTC so DATE columns never shift a day', () => {
  assert.equal(formatReportDateOnly(new Date('2026-09-01T00:00:00.000Z')), '01/09/2026');
});

test('pdf module keeps the visual contract and pagination primitives', () => {
  const source = readFileSync(path.resolve('src/lib/reports/pdf.tsx'), 'utf8');
  assert.doesNotMatch(source, /#00D4FF/i);
  assert.match(source, /fixed/);
  assert.match(source, /render=\{\(\{ pageNumber, totalPages \}\)/);
  assert.match(source, /timeZone: 'UTC'/);
  assert.match(source, /export function PeriodReportPdfDocument/);
  assert.match(source, /export function WorkerReceiptPdfDocument/);
  assert.match(source, /'period' \| 'worker-period'/);
  assert.match(source, /sem documentos pessoais/i);
});

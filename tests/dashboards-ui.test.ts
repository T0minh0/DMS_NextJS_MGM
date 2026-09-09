import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const PAGE = 'src/app/dashboards/page.tsx';

test('dashboards page drives charts, tables and PDFs from the single period report', () => {
  const source = readSource(PAGE);

  assert.match(source, /activePath="\/dashboards"/);
  assert.match(source, /Dashboards da cooperativa/);
  assert.match(source, /\/api\/reports\/period\?/);
  assert.match(source, /reportRequestSeq/);
  assert.match(source, /requestId !== reportRequestSeq\.current/);
  assert.match(source, /year_month/);
  assert.match(source, /worker_id/);
  assert.match(source, /group_\$\{materialGroupFilter\}/);
  assert.match(source, /from '@\/components\/charts'/);
  assert.match(source, /<BarChart/);
  assert.match(source, /<DoughnutChart/);
  assert.match(source, /SectionMessage/);
  assert.match(source, /MetricCard/);
  assert.match(source, /Sem coletas no período/);
});

test('dashboards page offers the two PDF reports as separate actions', () => {
  const source = readSource(PAGE);

  assert.match(source, /Relatórios em PDF/);
  assert.match(source, /\/api\/reports\/pdf\/period\?/);
  assert.match(source, /\/api\/reports\/pdf\/worker\/\$\{encodeURIComponent\(workerFilter\)\}/);
  assert.match(source, /Baixar relatório consolidado \(PDF\)/);
  assert.match(source, /Baixar comprovante do catador \(PDF\)/);
  assert.match(source, /href=\{pdfPeriodUrl\} download/);
  assert.match(source, /href=\{pdfWorkerUrl\} download/);
});

test('dashboards page respects scope and the design contract', () => {
  const source = readSource(PAGE);

  assert.match(source, /!worker\.exit_date/);
  assert.match(source, /session\.role === 'admin'/);
  assert.match(source, /cooperative_id/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /console\./);
  assert.doesNotMatch(source, /alert\(/);
  assert.doesNotMatch(source, /cpf|CPF/);
});

test('dashboards route is registered in nav, proxy and design contract', () => {
  assert.match(readSource('src/components/Layout.tsx'), /href: '\/dashboards', icon: FaChartPie, label: 'Dashboards'/);
  assert.match(readSource('src/proxy.ts'), /'\/dashboards'/);
  assert.match(readSource('.tony/design.md'), /"\/dashboards":/);
  assert.match(readSource('.tony/design.md'), /src\/app\/dashboards\/page\.tsx/);
  assert.match(readSource('tests/auth-rbac.test.ts'), /'\/dashboards'/);
});

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const CHARTS_DIR = 'src/components/charts';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

function chartFiles() {
  return readdirSync(path.resolve(CHARTS_DIR))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => path.join(CHARTS_DIR, file));
}

test('chart layer never hardcodes colors and reads tokens from the document', () => {
  for (const file of chartFiles()) {
    const source = readSource(file);
    assert.doesNotMatch(source, /#[0-9A-Fa-f]{6}\b/, `${file} must not carry hex literals`);
    assert.doesNotMatch(source, /console\./, `${file} must not log`);
  }

  const theme = readSource(path.join(CHARTS_DIR, 'chart-theme.ts'));
  assert.match(theme, /ArcElement/);
  assert.match(theme, /typeof window === 'undefined'/);
  assert.match(theme, /getComputedStyle\(document\.documentElement\)/);

  const snapshotBody = theme.slice(theme.indexOf('function getThemeSnapshot'));
  assert.match(snapshotBody, /useSyncExternalStore\(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot\)/);
  assert.match(snapshotBody, /readChartTheme\(\)/);
  assert.match(snapshotBody, /ensureChartRegistration\(\)/);
  assert.doesNotMatch(theme, /useEffect|useState/);
});

test('every chart wrapper ships the textual fallback table with an explicit unit', () => {
  for (const wrapper of ['BarChart.tsx', 'LineChart.tsx', 'DoughnutChart.tsx']) {
    const source = readSource(path.join(CHARTS_DIR, wrapper));
    assert.match(source, /ChartFallbackTable/, `${wrapper} must render the fallback table`);
    assert.match(source, /unit/, `${wrapper} must declare a unit`);
    assert.match(source, /role="img"/, `${wrapper} must expose an accessible chart region`);
    assert.match(source, /aria-label=\{ariaLabel\}/, `${wrapper} must forward aria-label`);
    assert.match(source, /useChartTheme\(\)/, `${wrapper} must read the token theme`);
  }

  const fallback = readSource(path.join(CHARTS_DIR, 'ChartFallbackTable.tsx'));
  assert.match(fallback, /unidade: \{unit\}/);
  assert.match(fallback, /Ver dados em tabela/);
  assert.match(fallback, /sr-only/);
});

test('chart wrappers are loaded lazily on the client', () => {
  const index = readSource(path.join(CHARTS_DIR, 'index.ts'));
  assert.match(index, /^'use client';/);
  assert.match(index, /dynamic\(/);
  assert.match(index, /ssr: false/);
  assert.match(index, /export const BarChart/);
  assert.match(index, /export const LineChart/);
  assert.match(index, /export const DoughnutChart/);
});

test('dashboard primitives were extracted into shared components', () => {
  const page = readSource('src/app/page.tsx');
  assert.match(page, /@\/components\/dashboard\/SectionMessage/);
  assert.match(page, /@\/components\/dashboard\/MetricCard/);
  assert.doesNotMatch(page, /function SectionMessage\(/);
  assert.doesNotMatch(page, /function MetricCard\(/);

  const sectionMessage = readSource('src/components/dashboard/SectionMessage.tsx');
  assert.match(sectionMessage, /Carregando leitura operacional/);
  assert.match(sectionMessage, /Leitura indisponível/);
});

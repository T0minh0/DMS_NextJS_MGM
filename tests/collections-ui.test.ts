import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const PAGE = 'src/app/collections/page.tsx';

test('collections page mirrors the mobile weighing flow with cumulative reading and bag full toggle', () => {
  const source = readSource(PAGE);

  assert.match(source, /activePath="\/collections"/);
  assert.match(source, /Registrar coleta/);
  assert.match(source, /Coletas recentes/);
  assert.match(source, /Leitura da balança \(kg\)/);
  assert.match(source, /Saco cheio/);
  assert.match(source, /Coleta estimada/);
  assert.match(source, /Revisar coleta/);
  assert.match(source, /Confirmar coleta/);
  assert.match(source, /\/api\/collections\/bag-state/);
  assert.match(source, /fetch\('\/api\/collections'/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /!worker\.exit_date/);
  assert.match(source, /!material\.isGroup/);
  assert.match(source, /submitInFlight/);
});

test('collections page only sends measured_at when the operator changed the date', () => {
  const source = readSource(PAGE);

  assert.match(source, /const dateChanged = form\.date !== todayKey/);
  assert.match(source, /if \(dateChanged\) \{\s*body\.measured_at = form\.date;/);
  assert.match(source, /Datas anteriores só são aceitas se não houver leitura posterior/);
});

test('collections page maps domain errors to fields and keeps the design contract', () => {
  const source = readSource(PAGE);

  assert.match(source, /INVALID_MATERIAL_MEASUREMENT/);
  assert.match(source, /Já existe leitura mais recente para este material/);
  assert.match(source, /'WORKER_SCOPE_DENIED', 'WORKER_NOT_FOUND', 'WORKER_INACTIVE', 'WORKER_ROLE_REQUIRED'/);
  assert.match(source, /MATERIAL_NOT_FOUND/);
  assert.match(source, /SectionMessage/);
  assert.match(source, /hidden overflow-x-auto rounded-lg border border-outline md:block/);
  assert.match(source, /grid gap-3 md:hidden/);
  assert.match(source, /Nenhuma coleta no período/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /console\./);
  assert.doesNotMatch(source, /alert\(/);
});

test('collections route is registered in nav, proxy and design contract', () => {
  assert.match(readSource('src/components/Layout.tsx'), /href: '\/collections', icon: FaBalanceScale, label: 'Coletas'/);
  assert.match(readSource('src/proxy.ts'), /'\/collections'/);
  assert.match(readSource('.tony/design.md'), /"\/collections":/);
  assert.match(readSource('.tony/design.md'), /src\/app\/collections\/page\.tsx/);
  assert.match(readSource('tests/auth-rbac.test.ts'), /'\/collections'/);
});

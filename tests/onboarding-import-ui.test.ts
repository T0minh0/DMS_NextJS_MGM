import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const PAGE = 'src/app/admin/onboarding/page.tsx';

test('hidden onboarding page is not navigable and hides itself from non-admins', () => {
  assert.doesNotMatch(readSource('src/components/Layout.tsx'), /admin\/onboarding/);
  assert.match(readSource('src/proxy.ts'), /'\/admin'/);
  assert.match(readSource('.tony/design.md'), /"\/admin\/onboarding":/);

  const source = readSource(PAGE);
  assert.match(source, /fetch\('\/api\/auth\/session'/);
  assert.match(source, /sessionUser\.role !== 'admin'/);
  assert.match(source, /Página não encontrada/);
  assert.match(source, /Voltar ao painel/);
  assert.match(source, /router\.push\('\/login'\)/);
});

test('onboarding page walks through template, upload, preview, confirm and result', () => {
  const source = readSource(PAGE);

  assert.match(source, /Baixar modelo CSV/);
  assert.match(source, /Baixar referência \(coletores e materiais\)/);
  assert.match(source, /kind=template/);
  assert.match(source, /kind=referencia/);
  assert.match(source, /accept="\.csv,text\/csv"/);
  assert.match(source, /readAsText\(file, 'UTF-8'\)/);
  assert.match(source, /mode: 'validate'/);
  assert.match(source, /mode: 'apply'/);
  assert.match(source, /confirmation_token: validation\.confirmation_token/);
  assert.match(source, /Mostrar apenas linhas com problemas/);
  assert.match(source, /Confirmar importação/);
  assert.match(source, /sem alterar o estoque atual/);
  assert.match(source, /todas as cooperativas/);
  assert.match(source, /Esta ação não pode ser desfeita pela interface/);
  assert.match(source, /Confirmo que revisei a pré-visualização/);
  assert.match(source, /serão inseridas novamente/);
  assert.match(source, /force: forceDuplicates/);
  assert.match(source, /Baixar comprovante \(JSON\)/);
  assert.match(source, /Nova importação/);
});

test('onboarding page respects the design contract and never leaks the CSV to storage or logs', () => {
  const source = readSource(PAGE);
  assert.doesNotMatch(source, /alert\(|confirm\(/);
  assert.doesNotMatch(source, /console\./);
  assert.doesNotMatch(source, /localStorage/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});

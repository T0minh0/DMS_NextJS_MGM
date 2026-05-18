import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const PAGE = 'src/app/page.tsx';
const LAYOUT = 'src/components/Layout.tsx';
const PROXY = 'src/proxy.ts';
const SESSION_ROUTE = 'src/app/api/auth/session/route.ts';
const NEXT_CONFIG = 'next.config.ts';

test('dashboard is framed as a managerial operational overview', () => {
  const source = readSource(PAGE);

  assert.match(source, /Painel do dia da cooperativa/);
  assert.match(source, /Visão geral gerencial/);
  assert.match(source, /Pendências operacionais/);
  assert.match(source, /Estoque por material/);
  assert.match(source, /Receita e produtividade/);
  assert.match(source, /Próximas ações/);
  assert.doesNotMatch(source, /Dashboard de Coleta de Materiais/);
});

test('dashboard removes dev-only and debug actions from the page surface', () => {
  const source = readSource(PAGE);

  assert.doesNotMatch(source, /\/api\/debug\/check-data/);
  assert.doesNotMatch(source, /\/api\/recalculate-contributions/);
  assert.doesNotMatch(source, /\/api\/users\/assign-wastepicker-ids/);
  assert.doesNotMatch(source, /handleDebugData|handleRecalculateContributions|handleAssignWastepickerIds/);
  assert.doesNotMatch(source, /DEBUG STATE|Debug Data Full|Atribuir IDs aos Catadores/);
});

test('dashboard uses session endpoint and professional section states', () => {
  const source = readSource(PAGE);

  assert.match(source, /\/api\/auth\/session/);
  assert.match(source, /SectionMessage/);
  assert.match(source, /Leitura indisponível/);
  assert.match(source, /Carregando leitura operacional/);
  assert.match(source, /Atualizar painel/);
  assert.doesNotMatch(source, /localStorage/);
});

test('dashboard ignores stale async responses after filter changes', () => {
  const source = readSource(PAGE);

  assert.match(source, /dashboardRequestSeq/);
  assert.match(source, /requestId !== dashboardRequestSeq\.current/);
});

test('dashboard keeps material filters to individual materials, not group placeholders', () => {
  const source = readSource(PAGE);

  assert.match(source, /filterableMaterials/);
  assert.match(source, /!material\.isGroup/);
  assert.match(source, /encodeURIComponent\(materialFilter\)/);
});

test('Layout loads authenticated session from the server and gates manager nav items', () => {
  const source = readSource(LAYOUT);

  assert.match(source, /\/api\/auth\/session/);
  assert.match(source, /roles: MANAGER_NAV_ROLES/);
  assert.match(source, /item\.roles\.includes\(userRole\)/);
  assert.match(source, /Visão geral/);
  assert.match(source, /Materiais e estoque/);
  assert.match(source, /Meu perfil/);
  assert.match(source, /hidden flex-wrap gap-2 sm:flex/);
  assert.match(source, /Navegação/);
  assert.match(source, /router\.push\(event\.target\.value\)/);
  assert.doesNotMatch(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /FaBars/);
  assert.doesNotMatch(source, /\/api\/user\?id=/);
  assert.doesNotMatch(source, /notFound:\s*true/);
});

test('local browser evidence hides framework dev indicator chrome', () => {
  const source = readSource(NEXT_CONFIG);

  assert.match(source, /devIndicators:\s*false/);
});

test('proxy blocks worker direct access to managerial pages server-side', () => {
  const source = readSource(PROXY);

  assert.match(source, /MANAGER_PAGE_PATHS/);
  assert.match(source, /session\.role === 'worker'/);
  assert.match(source, /worker_page_denied/);
  assert.match(source, /web-role-denied/);
});

test('auth session route is manager/admin only and does not require database reads', () => {
  const source = readSource(SESSION_ROUTE);

  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /cooperative_name/);
  assert.doesNotMatch(source, /prisma/);
});

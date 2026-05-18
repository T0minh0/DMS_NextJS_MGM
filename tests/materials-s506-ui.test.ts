import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const MATERIALS_PAGE = 'src/app/materials/page.tsx';
const DASHBOARD_PAGE = 'src/app/page.tsx';
const STOCK_ROUTE = 'src/app/api/stock/route.ts';
const COOPERATIVE_MATERIALS_ROUTE = 'src/app/api/cooperative/materials/route.ts';
const MATERIALS_DOCS = 'Web_vault/API/Materiais-e-cooperativas.md';
const STOCK_DOCS = 'Web_vault/API/Vendas-e-estoque.md';

test('S5-06 materials page reads session, catalog and cooperative stock', () => {
  const source = readSource(MATERIALS_PAGE);

  assert.match(source, /fetch\('\/api\/auth\/session'\)/);
  assert.match(source, /fetch\('\/api\/materials'\)/);
  assert.match(source, /new URLSearchParams\(\{ cooperative_id: sessionData\.cooperative_id \}\)/);
  assert.match(source, /fetch\(`\/api\/cooperative\/materials\?\$\{stockParams\.toString\(\)\}`\)/);
  assert.doesNotMatch(source, /fetch\('\/api\/cooperative\/materials'\)/);
  assert.match(source, /stockByMaterialId/);
  assert.match(source, /stock_kg/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /console\.(log|error|warn|debug)/);
});

test('S5-06 materials page exposes stock status, unit and movement totals', () => {
  const source = readSource(MATERIALS_PAGE);

  assert.match(source, /type StockStatus = 'empty' \| 'critical' \| 'stable' \| 'unavailable'/);
  assert.match(source, /Sem saldo/);
  assert.match(source, /Crítico/);
  assert.match(source, /Operacional/);
  assert.match(source, /Indisponível/);
  assert.match(source, /unidade kg/);
  assert.match(source, /Coletado \/ vendido/);
  assert.match(source, /totalCollectedKg/);
  assert.match(source, /totalSoldKg/);
});

test('S5-06 materials page gates catalog CRUD by role and keeps manager stock action', () => {
  const source = readSource(MATERIALS_PAGE);

  assert.match(source, /canManageMaterials = sessionUser\?\.role === 'admin'/);
  assert.match(source, /Catálogo somente leitura/);
  assert.match(source, /Gerentes ajustam saldos da própria cooperativa/);
  assert.match(source, /Apenas administradores podem alterar o catálogo de materiais/);
  assert.match(source, /showMaterialModal && canManageMaterials/);
  assert.match(source, /deleteMaterial && canManageMaterials/);
  assert.match(source, /Ajustar estoque/);
});

test('S5-06 stock adjustment has inline validation, impact confirmation and scoped API payload', () => {
  const source = readSource(MATERIALS_PAGE);

  assert.match(source, /parseAmount/);
  assert.match(source, /Informe um peso positivo com até 2 casas decimais/);
  assert.match(source, /Revisar impacto/);
  assert.match(source, /Confirmar ajuste/);
  assert.match(source, /Confirmar este ajuste elevará o saldo/);
  assert.match(source, /fetch\('\/api\/stock'/);
  assert.match(source, /cooperative_id: sessionUser\?\.cooperative_id/);
  assert.match(source, /const stockSubmitInFlight = useRef\(false\)/);
  assert.match(source, /if \(!stockMaterial \|\| stockSubmitInFlight\.current\) return/);
  assert.match(source, /stockSubmitInFlight\.current = true/);
  assert.match(source, /stockSubmitInFlight\.current = false/);
  assert.doesNotMatch(source, /\balert\(/);
  assert.doesNotMatch(source, /\bconfirm\(/);
});

test('S5-06 stock read failures do not masquerade as zero balances', () => {
  const source = readSource(MATERIALS_PAGE);

  assert.match(source, /const stockReadAvailable = !stockError/);
  assert.match(source, /stockPayload\.truncated === true/);
  assert.match(source, /stockPayload\.has_more === true/);
  assert.match(source, /stockPayload\.total > stockPayload\.count/);
  assert.match(source, /Leitura parcial do estoque/);
  assert.match(source, /stockKg = stockReadAvailable \? stock\?\.stock_kg \?\? 0 : null/);
  assert.match(source, /totalStock = stockReadAvailable/);
  assert.match(source, /formatStockWeight\(totalStock\)/);
  assert.match(source, /criticalCount === null \|\| emptyCount === null \? 'Indisponível'/);
  assert.match(source, /disabled=\{Boolean\(stockError\)\}/);
  assert.match(source, /if \(stockError\) return/);
});

test('S5-06 stock adjustment backend errors render inside the modal', () => {
  const source = readSource(MATERIALS_PAGE);

  assert.match(source, /stockSubmitError/);
  assert.match(source, /setStockSubmitError\(null\)/);
  assert.match(source, /setStockSubmitError\(error instanceof Error \? error\.message : 'Não foi possível ajustar o estoque'\)/);
  assert.match(source, /stockSubmitError &&/);
  assert.match(source, /<p>\{stockSubmitError\}<\/p>/);
});

test('S5-06 materials page keeps desktop table and mobile cards for dense stock data', () => {
  const source = readSource(MATERIALS_PAGE);

  assert.match(source, /hidden overflow-x-auto rounded-lg border border-outline md:block/);
  assert.match(source, /grid gap-3 md:hidden/);
  assert.match(source, /min-w-\[64rem\]/);
  assert.match(source, /Saldo/);
  assert.match(source, /Grupo/);
});

test('S5-06 stock APIs enforce scoped manager access and richer material stock reads', () => {
  const stockRoute = readSource(STOCK_ROUTE);
  const cooperativeMaterialsRoute = readSource(COOPERATIVE_MATERIALS_ROUTE);

  assert.match(stockRoute, /determineTargetCooperative/);
  assert.match(stockRoute, /requireScopedPermission\(session, 'stock', 'manage', 'cooperative'\)/);
  assert.match(stockRoute, /addManualStock/);
  assert.match(cooperativeMaterialsRoute, /MATERIALS_QUERY_CEILING/);
  assert.match(cooperativeMaterialsRoute, /prisma\.stock\.count/);
  assert.match(cooperativeMaterialsRoute, /requireManagerOrAdmin/);
  assert.match(cooperativeMaterialsRoute, /determineTargetCooperative/);
  assert.match(cooperativeMaterialsRoute, /stock_kg/);
  assert.match(cooperativeMaterialsRoute, /total_collected_kg/);
  assert.match(cooperativeMaterialsRoute, /total_sold_kg/);
  assert.match(cooperativeMaterialsRoute, /has_more: truncated/);
  assert.match(cooperativeMaterialsRoute, /truncated/);
});

test('S5-06 dashboard still maps stock labels through real material names', () => {
  const source = readSource(DASHBOARD_PAGE);

  assert.match(source, /materialNameById/);
  assert.match(source, /getMaterialName\(material\)/);
  assert.match(source, /materialNameById\.get\(materialId\) \|\| key/);
  assert.match(source, /Estoque por material/);
  assert.match(source, /Estoque total/);
});

test('S5-06 docs describe material stock UX contracts', () => {
  const materialsDocs = readSource(MATERIALS_DOCS);
  const stockDocs = readSource(STOCK_DOCS);

  assert.match(materialsDocs, /material_id` como string/);
  assert.match(materialsDocs, /\/materials` usa `\/api\/materials` e `\/api\/cooperative\/materials\?cooperative_id=<id-da-sessao>`/);
  assert.match(stockDocs, /A tela `\/materials` usa `POST \/api\/stock`/);
  assert.match(stockDocs, /Ajuste manual/);
});

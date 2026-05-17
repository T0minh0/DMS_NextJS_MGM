import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const DEPRECATION_DOC = 'Web_vault/Operacao/Deprecacao-network-management-system.md';
const ROUTES_DOC = 'Web_vault/API/Rotas.md';
const SALES_DOC = 'Web_vault/API/Vendas-e-estoque.md';
const HOME_DOC = 'Web_vault/Home.md';

const parityRoutes = [
  ['POST', 'src/app/api/auth/login/route.ts'],
  ['GET', 'src/app/api/cooperatives/route.ts'],
  ['GET', 'src/app/api/buyers/route.ts'],
  ['POST', 'src/app/api/buyers/route.ts'],
  ['GET', 'src/app/api/revenue/route.ts'],
  ['GET', 'src/app/api/cooperative/materials/route.ts'],
  ['GET', 'src/app/api/cooperative/lastsales/route.ts'],
  ['GET', 'src/app/api/stock/route.ts'],
  ['POST', 'src/app/api/stock/route.ts'],
  ['POST', 'src/app/api/insertMaterial/route.ts'],
  ['GET', 'src/app/api/sales/route.ts'],
  ['POST', 'src/app/api/sales/route.ts'],
  ['PUT', 'src/app/api/sales/[id]/route.ts'],
  ['DELETE', 'src/app/api/sales/[id]/route.ts'],
  ['PATCH', 'src/app/api/sales/[id]/complete/route.ts'],
  ['PATCH', 'src/app/api/sales/[id]/cancel/route.ts'],
  ['GET', 'src/app/api/collective-sales/route.ts'],
  ['POST', 'src/app/api/collective-sales/route.ts'],
  ['GET', 'src/app/api/collective-sales/invitations/route.ts'],
  ['PATCH', 'src/app/api/collective-sales/[id]/route.ts'],
  ['POST', 'src/app/api/collective-sales/[id]/invite/route.ts'],
  ['POST', 'src/app/api/collective-sales/[id]/join/route.ts'],
  ['PATCH', 'src/app/api/collective-sales/[id]/contribution/route.ts'],
  ['POST', 'src/app/api/collective-sales/[id]/leave/route.ts'],
  ['POST', 'src/app/api/collective-sales/[id]/cancel/route.ts'],
  ['POST', 'src/app/api/collective-sales/[id]/complete/route.ts'],
  ['GET', 'src/app/api/reports/sales/normal/[saleId]/route.ts'],
  ['GET', 'src/app/api/reports/sales/collective/[saleId]/route.ts'],
  ['GET', 'src/app/api/reports/pdf/normal-sale/[saleId]/route.ts'],
  ['GET', 'src/app/api/reports/pdf/collective-sale/[saleId]/route.ts'],
  ['GET', 'src/app/api/notices/route.ts'],
  ['POST', 'src/app/api/notices/route.ts'],
  ['GET', 'src/app/api/notices/global/route.ts'],
  ['GET', 'src/app/api/notices/filter/route.ts'],
  ['GET', 'src/app/api/notices/[id]/route.ts'],
  ['PATCH', 'src/app/api/notices/[id]/route.ts'],
  ['DELETE', 'src/app/api/notices/[id]/route.ts'],
  ['GET', 'src/app/api/multipliers/route.ts'],
  ['POST', 'src/app/api/multipliers/route.ts'],
  ['GET', 'src/app/api/multipliers/single/route.ts'],
  ['GET', 'src/app/api/achievements/route.ts'],
  ['PATCH', 'src/app/api/achievements/[achievementId]/xp/route.ts'],
  ['GET', 'src/app/api/achievements/workers/[workerId]/month/route.ts'],
  ['GET', 'src/app/api/achievements/workers/[workerId]/top-month/route.ts'],
  ['GET', 'src/app/api/achievements/workers/[workerId]/top-day/route.ts'],
  ['GET', 'src/app/api/levels/route.ts'],
  ['GET', 'src/app/api/levels/worker/[workerId]/route.ts'],
  ['GET', 'src/app/api/leaderboard/route.ts'],
  ['GET', 'src/app/api/leaderboard/history/route.ts'],
  ['POST', 'src/app/api/jobs/random-multiplier/route.ts'],
  ['POST', 'src/app/api/jobs/achievement-evaluation/route.ts'],
  ['POST', 'src/app/api/jobs/leaderboard-snapshot-weekly/route.ts'],
  ['POST', 'src/app/api/jobs/leaderboard-snapshot-monthly/route.ts'],
] as const;

const classifiedLegacyEndpoints = [
  'POST /api/auth/login',
  'GET /api/cooperatives',
  'GET /api/buyers',
  'GET /api/performance',
  'GET /api/productivity',
  'GET /api/revenue',
  'GET /api/cooperative/materials',
  'GET /api/cooperative/lastsales/all',
  'GET /api/cooperative/lastsales',
  'GET /api/getLast5Sales',
  'GET /api/stock',
  'POST /api/stock',
  'POST /api/insertMaterial',
  'GET /api/sales/history',
  'GET /api/sales/active',
  'GET /api/sales',
  'POST /api/sales',
  'PUT /api/sales/{saleId}',
  'PATCH /api/sales/{saleId}/complete',
  'PATCH /api/sales/{saleId}/cancel',
  'GET /api/collective-sale',
  'GET /api/collective-sale/invitations',
  'POST /api/collective-sale',
  'POST /api/collective-sale/{saleId}/invite',
  'POST /api/collective-sale/{saleId}/join',
  'PUT /api/collective-sale/{saleId}/contribution',
  'PUT /api/collective-sale/{saleId}/material',
  'PUT /api/collective-sale/{saleId}/price',
  'DELETE /api/collective-sale/{saleId}/leave',
  'GET /api/collective-sale/my',
  'DELETE /api/collective-sale/{saleId}',
  'PATCH /api/collective-sale/{saleId}/complete',
  'GET /api/reports/sales/normal/{saleId}',
  'GET /api/reports/sales/collective/{saleId}',
  'GET /api/reports/pdf/normal-sale/{saleId}',
  'GET /api/reports/pdf/collective-sale/{saleId}',
  'GET /api/notices',
  'POST /api/notices',
  'PUT /api/notices/{noticeId}',
  'DELETE /api/notices/{noticeId}',
  'POST /api/multipliers',
  'GET /api/multipliers',
  'GET /api/achievements',
  'GET /api/levels',
  'GET /api/leaderboard',
] as const;

test('S5-07 parity route surface exists in the Next app', () => {
  for (const [method, routePath] of parityRoutes) {
    assert.equal(existsSync(path.resolve(routePath)), true, routePath);
    assert.match(
      readSource(routePath),
      new RegExp(`export\\s+async\\s+function\\s+${method}\\b`),
      routePath,
    );
  }
});

test('S5-07 deprecation checklist documents go/no-go gates and evidence commands', () => {
  const doc = readSource(DEPRECATION_DOC);

  assert.match(doc, /Task ClickUp: `86e1c9ezk`/);
  assert.match(doc, /GO condicional para freeze operacional/);
  assert.match(doc, /NO-GO para desligamento definitivo ate S5-04/);
  assert.match(doc, /Revisao-S5-03-seguranca-performance-concorrencia/);
  assert.match(doc, /network_management_system/);
  assert.match(doc, /DMS_NextJS_MGM/);
  assert.match(doc, /repo Java.*somente leitura/i);
  assert.match(doc, /npm run quality/);
  assert.match(doc, /tests\/deprecation-parity-s507\.test\.ts/);
  assert.match(doc, /npm audit --audit-level=high --json/);
  assert.match(doc, /npx @google\/design\.md lint \.tony\/design\.md/);
  assert.match(doc, /scripts\/run-s5-02-uat\.mjs/);
  assert.match(doc, /npx prisma migrate deploy/);
  assert.match(doc, /pg_dump/);
  assert.match(doc, /pg_restore/);
  assert.match(doc, /nao executar `git push`/);
});

test('S5-07 deprecation matrix covers every migrated Java domain family', () => {
  const doc = readSource(DEPRECATION_DOC);
  const expectedFamilies = [
    'Auth/RBAC',
    'Cooperativas e compradores',
    'Analytics e dashboard',
    'Pesagem, bag state e estoque manual',
    'Venda normal lifecycle',
    'Venda coletiva',
    'Completion coletiva existente no Java',
    'Reports JSON/PDF',
    'Notices',
    'Multipliers e random multiplier',
    'Achievements, levels e leaderboard',
    'Browser routes Java',
    'Banco e migrations',
    'Observabilidade e debug',
  ];

  for (const family of expectedFamilies) {
    assert.match(doc, new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(doc, /\/api\/collective-sales/);
  assert.match(doc, /\/api\/collective-sale` fica apenas como referencia historica/);
  assert.match(doc, /PATCH \/api\/collective-sale\{saleId\}\/complete|PATCH \/api\/collective-sale\/\{saleId\}\/complete/);
  assert.doesNotMatch(doc, /completion coletiva ausente/i);
  assert.match(doc, /JWT via `\?token=`/);
});

test('S5-07 classifies legacy Java endpoints that are not preserved one-to-one', () => {
  const doc = readSource(DEPRECATION_DOC);

  for (const endpoint of classifiedLegacyEndpoints) {
    assert.match(doc, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(doc, /GET \/api\/sales\/history`\s+\|\s+substituir/);
  assert.match(doc, /GET \/api\/sales\/active`\s+\|\s+substituir/);
  assert.match(doc, /GET \/api\/performance`\s+\|\s+substituir/);
  assert.match(doc, /GET \/api\/cooperative\/lastsales\/all`\s+\|\s+retirar\/substituir/);
  assert.match(doc, /GET \/api\/getLast5Sales`\s+\|\s+retirar/);
  assert.match(doc, /PUT \/api\/collective-sale\/\{saleId\}\/contribution`\s+\|\s+substituir por `PATCH \/api\/collective-sales\/\[id\]\/contribution`/);
  assert.match(doc, /PATCH \/api\/collective-sale\/\{saleId\}\/complete`\s+\|\s+substituir por `POST \/api\/collective-sales\/\[id\]\/complete`/);
});

test('S5-07 vault docs point to the deprecation checklist and current collective-sales contract', () => {
  const home = readSource(HOME_DOC);
  const routes = readSource(ROUTES_DOC);
  const sales = readSource(SALES_DOC);

  assert.match(home, /Operacao\/Deprecacao-network-management-system/);
  assert.match(routes, /\/api\/collective-sales\/\[id\]\/complete/);
  assert.match(routes, /\/api\/multipliers/);
  assert.match(routes, /\/api\/multipliers\/single/);
  assert.match(routes, /\/api\/jobs\/leaderboard-snapshot-monthly/);
  assert.match(routes, /legado singular `\/api\/collective-sale`/);
  assert.match(sales, /Rota canonica Next: `\/api\/collective-sales`/);
  assert.match(sales, /POST`\s+\|\s+`\/api\/collective-sales\/\[id\]\/complete`/);
  assert.match(sales, /Java ja tinha `PATCH \/api\/collective-sale\/\{saleId\}\/complete`/);
  assert.match(sales, /Exclusao destrutiva foi removida/);
  assert.doesNotMatch(sales, /Ainda nao ha endpoints Next para venda coletiva/);
  assert.doesNotMatch(sales, /nao tinha completion coletiva/i);
});

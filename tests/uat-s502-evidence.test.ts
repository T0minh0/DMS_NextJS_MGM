import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const UAT_RUNNER = 'scripts/run-s5-02-uat.mjs';
const UAT_REPORT = 'Web_vault/Operacao/UAT-S5-02.md';
const UAT_EVIDENCE = 'output/playwright/s5-02/s5-02-uat-evidence.json';

async function importRunner() {
  return import(pathToFileURL(path.resolve(UAT_RUNNER)).href);
}

test('S5-02 UAT runner covers the integrated managerial route set', () => {
  const source = readSource(UAT_RUNNER);
  const expectedRoutes = [
    '/login',
    '/',
    '/sales',
    '/materials',
    '/manage-workers',
    '/worker-productivity',
    '/profile',
    '/notices',
    '/collective-sales',
  ];

  for (const route of expectedRoutes) {
    assert.match(source, new RegExp(`path: '${route.replace('/', '\\/')}'`));
  }

  assert.match(source, /viewportName === 'desktop'/);
  assert.match(source, /width: 390, height: 844/);
  assert.match(source, /horizontalOverflow/);
  assert.match(source, /consoleEntries/);
  assert.match(source, /networkFailures/);
  assert.match(source, /httpFailures/);
  assert.match(source, /s5-02-uat-evidence\.json/);
});

test('S5-02 UAT runner exercises managerial interactions and scoped negatives', () => {
  const source = readSource(UAT_RUNNER);

  assert.match(source, /login-success/);
  assert.match(source, /open-sale-modal/);
  assert.match(source, /stock-review/);
  assert.match(source, /team-search/);
  assert.match(source, /select-worker/);
  assert.match(source, /priority-filter/);
  assert.match(source, /collective-tab/);
  assert.match(source, /noSessionRedirected/);
  assert.match(source, /workerDenied/);
  assert.match(source, /realProxyChecks/);
  assert.match(source, /backendContractChecks/);
  assert.match(source, /auth-rbac\.test\.ts/);
  assert.match(source, /\/login\?reason=web-role-denied/);
});

test('S5-02 UAT runner validates JSON and PDF report surfaces', () => {
  const source = readSource(UAT_RUNNER);

  assert.match(source, /\/api\/reports\/sales\/collective\/201/);
  assert.match(source, /\/api\/reports\/pdf\/collective-sale\/201/);
  assert.match(source, /contentType: response\.headers\.get\('content-type'\)/);
  assert.match(source, /magicBytes/);
  assert.match(source, /application\\\/pdf/);
  assert.match(source, /%PDF/);
  assert.match(source, /UNHANDLED_MOCKED_API_REQUEST/);
});

test('S5-02 UAT runner fails closed on unhandled mocked API calls', async () => {
  const { mockApi } = await importRunner();
  const fulfillCalls: Array<{ status: number; body: string }> = [];
  const route = {
    request: () => ({
      url: () => 'http://localhost:3106/api/new-unexpected-endpoint',
      method: () => 'GET',
      postData: () => null,
    }),
    fulfill: (payload: { status: number; body: string }) => {
      fulfillCalls.push(payload);
      return Promise.resolve(payload);
    },
  };

  await mockApi(route);

  assert.equal(fulfillCalls[0]?.status, 599);
  assert.match(fulfillCalls[0]?.body ?? '', /UNHANDLED_MOCKED_API_REQUEST/);
});

test('S5-02 UAT runner fails closed on unexpected methods for known API paths', async () => {
  const { mockApi } = await importRunner();
  const fulfillCalls: Array<{ status: number; body: string }> = [];
  const route = {
    request: () => ({
      url: () => 'http://localhost:3106/api/materials',
      method: () => 'POST',
      postData: () => null,
    }),
    fulfill: (payload: { status: number; body: string }) => {
      fulfillCalls.push(payload);
      return Promise.resolve(payload);
    },
  };

  await mockApi(route);

  assert.equal(fulfillCalls[0]?.status, 599);
  assert.match(fulfillCalls[0]?.body ?? '', /POST \/api\/materials/);
});

test('S5-02 evidence validator rejects non-PDF report responses', async () => {
  const { validateEvidence } = await importRunner();
  const failures = validateEvidence({
    routes: new Array(18).fill({}),
    negativeChecks: { noSessionRedirected: true, workerDenied: true },
    reportChecks: {
      jsonStatus: 200,
      pdfStatus: { status: 200, contentType: 'text/html', magicBytes: '<!do' },
    },
    backendContractChecks: { pass: true },
    summary: { routeFailures: [] },
  });

  assert.ok(failures.some((failure: string) => failure.includes('content-type')));
  assert.ok(failures.some((failure: string) => failure.includes('magic bytes')));
});

test('S5-02 generated evidence, when present, validates screenshots and backend contracts', async () => {
  if (!existsSync(UAT_EVIDENCE)) return;

  const { validateEvidence } = await importRunner();
  const evidence = JSON.parse(readSource(UAT_EVIDENCE));
  const failures = validateEvidence(evidence);

  assert.deepEqual(failures, []);
  assert.equal(evidence.backendContractChecks.pass, true);
  assert.equal(evidence.summary.httpFailures.length, 0);

  for (const route of evidence.routes as Array<{ screenshot: string }>) {
    assert.equal(existsSync(route.screenshot), true, route.screenshot);
  }
});

test('S5-02 vault report documents execution contract and evidence paths', () => {
  const report = readSource(UAT_REPORT);

  assert.match(report, /Task ClickUp: `86e136ckr`/);
  assert.match(report, /scripts\/run-s5-02-uat\.mjs/);
  assert.match(report, /output\/playwright\/s5-02\/s5-02-uat-evidence\.json/);
  assert.match(report, /login/);
  assert.match(report, /materials/);
  assert.match(report, /worker-web-login-denied/);
  assert.match(report, /manager-horizonte-worker-leste-denied/);
  assert.match(report, /Regressao visual/);
});

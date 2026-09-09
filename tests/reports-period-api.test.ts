import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { AuthError, AuthSession } from '../src/lib/auth/shared';
import type { MaterialLookupClient } from '../src/lib/analytics/period';
import { parseWorkerIdParam, resolvePeriodReportRequest } from '../src/lib/reports/period-request';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const managerSession: AuthSession = {
  workerId: '1',
  cooperativeId: '100',
  role: 'manager',
  userType: 0,
  name: 'Gerente UAT',
};

const adminSession: AuthSession = { ...managerSession, role: 'admin', name: 'Admin UAT' };

const fakeDb = {
  materials: {
    findMany: async ({ where }: { where: { group: { groupName: { equals: string } } } }) =>
      where.group.groupName.equals.toLowerCase() === 'papel' ? [{ materialId: BigInt(7) }] : [],
  },
} as unknown as MaterialLookupClient;

const now = new Date('2026-09-09T15:00:00Z');

test('parseWorkerIdParam accepts numeric and WP identifiers', () => {
  assert.deepEqual(parseWorkerIdParam('WP005'), { kind: 'id', workerId: BigInt(5) });
  assert.deepEqual(parseWorkerIdParam('12'), { kind: 'id', workerId: BigInt(12) });
  assert.deepEqual(parseWorkerIdParam(''), { kind: 'none' });
  assert.deepEqual(parseWorkerIdParam(null), { kind: 'none' });
  assert.deepEqual(parseWorkerIdParam('abc'), { kind: 'invalid' });
});

test('resolvePeriodReportRequest defaults to the current month in America/Sao_Paulo', async () => {
  const resolution = await resolvePeriodReportRequest(fakeDb, managerSession, new URLSearchParams(), { now });
  assert.ok(resolution.ok);
  assert.equal(resolution.input.cooperativeId, BigInt(100));
  assert.equal(resolution.input.yearMonth, '2026-09');
  assert.equal(resolution.input.from.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(resolution.input.toExclusive.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(resolution.input.workerId, null);
  assert.equal(resolution.input.materialIds, null);
  assert.deepEqual(resolution.input.generatedBy, { name: 'Gerente UAT', role: 'manager' });
});

test('resolvePeriodReportRequest parses ranges, workers and material groups', async () => {
  const resolution = await resolvePeriodReportRequest(
    fakeDb,
    managerSession,
    new URLSearchParams('from=2026-09-01&to=2026-09-15&worker_id=WP005&material_id=group_Papel'),
    { now },
  );
  assert.ok(resolution.ok);
  assert.equal(resolution.input.yearMonth, null);
  assert.equal(resolution.input.periodLabel, '01/09/2026 a 15/09/2026');
  assert.equal(resolution.input.toExclusive.toISOString(), '2026-09-16T00:00:00.000Z');
  assert.equal(resolution.input.workerId, BigInt(5));
  assert.deepEqual(resolution.input.materialIds, [BigInt(7)]);
  assert.equal(resolution.input.materialLabel, 'Grupo Papel');

  const ignored = await resolvePeriodReportRequest(fakeDb, managerSession, new URLSearchParams('worker_id=5'), { now, ignoreWorker: true });
  assert.ok(ignored.ok);
  assert.equal(ignored.input.workerId, null);

  const override = await resolvePeriodReportRequest(fakeDb, managerSession, new URLSearchParams('worker_id=5'), { now, workerIdParam: 'WP009' });
  assert.ok(override.ok);
  assert.equal(override.input.workerId, BigInt(9));

  const emptyGroup = await resolvePeriodReportRequest(fakeDb, managerSession, new URLSearchParams('material_id=group_Vidro'), { now });
  assert.ok(emptyGroup.ok);
  assert.deepEqual(emptyGroup.input.materialIds, []);
});

test('resolvePeriodReportRequest returns typed errors for bad input', async () => {
  const cases: Array<[string, string]> = [
    ['year_month=2026-13', 'INVALID_YEAR_MONTH'],
    ['from=2026-09-01', 'INVALID_PERIOD'],
    ['from=2026-09-10&to=2026-09-01', 'INVALID_PERIOD_RANGE'],
    ['from=2025-01-01&to=2026-12-31', 'INVALID_PERIOD_RANGE'],
    ['worker_id=abc', 'INVALID_WORKER_ID'],
    ['material_id=abc', 'INVALID_MATERIAL'],
  ];

  for (const [query, code] of cases) {
    const resolution = await resolvePeriodReportRequest(fakeDb, managerSession, new URLSearchParams(query), { now });
    assert.equal(resolution.ok, false, query);
    assert.equal(resolution.ok ? null : resolution.error.code, code, query);
    assert.equal(resolution.ok ? null : resolution.error.status, 400, query);
  }
});

test('resolvePeriodReportRequest blocks managers from other cooperatives and lets admins pick one', async () => {
  await assert.rejects(
    () => resolvePeriodReportRequest(fakeDb, managerSession, new URLSearchParams('cooperative_id=999'), { now }),
    (error: unknown) => error instanceof AuthError && error.status === 403 && error.code === 'COOPERATIVE_SCOPE_DENIED',
  );

  const admin = await resolvePeriodReportRequest(fakeDb, adminSession, new URLSearchParams('cooperative_id=999'), { now });
  assert.ok(admin.ok);
  assert.equal(admin.input.cooperativeId, BigInt(999));

  const adminDefault = await resolvePeriodReportRequest(fakeDb, adminSession, new URLSearchParams(), { now });
  assert.ok(adminDefault.ok);
  assert.equal(adminDefault.input.cooperativeId, BigInt(100));
});

test('period report routes share auth, parsing and PDF headers', () => {
  const jsonRoute = readSource('src/app/api/reports/period/route.ts');
  const pdfRoute = readSource('src/app/api/reports/pdf/period/route.ts');
  const workerRoute = readSource('src/app/api/reports/pdf/worker/[workerId]/route.ts');
  const request = readSource('src/lib/reports/period-request.ts');

  for (const [name, source] of [['json', jsonRoute], ['pdf', pdfRoute], ['worker', workerRoute]] as const) {
    assert.match(source, /requireManagerOrAdmin/, name);
    assert.match(source, /resolvePeriodReportRequest/, name);
    assert.match(source, /buildPeriodReportData/, name);
    assert.match(source, /PeriodReportError/, name);
    assert.doesNotMatch(source, /maskCpf|cpf/, name);
  }

  assert.match(request, /requireScopedPermission\(session, 'reports', 'read', 'cooperative'\)/);
  assert.match(request, /determineTargetCooperative\([\s\S]*required: true/);
  assert.match(request, /INVALID_YEAR_MONTH/);
  assert.match(request, /INVALID_WORKER_ID/);

  assert.match(jsonRoute, /report: serializePeriodReport\(data\)/);

  assert.match(pdfRoute, /export const runtime = 'nodejs'/);
  assert.match(pdfRoute, /ignoreWorker: true/);
  assert.match(pdfRoute, /buildPdfDownloadHeaders/);
  assert.match(pdfRoute, /buildPeriodReportPdfFilename/);
  assert.match(pdfRoute, /new NextResponse\(pdfBuffer/);

  assert.match(workerRoute, /export const runtime = 'nodejs'/);
  assert.match(workerRoute, /workerIdParam: workerId/);
  assert.match(workerRoute, /buildWorkerReceiptPdfFilename/);
  assert.match(workerRoute, /renderWorkerReceiptPdfBuffer/);
  assert.match(workerRoute, /new NextResponse\(pdfBuffer/);
});

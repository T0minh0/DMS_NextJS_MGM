import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const RUNBOOK = 'Web_vault/Operacao/Runbook-final-migracao-e-handoff.md';
const DEPRECATION_DOC = 'Web_vault/Operacao/Deprecacao-network-management-system.md';
const COMMANDS_DOC = 'Web_vault/Operacao/Comandos-e-validacao.md';
const HOME_DOC = 'Web_vault/Home.md';
const JOBS_DOC = 'Web_vault/Operacao/Jobs-e-feature-flags.md';
const ADR_SCHEMA_DOC = 'Web_vault/ADR/ADR-0001-schema-prisma-baseline-rollback.md';

test('S5-04 final migration runbook exists and ties together prior release gates', () => {
  assert.equal(existsSync(path.resolve(RUNBOOK)), true);

  const runbook = readSource(RUNBOOK);

  assert.match(runbook, /Task ClickUp: `86e136cma`/);
  assert.match(runbook, /S5-02/);
  assert.match(runbook, /S5-03/);
  assert.match(runbook, /S5-07/);
  assert.match(runbook, /network_management_system/);
  assert.match(runbook, /DMS_NextJS_MGM/);
  assert.match(runbook, /nao executar `git push`/);
});

test('S5-04 runbook documents mandatory preflight, audit and UAT commands', () => {
  const runbook = readSource(RUNBOOK);

  const expectedCommands = [
    'npm run quality',
    'npm audit --audit-level=high --json',
    'npm audit --omit=dev --audit-level=high --json',
    'npx --yes @google/design.md lint .tony/design.md',
    'tests/deprecation-parity-s507.test.ts',
    'tests/security-performance-concurrency-s503.test.ts',
    'tests/uat-s502-evidence.test.ts',
    'scripts/run-s5-02-uat.mjs',
  ];

  for (const command of expectedCommands) {
    assert.match(runbook, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('S5-04 runbook covers database migration, backup, restore and rollback', () => {
  const runbook = readSource(RUNBOOK);

  for (const expected of [
    'npx prisma migrate deploy',
    'npx prisma migrate status',
    'npm run prisma:validate',
    'npm run db:seed:uat',
    'pg_dump "$PG_TOOLS_URL"',
    'pg_restore --single-transaction --exit-on-error --dbname="$RESTORE_CHECK_URL"',
    '--single-transaction --exit-on-error',
    'RESTORE_CHECK_URL',
    'backup-before-dms-cutover.dump',
    'Rollback',
    'Parar novas writes no Next',
    'nao restaurar cegamente',
  ]) {
    assert.match(runbook, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('S5-04 operational docs do not show non-atomic pg_restore examples', () => {
  for (const filePath of [RUNBOOK, COMMANDS_DOC, DEPRECATION_DOC, ADR_SCHEMA_DOC]) {
    const source = readSource(filePath);
    const restoreExamples = source
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.trim().startsWith('pg_restore '));

    assert.ok(restoreExamples.length > 0, `${filePath} should document restore commands`);

    for (const { line, number } of restoreExamples) {
      assert.match(line, /--single-transaction/, `${filePath}:${number}`);
      assert.match(line, /--exit-on-error/, `${filePath}:${number}`);
    }
  }
});

test('S5-04 runbook documents production feature flags, stop conditions and handoff evidence', () => {
  const runbook = readSource(RUNBOOK);

  for (const expected of [
    'DMS_FEATURE_COLLECTIVE_SALES',
    'DMS_FEATURE_NOTICES',
    'DMS_FEATURE_REPORTS',
    'DMS_FEATURE_GAMIFICATION',
    'NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION',
    'nao sao kill switches globais',
    'DMS_DEBUG_ENDPOINTS_ENABLED=false',
    'Stop condition',
    'Handoff operacional',
    'Output de `npm run quality`',
    'Output de `npx prisma migrate status`',
    'smoke nao mockado de APIs reais',
    'Chamadas remanescentes para rotas Java',
  ]) {
    assert.match(runbook, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('S5-04 runbook distinguishes mocked browser UAT from real staging API smoke', () => {
  const runbook = readSource(RUNBOOK);

  assert.match(runbook, /intercepta `\*\*\/api\/\*\*` com mocks/);
  assert.match(runbook, /nao prova que o banco\/API real de staging esta saudavel sozinho/);
  assert.match(runbook, /curl -fsS -c \/tmp\/dms-cookie\.jar/);
  assert.match(runbook, /\/api\/auth\/login/);
  assert.match(runbook, /\/api\/stock/);
  assert.match(runbook, /\/api\/cooperative\/materials/);
  assert.match(runbook, /\/api\/sales\?status=ACTIVE/);
  assert.match(runbook, /\/api\/collective-sales\?status=ACTIVE/);
  assert.match(runbook, /\/api\/reports\/sales\/collective\/201/);
  assert.match(runbook, /\/api\/reports\/pdf\/collective-sale\/201/);
});

test('S5-04 vault index, deprecation and feature flag docs avoid false rollout guarantees', () => {
  const deprecation = readSource(DEPRECATION_DOC);
  const commands = readSource(COMMANDS_DOC);
  const home = readSource(HOME_DOC);
  const jobs = readSource(JOBS_DOC);

  assert.match(deprecation, /Runbook-final-migracao-e-handoff/);
  assert.match(deprecation, /GO para handoff e cutover supervisionado pelo runbook S5-04/);
  assert.match(deprecation, /A flag nao e kill switch global das rotas/);
  assert.doesNotMatch(deprecation, /NO-GO para desligamento definitivo ate S5-04/);
  assert.match(commands, /Runbook final S5-04/);
  assert.match(commands, /backup-before-dms-cutover\.dump/);
  assert.match(commands, /smoke nao mockado/);
  assert.match(home, /Operacao\/Runbook-final-migracao-e-handoff/);
  assert.match(jobs, /nao e kill switch global/);
  assert.match(jobs, /nao bloqueiam automaticamente todas as rotas/);
});

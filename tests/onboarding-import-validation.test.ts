import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv } from '../src/lib/onboarding/csv';
import {
  collectDateBounds,
  measurementKey,
  validateOnboardingRows,
  type OnboardingReferenceData,
} from '../src/lib/onboarding/validate';

const today = new Date('2026-09-09T12:00:00Z');

function reference(): OnboardingReferenceData {
  return {
    cooperative: { id: BigInt(100), name: 'Cooperativa São João' },
    workers: [
      { workerId: BigInt(5), wastepickerId: 'WP005', name: 'Ana Lima', normalizedName: 'ana lima', userType: '1', enterDate: new Date('2020-01-01T00:00:00Z'), exitDate: null },
      { workerId: BigInt(6), wastepickerId: 'WP006', name: 'Bia Souza', normalizedName: 'bia souza', userType: 'W', enterDate: new Date('2021-01-01T00:00:00Z'), exitDate: new Date('2023-12-31T00:00:00Z') },
      { workerId: BigInt(7), wastepickerId: 'WP007', name: 'Carla', normalizedName: 'carla', userType: '1', enterDate: null, exitDate: null },
      { workerId: BigInt(8), wastepickerId: 'WP008', name: 'Carla', normalizedName: 'carla', userType: '1', enterDate: null, exitDate: null },
      { workerId: BigInt(9), wastepickerId: 'WP009', name: 'Gerente', normalizedName: 'gerente', userType: 'M', enterDate: null, exitDate: null },
    ],
    workerCooperativeById: new Map([
      ['5', BigInt(100)], ['6', BigInt(100)], ['7', BigInt(100)], ['8', BigInt(100)], ['9', BigInt(100)], ['30', BigInt(200)],
    ]),
    materials: [
      { materialId: BigInt(7), name: 'Papelão', normalizedName: 'papelao', groupName: 'Papel' },
      { materialId: BigInt(8), name: 'PET', normalizedName: 'pet', groupName: 'Plástico' },
    ],
  };
}

const HEADER = 'data_coleta;coletor;material;peso_kg;estado_sacola;observacao';

function validate(lines: string[], existing = new Map<string, number>()) {
  const parsed = parseCsv([HEADER, ...lines].join('\n'));
  return validateOnboardingRows(parsed, reference(), existing, { today, stockMode: 'collected_only' });
}

test('valid rows resolve workers, materials, weights and summarize totals', () => {
  const report = validate([
    '15/03/2024;WP005;Papelão;12,50;cheia;caderno',
    '16/03/2024;ana lima;pet;3;vazia;',
    '01/04/2024;7;5;PET;sim;',
  ].map((line, index) => (index === 2 ? '01/04/2024;WP007;8;5;sim;' : line)));

  assert.equal(report.fileErrors.length, 0);
  assert.equal(report.summary.totalRows, 3);
  assert.equal(report.summary.validRows, 3);
  assert.equal(report.summary.invalidRows, 0);
  assert.equal(report.summary.totalKg, 20.5);
  assert.deepEqual(report.summary.dateRange, { from: '2024-03-15', to: '2024-04-01' });
  assert.deepEqual(report.summary.affectedYearMonths, ['2024-03', '2024-04']);
  assert.equal(report.canApply, true);
  assert.equal(report.requiresForce, false);
  assert.deepEqual(report.summary.byMaterial.map((entry) => [entry.materialName, entry.rows, entry.totalKg]), [['Papelão', 1, 12.5], ['PET', 2, 8]]);
  assert.deepEqual(report.summary.byWorker.map((entry) => [entry.wastepickerId, entry.rows]), [['WP005', 2], ['WP007', 1]]);
  assert.equal(report.okRows[0].bagFilled, true);
  assert.equal(report.okRows[1].bagFilled, false);
  assert.equal(report.okRows[0].weightKey, '12.50');
});

test('each row error code is reported and blocks apply', () => {
  const report = validate([
    ';WP005;Papelão;1;cheia;',
    '15/03/2024;;Papelão;1;cheia;',
    '15/03/2024;WP999;Papelão;1;cheia;',
    '15/03/2024;WP030;Papelão;1;cheia;',
    '15/03/2024;carla;Papelão;1;cheia;',
    '15/03/2024;WP009;Papelão;1;cheia;',
    '15/03/2024;WP005;Vidro;1;cheia;',
    '15/03/2024;WP005;Papelão;0;cheia;',
    '15/03/2024;WP005;Papelão;1;meio;',
    '15/03/2024;Zé;99;1;cheia;',
  ]);

  const codes = report.rows.map((row) => row.errors.map((issue) => issue.code));
  assert.deepEqual(codes[0], ['MISSING_REQUIRED']);
  assert.deepEqual(codes[1], ['MISSING_REQUIRED']);
  assert.deepEqual(codes[2], ['WORKER_NOT_FOUND']);
  assert.deepEqual(codes[3], ['WORKER_OUTSIDE_COOPERATIVE']);
  assert.deepEqual(codes[4], ['WORKER_AMBIGUOUS']);
  assert.deepEqual(codes[5], ['WORKER_NOT_WASTEPICKER']);
  assert.deepEqual(codes[6], ['MATERIAL_NOT_FOUND']);
  assert.deepEqual(codes[7], ['INVALID_WEIGHT']);
  assert.deepEqual(codes[8], ['INVALID_BAG_STATE']);
  assert.deepEqual(codes[9], ['WORKER_NOT_FOUND', 'MATERIAL_NOT_FOUND']);
  assert.equal(report.summary.invalidRows, 10);
  assert.equal(report.summary.validRows, 0);
  assert.equal(report.canApply, false);
});

test('warnings cover exited workers, tenure and duplicates; duplicates require force', () => {
  const existing = new Map<string, number>([[measurementKey(BigInt(5), BigInt(7), '2024-03-15', '12.50'), 1]]);
  const report = validate([
    '15/03/2024;WP005;Papelão;12,50;cheia;',
    '15/03/2024;WP005;Papelão;12,50;cheia;',
    '15/03/2024;WP006;PET;2;vazia;',
    '15/03/2019;WP005;PET;2;vazia;',
  ].map((line) => (line.includes('2019') ? '15/03/2019;WP005;PET;2;vazia;' : line)), existing);

  const warnings = report.rows.map((row) => row.warnings.map((issue) => issue.code));
  assert.deepEqual(warnings[0], ['DUPLICATE_IN_DATABASE']);
  assert.deepEqual(warnings[1], ['DUPLICATE_IN_FILE', 'DUPLICATE_IN_DATABASE']);
  assert.deepEqual(warnings[2], ['WORKER_EXITED', 'DATE_OUTSIDE_WORKER_TENURE']);
  assert.deepEqual(warnings[3], ['DATE_OUTSIDE_WORKER_TENURE']);
  assert.equal(report.summary.invalidRows, 0);
  assert.equal(report.summary.warningRows, 4);
  assert.equal(report.summary.duplicateRows, 2);
  assert.equal(report.canApply, true);
  assert.equal(report.requiresForce, true);
});

test('missing required columns fail the file; unknown columns only warn', () => {
  const parsed = parseCsv('data_coleta;coletor;peso_kg;estado_sacola;extra\n15/03/2024;WP005;1;cheia;x\n');
  const report = validateOnboardingRows(parsed, reference(), new Map(), { today, stockMode: 'collected_only' });
  assert.deepEqual(report.fileErrors.map((issue) => [issue.code, issue.field]), [['MISSING_COLUMN', 'material']]);
  assert.deepEqual(report.fileWarnings.map((issue) => issue.code), ['UNKNOWN_COLUMN']);
  assert.equal(report.rows.length, 0);
  assert.equal(report.canApply, false);
});

test('collectDateBounds scopes the duplicate lookup to the parseable dates', () => {
  const parsed = parseCsv([HEADER, '15/03/2024;WP005;Papelão;1;cheia;', 'xx;WP005;Papelão;1;cheia;', '01/04/2024;WP005;Papelão;1;cheia;'].join('\n'));
  const bounds = collectDateBounds(parsed, today);
  assert.ok(bounds);
  assert.equal(bounds.from.toISOString(), '2024-03-15T00:00:00.000Z');
  assert.equal(bounds.toExclusive.toISOString(), '2024-04-02T00:00:00.000Z');
  assert.equal(collectDateBounds(parseCsv('coletor\nWP005\n'), today), null);
});

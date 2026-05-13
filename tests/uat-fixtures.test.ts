import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  UAT_COLLECTIVE_SALE_FIXTURES,
  UAT_DECLARED_FUTURE_FIXTURE_IDS,
  UAT_DECLARED_PSEUDO_FIXTURE_IDS,
  UAT_FIXTURE_IDENTITIES,
  UAT_JOURNEY_FIXTURE_MATRIX,
  UAT_MATERIAL_FIXTURES,
  UAT_NEGATIVE_SCENARIOS,
  UAT_SALE_LIFECYCLE_FIXTURES,
} from '../src/lib/uat/fixtures';
import { assertSafeSeedTarget } from '../src/lib/uat/seed-safety';

const expectedJourneyIds = [
  'daily-dashboard',
  'critical-stock',
  'normal-sale',
  'collective-sale',
  'team-pii',
  'notices',
  'reports-pdf',
  'operational-pending',
];

const privacyScanRoots = [
  'src',
  'prisma',
  'tests',
  'Web_vault',
  'README.md',
  'PRODUCTIVITY_README.md',
  'env.example',
];

function collectPrivacyScanFiles(entryPath: string): string[] {
  const stats = statSync(entryPath);

  if (stats.isDirectory()) {
    return readdirSync(entryPath)
      .filter((entry) => !['node_modules', '.next', '.git'].includes(entry))
      .flatMap((entry) => collectPrivacyScanFiles(path.join(entryPath, entry)));
  }

  if (!stats.isFile()) {
    return [];
  }

  if (/\.(ts|tsx|md|json|example)$/.test(entryPath)) {
    return [entryPath];
  }

  return [];
}

function isPersonalDocumentLine(line: string) {
  return /\b(cpf|pis|rg|documento|document|recordLoginFailure|getLoginRateLimit|clearLoginFailures|maskCpf|maskPis)\b/i.test(
    line,
  );
}

function isAllowedSyntheticDocument(value: string) {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 11) {
    return /^000\d{8}$/.test(digits) || /^900\d{8}$/.test(digits);
  }

  if (digits.length === 9) {
    return /^990\d{6}$/.test(digits);
  }

  return true;
}

test('UAT management fixture matrix covers roles, cooperatives, journeys and negative scope', () => {
  assert.ok(
    new Set(UAT_FIXTURE_IDENTITIES.map((identity) => identity.cooperativeId)).size >= 2,
  );

  for (const role of ['admin', 'manager', 'operator', 'viewer']) {
    assert.ok(
      UAT_FIXTURE_IDENTITIES.some((identity) => identity.productRole === role),
      `missing product role ${role}`,
    );
  }

  assert.deepEqual(
    UAT_JOURNEY_FIXTURE_MATRIX.map((journey) => journey.journeyId),
    expectedJourneyIds,
  );

  for (const journey of UAT_JOURNEY_FIXTURE_MATRIX) {
    assert.ok(journey.fixtureIds.length > 0, `${journey.journeyId} needs fixtures`);
    assert.ok(journey.negativeScenarioId, `${journey.journeyId} needs a negative scenario`);
  }

  assert.ok(
    UAT_NEGATIVE_SCENARIOS.some(
      (scenario) => scenario.id === 'manager-horizonte-worker-leste-denied',
    ),
  );
});

test('UAT documents are clearly synthetic and stay maskable', () => {
  for (const identity of UAT_FIXTURE_IDENTITIES) {
    assert.match(identity.cpf, /^000\d{8}$/);
    assert.match(identity.pis, /^900\d{8}$/);
    assert.match(identity.rg, /^990\d{6}$/);
  }
});

test('UAT fixture matrix covers material and sale states expected by S0-13', () => {
  const materialCases = new Set(UAT_MATERIAL_FIXTURES.map((material) => material.stockCase));
  assert.ok(materialCases.has('sufficient'));
  assert.ok(materialCases.has('low'));
  assert.ok(materialCases.has('empty'));
  assert.ok(materialCases.has('cross-coop'));

  const saleStates = new Set(UAT_SALE_LIFECYCLE_FIXTURES.map((sale) => sale.state));
  assert.ok(saleStates.has('active'));
  assert.ok(saleStates.has('completed'));
  assert.ok(saleStates.has('cancelled'));

  assert.ok(
    UAT_COLLECTIVE_SALE_FIXTURES.some((sale) => sale.state === 'invite-open'),
  );
  assert.ok(
    UAT_COLLECTIVE_SALE_FIXTURES.some((sale) => sale.state === 'contribution-pending'),
  );
});

test('UAT journey fixture references are declared even when schema support is future work', () => {
  const declaredFixtureIds = new Set<string>([
    ...UAT_FIXTURE_IDENTITIES.map((identity) => identity.id),
    ...UAT_MATERIAL_FIXTURES.map((material) => material.id),
    ...UAT_SALE_LIFECYCLE_FIXTURES.map((sale) => sale.id),
    ...UAT_COLLECTIVE_SALE_FIXTURES.map((sale) => sale.id),
    ...UAT_DECLARED_FUTURE_FIXTURE_IDS,
    ...UAT_DECLARED_PSEUDO_FIXTURE_IDS,
  ]);
  const negativeScenarioIds = new Set(UAT_NEGATIVE_SCENARIOS.map((scenario) => scenario.id));

  for (const journey of UAT_JOURNEY_FIXTURE_MATRIX) {
    for (const fixtureId of journey.fixtureIds) {
      assert.ok(declaredFixtureIds.has(fixtureId), `${fixtureId} is not declared`);
    }
    assert.ok(
      negativeScenarioIds.has(journey.negativeScenarioId),
      `${journey.negativeScenarioId} is not declared`,
    );
  }

  for (const scenario of UAT_NEGATIVE_SCENARIOS) {
    assert.ok(
      declaredFixtureIds.has(scenario.actorFixtureId),
      `${scenario.actorFixtureId} negative actor is not declared`,
    );
    assert.ok(
      declaredFixtureIds.has(scenario.targetFixtureId),
      `${scenario.targetFixtureId} negative target is not declared`,
    );
  }
});

test('UAT seed refuses production-looking, durable or non-local databases by default', () => {
  const seedSource = readFileSync(path.resolve('prisma/seed.ts'), 'utf8');
  const seedSafetySource = readFileSync(path.resolve('src/lib/uat/seed-safety.ts'), 'utf8');
  const previousAllowRemote = process.env.DMS_ALLOW_REMOTE_UAT_SEED;

  assert.match(seedSource, /assertSafeSeedTarget/);
  assert.match(seedSafetySource, /DMS_ALLOW_REMOTE_UAT_SEED/);
  assert.match(seedSafetySource, /explicit disposable marker/);
  assert.match(seedSource, /00000000001/);
  assert.match(seedSource, /90000000001/);
  assert.match(seedSource, /990000001/);

  try {
    delete process.env.DMS_ALLOW_REMOTE_UAT_SEED;

    assert.throws(() => assertSafeSeedTarget(''), /DATABASE_URL/);
    assert.throws(() => assertSafeSeedTarget('not-a-url'), /valid URL/);

    for (const url of [
      'postgresql://user:pass@localhost:5432/dmsprod',
      'postgresql://user:pass@localhost:5432/productiondb',
      'postgresql://user:pass@localhost:5432/prdclone',
      'postgresql://prod_user:pass@localhost:5432/dms_uat',
      'postgresql://user:pass@prod-db.local:5432/dms_uat',
    ]) {
      assert.throws(() => assertSafeSeedTarget(url), /production/);
    }

    assert.throws(
      () => assertSafeSeedTarget('postgresql://user:pass@localhost:5432/dms'),
      /explicit disposable marker/,
    );
    for (const url of [
      'postgresql://user:pass@localhost:5432/latest',
      'postgresql://user:pass@localhost:5432/contest',
      'postgresql://devops:pass@localhost:5432/dms',
      'postgresql://app_devops:pass@localhost:5432/dms',
    ]) {
      assert.throws(() => assertSafeSeedTarget(url), /explicit disposable marker/);
    }
    assert.throws(
      () => assertSafeSeedTarget('postgresql://user:pass@preview.example.com:5432/dms_uat'),
      /non-local database/,
    );
    assert.doesNotThrow(() =>
      assertSafeSeedTarget('postgresql://user:pass@localhost:5432/dms_uat'),
    );
    assert.doesNotThrow(() =>
      assertSafeSeedTarget('postgresql://user:pass@localhost:5432/dms-preview'),
    );
    assert.doesNotThrow(() =>
      assertSafeSeedTarget('postgresql://seed_local:pass@localhost:5432/dms'),
    );

    process.env.DMS_ALLOW_REMOTE_UAT_SEED = 'true';
    assert.doesNotThrow(() =>
      assertSafeSeedTarget('postgresql://user:pass@preview.example.com:5432/dms_uat'),
    );
  } finally {
    if (previousAllowRemote === undefined) {
      delete process.env.DMS_ALLOW_REMOTE_UAT_SEED;
    } else {
      process.env.DMS_ALLOW_REMOTE_UAT_SEED = previousAllowRemote;
    }
  }
});

test('test and debug documents use reserved synthetic personal-document values', () => {
  const files = privacyScanRoots.flatMap((root) => collectPrivacyScanFiles(path.resolve(root)));
  const offenders: string[] = [];
  const documentPattern = /\b\d{11}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{9}\b/g;

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
      if (!isPersonalDocumentLine(line)) {
        return;
      }

      for (const match of line.matchAll(documentPattern)) {
        if (!isAllowedSyntheticDocument(match[0])) {
          offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}:${match[0]}`);
        }
      }
    });
  }

  assert.deepEqual(offenders, []);
});

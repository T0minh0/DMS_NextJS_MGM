import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertValidJobSecret,
  buildJobRunKey,
  getJobRuntimeConfig,
  InMemoryJobRunLedger,
  isMigrationFeatureEnabled,
  JobConfigError,
  runIdempotentJob,
  verifyJobAuthorizationHeader,
} from '../src/lib/jobs';

test('migration feature flags are opt-in and parsed from env', () => {
  assert.equal(isMigrationFeatureEnabled('gamification', {}), false);
  assert.equal(isMigrationFeatureEnabled('gamification', { DMS_FEATURE_GAMIFICATION: 'on' }), true);
  assert.equal(isMigrationFeatureEnabled('collectiveSales', { DMS_FEATURE_COLLECTIVE_SALES: '0' }), false);

  assert.throws(
    () => isMigrationFeatureEnabled('reports', { DMS_FEATURE_REPORTS: 'maybe' }),
    JobConfigError,
  );
});

test('job runtime config keeps jobs disabled unless explicitly enabled', () => {
  assert.deepEqual(getJobRuntimeConfig({}), {
    runnerMode: 'disabled',
    jobSecretConfigured: false,
    features: {
      collectiveSales: false,
      gamification: false,
      notices: false,
      reports: false,
    },
  });

  assert.deepEqual(
    getJobRuntimeConfig({
      DMS_JOB_RUNNER: 'railway-cron',
      DMS_JOB_SECRET: 'local-secret',
      DMS_FEATURE_GAMIFICATION: 'true',
    }),
    {
      runnerMode: 'railway-cron',
      jobSecretConfigured: true,
      features: {
        collectiveSales: false,
        gamification: true,
        notices: false,
        reports: false,
      },
    },
  );
});

test('job secret accepts CRON_SECRET fallback and enforces production strength', () => {
  assert.equal(
    assertValidJobSecret({ CRON_SECRET: 'local-cron-secret' }),
    'local-cron-secret',
  );

  assert.throws(
    () => assertValidJobSecret({ NODE_ENV: 'production', DMS_JOB_SECRET: 'short' }),
    /at least 32 characters/,
  );

  assert.equal(
    verifyJobAuthorizationHeader('Bearer strong-job-secret', {
      DMS_JOB_SECRET: 'strong-job-secret',
    }),
    true,
  );
  assert.equal(
    verifyJobAuthorizationHeader('Bearer wrong-secret', {
      DMS_JOB_SECRET: 'strong-job-secret',
    }),
    false,
  );
});

test('idempotent job execution skips duplicate monthly cooperative runs', async () => {
  const ledger = new InMemoryJobRunLedger();
  const key = buildJobRunKey({
    jobName: 'monthly-random-multiplier',
    periodKey: '2026-04',
    cooperativeId: '042',
  });
  let executions = 0;

  assert.equal(key, 'monthly-random-multiplier:2026-04:cooperative-42');

  const first = await runIdempotentJob(ledger, key, async () => {
    executions += 1;
    return { multiplier: '1.2500' };
  });

  const second = await runIdempotentJob(ledger, key, async () => {
    executions += 1;
    return { multiplier: '1.4000' };
  });

  assert.equal(executions, 1);
  assert.deepEqual(first, {
    status: 'completed',
    key,
    result: { multiplier: '1.2500' },
  });
  assert.deepEqual(second, {
    status: 'skipped',
    key,
    reason: 'already_completed',
  });
  assert.equal(ledger.get(key)?.status, 'completed');
});

test('failed job keys can be retried without creating a second completed run', async () => {
  const ledger = new InMemoryJobRunLedger();
  const key = buildJobRunKey({
    jobName: 'leaderboard-snapshot-weekly',
    periodKey: '2026-04-W2',
    cooperativeId: 7,
  });

  await assert.rejects(
    () => runIdempotentJob(ledger, key, async () => {
      throw new Error('temporary failure');
    }),
    /temporary failure/,
  );

  const retry = await runIdempotentJob(ledger, key, async () => 'ok');

  assert.deepEqual(retry, { status: 'completed', key, result: 'ok' });
  assert.equal(ledger.get(key)?.attempts, 2);
});

test('daily achievement evaluation reruns are deduped per day, not per month', async () => {
  const ledger = new InMemoryJobRunLedger();
  const firstDayKey = buildJobRunKey({
    jobName: 'achievement-evaluation',
    periodKey: '2026-04-01',
    cooperativeId: 7,
  });
  const secondDayKey = buildJobRunKey({
    jobName: 'achievement-evaluation',
    periodKey: '2026-04-02',
    cooperativeId: 7,
  });
  let executions = 0;

  const first = await runIdempotentJob(ledger, firstDayKey, async () => {
    executions += 1;
    return { evaluatedWorkers: 3 };
  });
  const duplicate = await runIdempotentJob(ledger, firstDayKey, async () => {
    executions += 1;
    return { evaluatedWorkers: 99 };
  });
  const nextDay = await runIdempotentJob(ledger, secondDayKey, async () => {
    executions += 1;
    return { evaluatedWorkers: 4 };
  });

  assert.equal(executions, 2);
  assert.equal(first.status, 'completed');
  assert.deepEqual(duplicate, {
    status: 'skipped',
    key: firstDayKey,
    reason: 'already_completed',
  });
  assert.deepEqual(nextDay, {
    status: 'completed',
    key: secondDayKey,
    result: { evaluatedWorkers: 4 },
  });
});

test('weekly and monthly leaderboard snapshots use separate idempotency keys', async () => {
  const ledger = new InMemoryJobRunLedger();
  const weeklyKey = buildJobRunKey({
    jobName: 'leaderboard-snapshot-weekly',
    periodKey: '2026-04-W4',
    cooperativeId: 7,
  });
  const monthlyKey = buildJobRunKey({
    jobName: 'leaderboard-snapshot-monthly',
    periodKey: '2026-04',
    cooperativeId: 7,
  });
  let executions = 0;

  const weekly = await runIdempotentJob(ledger, weeklyKey, async () => {
    executions += 1;
    return { entries: 3 };
  });
  const monthly = await runIdempotentJob(ledger, monthlyKey, async () => {
    executions += 1;
    return { entries: 3, final: true };
  });
  const duplicateMonthly = await runIdempotentJob(ledger, monthlyKey, async () => {
    executions += 1;
    return { entries: 99 };
  });

  assert.equal(executions, 2);
  assert.equal(weekly.status, 'completed');
  assert.deepEqual(monthly, {
    status: 'completed',
    key: monthlyKey,
    result: { entries: 3, final: true },
  });
  assert.deepEqual(duplicateMonthly, {
    status: 'skipped',
    key: monthlyKey,
    reason: 'already_completed',
  });
});

test('job run keys reject blank or malformed cooperative ids', () => {
  assert.throws(
    () => buildJobRunKey({
      jobName: 'achievement-evaluation',
      periodKey: '2026-04',
      cooperativeId: '42a',
    }),
    /positive numeric identifier/,
  );
  assert.throws(
    () => buildJobRunKey({
      jobName: 'achievement-evaluation',
      periodKey: '2026-04',
      cooperativeId: '0',
    }),
    /positive numeric identifier/,
  );
});

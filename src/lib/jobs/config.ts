export type JobRunnerMode = 'disabled' | 'railway-cron' | 'http-cron' | 'manual';

export type MigrationFeatureFlag =
  | 'collectiveSales'
  | 'gamification'
  | 'notices'
  | 'reports';

export type JobEnv = Record<string, string | undefined>;

export const FEATURE_FLAG_ENV: Record<MigrationFeatureFlag, string> = {
  collectiveSales: 'DMS_FEATURE_COLLECTIVE_SALES',
  gamification: 'DMS_FEATURE_GAMIFICATION',
  notices: 'DMS_FEATURE_NOTICES',
  reports: 'DMS_FEATURE_REPORTS',
};

const JOB_RUNNER_MODES = new Set<JobRunnerMode>([
  'disabled',
  'railway-cron',
  'http-cron',
  'manual',
]);

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off', 'disabled', '']);

export class JobConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobConfigError';
  }
}

export interface JobRuntimeConfig {
  runnerMode: JobRunnerMode;
  jobSecretConfigured: boolean;
  features: Record<MigrationFeatureFlag, boolean>;
}

function parseRunnerMode(value: string | undefined): JobRunnerMode {
  if (!value) {
    return 'disabled';
  }

  const normalized = value.trim().toLowerCase() as JobRunnerMode;

  if (!JOB_RUNNER_MODES.has(normalized)) {
    throw new JobConfigError(
      `DMS_JOB_RUNNER must be one of: ${[...JOB_RUNNER_MODES].join(', ')}`,
    );
  }

  return normalized;
}

export function parseFeatureFlag(value: string | undefined, flagName: string) {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new JobConfigError(
    `${flagName} must be a boolean-like value: true/false, 1/0, on/off, yes/no`,
  );
}

export function getJobSecret(env: JobEnv = process.env) {
  return env.DMS_JOB_SECRET || env.CRON_SECRET || null;
}

export function assertValidJobSecret(env: JobEnv = process.env) {
  const secret = getJobSecret(env);

  if (!secret) {
    throw new JobConfigError('DMS_JOB_SECRET or CRON_SECRET must be configured for jobs.');
  }

  if (env.NODE_ENV === 'production' && secret.length < 32) {
    throw new JobConfigError('Job secret must have at least 32 characters in production.');
  }

  return secret;
}

export function isMigrationFeatureEnabled(
  feature: MigrationFeatureFlag,
  env: JobEnv = process.env,
) {
  return parseFeatureFlag(env[FEATURE_FLAG_ENV[feature]], FEATURE_FLAG_ENV[feature]);
}

export function getJobRuntimeConfig(env: JobEnv = process.env): JobRuntimeConfig {
  return {
    runnerMode: parseRunnerMode(env.DMS_JOB_RUNNER),
    jobSecretConfigured: Boolean(getJobSecret(env)),
    features: {
      collectiveSales: isMigrationFeatureEnabled('collectiveSales', env),
      gamification: isMigrationFeatureEnabled('gamification', env),
      notices: isMigrationFeatureEnabled('notices', env),
      reports: isMigrationFeatureEnabled('reports', env),
    },
  };
}

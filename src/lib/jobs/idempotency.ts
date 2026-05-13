export type JobName =
  | 'monthly-random-multiplier'
  | 'achievement-evaluation'
  | 'leaderboard-snapshot-weekly'
  | 'leaderboard-snapshot-monthly';

export type JobRunStatus = 'running' | 'completed' | 'failed';

export interface JobRunKeyInput {
  jobName: JobName;
  periodKey: string;
  cooperativeId?: string | number | null;
}

export interface JobRunRecord {
  key: string;
  status: JobRunStatus;
  attempts: number;
  lastError?: string;
  result?: unknown;
}

export interface JobRunClaim {
  acquired: boolean;
  reason?: 'already_running' | 'already_completed';
  record?: JobRunRecord;
}

export interface JobRunLedger {
  claim(key: string): Promise<JobRunClaim>;
  complete(key: string, result?: unknown): Promise<void>;
  fail(key: string, error: unknown): Promise<void>;
}

export type RunIdempotentJobResult<T> =
  | { status: 'completed'; key: string; result: T }
  | { status: 'skipped'; key: string; reason: 'already_running' | 'already_completed' };

export function buildJobRunKey({
  jobName,
  periodKey,
  cooperativeId = null,
}: JobRunKeyInput) {
  const normalizedPeriod = periodKey.trim();

  if (!normalizedPeriod) {
    throw new Error('periodKey is required for job idempotency.');
  }

  if (cooperativeId === null || cooperativeId === undefined) {
    return `${jobName}:${normalizedPeriod}:global`;
  }

  const rawCooperativeId = String(cooperativeId).trim();

  if (!/^\d+$/.test(rawCooperativeId) || BigInt(rawCooperativeId) <= BigInt(0)) {
    throw new Error('cooperativeId must be a positive numeric identifier.');
  }

  return `${jobName}:${normalizedPeriod}:cooperative-${BigInt(rawCooperativeId).toString()}`;
}

export async function runIdempotentJob<T>(
  ledger: JobRunLedger,
  key: string,
  execute: () => Promise<T>,
): Promise<RunIdempotentJobResult<T>> {
  const claim = await ledger.claim(key);

  if (!claim.acquired) {
    return {
      status: 'skipped',
      key,
      reason: claim.reason ?? 'already_running',
    };
  }

  try {
    const result = await execute();
    await ledger.complete(key, result);

    return { status: 'completed', key, result };
  } catch (error) {
    await ledger.fail(key, error);
    throw error;
  }
}

export class InMemoryJobRunLedger implements JobRunLedger {
  private readonly records = new Map<string, JobRunRecord>();

  async claim(key: string): Promise<JobRunClaim> {
    const current = this.records.get(key);

    if (current?.status === 'completed') {
      return { acquired: false, reason: 'already_completed', record: current };
    }

    if (current?.status === 'running') {
      return { acquired: false, reason: 'already_running', record: current };
    }

    const next: JobRunRecord = {
      key,
      status: 'running',
      attempts: (current?.attempts ?? 0) + 1,
    };

    this.records.set(key, next);
    return { acquired: true, record: next };
  }

  async complete(key: string, result?: unknown) {
    const current = this.records.get(key);

    this.records.set(key, {
      key,
      status: 'completed',
      attempts: current?.attempts ?? 1,
      result,
    });
  }

  async fail(key: string, error: unknown) {
    const current = this.records.get(key);
    const message = error instanceof Error ? error.message : String(error);

    this.records.set(key, {
      key,
      status: 'failed',
      attempts: current?.attempts ?? 1,
      lastError: message,
    });
  }

  get(key: string) {
    return this.records.get(key);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext, logInfo } from '@/lib/observability/logger';
import {
  buildJobRunKey,
  InMemoryJobRunLedger,
  JobName,
  runIdempotentJob,
} from '@/lib/jobs/idempotency';
import { verifyJobAuthorizationHeader } from '@/lib/jobs/auth';
import {
  computeLeaderboardSnapshot,
  LeaderboardDomainError,
  LeaderboardPeriod,
  normalizeLeaderboardYearMonth,
  parseLeaderboardWeekNumber,
  parsePositiveBigInt,
} from '@/lib/leaderboard';

const ledger = new InMemoryJobRunLedger();

async function readOptionalJsonBody(request: NextRequest) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new LeaderboardDomainError(
      'Corpo JSON inválido',
      'INVALID_JSON_BODY',
      400,
    );
  }
}

function parseOptionalCooperativeId(body: Record<string, unknown>) {
  const raw = body.cooperativeId ?? body.cooperative_id;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  if (
    typeof raw !== 'string' &&
    typeof raw !== 'number' &&
    typeof raw !== 'bigint'
  ) {
    throw new LeaderboardDomainError(
      'cooperativeId inválido',
      'INVALID_COOPERATIVE_ID',
      400,
    );
  }

  return parsePositiveBigInt(raw, 'Cooperativa');
}

function resolveSnapshotPeriod(
  body: Record<string, unknown>,
  getDefaultPeriod: (now: Date) => LeaderboardPeriod,
  now: Date,
) {
  const hasYearMonth =
    body.yearMonth !== null && body.yearMonth !== undefined && body.yearMonth !== '';
  const hasWeekNumber =
    body.weekNumber !== null && body.weekNumber !== undefined && body.weekNumber !== '';
  const defaultPeriod = hasYearMonth && hasWeekNumber ? null : getDefaultPeriod(now);
  const yearMonth =
    hasYearMonth
      ? normalizeLeaderboardYearMonth(String(body.yearMonth))
      : defaultPeriod!.yearMonth;

  const weekNumber =
    hasWeekNumber
      ? parseLeaderboardWeekNumber(
          typeof body.weekNumber === 'number' ? body.weekNumber : String(body.weekNumber),
        )
      : defaultPeriod!.weekNumber;

  return { yearMonth, weekNumber };
}

export async function runLeaderboardSnapshotJob({
  request,
  jobName,
  getDefaultPeriod,
}: {
  request: NextRequest;
  jobName: Extract<JobName, 'leaderboard-snapshot-weekly' | 'leaderboard-snapshot-monthly'>;
  getDefaultPeriod: (now: Date) => LeaderboardPeriod;
}) {
  const context = createLogContext(request, { domain: 'job' });

  if (!verifyJobAuthorizationHeader(request.headers.get('authorization'))) {
    return apiErrorResponse({
      message: 'Acesso não autorizado',
      code: 'JOB_UNAUTHORIZED',
      status: 401,
      requestId: context.requestId,
    });
  }

  try {
    const now = new Date();
    const body = await readOptionalJsonBody(request);
    const snapshotPeriod = resolveSnapshotPeriod(body, getDefaultPeriod, now);
    const periodKey = `${snapshotPeriod.yearMonth}-W${snapshotPeriod.weekNumber}`;
    const requestedCooperativeId = parseOptionalCooperativeId(body);
    const cooperatives = requestedCooperativeId
      ? [{ cooperativeId: requestedCooperativeId }]
      : await prisma.cooperative.findMany({
          select: { cooperativeId: true },
          orderBy: { cooperativeId: 'asc' },
        });

    const results = [];
    for (const cooperative of cooperatives) {
      const key = buildJobRunKey({
        jobName,
        periodKey,
        cooperativeId: cooperative.cooperativeId.toString(),
      });

      const result = await runIdempotentJob(
        ledger,
        key,
        () =>
          computeLeaderboardSnapshot({
            cooperativeId: cooperative.cooperativeId,
            yearMonth: snapshotPeriod.yearMonth,
            weekNumber: snapshotPeriod.weekNumber,
            now,
          }),
        { context, rerunCompleted: true },
      );

      results.push(result);
    }

    logInfo('job.leaderboard-snapshot.applied', context, {
      jobName,
      periodKey,
      yearMonth: snapshotPeriod.yearMonth,
      weekNumber: snapshotPeriod.weekNumber,
      cooperativeCount: cooperatives.length,
    });

    return NextResponse.json({
      status: results.every((result) => result.status === 'skipped')
        ? 'skipped'
        : 'completed',
      jobName,
      periodKey,
      yearMonth: snapshotPeriod.yearMonth,
      weekNumber: snapshotPeriod.weekNumber,
      results,
    });
  } catch (error) {
    if (error instanceof LeaderboardDomainError) {
      return apiErrorResponse({
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: context.requestId,
      });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao executar job de snapshot de leaderboard',
      code: 'LEADERBOARD_SNAPSHOT_JOB_FAILED',
      context,
      event: 'job.leaderboard-snapshot.failed',
      error,
      metadata: { jobName },
    });
  }
}

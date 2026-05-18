import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { apiErrorResponse, apiInternalErrorResponse } from '@/lib/api/errors';
import { createLogContext, logInfo } from '@/lib/observability/logger';
import {
  buildJobRunKey,
  InMemoryJobRunLedger,
  runIdempotentJob,
} from '@/lib/jobs/idempotency';
import { verifyJobAuthorizationHeader } from '@/lib/jobs/auth';
import {
  AchievementDomainError,
  currentDateKey,
  evaluateAchievementsForCooperative,
  normalizeYearMonth,
  parsePositiveBigInt,
} from '@/lib/achievements';

export const runtime = 'nodejs';

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
    throw new AchievementDomainError(
      'Corpo JSON inválido',
      'INVALID_JSON_BODY',
      400,
    );
  }
}

function parsePeriodKey(value: unknown, now = new Date()) {
  if (value === null || value === undefined || value === '') {
    return currentDateKey(now);
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new AchievementDomainError(
      'periodKey deve usar o formato YYYY-MM-DD',
      'INVALID_PERIOD_KEY',
      400,
    );
  }

  const trimmed = value.trim();
  const [yearPart, monthPart, dayPart] = trimmed.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new AchievementDomainError(
      'periodKey deve ser uma data válida YYYY-MM-DD',
      'INVALID_PERIOD_KEY',
      400,
    );
  }

  return trimmed;
}

function parseYearMonthInput(value: unknown, now = new Date()) {
  if (value === null || value === undefined || value === '') {
    return normalizeYearMonth(null, now);
  }

  if (typeof value !== 'string') {
    throw new AchievementDomainError(
      'yearMonth deve usar o formato YYYY-MM',
      'INVALID_YEAR_MONTH',
      400,
    );
  }

  return normalizeYearMonth(value, now);
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
    throw new AchievementDomainError(
      'cooperativeId inválido',
      'INVALID_COOPERATIVE_ID',
      400,
    );
  }

  return parsePositiveBigInt(raw, 'Cooperativa');
}

export async function POST(request: NextRequest) {
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
    const periodKey = parsePeriodKey(body.periodKey, now);
    const yearMonth = parseYearMonthInput(body.yearMonth, now);
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
        jobName: 'achievement-evaluation',
        periodKey,
        cooperativeId: cooperative.cooperativeId.toString(),
      });

      const result = await runIdempotentJob(
        ledger,
        key,
        () =>
          evaluateAchievementsForCooperative({
            cooperativeId: cooperative.cooperativeId,
            yearMonth,
            now,
          }),
        { context },
      );

      results.push(result);
    }

    logInfo('job.achievement-evaluation.applied', context, {
      periodKey,
      yearMonth,
      cooperativeCount: cooperatives.length,
    });

    return NextResponse.json({
      status: results.every((result) => result.status === 'skipped')
        ? 'skipped'
        : 'completed',
      jobName: 'achievement-evaluation',
      periodKey,
      yearMonth,
      results,
    });
  } catch (error) {
    if (error instanceof AchievementDomainError) {
      return apiErrorResponse({
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: context.requestId,
      });
    }

    return apiInternalErrorResponse({
      message: 'Erro ao executar job de avaliação de achievements',
      code: 'ACHIEVEMENT_EVALUATION_JOB_FAILED',
      context,
      event: 'job.achievement-evaluation.failed',
      error,
    });
  }
}

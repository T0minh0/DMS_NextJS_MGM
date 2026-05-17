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
import { LEADERBOARD_TIME_ZONE } from '@/lib/leaderboard';

// Per-process ledger prevents concurrent in-process runs. Cross-process idempotency
// is handled by the unique history row for each cooperative/year-month.
const ledger = new InMemoryJobRunLedger();

function generateRandomMultiplier(): number {
  // Uniform in [0.8, 1.2], rounded to 3 decimal places.
  return Math.round((0.8 + Math.random() * 0.4) * 1000) / 1000;
}

function buildPeriodKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEADERBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const year = values.year;
  const month = values.month;

  return `${year}-${month}`;
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

  const now = new Date();
  const periodKey = buildPeriodKey(now);
  const jobKey = buildJobRunKey({ jobName: 'monthly-random-multiplier', periodKey });

  try {
    const jobResult = await runIdempotentJob(
      ledger,
      jobKey,
      async () => {
        const cooperatives = await prisma.cooperative.findMany({
          select: { cooperativeId: true },
        });

        let skippedCount = 0;
        let updatedCount = 0;

        for (const coop of cooperatives) {
          const inserted = await prisma.$transaction(async (tx) => {
            const existingCurrent = await tx.cooperativeRandomMultiplier.findUnique({
              where: { cooperativeId: coop.cooperativeId },
              select: {
                multiplierValue: true,
                lastUpdated: true,
              },
            });
            const currentMatchesPeriod =
              existingCurrent && buildPeriodKey(existingCurrent.lastUpdated) === periodKey;
            const candidateMultiplier = currentMatchesPeriod
              ? existingCurrent.multiplierValue
              : generateRandomMultiplier();
            const candidateUpdatedAt = currentMatchesPeriod
              ? existingCurrent.lastUpdated
              : now;
            const created = await tx.cooperativeRandomMultiplierHistory.createMany({
              data: [
                {
                  cooperativeId: coop.cooperativeId,
                  yearMonth: periodKey,
                  multiplierValue: candidateMultiplier,
                  updatedAt: candidateUpdatedAt,
                },
              ],
              skipDuplicates: true,
            });
            const periodMultiplier =
              await tx.cooperativeRandomMultiplierHistory.findUniqueOrThrow({
                where: {
                  cooperativeId_yearMonth: {
                    cooperativeId: coop.cooperativeId,
                    yearMonth: periodKey,
                  },
                },
                select: {
                  multiplierValue: true,
                  updatedAt: true,
                },
              });

            await tx.cooperativeRandomMultiplier.upsert({
              where: { cooperativeId: coop.cooperativeId },
              create: {
                cooperativeId: coop.cooperativeId,
                multiplierValue: periodMultiplier.multiplierValue,
                lastUpdated: periodMultiplier.updatedAt,
              },
              update: {
                multiplierValue: periodMultiplier.multiplierValue,
                lastUpdated: periodMultiplier.updatedAt,
              },
            });

            return created.count > 0;
          });

          if (inserted) {
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
        }

        logInfo('job.random-multiplier.applied', context, {
          periodKey,
          updatedCount,
          skippedCount,
        });

        return { periodKey, updatedCount, skippedCount };
      },
      { context },
    );

    if (jobResult.status === 'skipped') {
      return NextResponse.json({
        status: 'skipped',
        reason: jobResult.reason,
        key: jobResult.key,
      });
    }

    return NextResponse.json({
      status: 'completed',
      key: jobResult.key,
      result: jobResult.result,
    });
  } catch (error) {
    return apiInternalErrorResponse({
      message: 'Erro ao executar job de multiplicador aleatório',
      code: 'RANDOM_MULTIPLIER_JOB_FAILED',
      context,
      event: 'job.random-multiplier.failed',
      error,
    });
  }
}

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

// Per-process ledger — the actual upsert to CooperativeRandomMultiplier provides
// DB-level idempotency; this prevents concurrent runs within the same process.
const ledger = new InMemoryJobRunLedger();

function generateRandomMultiplier(): number {
  // Uniform in [0.8, 1.2], rounded to 3 decimal places.
  return Math.round((0.8 + Math.random() * 0.4) * 1000) / 1000;
}

function buildPeriodKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
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

  const periodKey = buildPeriodKey(new Date());
  const jobKey = buildJobRunKey({ jobName: 'monthly-random-multiplier', periodKey });

  try {
    const jobResult = await runIdempotentJob(
      ledger,
      jobKey,
      async () => {
        const cooperatives = await prisma.cooperative.findMany({
          select: { cooperativeId: true },
        });

        const updates = await Promise.all(
          cooperatives.map((coop) =>
            prisma.cooperativeRandomMultiplier.upsert({
              where: { cooperativeId: coop.cooperativeId },
              create: {
                cooperativeId: coop.cooperativeId,
                multiplierValue: generateRandomMultiplier(),
              },
              update: { multiplierValue: generateRandomMultiplier() },
              select: {
                cooperativeId: true,
                multiplierValue: true,
              },
            }),
          ),
        );

        logInfo('job.random-multiplier.applied', context, {
          periodKey,
          cooperativeCount: updates.length,
        });

        return { periodKey, cooperativeCount: updates.length };
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

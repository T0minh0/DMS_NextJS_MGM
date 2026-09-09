import { AuthSession } from '@/lib/auth/shared';
import { determineTargetCooperative, requireScopedPermission } from '@/lib/auth/server';
import {
  MAX_REPORT_RANGE_DAYS,
  currentYearMonth,
  dateRangeUtc,
  formatDateRangeLabel,
  monthRangeUtc,
  parseIsoDateOnly,
  rangeLengthDays,
  resolveMaterialIds,
  type MaterialLookupClient,
} from '@/lib/analytics/period';
import type { PeriodReportInput } from '@/lib/reports/period-report';

export interface PeriodRequestError {
  message: string;
  code: string;
  status: number;
}

export type PeriodReportRequestResolution =
  | { ok: true; input: PeriodReportInput }
  | { ok: false; error: PeriodRequestError };

export interface ResolvePeriodReportOptions {
  /** Path-level worker id (comprovante route); overrides the `worker_id` query param. */
  workerIdParam?: string | null;
  /** Ignore any worker filter (consolidated report). */
  ignoreWorker?: boolean;
  now?: Date;
}

function fail(message: string, code: string, status = 400): PeriodReportRequestResolution {
  return { ok: false, error: { message, code, status } };
}

export function parseWorkerIdParam(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') {
    return { kind: 'none' as const };
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return { kind: 'invalid' as const };
  }

  try {
    return { kind: 'id' as const, workerId: BigInt(digits) };
  } catch {
    return { kind: 'invalid' as const };
  }
}

/**
 * Shared query parsing for the period report endpoints (JSON + both PDFs).
 * Resolves cooperative scope (admin may pass `cooperative_id`), period
 * (`year_month` or `from`/`to`), worker and material filters.
 */
export async function resolvePeriodReportRequest(
  db: MaterialLookupClient,
  session: AuthSession,
  searchParams: URLSearchParams,
  options: ResolvePeriodReportOptions = {},
): Promise<PeriodReportRequestResolution> {
  const targetCooperativeId = determineTargetCooperative(
    session,
    searchParams.get('cooperative_id'),
    { required: true },
  );
  requireScopedPermission(session, 'reports', 'read', 'cooperative');

  const now = options.now ?? new Date();
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  let from: Date;
  let toExclusive: Date;
  let yearMonth: string | null = null;
  let periodLabel: string;

  if (fromParam || toParam) {
    const fromDate = parseIsoDateOnly(fromParam);
    const toDate = parseIsoDateOnly(toParam);
    if (!fromDate || !toDate) {
      return fail('Período inválido. Informe from e to no formato AAAA-MM-DD.', 'INVALID_PERIOD');
    }
    if (toDate.getTime() < fromDate.getTime()) {
      return fail('A data final deve ser igual ou posterior à data inicial.', 'INVALID_PERIOD_RANGE');
    }
    const range = dateRangeUtc(fromDate, toDate);
    if (rangeLengthDays(range) > MAX_REPORT_RANGE_DAYS) {
      return fail(`O período não pode ultrapassar ${MAX_REPORT_RANGE_DAYS} dias.`, 'INVALID_PERIOD_RANGE');
    }
    from = range.from;
    toExclusive = range.toExclusive;
    periodLabel = formatDateRangeLabel(range);
  } else {
    const requestedYearMonth = searchParams.get('year_month') ?? currentYearMonth(now);
    const monthRange = monthRangeUtc(requestedYearMonth);
    if (!monthRange) {
      return fail('Mês inválido. Use o formato AAAA-MM.', 'INVALID_YEAR_MONTH');
    }
    yearMonth = requestedYearMonth;
    from = monthRange.from;
    toExclusive = monthRange.toExclusive;
    periodLabel = monthRange.label;
  }

  let workerId: bigint | null = null;
  if (!options.ignoreWorker) {
    const workerParam = options.workerIdParam ?? searchParams.get('worker_id');
    const parsedWorker = parseWorkerIdParam(workerParam);
    if (parsedWorker.kind === 'invalid') {
      return fail('Catador inválido', 'INVALID_WORKER_ID');
    }
    if (parsedWorker.kind === 'id') {
      workerId = parsedWorker.workerId;
    }
  }

  const materialResolution = await resolveMaterialIds(db, searchParams.get('material_id'));
  if (materialResolution.kind === 'invalid') {
    return fail('Material inválido', 'INVALID_MATERIAL');
  }

  const materialIds = materialResolution.kind === 'ids'
    ? materialResolution.ids
    : materialResolution.kind === 'empty_group'
      ? []
      : null;

  return {
    ok: true,
    input: {
      cooperativeId: BigInt(targetCooperativeId),
      from,
      toExclusive,
      yearMonth,
      periodLabel,
      workerId,
      materialIds,
      materialLabel: materialResolution.label,
      generatedBy: { name: session.name, role: session.role },
      now,
    },
  };
}

import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Shared period helpers for reports and dashboards.
 *
 * Rules:
 * - `@db.Date` columns (`Measurments.Time_stamp`, `Sales.Date`) come back from
 *   Prisma as UTC-midnight dates. Range bounds are therefore built with
 *   `Date.UTC(...)` and date-only values are formatted with `timeZone: 'UTC'`.
 * - `America/Sao_Paulo` is only used to decide which month is "current" and to
 *   format timestamps (generated at, sold at).
 */

export type PeriodType = 'weekly' | 'monthly' | 'yearly';

export const REPORT_TIME_ZONE = 'America/Sao_Paulo';
export const MAX_REPORT_RANGE_DAYS = 366;
export const DAY_MS = 86_400_000;

export interface UtcDateRange {
  from: Date;
  toExclusive: Date;
}

export function currentYearMonth(now: Date = new Date(), timeZone = REPORT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';

  return `${year}-${month}`;
}

export function parseYearMonth(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  return { year, monthIndex: month - 1 };
}

export function monthRangeUtc(yearMonth: string) {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    return null;
  }

  const from = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1));
  const toExclusive = new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, 1));
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(from);

  return { from, toExclusive, label };
}

export function parseIsoDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function dateRangeUtc(from: Date, toInclusive: Date): UtcDateRange {
  return {
    from,
    toExclusive: new Date(toInclusive.getTime() + DAY_MS),
  };
}

export function rangeLengthDays(range: UtcDateRange) {
  return Math.round((range.toExclusive.getTime() - range.from.getTime()) / DAY_MS);
}

export function lastInclusiveDay(range: UtcDateRange) {
  return new Date(range.toExclusive.getTime() - DAY_MS);
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatDateOnly(date: Date, locale = 'pt-BR') {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateRangeLabel(range: UtcDateRange, locale = 'pt-BR') {
  return `${formatDateOnly(range.from, locale)} a ${formatDateOnly(lastInclusiveDay(range), locale)}`;
}

/**
 * Legacy dashboard period buckets (server-local time). Kept identical to the
 * historical implementation used by `/api/worker-collections` so new code can
 * share it without changing existing behaviour.
 */
export function getDateRange(periodType: PeriodType, now: Date = new Date()) {
  if (periodType === 'weekly') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (periodType === 'yearly') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }

  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

export type MaterialFilterResolution =
  | { kind: 'all'; ids: null; label: null }
  | { kind: 'ids'; ids: bigint[]; label: string }
  | { kind: 'empty_group'; ids: null; label: string; groupName: string }
  | { kind: 'invalid'; ids: null; label: null };

export type MaterialLookupClient = Pick<PrismaClient, 'materials'> | Pick<Prisma.TransactionClient, 'materials'>;

export const MATERIAL_GROUP_PREFIX = 'group_';

/**
 * Resolves the dashboard `material_id` convention: a numeric material id or
 * `group_<GroupName>` (case-insensitive) selecting every material of a group.
 */
export async function resolveMaterialIds(
  db: MaterialLookupClient,
  materialParam: string | null | undefined,
): Promise<MaterialFilterResolution> {
  if (!materialParam) {
    return { kind: 'all', ids: null, label: null };
  }

  if (materialParam.startsWith(MATERIAL_GROUP_PREFIX)) {
    const groupName = materialParam.slice(MATERIAL_GROUP_PREFIX.length).trim();
    const groupMaterials = await db.materials.findMany({
      where: {
        group: {
          groupName: {
            equals: groupName,
            mode: 'insensitive',
          },
        },
      },
      select: { materialId: true },
    });

    if (groupMaterials.length === 0) {
      return { kind: 'empty_group', ids: null, label: `Grupo ${groupName}`, groupName };
    }

    return {
      kind: 'ids',
      ids: groupMaterials.map((material) => material.materialId),
      label: `Grupo ${groupName}`,
    };
  }

  try {
    const materialId = BigInt(materialParam);
    return { kind: 'ids', ids: [materialId], label: `Material ${materialId.toString()}` };
  } catch {
    return { kind: 'invalid', ids: null, label: null };
  }
}

import { Prisma, type PrismaClient } from '@prisma/client';
import { decimalToJsonNumber, formatDecimal } from '@/lib/decimal';
import { resolveCooperativeDevice } from '@/lib/materials/measurements';
import { addHistoricalCollected, addToStock, type StockSnapshot } from '@/lib/stock/ledger';
import type { ResolvedOnboardingRow, StockMode, ValidationReport } from './contract';
import { loadExistingMeasurementKeys, measurementKey } from './validate';

export type OnboardingImportErrorCode = 'ONBOARDING_NOT_APPLICABLE' | 'ONBOARDING_ALREADY_IMPORTED';

export class OnboardingImportError extends Error {
  readonly code: OnboardingImportErrorCode;
  readonly status: number;

  constructor(code: OnboardingImportErrorCode, message: string, status: number) {
    super(message);
    this.name = 'OnboardingImportError';
    this.code = code;
    this.status = status;
  }
}

export interface OnboardingImportPlan {
  cooperativeId: bigint;
  stockMode: StockMode;
  rows: ResolvedOnboardingRow[];
  byMaterial: Array<{ materialId: bigint; totalKg: Prisma.Decimal; rows: number }>;
  expectedDuplicateCount: number;
  dateRange: { from: Date; toExclusive: Date } | null;
}

export function buildOnboardingImportPlan(
  report: ValidationReport,
  cooperativeId: bigint,
  stockMode: StockMode,
): OnboardingImportPlan {
  if (!report.canApply) {
    throw new OnboardingImportError(
      'ONBOARDING_NOT_APPLICABLE',
      'O arquivo tem linhas inválidas; corrija e valide novamente.',
      422,
    );
  }

  const byMaterial = new Map<string, { materialId: bigint; totalKg: Prisma.Decimal; rows: number }>();
  let min: Date | null = null;
  let max: Date | null = null;

  report.okRows.forEach((row) => {
    const entry = byMaterial.get(row.materialId.toString()) ?? {
      materialId: row.materialId,
      totalKg: new Prisma.Decimal(0),
      rows: 0,
    };
    entry.totalKg = entry.totalKg.plus(row.weightKg);
    entry.rows += 1;
    byMaterial.set(row.materialId.toString(), entry);
    if (!min || row.date < min) min = row.date;
    if (!max || row.date > max) max = row.date;
  });

  return {
    cooperativeId,
    stockMode,
    rows: report.okRows,
    byMaterial: Array.from(byMaterial.values()),
    expectedDuplicateCount: report.summary.duplicateRows,
    dateRange: min && max ? { from: min as Date, toExclusive: new Date((max as Date).getTime() + 86_400_000) } : null,
  };
}

export interface OnboardingImportResult {
  cooperativeId: bigint;
  deviceId: bigint;
  measurementCount: number;
  totalKg: number;
  stockMode: StockMode;
  weightingIds: bigint[];
  byMaterial: Array<{ materialId: bigint; addedCollectedKg: number; stockAfter: StockSnapshot }>;
}

export const ONBOARDING_IMPORT_TRANSACTION_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;
export const ONBOARDING_IMPORT_CHUNK = 1_000;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export type OnboardingImportDbClient = Pick<PrismaClient, '$transaction'>;

/**
 * Applies a validated plan in ONE transaction:
 * advisory lock per cooperative -> device -> duplicate recount inside the lock
 * -> createManyAndReturn in chunks -> one stock upsert per material.
 * Never touches material_bag_state (historical rows are already deltas).
 */
export async function applyOnboardingImport(
  db: OnboardingImportDbClient,
  plan: OnboardingImportPlan,
  options: { chunkSize?: number } = {},
): Promise<OnboardingImportResult> {
  const chunkSize = options.chunkSize ?? ONBOARDING_IMPORT_CHUNK;

  return db.$transaction(async (tx) => {
    const lockKey = `onboarding-import:${plan.cooperativeId.toString()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const deviceId = await resolveCooperativeDevice(tx, plan.cooperativeId);

    if (plan.dateRange) {
      const existing = await loadExistingMeasurementKeys(tx, plan.cooperativeId, plan.dateRange.from, plan.dateRange.toExclusive);
      const duplicates = plan.rows.filter((row) => (
        (existing.get(measurementKey(row.workerId, row.materialId, row.dateKey, row.weightKey)) ?? 0) > 0
      )).length;

      if (duplicates > plan.expectedDuplicateCount) {
        throw new OnboardingImportError(
          'ONBOARDING_ALREADY_IMPORTED',
          'Novas duplicatas apareceram no banco desde a validação; valide o arquivo novamente.',
          409,
        );
      }
    }

    const weightingIds: bigint[] = [];
    for (const batch of chunk(plan.rows, chunkSize)) {
      const created = await tx.measurments.createManyAndReturn({
        data: batch.map((row) => ({
          weightKg: formatDecimal(row.weightKg),
          timeStamp: row.date,
          wastepicker: row.workerId,
          material: row.materialId,
          device: deviceId,
          bagFilled: row.bagFilled,
        })),
        select: { weightingId: true },
      });
      created.forEach((row) => weightingIds.push(row.weightingId));
    }

    const byMaterial: OnboardingImportResult['byMaterial'] = [];
    for (const entry of plan.byMaterial) {
      const input = { cooperativeId: plan.cooperativeId, materialId: entry.materialId, amountKg: entry.totalKg };
      const stockAfter = plan.stockMode === 'collected_and_current'
        ? await addToStock(tx, input)
        : await addHistoricalCollected(tx, input);
      byMaterial.push({
        materialId: entry.materialId,
        addedCollectedKg: decimalToJsonNumber(entry.totalKg),
        stockAfter,
      });
    }

    const totalKg = plan.byMaterial.reduce((sum, entry) => sum.plus(entry.totalKg), new Prisma.Decimal(0));

    return {
      cooperativeId: plan.cooperativeId,
      deviceId,
      measurementCount: weightingIds.length,
      totalKg: decimalToJsonNumber(totalKg),
      stockMode: plan.stockMode,
      weightingIds,
      byMaterial,
    };
  }, ONBOARDING_IMPORT_TRANSACTION_OPTIONS);
}

export interface GamificationJobHint {
  name: string;
  method: 'POST';
  path: string;
  body: Record<string, string>;
  auth: string;
}

/** Jobs the admin should run after an import. Not triggered automatically (closed periods + job secret). */
export function listGamificationFollowUps(yearMonths: string[], cooperativeId: bigint): GamificationJobHint[] {
  const auth = 'Bearer <DMS_JOB_SECRET>';
  const cooperative = cooperativeId.toString();
  return yearMonths.flatMap((yearMonth) => [
    {
      name: `Avaliação de conquistas ${yearMonth}`,
      method: 'POST' as const,
      path: '/api/jobs/achievement-evaluation',
      body: { yearMonth, cooperativeId: cooperative },
      auth,
    },
    {
      name: `Snapshot semanal do leaderboard ${yearMonth}`,
      method: 'POST' as const,
      path: '/api/jobs/leaderboard-snapshot-weekly',
      body: { yearMonth, cooperativeId: cooperative },
      auth,
    },
    {
      name: `Snapshot mensal do leaderboard ${yearMonth}`,
      method: 'POST' as const,
      path: '/api/jobs/leaderboard-snapshot-monthly',
      body: { yearMonth, cooperativeId: cooperative },
      auth,
    },
  ]);
}

export function serializeImportResult(result: OnboardingImportResult) {
  const ids = result.weightingIds.map((id) => id.toString());
  return {
    cooperative_id: result.cooperativeId.toString(),
    device_id: result.deviceId.toString(),
    measurement_count: result.measurementCount,
    total_kg: result.totalKg,
    stock_mode: result.stockMode,
    weighting_id_range: ids.length > 0 ? { from: ids[0], to: ids[ids.length - 1] } : null,
    weighting_ids: ids,
    by_material: result.byMaterial.map((entry) => ({
      material_id: entry.materialId.toString(),
      added_collected_kg: entry.addedCollectedKg,
      stock_after: {
        total_collected_kg: decimalToJsonNumber(entry.stockAfter.totalCollectedKg),
        total_sold_kg: decimalToJsonNumber(entry.stockAfter.totalSoldKg),
        current_stock_kg: decimalToJsonNumber(entry.stockAfter.currentStockKg),
      },
    })),
  };
}

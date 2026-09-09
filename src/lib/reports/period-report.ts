import { Prisma, type PrismaClient } from '@prisma/client';
import {
  DAY_MS,
  MAX_REPORT_RANGE_DAYS,
  formatDateKey,
  formatDateRangeLabel,
  lastInclusiveDay,
} from '@/lib/analytics/period';
import { formatWorkerId } from '@/lib/db-utils';
import { decimalToJsonNumber } from '@/lib/decimal';
import { SOLD_SALE_WHERE } from '@/lib/sales/lifecycle';

/**
 * Shared period aggregation used by the JSON endpoint, both PDF reports and
 * the dashboards page, so every surface shows the same numbers.
 *
 * Scope rules: every query is bounded by the cooperative (measurements through
 * `wastepickerRef.cooperative`, sales and stock through their own column) and
 * zero-delta measurements are excluded so counts and totals agree.
 */

export type PeriodReportDbClient = Pick<
  PrismaClient,
  'cooperative' | 'workers' | 'measurments' | 'materials' | 'sales' | 'stock'
>;

export type PeriodReportErrorCode = 'COOPERATIVE_NOT_FOUND' | 'WORKER_NOT_FOUND' | 'INVALID_PERIOD_RANGE';

export class PeriodReportError extends Error {
  readonly code: PeriodReportErrorCode;
  readonly status: number;

  constructor(code: PeriodReportErrorCode, message: string, status: number) {
    super(message);
    this.name = 'PeriodReportError';
    this.code = code;
    this.status = status;
  }
}

export interface PeriodReportInput {
  cooperativeId: bigint;
  from: Date;
  toExclusive: Date;
  yearMonth?: string | null;
  periodLabel?: string | null;
  workerId?: bigint | null;
  materialIds?: bigint[] | null;
  materialLabel?: string | null;
  generatedBy?: { name: string; role: string } | null;
  now?: Date;
}

export interface PeriodReportMaterialRow {
  materialId: bigint;
  materialName: string;
  groupName: string | null;
  kg: number;
  sharePct: number;
  collectionsCount: number;
}

export interface PeriodReportWorkerRow {
  workerId: bigint;
  wastepickerId: string;
  workerName: string;
  kg: number;
  collectionsCount: number;
  workedDays: number;
}

export interface PeriodReportDailyRow {
  date: Date;
  kg: number;
  collectionsCount: number;
}

export interface PeriodReportSaleRow {
  saleId: bigint;
  date: Date;
  materialName: string;
  buyerName: string;
  kg: number;
  priceKg: number;
  totalBrl: number;
}

export interface PeriodReportStockRow {
  materialId: bigint;
  materialName: string;
  groupName: string | null;
  currentKg: number;
  totalCollectedKg: number;
  totalSoldKg: number;
}

export interface PeriodReportWorkerDailyRow {
  date: Date;
  materialId: bigint;
  materialName: string;
  kg: number;
  collectionsCount: number;
}

export interface PeriodReportData {
  kind: 'period' | 'worker-period';
  cooperative: { id: bigint; name: string };
  period: { yearMonth: string | null; from: Date; toInclusive: Date; label: string };
  generatedAt: Date;
  generatedBy: { name: string; role: string };
  filters: {
    worker: { id: bigint; wastepickerId: string; name: string } | null;
    materialIds: bigint[] | null;
    materialLabel: string | null;
  };
  summary: {
    collectedKg: number;
    collectionsCount: number;
    activeWorkers: number;
    workedDays: number;
    soldKg: number;
    salesCount: number;
    revenueBrl: number;
    stockKg: number;
  };
  byMaterial: PeriodReportMaterialRow[];
  byWorker: PeriodReportWorkerRow[];
  daily: PeriodReportDailyRow[];
  sales: PeriodReportSaleRow[];
  stock: PeriodReportStockRow[];
  workerDaily: PeriodReportWorkerDailyRow[];
}

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

function toDecimal(value: DecimalLike) {
  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }
  return Prisma.Decimal.isDecimal(value) ? value : new Prisma.Decimal(value);
}

function toNumber(value: DecimalLike) {
  return decimalToJsonNumber(toDecimal(value));
}

function sharePercent(part: Prisma.Decimal, total: Prisma.Decimal) {
  if (total.lessThanOrEqualTo(0)) {
    return 0;
  }
  return decimalToJsonNumber(part.div(total).times(100));
}

export async function buildPeriodReportData(
  db: PeriodReportDbClient,
  input: PeriodReportInput,
): Promise<PeriodReportData> {
  const rangeDays = Math.round((input.toExclusive.getTime() - input.from.getTime()) / DAY_MS);
  if (rangeDays <= 0 || rangeDays > MAX_REPORT_RANGE_DAYS) {
    throw new PeriodReportError(
      'INVALID_PERIOD_RANGE',
      `O período deve ter entre 1 e ${MAX_REPORT_RANGE_DAYS} dias`,
      400,
    );
  }

  const cooperative = await db.cooperative.findUnique({
    where: { cooperativeId: input.cooperativeId },
    select: { cooperativeId: true, cooperativeName: true },
  });

  if (!cooperative) {
    throw new PeriodReportError('COOPERATIVE_NOT_FOUND', 'Cooperativa não encontrada', 404);
  }

  let worker: { workerId: bigint; workerName: string } | null = null;
  if (input.workerId) {
    worker = await db.workers.findFirst({
      where: { workerId: input.workerId, cooperative: input.cooperativeId },
      select: { workerId: true, workerName: true },
    });

    if (!worker) {
      throw new PeriodReportError('WORKER_NOT_FOUND', 'Catador não encontrado nesta cooperativa', 404);
    }
  }

  const isWorkerReport = Boolean(worker);
  const materialIds = input.materialIds ?? null;
  const materialWhere = materialIds ? { material: { in: materialIds } } : {};

  const measurementWhere: Prisma.MeasurmentsWhereInput = {
    timeStamp: { gte: input.from, lt: input.toExclusive },
    weightKg: { gt: 0 },
    wastepickerRef: { cooperative: input.cooperativeId },
    ...(worker ? { wastepicker: worker.workerId } : {}),
    ...materialWhere,
  };

  const [byMaterialRaw, byWorkerDayRaw, workerDailyRaw, salesRaw, stockRaw] = await Promise.all([
    db.measurments.groupBy({
      by: ['material'],
      where: measurementWhere,
      _sum: { weightKg: true },
      _count: { _all: true },
    }),
    db.measurments.groupBy({
      by: ['wastepicker', 'timeStamp'],
      where: measurementWhere,
      _sum: { weightKg: true },
      _count: { _all: true },
    }),
    isWorkerReport
      ? db.measurments.groupBy({
        by: ['timeStamp', 'material'],
        where: measurementWhere,
        _sum: { weightKg: true },
        _count: { _all: true },
      })
      : Promise.resolve([]),
    isWorkerReport
      ? Promise.resolve([])
      : db.sales.findMany({
        where: {
          ...SOLD_SALE_WHERE,
          cooperativeId: input.cooperativeId,
          date: { gte: input.from, lt: input.toExclusive },
          ...materialWhere,
        },
        select: {
          saleId: true,
          date: true,
          weight: true,
          priceKg: true,
          materialRef: { select: { materialName: true } },
          buyerRef: { select: { buyerName: true } },
        },
        orderBy: [{ date: 'asc' }, { saleId: 'asc' }],
      }),
    db.stock.findMany({
      where: {
        cooperative: input.cooperativeId,
        ...materialWhere,
      },
      select: {
        material: true,
        currentStockKg: true,
        totalCollectedKg: true,
        totalSoldKg: true,
        materialRef: { select: { materialName: true, group: { select: { groupName: true } } } },
      },
    }),
  ]);

  const materialIdsSeen = new Set<bigint>();
  byMaterialRaw.forEach((row) => materialIdsSeen.add(row.material));
  workerDailyRaw.forEach((row) => materialIdsSeen.add(row.material));

  const workerIdsSeen = new Set<bigint>();
  byWorkerDayRaw.forEach((row) => workerIdsSeen.add(row.wastepicker));

  const [materialRows, workerRows] = await Promise.all([
    materialIdsSeen.size > 0
      ? db.materials.findMany({
        where: { materialId: { in: Array.from(materialIdsSeen) } },
        select: { materialId: true, materialName: true, group: { select: { groupName: true } } },
      })
      : Promise.resolve([]),
    workerIdsSeen.size > 0
      ? db.workers.findMany({
        where: { workerId: { in: Array.from(workerIdsSeen) }, cooperative: input.cooperativeId },
        select: { workerId: true, workerName: true },
      })
      : Promise.resolve([]),
  ]);

  const materialNameById = new Map<string, { name: string; groupName: string | null }>();
  materialRows.forEach((row) => {
    materialNameById.set(row.materialId.toString(), {
      name: row.materialName,
      groupName: row.group?.groupName ?? null,
    });
  });
  const workerNameById = new Map<string, string>();
  workerRows.forEach((row) => workerNameById.set(row.workerId.toString(), row.workerName));

  const totalCollected = byMaterialRaw.reduce(
    (sum, row) => sum.plus(toDecimal(row._sum.weightKg)),
    new Prisma.Decimal(0),
  );
  const collectionsCount = byMaterialRaw.reduce((sum, row) => sum + row._count._all, 0);

  const byMaterial: PeriodReportMaterialRow[] = byMaterialRaw
    .map((row) => {
      const kg = toDecimal(row._sum.weightKg);
      const meta = materialNameById.get(row.material.toString());
      return {
        materialId: row.material,
        materialName: meta?.name ?? `Material ${row.material.toString()}`,
        groupName: meta?.groupName ?? null,
        kg: decimalToJsonNumber(kg),
        sharePct: sharePercent(kg, totalCollected),
        collectionsCount: row._count._all,
      };
    })
    .sort((left, right) => right.kg - left.kg || left.materialName.localeCompare(right.materialName, 'pt-BR'));

  const dailyMap = new Map<string, { date: Date; kg: Prisma.Decimal; count: number }>();
  const workerMap = new Map<string, { workerId: bigint; kg: Prisma.Decimal; count: number; days: Set<string> }>();

  byWorkerDayRaw.forEach((row) => {
    const dayKey = formatDateKey(row.timeStamp);
    const kg = toDecimal(row._sum.weightKg);
    const daily = dailyMap.get(dayKey) ?? { date: row.timeStamp, kg: new Prisma.Decimal(0), count: 0 };
    daily.kg = daily.kg.plus(kg);
    daily.count += row._count._all;
    dailyMap.set(dayKey, daily);

    const workerKey = row.wastepicker.toString();
    const entry = workerMap.get(workerKey) ?? {
      workerId: row.wastepicker,
      kg: new Prisma.Decimal(0),
      count: 0,
      days: new Set<string>(),
    };
    entry.kg = entry.kg.plus(kg);
    entry.count += row._count._all;
    entry.days.add(dayKey);
    workerMap.set(workerKey, entry);
  });

  const daily: PeriodReportDailyRow[] = Array.from(dailyMap.values())
    .map((entry) => ({ date: entry.date, kg: decimalToJsonNumber(entry.kg), collectionsCount: entry.count }))
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const byWorker: PeriodReportWorkerRow[] = Array.from(workerMap.values())
    .map((entry) => ({
      workerId: entry.workerId,
      wastepickerId: formatWorkerId(entry.workerId),
      workerName: workerNameById.get(entry.workerId.toString()) ?? `Catador ${entry.workerId.toString()}`,
      kg: decimalToJsonNumber(entry.kg),
      collectionsCount: entry.count,
      workedDays: entry.days.size,
    }))
    .sort((left, right) => right.kg - left.kg || left.workerName.localeCompare(right.workerName, 'pt-BR'));

  const workerDaily: PeriodReportWorkerDailyRow[] = workerDailyRaw
    .map((row) => ({
      date: row.timeStamp,
      materialId: row.material,
      materialName: materialNameById.get(row.material.toString())?.name ?? `Material ${row.material.toString()}`,
      kg: toNumber(row._sum.weightKg),
      collectionsCount: row._count._all,
    }))
    .sort((left, right) => (
      left.date.getTime() - right.date.getTime() ||
      left.materialName.localeCompare(right.materialName, 'pt-BR')
    ));

  const sales: PeriodReportSaleRow[] = salesRaw.map((sale) => ({
    saleId: sale.saleId,
    date: sale.date,
    materialName: sale.materialRef.materialName,
    buyerName: sale.buyerRef.buyerName,
    kg: toNumber(sale.weight),
    priceKg: toNumber(sale.priceKg),
    totalBrl: decimalToJsonNumber(toDecimal(sale.priceKg).times(toDecimal(sale.weight))),
  }));
  const soldKg = salesRaw.reduce((sum, sale) => sum.plus(toDecimal(sale.weight)), new Prisma.Decimal(0));
  const revenue = salesRaw.reduce(
    (sum, sale) => sum.plus(toDecimal(sale.priceKg).times(toDecimal(sale.weight))),
    new Prisma.Decimal(0),
  );

  const stock: PeriodReportStockRow[] = stockRaw
    .map((row) => ({
      materialId: row.material,
      materialName: row.materialRef.materialName,
      groupName: row.materialRef.group?.groupName ?? null,
      currentKg: toNumber(row.currentStockKg),
      totalCollectedKg: toNumber(row.totalCollectedKg),
      totalSoldKg: toNumber(row.totalSoldKg),
    }))
    .sort((left, right) => left.materialName.localeCompare(right.materialName, 'pt-BR'));
  const stockKg = stockRaw.reduce((sum, row) => sum.plus(toDecimal(row.currentStockKg)), new Prisma.Decimal(0));

  const toInclusive = lastInclusiveDay({ from: input.from, toExclusive: input.toExclusive });
  const workedDays = worker ? (byWorker[0]?.workedDays ?? 0) : dailyMap.size;

  return {
    kind: worker ? 'worker-period' : 'period',
    cooperative: { id: cooperative.cooperativeId, name: cooperative.cooperativeName },
    period: {
      yearMonth: input.yearMonth ?? null,
      from: input.from,
      toInclusive,
      label: input.periodLabel ?? formatDateRangeLabel({ from: input.from, toExclusive: input.toExclusive }),
    },
    generatedAt: input.now ?? new Date(),
    generatedBy: input.generatedBy ?? { name: 'DMS', role: 'system' },
    filters: {
      worker: worker
        ? { id: worker.workerId, wastepickerId: formatWorkerId(worker.workerId), name: worker.workerName }
        : null,
      materialIds,
      materialLabel: input.materialLabel ?? null,
    },
    summary: {
      collectedKg: decimalToJsonNumber(totalCollected),
      collectionsCount,
      activeWorkers: byWorker.length,
      workedDays,
      soldKg: decimalToJsonNumber(soldKg),
      salesCount: salesRaw.length,
      revenueBrl: decimalToJsonNumber(revenue),
      stockKg: decimalToJsonNumber(stockKg),
    },
    byMaterial,
    byWorker,
    daily,
    sales,
    stock,
    workerDaily,
  };
}

export function serializePeriodReport(data: PeriodReportData) {
  return {
    kind: data.kind,
    cooperative: { id: data.cooperative.id.toString(), name: data.cooperative.name },
    period: {
      year_month: data.period.yearMonth,
      from: formatDateKey(data.period.from),
      to: formatDateKey(data.period.toInclusive),
      label: data.period.label,
    },
    generated_at: data.generatedAt.toISOString(),
    generated_by: data.generatedBy,
    filters: {
      worker: data.filters.worker
        ? {
          id: data.filters.worker.id.toString(),
          wastepicker_id: data.filters.worker.wastepickerId,
          name: data.filters.worker.name,
        }
        : null,
      material_ids: data.filters.materialIds?.map((id) => id.toString()) ?? null,
      material_label: data.filters.materialLabel,
    },
    summary: {
      collected_kg: data.summary.collectedKg,
      collections_count: data.summary.collectionsCount,
      active_workers: data.summary.activeWorkers,
      worked_days: data.summary.workedDays,
      sold_kg: data.summary.soldKg,
      sales_count: data.summary.salesCount,
      revenue_brl: data.summary.revenueBrl,
      stock_kg: data.summary.stockKg,
    },
    by_material: data.byMaterial.map((row) => ({
      material_id: row.materialId.toString(),
      material_name: row.materialName,
      group_name: row.groupName,
      kg: row.kg,
      share_pct: row.sharePct,
      collections_count: row.collectionsCount,
    })),
    by_worker: data.byWorker.map((row) => ({
      worker_id: row.workerId.toString(),
      wastepicker_id: row.wastepickerId,
      worker_name: row.workerName,
      kg: row.kg,
      collections_count: row.collectionsCount,
      worked_days: row.workedDays,
    })),
    daily: data.daily.map((row) => ({
      date: formatDateKey(row.date),
      kg: row.kg,
      collections_count: row.collectionsCount,
    })),
    sales: data.sales.map((row) => ({
      sale_id: row.saleId.toString(),
      date: formatDateKey(row.date),
      material_name: row.materialName,
      buyer_name: row.buyerName,
      kg: row.kg,
      price_kg: row.priceKg,
      total_brl: row.totalBrl,
    })),
    stock: data.stock.map((row) => ({
      material_id: row.materialId.toString(),
      material_name: row.materialName,
      group_name: row.groupName,
      current_kg: row.currentKg,
      total_collected_kg: row.totalCollectedKg,
      total_sold_kg: row.totalSoldKg,
    })),
    worker_daily: data.workerDaily.map((row) => ({
      date: formatDateKey(row.date),
      material_id: row.materialId.toString(),
      material_name: row.materialName,
      kg: row.kg,
      collections_count: row.collectionsCount,
    })),
  };
}

export type PeriodReportJson = ReturnType<typeof serializePeriodReport>;

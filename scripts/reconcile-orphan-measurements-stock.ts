import { Prisma } from '@prisma/client';
import prisma from '../src/lib/prisma';
import { formatDecimal, decimalToJsonNumber } from '../src/lib/decimal';
import { addToStock, calculateBagStateDelta } from '../src/lib/stock/ledger';

type CliArgs = {
  cooperativeId: bigint;
  from: Date;
  to: Date;
  materialIds?: bigint[];
  apply: boolean;
};

type MeasurementRow = {
  weightingId: bigint;
  weightKg: Prisma.Decimal;
  timeStamp: Date;
  material: bigint;
  bagFilled: boolean;
};

type PlannedUpdate = {
  weightingId: bigint;
  previousWeightKg: Prisma.Decimal;
  nextWeightKg: Prisma.Decimal;
  bagFilled: boolean;
  measuredAt: Date;
  effectiveAt: Date;
};

type GroupPlan = {
  materialId: bigint;
  updates: PlannedUpdate[];
  totalDeltaKg: Prisma.Decimal;
  finalCurrentKg: Prisma.Decimal;
  finalIsBegun: boolean;
  finalLastUpdated: Date;
};

const ZERO = new Prisma.Decimal(0);
const INITIAL_BAG_UPDATED_AT = new Date('1970-01-01T00:00:00Z');

function usage() {
  return [
    'Usage:',
    '  npm run stock:reconcile-orphan-measurements -- --cooperative-id <id> --from <date> --to <date> [--materials 1,2] [--apply]',
    '',
    'Default mode is dry-run. Pass --apply to mutate Measurments, Stock and material_bag_state.',
  ].join('\n');
}

function readValue(argv: string[], index: number, flag: string) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requer um valor.\n${usage()}`);
  }
  return value;
}

function parseBigIntArg(value: string, field: string) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${field} deve ser um inteiro válido.`);
  }
}

function parseDateArg(value: string, field: string, endOfDay = false) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`
    : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} deve ser uma data válida.`);
  }

  return date;
}

function parseArgs(argv = process.argv.slice(2)): CliArgs {
  const parsed: Partial<CliArgs> = { apply: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--cooperative-id') {
      parsed.cooperativeId = parseBigIntArg(readValue(argv, index, arg), 'cooperative-id');
      index += 1;
    } else if (arg === '--from') {
      parsed.from = parseDateArg(readValue(argv, index, arg), 'from');
      index += 1;
    } else if (arg === '--to') {
      parsed.to = parseDateArg(readValue(argv, index, arg), 'to', true);
      index += 1;
    } else if (arg === '--materials') {
      const rawMaterials = readValue(argv, index, arg)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      parsed.materialIds = rawMaterials.map((value) => parseBigIntArg(value, 'materials'));
      index += 1;
    } else if (arg === '--apply') {
      parsed.apply = true;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}\n${usage()}`);
    }
  }

  if (!parsed.cooperativeId || !parsed.from || !parsed.to) {
    throw new Error(`Filtros obrigatórios ausentes.\n${usage()}`);
  }

  if (parsed.from.getTime() > parsed.to.getTime()) {
    throw new Error('from precisa ser anterior ou igual a to.');
  }

  return parsed as CliArgs;
}

function groupMeasurements(rows: MeasurementRow[]) {
  const groups = new Map<string, MeasurementRow[]>();

  rows.forEach((row) => {
    const key = row.material.toString();
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  });

  return Array.from(groups.entries()).map(([materialId, list]) => ({
    materialId: BigInt(materialId),
    rows: list.sort((left, right) => {
      const byTime = left.timeStamp.getTime() - right.timeStamp.getTime();
      if (byTime !== 0) return byTime;
      return left.weightingId < right.weightingId ? -1 : 1;
    }),
  }));
}

function nextEffectiveTimestamp(raw: Date, previous: Date) {
  if (raw.getTime() > previous.getTime()) {
    return raw;
  }

  return new Date(previous.getTime() + 1);
}

function buildGroupPlan(materialId: bigint, rows: MeasurementRow[]): GroupPlan {
  let previousCurrentKg = ZERO;
  let previousUpdatedAt = INITIAL_BAG_UPDATED_AT;
  let totalDeltaKg = ZERO;
  let finalCurrentKg = ZERO;
  let finalIsBegun = false;

  const updates = rows.map((row) => {
    const effectiveAt = nextEffectiveTimestamp(row.timeStamp, previousUpdatedAt);
    const delta = calculateBagStateDelta({
      previousCurrentKg,
      reportedCurrentKg: row.weightKg,
      previousUpdatedAt,
      reportedAt: effectiveAt,
      bagFull: row.bagFilled,
    });

    previousCurrentKg = delta.nextCurrentKg;
    previousUpdatedAt = effectiveAt;
    totalDeltaKg = totalDeltaKg.plus(delta.collectedDeltaKg);
    finalCurrentKg = delta.nextCurrentKg;
    finalIsBegun = delta.isBegun;

    return {
      weightingId: row.weightingId,
      previousWeightKg: row.weightKg,
      nextWeightKg: delta.collectedDeltaKg,
      bagFilled: row.bagFilled,
      measuredAt: row.timeStamp,
      effectiveAt,
    };
  });

  return {
    materialId,
    updates,
    totalDeltaKg,
    finalCurrentKg,
    finalIsBegun,
    finalLastUpdated: previousUpdatedAt,
  };
}

async function applyGroupPlan(cooperativeId: bigint, plan: GroupPlan) {
  return prisma.$transaction(async (tx) => {
    const existingStock = await tx.stock.findFirst({
      where: {
        cooperative: cooperativeId,
        material: plan.materialId,
      },
      select: { stockId: true },
    });

    if (existingStock) {
      return {
        status: 'needs_manual_review' as const,
        reason: 'Stock já existe para este material; script não aplica para evitar dupla contagem.',
        existingStock: existingStock.stockId,
      };
    }

    for (const update of plan.updates) {
      await tx.measurments.update({
        where: { weightingId: update.weightingId },
        data: { weightKg: formatDecimal(update.nextWeightKg) },
      });
    }

    let stockId: bigint | null = null;
    if (plan.totalDeltaKg.greaterThan(0)) {
      const stockSnapshot = await addToStock(tx, {
        cooperativeId,
        materialId: plan.materialId,
        amountKg: plan.totalDeltaKg,
      });
      stockId = stockSnapshot.stockId ?? null;
    } else {
      const stock = await tx.stock.upsert({
        where: {
          cooperative_material: {
            cooperative: cooperativeId,
            material: plan.materialId,
          },
        },
        create: {
          cooperative: cooperativeId,
          material: plan.materialId,
          totalCollectedKg: '0.00',
          totalSoldKg: '0.00',
          currentStockKg: '0.00',
        },
        update: {},
        select: { stockId: true },
      });
      stockId = stock.stockId;
    }

    await tx.materialBagState.upsert({
      where: {
        cooperativeId_materialId: {
          cooperativeId,
          materialId: plan.materialId,
        },
      },
      create: {
        cooperativeId,
        materialId: plan.materialId,
        isBegun: plan.finalIsBegun,
        currentKg: formatDecimal(plan.finalCurrentKg),
        lastUpdated: plan.finalLastUpdated,
      },
      update: {
        isBegun: plan.finalIsBegun,
        currentKg: formatDecimal(plan.finalCurrentKg),
        lastUpdated: plan.finalLastUpdated,
      },
    });

    return {
      status: 'applied' as const,
      stockId,
    };
  });
}

function serializePlan(plan: GroupPlan) {
  return {
    material_id: plan.materialId.toString(),
    measurements: plan.updates.length,
    total_delta_kg: decimalToJsonNumber(plan.totalDeltaKg),
    final_bag_current_kg: decimalToJsonNumber(plan.finalCurrentKg),
    final_bag_is_begun: plan.finalIsBegun,
    final_bag_updated_at: plan.finalLastUpdated.toISOString(),
    updates: plan.updates.map((update) => ({
      weighting_id: update.weightingId.toString(),
      previous_weight_kg: decimalToJsonNumber(update.previousWeightKg),
      next_delta_kg: decimalToJsonNumber(update.nextWeightKg),
      bag_filled: update.bagFilled,
      measured_at: update.measuredAt.toISOString(),
      effective_at: update.effectiveAt.toISOString(),
    })),
  };
}

async function main() {
  const args = parseArgs();
  const options = { dryRun: !args.apply, args };

  const rows = await prisma.measurments.findMany({
    where: {
      wastepickerRef: {
        cooperative: args.cooperativeId,
      },
      timeStamp: {
        gte: args.from,
        lte: args.to,
      },
      ...(args.materialIds ? { material: { in: args.materialIds } } : {}),
    },
    orderBy: [
      { material: 'asc' },
      { timeStamp: 'asc' },
      { weightingId: 'asc' },
    ],
    select: {
      weightingId: true,
      weightKg: true,
      timeStamp: true,
      material: true,
      bagFilled: true,
    },
  });

  const groups = groupMeasurements(rows);
  const results = [];

  for (const group of groups) {
    const existingStock = await prisma.stock.findFirst({
      where: {
        cooperative: args.cooperativeId,
        material: group.materialId,
      },
      select: { stockId: true },
    });

    if (existingStock) {
      results.push({
        material_id: group.materialId.toString(),
        status: 'needs_manual_review',
        reason: 'Stock já existe para este material; script não aplica para evitar dupla contagem.',
        existing_stock_id: existingStock.stockId.toString(),
        measurements: group.rows.length,
      });
      continue;
    }

    const plan = buildGroupPlan(group.materialId, group.rows);

    if (options.dryRun) {
      results.push({
        status: 'dry_run',
        ...serializePlan(plan),
      });
      continue;
    }

    const applied = await applyGroupPlan(args.cooperativeId, plan);
    results.push({
      ...serializePlan(plan),
      status: applied.status,
      stock_id: applied.stockId?.toString() ?? null,
      reason: 'reason' in applied ? applied.reason : undefined,
      existing_stock_id: 'existingStock' in applied && applied.existingStock
        ? applied.existingStock.toString()
        : undefined,
    });
  }

  console.log(JSON.stringify({
    mode: options.dryRun ? 'dry_run' : 'apply',
    cooperative_id: args.cooperativeId.toString(),
    from: args.from.toISOString(),
    to: args.to.toISOString(),
    material_ids: args.materialIds?.map((id) => id.toString()) ?? null,
    measurement_count: rows.length,
    material_group_count: groups.length,
    results,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

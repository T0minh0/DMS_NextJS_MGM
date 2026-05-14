import { Prisma } from '@prisma/client';
import {
  DecimalInput,
  DecimalValidationError,
  formatDecimal,
  parseDecimal2,
  parseNonNegativeDecimal2,
  parsePositiveDecimal2,
  serializeBigIntDecimal,
} from '@/lib/decimal';

type LockedStockRow = {
  stockId: bigint;
  totalCollectedKg: Prisma.Decimal;
  totalSoldKg: Prisma.Decimal;
  currentStockKg: Prisma.Decimal;
};

export type LockedStockAggregate = {
  primaryStockId: bigint;
  duplicateStockIds: bigint[];
  totalCollectedKg: Prisma.Decimal;
  totalSoldKg: Prisma.Decimal;
  currentStockKg: Prisma.Decimal;
  rowCount: number;
};

export type StockSnapshot = {
  stockId?: bigint;
  totalCollectedKg: Prisma.Decimal;
  totalSoldKg: Prisma.Decimal;
  currentStockKg: Prisma.Decimal;
};

export type StockDomainErrorCode =
  | 'STOCK_MISSING'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_STOCK_DECIMAL'
  | 'STOCK_INVARIANT_VIOLATION';

export class StockDomainError extends Error {
  readonly code: StockDomainErrorCode;
  readonly details?: unknown;

  constructor(code: StockDomainErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'StockDomainError';
    this.code = code;
    this.details = serializeBigIntDecimal(details);
  }
}

export type AddToStockInput = {
  cooperativeId: bigint;
  materialId: bigint;
  amountKg: DecimalInput;
  createIfMissing?: boolean;
};

export type RecordSaleInput = {
  cooperativeId: bigint;
  materialId: bigint;
  amountKg: DecimalInput;
};

export type AdjustStockInput = {
  cooperativeId: bigint;
  materialId: bigint;
  deltaKg: DecimalInput;
};

export type BagStateDeltaInput = {
  previousCurrentKg: DecimalInput;
  reportedCurrentKg: DecimalInput;
  bagFull: boolean;
};

const ZERO = new Prisma.Decimal(0);

function parseStockDecimal(parse: () => Prisma.Decimal) {
  try {
    return parse();
  } catch (error) {
    if (error instanceof DecimalValidationError) {
      throw new StockDomainError('INVALID_STOCK_DECIMAL', error.message, {
        field: error.field,
      });
    }

    throw error;
  }
}

function parseStockDecimal2(value: DecimalInput, field: string) {
  return parseStockDecimal(() => parseDecimal2(value, field));
}

function parsePositiveStockDecimal2(value: DecimalInput, field: string) {
  return parseStockDecimal(() => parsePositiveDecimal2(value, field));
}

function parseNonNegativeStockDecimal2(value: DecimalInput, field: string) {
  return parseStockDecimal(() => parseNonNegativeDecimal2(value, field));
}

function sumDecimalRows(
  rows: LockedStockRow[],
  key: 'totalCollectedKg' | 'totalSoldKg' | 'currentStockKg',
) {
  return rows.reduce((sum, row) => sum.plus(row[key]), ZERO);
}

function rowToSnapshot(row: LockedStockRow): StockSnapshot {
  return {
    stockId: row.stockId,
    totalCollectedKg: row.totalCollectedKg,
    totalSoldKg: row.totalSoldKg,
    currentStockKg: row.currentStockKg,
  };
}

function assertNonNegativeStock(snapshot: StockSnapshot) {
  const invalidField = [
    ['totalCollectedKg', snapshot.totalCollectedKg],
    ['totalSoldKg', snapshot.totalSoldKg],
    ['currentStockKg', snapshot.currentStockKg],
  ].find(([, value]) => (value as Prisma.Decimal).lessThan(0));

  if (invalidField) {
    throw new StockDomainError(
      'STOCK_INVARIANT_VIOLATION',
      `Estoque inválido: ${invalidField[0]} não pode ser negativo`,
      snapshot,
    );
  }

  const physicalAvailableKg = snapshot.totalCollectedKg.minus(snapshot.totalSoldKg);
  if (snapshot.currentStockKg.greaterThan(physicalAvailableKg)) {
    throw new StockDomainError(
      'STOCK_INVARIANT_VIOLATION',
      'Estoque inválido: currentStockKg excede totalCollectedKg - totalSoldKg',
      {
        stockId: snapshot.stockId,
        currentStockKg: snapshot.currentStockKg,
        physicalAvailableKg,
      },
    );
  }
}

async function findStockSnapshot(
  tx: Prisma.TransactionClient,
  cooperativeId: bigint,
  materialId: bigint,
) {
  const rows = await tx.$queryRaw<LockedStockRow[]>`
    SELECT
      "Stock_id" AS "stockId",
      "Total_collected_KG" AS "totalCollectedKg",
      "Total_sold_KG" AS "totalSoldKg",
      "Current_stock_KG" AS "currentStockKg"
    FROM "Stock"
    WHERE "Cooperative" = ${cooperativeId}
      AND "Material" = ${materialId}
    ORDER BY "Stock_id" ASC
    LIMIT 1
  `;

  return rows[0] ? rowToSnapshot(rows[0]) : null;
}

export async function lockStockAggregateForUpdate(
  tx: Prisma.TransactionClient,
  cooperativeId: bigint,
  materialId: bigint,
): Promise<LockedStockAggregate | null> {
  const rows = await tx.$queryRaw<LockedStockRow[]>`
    SELECT
      "Stock_id" AS "stockId",
      "Total_collected_KG" AS "totalCollectedKg",
      "Total_sold_KG" AS "totalSoldKg",
      "Current_stock_KG" AS "currentStockKg"
    FROM "Stock"
    WHERE "Cooperative" = ${cooperativeId}
      AND "Material" = ${materialId}
    ORDER BY "Stock_id" ASC
    FOR UPDATE
  `;

  if (rows.length === 0) {
    return null;
  }

  return {
    primaryStockId: rows[0].stockId,
    duplicateStockIds: rows.slice(1).map((row) => row.stockId),
    totalCollectedKg: sumDecimalRows(rows, 'totalCollectedKg'),
    totalSoldKg: sumDecimalRows(rows, 'totalSoldKg'),
    currentStockKg: sumDecimalRows(rows, 'currentStockKg'),
    rowCount: rows.length,
  };
}

export async function updateLockedStockAggregate(
  tx: Prisma.TransactionClient,
  stock: LockedStockAggregate,
  nextValues: {
    currentStockKg: DecimalInput;
    totalSoldKg: DecimalInput;
    totalCollectedKg?: DecimalInput;
  },
) {
  const totalCollectedKg = parseNonNegativeStockDecimal2(
    nextValues.totalCollectedKg ?? stock.totalCollectedKg,
    'totalCollectedKg',
  );
  const totalSoldKg = parseNonNegativeStockDecimal2(nextValues.totalSoldKg, 'totalSoldKg');
  const currentStockKg = parseNonNegativeStockDecimal2(
    nextValues.currentStockKg,
    'currentStockKg',
  );

  assertNonNegativeStock({
    stockId: stock.primaryStockId,
    totalCollectedKg,
    totalSoldKg,
    currentStockKg,
  });

  await tx.stock.update({
    where: { stockId: stock.primaryStockId },
    data: {
      totalCollectedKg: formatDecimal(totalCollectedKg),
      totalSoldKg: formatDecimal(totalSoldKg),
      currentStockKg: formatDecimal(currentStockKg),
    },
  });

  if (stock.duplicateStockIds.length > 0) {
    await tx.stock.updateMany({
      where: { stockId: { in: stock.duplicateStockIds } },
      data: {
        totalCollectedKg: '0.00',
        totalSoldKg: '0.00',
        currentStockKg: '0.00',
      },
    });
  }
}

export function applyStockSnapshotDelta(
  snapshot: StockSnapshot,
  deltas: {
    currentDeltaKg?: DecimalInput;
    totalCollectedDeltaKg?: DecimalInput;
    totalSoldDeltaKg?: DecimalInput;
    requireCurrentAtLeastKg?: DecimalInput;
  },
): StockSnapshot {
  const currentDeltaKg = parseStockDecimal2(
    deltas.currentDeltaKg ?? '0.00',
    'currentDeltaKg',
  );
  const totalCollectedDeltaKg = parseStockDecimal2(
    deltas.totalCollectedDeltaKg ?? '0.00',
    'totalCollectedDeltaKg',
  );
  const totalSoldDeltaKg = parseStockDecimal2(
    deltas.totalSoldDeltaKg ?? '0.00',
    'totalSoldDeltaKg',
  );

  if (deltas.requireCurrentAtLeastKg !== undefined) {
    const required = parseNonNegativeStockDecimal2(
      deltas.requireCurrentAtLeastKg,
      'requireCurrentAtLeastKg',
    );
    if (snapshot.currentStockKg.lessThan(required)) {
      throw new StockDomainError(
        'INSUFFICIENT_STOCK',
        'Estoque insuficiente para a operação',
        {
          availableKg: snapshot.currentStockKg,
          requestedKg: required,
        },
      );
    }
  }

  const nextSnapshot = {
    stockId: snapshot.stockId,
    totalCollectedKg: snapshot.totalCollectedKg.plus(totalCollectedDeltaKg),
    totalSoldKg: snapshot.totalSoldKg.plus(totalSoldDeltaKg),
    currentStockKg: snapshot.currentStockKg.plus(currentDeltaKg),
  };

  assertNonNegativeStock(nextSnapshot);
  return nextSnapshot;
}

export async function addToStock(
  tx: Prisma.TransactionClient,
  input: AddToStockInput,
) {
  const amountKg = parsePositiveStockDecimal2(input.amountKg, 'amountKg');

  const rows = input.createIfMissing === false
    ? await tx.$queryRaw<LockedStockRow[]>`
        UPDATE "Stock"
        SET
          "Total_collected_KG" = "Total_collected_KG" + ${amountKg},
          "Current_stock_KG" = "Current_stock_KG" + ${amountKg}
        WHERE "Cooperative" = ${input.cooperativeId}
          AND "Material" = ${input.materialId}
        RETURNING
          "Stock_id" AS "stockId",
          "Total_collected_KG" AS "totalCollectedKg",
          "Total_sold_KG" AS "totalSoldKg",
          "Current_stock_KG" AS "currentStockKg"
      `
    : await tx.$queryRaw<LockedStockRow[]>`
        INSERT INTO "Stock" (
          "Cooperative",
          "Material",
          "Total_collected_KG",
          "Total_sold_KG",
          "Current_stock_KG"
        )
        VALUES (${input.cooperativeId}, ${input.materialId}, ${amountKg}, ${ZERO}, ${amountKg})
        ON CONFLICT ("Cooperative", "Material")
        DO UPDATE SET
          "Total_collected_KG" = "Stock"."Total_collected_KG" + EXCLUDED."Total_collected_KG",
          "Current_stock_KG" = "Stock"."Current_stock_KG" + EXCLUDED."Current_stock_KG"
        RETURNING
          "Stock_id" AS "stockId",
          "Total_collected_KG" AS "totalCollectedKg",
          "Total_sold_KG" AS "totalSoldKg",
          "Current_stock_KG" AS "currentStockKg"
      `;

  if (!rows[0]) {
    throw new StockDomainError('STOCK_MISSING', 'Estoque não encontrado', input);
  }

  const snapshot = rowToSnapshot(rows[0]);
  assertNonNegativeStock(snapshot);
  return snapshot;
}

export async function recordSale(
  tx: Prisma.TransactionClient,
  input: RecordSaleInput,
) {
  const amountKg = parsePositiveStockDecimal2(input.amountKg, 'amountKg');
  const rows = await tx.$queryRaw<LockedStockRow[]>`
    UPDATE "Stock"
    SET
      "Total_sold_KG" = "Total_sold_KG" + ${amountKg},
      "Current_stock_KG" = "Current_stock_KG" - ${amountKg}
    WHERE "Cooperative" = ${input.cooperativeId}
      AND "Material" = ${input.materialId}
      AND "Current_stock_KG" >= ${amountKg}
    RETURNING
      "Stock_id" AS "stockId",
      "Total_collected_KG" AS "totalCollectedKg",
      "Total_sold_KG" AS "totalSoldKg",
      "Current_stock_KG" AS "currentStockKg"
  `;

  if (rows[0]) {
    const snapshot = rowToSnapshot(rows[0]);
    assertNonNegativeStock(snapshot);
    return snapshot;
  }

  const existing = await findStockSnapshot(tx, input.cooperativeId, input.materialId);
  if (!existing) {
    throw new StockDomainError('STOCK_MISSING', 'Estoque não encontrado', input);
  }

  throw new StockDomainError('INSUFFICIENT_STOCK', 'Estoque insuficiente', {
    cooperativeId: input.cooperativeId,
    materialId: input.materialId,
    availableKg: existing.currentStockKg,
    requestedKg: amountKg,
  });
}

export async function adjustStock(
  tx: Prisma.TransactionClient,
  input: AdjustStockInput,
) {
  const deltaKg = parseStockDecimal2(input.deltaKg, 'deltaKg');

  if (deltaKg.isZero()) {
    const existing = await findStockSnapshot(tx, input.cooperativeId, input.materialId);
    if (!existing) {
      throw new StockDomainError('STOCK_MISSING', 'Estoque não encontrado', input);
    }
    return existing;
  }

  const rows = await tx.$queryRaw<LockedStockRow[]>`
    UPDATE "Stock"
    SET "Current_stock_KG" = "Current_stock_KG" - ${deltaKg}
    WHERE "Cooperative" = ${input.cooperativeId}
      AND "Material" = ${input.materialId}
      AND (
        (${deltaKg} > ${ZERO} AND "Current_stock_KG" >= ${deltaKg})
        OR (
          ${deltaKg} <= ${ZERO}
          AND "Current_stock_KG" - ${deltaKg} <= "Total_collected_KG" - "Total_sold_KG"
        )
      )
    RETURNING
      "Stock_id" AS "stockId",
      "Total_collected_KG" AS "totalCollectedKg",
      "Total_sold_KG" AS "totalSoldKg",
      "Current_stock_KG" AS "currentStockKg"
  `;

  if (rows[0]) {
    const snapshot = rowToSnapshot(rows[0]);
    assertNonNegativeStock(snapshot);
    return snapshot;
  }

  const existing = await findStockSnapshot(tx, input.cooperativeId, input.materialId);
  if (!existing) {
    throw new StockDomainError('STOCK_MISSING', 'Estoque não encontrado', input);
  }

  throw new StockDomainError('INSUFFICIENT_STOCK', 'Estoque insuficiente', {
    cooperativeId: input.cooperativeId,
    materialId: input.materialId,
    availableKg: existing.currentStockKg,
    requestedKg: deltaKg,
  });
}

export function calculateBagStateDelta(input: BagStateDeltaInput) {
  const previousCurrentKg = parseNonNegativeStockDecimal2(
    input.previousCurrentKg,
    'previousCurrentKg',
  );
  const reportedCurrentKg = parseNonNegativeStockDecimal2(
    input.reportedCurrentKg,
    'reportedCurrentKg',
  );
  const collectedDeltaKg = Prisma.Decimal.max(
    reportedCurrentKg.minus(previousCurrentKg),
    ZERO,
  );

  return {
    collectedDeltaKg,
    nextCurrentKg: input.bagFull ? ZERO : reportedCurrentKg,
    isBegun: !input.bagFull,
  };
}

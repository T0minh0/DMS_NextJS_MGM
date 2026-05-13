import { Prisma } from '@prisma/client';
import { decimalToNumber } from '@/lib/db-utils';

type LockedStockRow = {
  stockId: bigint;
  totalCollectedKg: Prisma.Decimal;
  totalSoldKg: Prisma.Decimal;
  currentStockKg: Prisma.Decimal;
};

export type LockedStockAggregate = {
  primaryStockId: bigint;
  duplicateStockIds: bigint[];
  totalCollectedKg: number;
  totalSoldKg: number;
  currentStockKg: number;
  rowCount: number;
};

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
    totalCollectedKg: rows.reduce(
      (sum, row) => sum + (decimalToNumber(row.totalCollectedKg) ?? 0),
      0,
    ),
    totalSoldKg: rows.reduce(
      (sum, row) => sum + (decimalToNumber(row.totalSoldKg) ?? 0),
      0,
    ),
    currentStockKg: rows.reduce(
      (sum, row) => sum + (decimalToNumber(row.currentStockKg) ?? 0),
      0,
    ),
    rowCount: rows.length,
  };
}

export async function updateLockedStockAggregate(
  tx: Prisma.TransactionClient,
  stock: LockedStockAggregate,
  nextValues: {
    currentStockKg: number;
    totalSoldKg: number;
  },
) {
  await tx.stock.update({
    where: { stockId: stock.primaryStockId },
    data: {
      totalCollectedKg: stock.totalCollectedKg.toFixed(2),
      totalSoldKg: nextValues.totalSoldKg.toFixed(2),
      currentStockKg: nextValues.currentStockKg.toFixed(2),
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

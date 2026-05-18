import { Prisma } from '@prisma/client';

export type LockedCollectiveSale = {
  collectiveSaleId: bigint;
  creatorCooperativeId: bigint;
  soldAt: Date | null;
  cancelledAt: Date | null;
  materialId: bigint;
  priceKg: Prisma.Decimal;
  totalWeight: Prisma.Decimal | null;
};

export async function lockCollectiveSaleForUpdate(
  tx: Prisma.TransactionClient,
  collectiveSaleId: bigint,
): Promise<LockedCollectiveSale | null> {
  const rows = await tx.$queryRaw<LockedCollectiveSale[]>`
    SELECT
      "collective_sale_id" AS "collectiveSaleId",
      "creator_cooperative_id" AS "creatorCooperativeId",
      "sold_at" AS "soldAt",
      "cancelled_at" AS "cancelledAt",
      "material_id" AS "materialId",
      "price_kg" AS "priceKg",
      "total_weight" AS "totalWeight"
    FROM "collective_sale"
    WHERE "collective_sale_id" = ${collectiveSaleId}
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

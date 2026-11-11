import { Prisma } from '@prisma/client';
import { formatDecimal } from '@/lib/decimal';

export type BagEffectState = { isBegun: boolean; currentKg: string };

export async function recordCollectionEffect(tx: Prisma.TransactionClient, input: {
  measurementId: bigint; cooperativeId: bigint; materialId: bigint; amount: Prisma.Decimal;
  bagBefore: { isBegun: boolean; currentKg: Prisma.Decimal };
  bagAfter: { isBegun: boolean; currentKg: Prisma.Decimal };
}) {
  const state = (bag: typeof input.bagBefore) => JSON.stringify({ isBegun: bag.isBegun, currentKg: formatDecimal(bag.currentKg) });
  await tx.$executeRaw`
    INSERT INTO measurement_effect (measurement_id,cooperative_id,material_id,collected_delta_kg,current_delta_kg,bag_before,bag_after,source)
    VALUES (${input.measurementId},${input.cooperativeId},${input.materialId},${input.amount},${input.amount},${state(input.bagBefore)}::jsonb,${state(input.bagAfter)}::jsonb,'web')
  `;
}

export async function recordImportedCollectionEffects(tx: Prisma.TransactionClient, input: {
  measurementIds: bigint[]; cooperativeId: bigint; includeCurrent: boolean;
}) {
  if (!input.measurementIds.length) return;
  await tx.$executeRaw`
    INSERT INTO measurement_effect (measurement_id,cooperative_id,material_id,collected_delta_kg,current_delta_kg,source)
    SELECT "Weighting_id",${input.cooperativeId},"Material","Weight_KG",
      CASE WHEN ${input.includeCurrent} THEN "Weight_KG" ELSE 0 END,'import'
    FROM "Measurments" WHERE "Weighting_id" IN (${Prisma.join(input.measurementIds)})
  `;
}

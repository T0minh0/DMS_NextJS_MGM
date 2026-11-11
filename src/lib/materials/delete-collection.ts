import { Prisma } from '@prisma/client';
import { AuthError, requirePermission, type AuthSession } from '@/lib/auth/shared';
import { formatDecimal, serializeBigIntDecimal } from '@/lib/decimal';
import type { BagEffectState } from './collection-effect';
import { lockStockAggregateForUpdate, updateLockedStockAggregate } from '@/lib/stock/ledger';

export class CollectionDeletionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = 'CollectionDeletionError';
  }
}

export function parseCollectionDeletion(id: string, body: unknown) {
  if (!/^[1-9]\d*$/.test(id) || BigInt(id) > BigInt('9223372036854775807')) {
    throw new CollectionDeletionError('INVALID_COLLECTION_ID', 'Pesagem inválida', 400);
  }
  const reason = body && typeof body === 'object' && !Array.isArray(body) && 'reason' in body
    && typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    throw new CollectionDeletionError('INVALID_DELETION_REASON', 'Informe o motivo da exclusão, entre 3 e 500 caracteres.', 400);
  }
  return { collectionId: BigInt(id), reason };
}

type DeleteCollectionInput = ReturnType<typeof parseCollectionDeletion> & {
  cooperativeId: bigint;
  session: AuthSession;
};

type Effect = { collectedDeltaKg: Prisma.Decimal; currentDeltaKg: Prisma.Decimal; bagBefore: BagEffectState | null; bagAfter: BagEffectState | null; source: string };

type Bag = { isBegun: boolean; currentKg: Prisma.Decimal; lastUpdated: Date };

function bagConflict(): never {
  throw new CollectionDeletionError('BAG_STATE_CONFLICT',
    'O estado do saco mudou ou não corresponde à pesagem. Atualize a página; se persistir, solicite uma correção assistida.', 409);
}

/** Caller must use one interactive transaction. Lock order matches both weighing writers: bag -> stock. */
export async function deleteCollection(tx: Prisma.TransactionClient, input: DeleteCollectionInput) {
  requirePermission(input.session, 'stock', 'delete', 'cooperative');
  if (input.session.role !== 'admin' && input.session.cooperativeId !== input.cooperativeId.toString()) {
    throw new AuthError('Cooperativa fora do escopo da sessão', 403, 'COOPERATIVE_SCOPE_DENIED');
  }
  const { reason } = parseCollectionDeletion(input.collectionId.toString(), { reason: input.reason });
  const where = { weightingId: input.collectionId, wastepickerRef: { cooperative: input.cooperativeId } };
  const initial = await tx.measurments.findFirst({ where });
  if (!initial) throw new CollectionDeletionError('COLLECTION_NOT_FOUND', 'Pesagem não encontrada nesta cooperativa.', 404);

  const effects = await tx.$queryRaw<Effect[]>`
    SELECT collected_delta_kg AS "collectedDeltaKg",current_delta_kg AS "currentDeltaKg",
      bag_before AS "bagBefore",bag_after AS "bagAfter",source FROM measurement_effect
    WHERE measurement_id=${initial.weightingId} AND cooperative_id=${input.cooperativeId} AND material_id=${initial.material}
  `;
  const effect = effects[0];
  if (!effect) throw new CollectionDeletionError('LEGACY_COLLECTION_UNSUPPORTED',
    'Esta pesagem antiga precisa de correção assistida para preservar o estoque e o saldo do saco.', 409);

  const bags = await tx.$queryRaw<Bag[]>`
    SELECT is_begun AS "isBegun", current_kg AS "currentKg", last_updated AS "lastUpdated"
    FROM material_bag_state
    WHERE cooperative_id=${input.cooperativeId} AND material_id=${initial.material}
    FOR UPDATE
  `;
  // A second delete may have waited on the bag. Re-read after locking the target.
  await tx.$queryRaw`SELECT "Weighting_id" FROM "Measurments" WHERE "Weighting_id"=${input.collectionId} FOR UPDATE`;
  const measurement = await tx.measurments.findFirst({ where });
  if (!measurement) throw new CollectionDeletionError('COLLECTION_NOT_FOUND', 'Esta pesagem já foi excluída.', 404);

  const latestBagMeasurements = await tx.$queryRaw<Array<{ id: bigint }>>`
    SELECT id FROM (
      SELECT m."Weighting_id" AS id,m."Time_stamp" AS date FROM "Measurments" m
      JOIN "Workers" w ON w."Worker_id"=m."Wastepicker"
      LEFT JOIN measurement_effect e ON e.measurement_id=m."Weighting_id"
      WHERE m."Material"=${measurement.material} AND w."Cooperative"=${input.cooperativeId}
        AND (e.measurement_id IS NULL OR e.bag_before IS NOT NULL)
      UNION ALL
      -- A historical deletion removes attribution/stock, but preserves its
      -- physical reading/reset. Keep it as a barrier against rewinding older events.
      SELECT a.measurement_id AS id,(a.measurement->>'date')::date AS date
      FROM collection_deletion_audit a JOIN measurement_effect e ON e.measurement_id=a.measurement_id
      WHERE a.cooperative_id=${input.cooperativeId} AND e.material_id=${measurement.material}
        AND e.bag_before IS NOT NULL AND a.after_state->>'bag_adjusted'='false'
    ) physical_events ORDER BY date DESC,id DESC LIMIT 1
  `;
  const bag = bags[0] ?? null;
  let nextBag: Bag | null = bag;
  if (effect.bagBefore && effect.bagAfter && latestBagMeasurements[0]?.id === measurement.weightingId) {
    if (!bag || bag.isBegun !== effect.bagAfter.isBegun || !bag.currentKg.equals(effect.bagAfter.currentKg)) bagConflict();
    nextBag = { ...bag, currentKg: new Prisma.Decimal(effect.bagBefore.currentKg), isBegun: effect.bagBefore.isBegun };
  }

  const stock = await lockStockAggregateForUpdate(tx, input.cooperativeId, measurement.material);
  const amount = measurement.weightKg;
  if (amount.lessThan(0)) throw new CollectionDeletionError('INVALID_MEASUREMENT_WEIGHT', 'Peso registrado inválido; solicite uma correção assistida.', 409);
  const collectedDelta = effect.collectedDeltaKg;
  const currentDelta = effect.currentDeltaKg;
  if (!collectedDelta.equals(amount)) throw new CollectionDeletionError('MEASUREMENT_EFFECT_CONFLICT', 'O efeito registrado não corresponde à pesagem. Solicite uma correção assistida.', 409);
  const stockAfter = stock ? {
    totalCollectedKg: stock.totalCollectedKg.minus(collectedDelta),
    totalSoldKg: stock.totalSoldKg,
    currentStockKg: stock.currentStockKg.minus(currentDelta),
  } : null;
  if ((amount.greaterThan(0) && !stockAfter) || (stockAfter && (
    stockAfter.currentStockKg.lessThan(0) || stockAfter.totalCollectedKg.lessThan(0)
    || stockAfter.currentStockKg.greaterThan(stockAfter.totalCollectedKg.minus(stockAfter.totalSoldKg))
  ))) {
    throw new CollectionDeletionError('INSUFFICIENT_STOCK', 'Não é possível excluir: o peso já foi vendido, reservado ou não está disponível no estoque.', 409);
  }
  if (stock && stockAfter) await updateLockedStockAggregate(tx, stock, stockAfter);
  if (nextBag && nextBag !== bag) {
    await tx.materialBagState.update({
      where: { cooperativeId_materialId: { cooperativeId: input.cooperativeId, materialId: measurement.material } },
      data: { currentKg: formatDecimal(nextBag.currentKg), isBegun: nextBag.isBegun },
    });
  }
  await tx.measurments.delete({ where: { weightingId: measurement.weightingId } });
  // Only existing summaries for this worker/material/date; never rebuild other cooperatives.
  await tx.$executeRaw`
    UPDATE "Worker_contributions" c SET "Weight_KG"=(
      SELECT COALESCE(SUM(m."Weight_KG"),0) FROM "Measurments" m
      WHERE m."Wastepicker"=c."Wastepicker" AND m."Material"=c."Material" AND c."Period" @> m."Time_stamp"
    ), "Last_updated"=CURRENT_DATE
    WHERE c.cooperative=${input.cooperativeId} AND c."Wastepicker"=${measurement.wastepicker}
      AND c."Material"=${measurement.material} AND c."Period" @> ${measurement.timeStamp}::date
  `;
  const snapshot = {
    id: measurement.weightingId.toString(), worker_id: measurement.wastepicker.toString(),
    material_id: measurement.material.toString(), device_id: measurement.device.toString(),
    weight_kg: formatDecimal(amount), date: measurement.timeStamp.toISOString().slice(0, 10), bag_full: measurement.bagFilled,
  };
  const beforeState = JSON.stringify(serializeBigIntDecimal({ bag, stock, effect }));
  const afterState = JSON.stringify(serializeBigIntDecimal({ bag: nextBag, stock: stockAfter, bag_adjusted: nextBag !== bag }));
  await tx.$executeRaw`
    INSERT INTO collection_deletion_audit (measurement_id,cooperative_id,actor_worker_id,actor_role,reason,measurement,before_state,after_state)
    VALUES (${measurement.weightingId},${input.cooperativeId},${BigInt(input.session.workerId)},${input.session.role},${reason},${JSON.stringify(snapshot)}::jsonb,${beforeState}::jsonb,${afterState}::jsonb)
  `;
  return { id: measurement.weightingId.toString(), removed_weight_kg: Number(formatDecimal(amount)), removed_current_stock_kg: Number(formatDecimal(currentDelta)), bag_adjusted: nextBag !== bag };
}

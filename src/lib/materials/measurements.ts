import { Prisma } from '@prisma/client';
import { AuthSession } from '@/lib/auth/shared';
import {
  DecimalInput,
  DecimalValidationError,
  decimalToJsonNumber,
  formatDecimal,
  parsePositiveDecimal2,
  serializeBigIntDecimal,
} from '@/lib/decimal';
import { addToStock, calculateBagStateDelta, StockDomainError } from '@/lib/stock/ledger';

export type MaterialDomainErrorCode =
  | 'INVALID_MATERIAL_MEASUREMENT'
  | 'WORKER_ROLE_REQUIRED'
  | 'WORKER_SCOPE_DENIED'
  | 'MATERIAL_NOT_FOUND'
  | 'WORKER_NOT_FOUND'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_SCOPE_DENIED'
  | 'STOCK_MISSING';

export class MaterialDomainError extends Error {
  readonly code: MaterialDomainErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: MaterialDomainErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = 'MaterialDomainError';
    this.code = code;
    this.status = status;
    this.details = serializeBigIntDecimal(details);
  }
}

export type InsertMaterialRequestBody = {
  materialId?: unknown;
  material_id?: unknown;
  workerId?: unknown;
  worker_id?: unknown;
  amount?: unknown;
  bagFull?: unknown;
  bag_full?: unknown;
  measuredAt?: unknown;
  measured_at?: unknown;
  timeStamp?: unknown;
  time_stamp?: unknown;
  deviceId?: unknown;
  device_id?: unknown;
};

export type ParsedInsertMaterialInput = {
  materialId: bigint;
  workerId: bigint;
  amountKg: Prisma.Decimal;
  bagFull: boolean;
  measuredAt: Date;
  deviceId: bigint;
};

export type RecordMaterialWeighingInput = ParsedInsertMaterialInput & {
  cooperativeId: bigint;
};

export type ManualStockInput = {
  cooperativeId: bigint;
  materialId: bigint;
  amountKg: unknown;
};

type LockedBagStateRow = {
  bagStateId: bigint;
  isBegun: boolean;
  currentKg: Prisma.Decimal;
  lastUpdated: Date;
};

function parseBigIntField(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      `${field} é obrigatório`,
      400,
      { field },
    );
  }

  try {
    return BigInt(String(value));
  } catch {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      `${field} deve ser um ID válido`,
      400,
      { field },
    );
  }
}

function parseBagFull(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  throw new MaterialDomainError(
    'INVALID_MATERIAL_MEASUREMENT',
    'bagFull deve ser booleano',
    400,
    { field: 'bagFull' },
  );
}

function parseMeasurementTimestamp(value: unknown) {
  if (value === null || value === undefined || value === '') {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      'measuredAt é obrigatório',
      400,
      { field: 'measuredAt' },
    );
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      'measuredAt deve ser uma data válida',
      400,
      { field: 'measuredAt' },
    );
  }

  // Reject future timestamps: a worker could set measuredAt far in the future,
  // which permanently blocks all weighings for that (cooperative, material) pair
  // because calculateBagStateDelta rejects readings older than lastUpdated.
  const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
  if (date.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      'measuredAt não pode ser no futuro',
      400,
      { field: 'measuredAt' },
    );
  }

  return date;
}

function parsePositiveKg(value: unknown, field: string) {
  try {
    return parsePositiveDecimal2(value as DecimalInput, field);
  } catch (error) {
    if (error instanceof DecimalValidationError) {
      throw new MaterialDomainError(
        'INVALID_MATERIAL_MEASUREMENT',
        `${field} deve ser maior que zero e ter no máximo 2 casas decimais`,
        400,
        { field },
      );
    }

    throw error;
  }
}

function assertRequestObject(body: unknown): asserts body is InsertMaterialRequestBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      'Corpo da pesagem deve ser um objeto JSON',
      400,
      { field: 'body' },
    );
  }
}

export function authorizeInsertMaterialSession(
  session: AuthSession,
  requestedWorkerId?: unknown,
) {
  if (session.role !== 'worker') {
    throw new MaterialDomainError(
      'WORKER_ROLE_REQUIRED',
      'Apenas trabalhadores podem registrar pesagem de material',
      403,
      { role: session.role },
    );
  }

  const workerId = requestedWorkerId === undefined || requestedWorkerId === null || requestedWorkerId === ''
    ? BigInt(session.workerId)
    : parseBigIntField(requestedWorkerId, 'workerId');

  if (workerId.toString() !== session.workerId) {
    throw new MaterialDomainError(
      'WORKER_SCOPE_DENIED',
      'Trabalhador fora do escopo da sessão',
      403,
      {
        sessionWorkerId: session.workerId,
        requestedWorkerId: workerId,
      },
    );
  }

  return {
    cooperativeId: BigInt(session.cooperativeId),
    workerId,
  };
}

export function parseInsertMaterialRequest(
  body: InsertMaterialRequestBody,
  session: AuthSession,
): RecordMaterialWeighingInput {
  assertRequestObject(body);
  const requestedWorkerId = body.workerId ?? body.worker_id;
  const authScope = authorizeInsertMaterialSession(session, requestedWorkerId);
  const measuredAt = parseMeasurementTimestamp(
    body.measuredAt ?? body.measured_at ?? body.timeStamp ?? body.time_stamp,
  );

  return {
    cooperativeId: authScope.cooperativeId,
    materialId: parseBigIntField(body.materialId ?? body.material_id, 'materialId'),
    workerId: authScope.workerId,
    amountKg: parsePositiveKg(body.amount, 'amount'),
    bagFull: parseBagFull(body.bagFull ?? body.bag_full),
    measuredAt,
    deviceId: parseBigIntField(body.deviceId ?? body.device_id, 'deviceId'),
  };
}

async function ensureBagStateLocked(
  tx: Prisma.TransactionClient,
  cooperativeId: bigint,
  materialId: bigint,
) {
  await tx.$executeRaw`
    INSERT INTO "material_bag_state" (
      "cooperative_id",
      "material_id",
      "is_begun",
      "current_kg",
      "last_updated"
    )
    VALUES (${cooperativeId}, ${materialId}, false, ${new Prisma.Decimal(0)}, TIMESTAMP '1970-01-01 00:00:00')
    ON CONFLICT ("cooperative_id", "material_id") DO NOTHING
  `;

  const rows = await tx.$queryRaw<LockedBagStateRow[]>`
    SELECT
      "bag_state_id" AS "bagStateId",
      "is_begun" AS "isBegun",
      "current_kg" AS "currentKg",
      "last_updated" AS "lastUpdated"
    FROM "material_bag_state"
    WHERE "cooperative_id" = ${cooperativeId}
      AND "material_id" = ${materialId}
    FOR UPDATE
  `;

  if (!rows[0]) {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      'Estado de saco não pôde ser bloqueado para atualização',
      500,
      { cooperativeId, materialId },
    );
  }

  return rows[0];
}

async function assertMaterialWorkerDevice(
  tx: Prisma.TransactionClient,
  input: RecordMaterialWeighingInput,
) {
  const [material, worker, device] = await Promise.all([
    tx.materials.findUnique({
      where: { materialId: input.materialId },
      select: { materialId: true },
    }),
    tx.workers.findUnique({
      where: { workerId: input.workerId },
      select: { workerId: true, cooperative: true },
    }),
    tx.devices.findUnique({
      where: { deviceId: input.deviceId },
      select: { deviceId: true, cooperativeId: true },
    }),
  ]);

  if (!material) {
    throw new MaterialDomainError(
      'MATERIAL_NOT_FOUND',
      'Material não encontrado',
      422,
      { materialId: input.materialId },
    );
  }

  if (!worker) {
    throw new MaterialDomainError(
      'WORKER_NOT_FOUND',
      'Trabalhador não encontrado',
      422,
      { workerId: input.workerId },
    );
  }

  if (worker.cooperative !== input.cooperativeId) {
    throw new MaterialDomainError(
      'WORKER_SCOPE_DENIED',
      'Trabalhador fora da cooperativa da sessão',
      403,
      {
        workerId: input.workerId,
        workerCooperativeId: worker.cooperative,
        cooperativeId: input.cooperativeId,
      },
    );
  }

  if (!device) {
    throw new MaterialDomainError(
      'DEVICE_NOT_FOUND',
      'Dispositivo não encontrado',
      422,
      { deviceId: input.deviceId },
    );
  }

  if (device.cooperativeId !== input.cooperativeId) {
    throw new MaterialDomainError(
      'DEVICE_SCOPE_DENIED',
      'Dispositivo fora da cooperativa da sessão',
      403,
      {
        deviceId: input.deviceId,
        deviceCooperativeId: device.cooperativeId,
        cooperativeId: input.cooperativeId,
      },
    );
  }
}

function mapStockError(error: unknown): never {
  if (error instanceof StockDomainError && error.code === 'STOCK_MISSING') {
    throw new MaterialDomainError(
      'STOCK_MISSING',
      'Não há estoque registrado para este material nesta cooperativa',
      422,
      error.details,
    );
  }

  if (error instanceof StockDomainError && error.code === 'INVALID_BAG_READING') {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      error.message,
      422,
      error.details,
    );
  }

  throw error;
}

export async function recordMaterialWeighing(
  tx: Prisma.TransactionClient,
  input: RecordMaterialWeighingInput,
) {
  await assertMaterialWorkerDevice(tx, input);

  const lockedBagState = await ensureBagStateLocked(
    tx,
    input.cooperativeId,
    input.materialId,
  );
  let delta: ReturnType<typeof calculateBagStateDelta>;
  try {
    delta = calculateBagStateDelta({
      previousCurrentKg: lockedBagState.currentKg,
      reportedCurrentKg: input.amountKg,
      previousUpdatedAt: lockedBagState.lastUpdated,
      reportedAt: input.measuredAt,
      bagFull: input.bagFull,
    });
  } catch (error) {
    mapStockError(error);
  }

  const measurement = await tx.measurments.create({
    data: {
      weightKg: formatDecimal(delta.collectedDeltaKg),
      timeStamp: input.measuredAt,
      wastepicker: input.workerId,
      material: input.materialId,
      device: input.deviceId,
      bagFilled: input.bagFull,
    },
    select: {
      weightingId: true,
      weightKg: true,
      timeStamp: true,
      wastepicker: true,
      material: true,
      device: true,
      bagFilled: true,
    },
  });

  await tx.materialBagState.update({
    where: {
      cooperativeId_materialId: {
        cooperativeId: input.cooperativeId,
        materialId: input.materialId,
      },
    },
    data: {
      isBegun: delta.isBegun,
      currentKg: formatDecimal(delta.nextCurrentKg),
      lastUpdated: input.measuredAt,
    },
  });

  let stockSnapshot = null;
  if (delta.collectedDeltaKg.greaterThan(0)) {
    try {
      stockSnapshot = await addToStock(tx, {
        cooperativeId: input.cooperativeId,
        materialId: input.materialId,
        amountKg: delta.collectedDeltaKg,
      });
    } catch (error) {
      mapStockError(error);
    }
  }

  return {
    measurement,
    bagState: {
      bagStateId: lockedBagState.bagStateId,
      isBegun: delta.isBegun,
      currentKg: delta.nextCurrentKg,
    },
    collectedDeltaKg: delta.collectedDeltaKg,
    stockSnapshot,
  };
}

export async function addManualStock(
  tx: Prisma.TransactionClient,
  input: ManualStockInput,
) {
  const amountKg = parsePositiveKg(input.amountKg, 'amount');

  const [cooperative, material] = await Promise.all([
    tx.cooperative.findUnique({
      where: { cooperativeId: input.cooperativeId },
      select: { cooperativeId: true },
    }),
    tx.materials.findUnique({
      where: { materialId: input.materialId },
      select: { materialId: true },
    }),
  ]);

  if (!cooperative) {
    throw new MaterialDomainError(
      'INVALID_MATERIAL_MEASUREMENT',
      'Cooperativa não encontrada',
      422,
      { cooperativeId: input.cooperativeId },
    );
  }

  if (!material) {
    throw new MaterialDomainError(
      'MATERIAL_NOT_FOUND',
      'Material não encontrado',
      422,
      { materialId: input.materialId },
    );
  }

  const stockSnapshot = await addToStock(tx, {
    cooperativeId: input.cooperativeId,
    materialId: input.materialId,
    amountKg,
  });

  return {
    stockSnapshot,
  };
}

export function serializeMaterialWeighingResult(
  result: Awaited<ReturnType<typeof recordMaterialWeighing>>,
) {
  return {
    measurement: {
      id: result.measurement.weightingId.toString(),
      worker_id: result.measurement.wastepicker.toString(),
      material_id: result.measurement.material.toString(),
      device_id: result.measurement.device.toString(),
      weight_kg: decimalToJsonNumber(result.measurement.weightKg),
      bag_full: result.measurement.bagFilled,
      time_stamp: result.measurement.timeStamp.toISOString(),
    },
    bag_state: {
      id: result.bagState.bagStateId.toString(),
      is_begun: result.bagState.isBegun,
      current_kg: decimalToJsonNumber(result.bagState.currentKg),
    },
    collected_delta_kg: decimalToJsonNumber(result.collectedDeltaKg),
    stock: result.stockSnapshot
      ? {
        id: result.stockSnapshot.stockId?.toString() ?? null,
        total_collected_kg: decimalToJsonNumber(result.stockSnapshot.totalCollectedKg),
        total_sold_kg: decimalToJsonNumber(result.stockSnapshot.totalSoldKg),
        current_stock_kg: decimalToJsonNumber(result.stockSnapshot.currentStockKg),
      }
      : null,
  };
}

export function serializeManualStockResult(
  result: Awaited<ReturnType<typeof addManualStock>>,
) {
  return {
    stock: {
      id: result.stockSnapshot.stockId?.toString() ?? null,
      total_collected_kg: decimalToJsonNumber(result.stockSnapshot.totalCollectedKg),
      total_sold_kg: decimalToJsonNumber(result.stockSnapshot.totalSoldKg),
      current_stock_kg: decimalToJsonNumber(result.stockSnapshot.currentStockKg),
    },
  };
}

import { Prisma, type PrismaClient } from '@prisma/client';
import { formatWorkerId } from '@/lib/db-utils';
import { decimalToJsonNumber, formatDecimal } from '@/lib/decimal';
import { mapDatabaseUserTypeToRole } from '@/lib/auth/shared';
import {
  ONBOARDING_COLUMNS,
  ONBOARDING_REQUIRED_COLUMNS,
  type OnboardingColumnKey,
  type OnboardingRowInput,
  type ResolvedOnboardingRow,
  type RowIssue,
  type StockMode,
  type ValidationReport,
  type ValidationRowReport,
} from './contract';
import {
  normalizeLookupText,
  parseBagState,
  parseCollectionDate,
  parseMaterialReference,
  parseWeightKg,
  parseWorkerReference,
  type ParsedCsv,
} from './csv';

export type OnboardingDbClient = Pick<PrismaClient, 'cooperative' | 'workers' | 'materials' | 'measurments'>;

export interface ReferenceWorkerRecord {
  workerId: bigint;
  wastepickerId: string;
  name: string;
  normalizedName: string;
  userType: string;
  enterDate: Date | null;
  exitDate: Date | null;
}

export interface ReferenceMaterialRecord {
  materialId: bigint;
  name: string;
  normalizedName: string;
  groupName: string | null;
}

export interface OnboardingReferenceData {
  cooperative: { id: bigint; name: string };
  workers: ReferenceWorkerRecord[];
  /** Global worker -> cooperative map (ids only) used for clearer cross-cooperative messages. */
  workerCooperativeById: Map<string, bigint>;
  materials: ReferenceMaterialRecord[];
}

export async function loadOnboardingReferenceData(
  db: Pick<OnboardingDbClient, 'cooperative' | 'workers' | 'materials'>,
  cooperativeId: bigint,
): Promise<OnboardingReferenceData | null> {
  const cooperative = await db.cooperative.findUnique({
    where: { cooperativeId },
    select: { cooperativeId: true, cooperativeName: true },
  });

  if (!cooperative) {
    return null;
  }

  const [workerRows, allWorkerRows, materialRows] = await Promise.all([
    db.workers.findMany({
      where: { cooperative: cooperativeId },
      select: { workerId: true, workerName: true, userType: true, enterDate: true, exitDate: true },
      orderBy: { workerName: 'asc' },
    }),
    db.workers.findMany({ select: { workerId: true, cooperative: true } }),
    db.materials.findMany({
      select: { materialId: true, materialName: true, group: { select: { groupName: true } } },
      orderBy: { materialName: 'asc' },
    }),
  ]);

  return {
    cooperative: { id: cooperative.cooperativeId, name: cooperative.cooperativeName },
    workers: workerRows.map((worker) => ({
      workerId: worker.workerId,
      wastepickerId: formatWorkerId(worker.workerId),
      name: worker.workerName,
      normalizedName: normalizeLookupText(worker.workerName),
      userType: worker.userType,
      enterDate: worker.enterDate ?? null,
      exitDate: worker.exitDate ?? null,
    })),
    workerCooperativeById: new Map(allWorkerRows.map((worker) => [worker.workerId.toString(), worker.cooperative])),
    materials: materialRows.map((material) => ({
      materialId: material.materialId,
      name: material.materialName,
      normalizedName: normalizeLookupText(material.materialName),
      groupName: material.group?.groupName ?? null,
    })),
  };
}

export function measurementKey(workerId: bigint, materialId: bigint, dateKey: string, weightKey: string) {
  return `${workerId.toString()}|${materialId.toString()}|${dateKey}|${weightKey}`;
}

/** Existing measurement fingerprints for the cooperative in the date range (duplicate detection). */
export async function loadExistingMeasurementKeys(
  db: Pick<OnboardingDbClient, 'measurments'>,
  cooperativeId: bigint,
  from: Date,
  toExclusive: Date,
) {
  const rows = await db.measurments.findMany({
    where: {
      wastepickerRef: { cooperative: cooperativeId },
      timeStamp: { gte: from, lt: toExclusive },
    },
    select: { wastepicker: true, material: true, timeStamp: true, weightKg: true },
  });

  const keys = new Map<string, number>();
  rows.forEach((row) => {
    const key = measurementKey(row.wastepicker, row.material, row.timeStamp.toISOString().slice(0, 10), formatDecimal(row.weightKg));
    keys.set(key, (keys.get(key) ?? 0) + 1);
  });
  return keys;
}

export interface ValidateOptions {
  today?: Date;
  stockMode: StockMode;
}

function fileIssue(code: string, message: string, field = 'arquivo'): RowIssue {
  return { field, code, message };
}

function rowIssue(field: string, code: string, message: string): RowIssue {
  return { field, code, message };
}

function emptyInput(): OnboardingRowInput {
  return { data_coleta: '', coletor: '', material: '', peso_kg: '', estado_sacola: '', observacao: '' };
}

/** Pure validation over an already-parsed CSV. No I/O. */
export function validateOnboardingRows(
  parsed: ParsedCsv,
  reference: OnboardingReferenceData,
  existingKeys: Map<string, number>,
  options: ValidateOptions,
): ValidationReport {
  const today = options.today ?? new Date();
  const fileErrors: RowIssue[] = [];
  const fileWarnings: RowIssue[] = [];
  const columnIndex = new Map<OnboardingColumnKey, number>();
  const knownColumns = new Set<string>(ONBOARDING_COLUMNS.map((column) => column.key));

  parsed.headers.forEach((header, index) => {
    if (knownColumns.has(header)) {
      columnIndex.set(header as OnboardingColumnKey, index);
    } else if (header) {
      fileWarnings.push(fileIssue('UNKNOWN_COLUMN', `Coluna "${header}" não faz parte do modelo e será ignorada.`, header));
    }
  });

  ONBOARDING_REQUIRED_COLUMNS.forEach((column) => {
    if (!columnIndex.has(column)) {
      fileErrors.push(fileIssue('MISSING_COLUMN', `Coluna obrigatória "${column}" não encontrada no cabeçalho.`, column));
    }
  });

  const workersById = new Map(reference.workers.map((worker) => [worker.workerId.toString(), worker]));
  const workersByName = new Map<string, ReferenceWorkerRecord[]>();
  reference.workers.forEach((worker) => {
    const list = workersByName.get(worker.normalizedName) ?? [];
    list.push(worker);
    workersByName.set(worker.normalizedName, list);
  });
  const materialsById = new Map(reference.materials.map((material) => [material.materialId.toString(), material]));
  const materialsByName = new Map<string, ReferenceMaterialRecord[]>();
  reference.materials.forEach((material) => {
    const list = materialsByName.get(material.normalizedName) ?? [];
    list.push(material);
    materialsByName.set(material.normalizedName, list);
  });

  const rows: ValidationRowReport[] = [];
  const okRows: ResolvedOnboardingRow[] = [];
  const fileKeyCounts = new Map<string, number>();
  let duplicateRows = 0;
  let warningRows = 0;
  let totalKg = new Prisma.Decimal(0);
  const byMaterial = new Map<string, { materialId: string; materialName: string; rows: number; totalKg: Prisma.Decimal }>();
  const byWorker = new Map<string, { workerId: string; wastepickerId: string; workerName: string; rows: number; totalKg: Prisma.Decimal }>();
  const dateKeys: string[] = [];

  if (fileErrors.length === 0) {
    const read = (cells: string[], column: OnboardingColumnKey) => {
      const index = columnIndex.get(column);
      return index === undefined ? '' : (cells[index] ?? '');
    };

    parsed.rows.forEach((record) => {
      const input: OnboardingRowInput = {
        ...emptyInput(),
        data_coleta: read(record.cells, 'data_coleta'),
        coletor: read(record.cells, 'coletor'),
        material: read(record.cells, 'material'),
        peso_kg: read(record.cells, 'peso_kg'),
        estado_sacola: read(record.cells, 'estado_sacola'),
        observacao: read(record.cells, 'observacao'),
      };
      const errors: RowIssue[] = [];
      const warnings: RowIssue[] = [];

      const date = parseCollectionDate(input.data_coleta, today);
      if (!date.ok) errors.push(date.issue);

      let worker: ReferenceWorkerRecord | null = null;
      const workerReference = parseWorkerReference(input.coletor);
      if (workerReference.kind === 'empty') {
        errors.push(rowIssue('coletor', 'MISSING_REQUIRED', 'Informe o catador (WP005 ou nome).'));
      } else if (workerReference.kind === 'id') {
        worker = workersById.get(workerReference.workerId.toString()) ?? null;
        if (!worker) {
          const otherCooperative = reference.workerCooperativeById.get(workerReference.workerId.toString());
          if (otherCooperative !== undefined) {
            errors.push(rowIssue('coletor', 'WORKER_OUTSIDE_COOPERATIVE', `Catador ${formatWorkerId(workerReference.workerId)} pertence a outra cooperativa.`));
          } else {
            errors.push(rowIssue('coletor', 'WORKER_NOT_FOUND', `Catador ${formatWorkerId(workerReference.workerId)} não encontrado.`));
          }
        }
      } else {
        const candidates = workersByName.get(workerReference.normalized) ?? [];
        if (candidates.length === 1) {
          worker = candidates[0];
        } else if (candidates.length > 1) {
          errors.push(rowIssue('coletor', 'WORKER_AMBIGUOUS', `Mais de um catador chamado "${input.coletor.trim()}"; use o identificador WP.`));
        } else {
          errors.push(rowIssue('coletor', 'WORKER_NOT_FOUND', `Catador "${input.coletor.trim()}" não encontrado na cooperativa.`));
        }
      }

      if (worker && mapDatabaseUserTypeToRole(worker.userType) !== 'worker') {
        errors.push(rowIssue('coletor', 'WORKER_NOT_WASTEPICKER', `${worker.wastepickerId} não é catador (usuário de gestão).`));
        worker = null;
      }

      let material: ReferenceMaterialRecord | null = null;
      const materialReference = parseMaterialReference(input.material);
      if (materialReference.kind === 'empty') {
        errors.push(rowIssue('material', 'MISSING_REQUIRED', 'Informe o material.'));
      } else if (materialReference.kind === 'id') {
        material = materialsById.get(materialReference.materialId.toString()) ?? null;
        if (!material) errors.push(rowIssue('material', 'MATERIAL_NOT_FOUND', `Material ${materialReference.materialId.toString()} não encontrado.`));
      } else {
        const candidates = materialsByName.get(materialReference.normalized) ?? [];
        if (candidates.length === 1) {
          material = candidates[0];
        } else if (candidates.length > 1) {
          errors.push(rowIssue('material', 'MATERIAL_AMBIGUOUS', `Mais de um material chamado "${input.material.trim()}"; use o ID.`));
        } else {
          errors.push(rowIssue('material', 'MATERIAL_NOT_FOUND', `Material "${input.material.trim()}" não encontrado.`));
        }
      }

      const weight = parseWeightKg(input.peso_kg);
      if (!weight.ok) errors.push(weight.issue);

      const bagState = parseBagState(input.estado_sacola);
      if (!bagState.ok) errors.push(bagState.issue);

      let resolved: ResolvedOnboardingRow | null = null;

      if (errors.length === 0 && date.ok && worker && material && weight.ok && bagState.ok) {
        if (worker.exitDate) {
          warnings.push(rowIssue('coletor', 'WORKER_EXITED', `${worker.wastepickerId} está desligado; a coleta histórica será aceita mesmo assim.`));
        }
        if (
          (worker.enterDate && date.date.getTime() < worker.enterDate.getTime()) ||
          (worker.exitDate && date.date.getTime() > worker.exitDate.getTime())
        ) {
          warnings.push(rowIssue('data_coleta', 'DATE_OUTSIDE_WORKER_TENURE', `Data fora do período de vínculo de ${worker.wastepickerId}.`));
        }

        const weightKey = formatDecimal(weight.weightKg);
        const key = measurementKey(worker.workerId, material.materialId, date.dateKey, weightKey);
        const seenInFile = fileKeyCounts.get(key) ?? 0;
        fileKeyCounts.set(key, seenInFile + 1);
        if (seenInFile > 0) {
          warnings.push(rowIssue('arquivo', 'DUPLICATE_IN_FILE', 'Linha idêntica a outra linha deste arquivo.'));
        }
        if ((existingKeys.get(key) ?? 0) > 0) {
          warnings.push(rowIssue('arquivo', 'DUPLICATE_IN_DATABASE', 'Já existe uma coleta igual (catador, material, data e peso) no banco.'));
          duplicateRows += 1;
        }

        resolved = {
          line: record.line,
          date: date.date,
          dateKey: date.dateKey,
          workerId: worker.workerId,
          wastepickerId: worker.wastepickerId,
          workerName: worker.name,
          materialId: material.materialId,
          materialName: material.name,
          weightKg: weight.weightKg,
          weightKey,
          bagFilled: bagState.bagFilled,
        };
        okRows.push(resolved);
        totalKg = totalKg.plus(weight.weightKg);
        dateKeys.push(date.dateKey);

        const materialEntry = byMaterial.get(material.materialId.toString()) ?? {
          materialId: material.materialId.toString(),
          materialName: material.name,
          rows: 0,
          totalKg: new Prisma.Decimal(0),
        };
        materialEntry.rows += 1;
        materialEntry.totalKg = materialEntry.totalKg.plus(weight.weightKg);
        byMaterial.set(material.materialId.toString(), materialEntry);

        const workerEntry = byWorker.get(worker.workerId.toString()) ?? {
          workerId: worker.workerId.toString(),
          wastepickerId: worker.wastepickerId,
          workerName: worker.name,
          rows: 0,
          totalKg: new Prisma.Decimal(0),
        };
        workerEntry.rows += 1;
        workerEntry.totalKg = workerEntry.totalKg.plus(weight.weightKg);
        byWorker.set(worker.workerId.toString(), workerEntry);
      }

      if (warnings.length > 0) warningRows += 1;

      rows.push({
        line: record.line,
        status: errors.length === 0 ? 'ok' : 'error',
        errors,
        warnings,
        input,
        resolved,
      });
    });
  }

  const invalidRows = rows.filter((row) => row.status === 'error').length;
  const sortedDates = [...dateKeys].sort();
  const canApply = fileErrors.length === 0 && invalidRows === 0 && okRows.length > 0;

  return {
    fileErrors,
    fileWarnings,
    summary: {
      totalRows: rows.length,
      validRows: okRows.length,
      invalidRows,
      warningRows,
      duplicateRows,
      totalKg: decimalToJsonNumber(totalKg),
      dateRange: sortedDates.length > 0 ? { from: sortedDates[0], to: sortedDates[sortedDates.length - 1] } : null,
      affectedYearMonths: Array.from(new Set(sortedDates.map((key) => key.slice(0, 7)))).sort(),
      byMaterial: Array.from(byMaterial.values())
        .map((entry) => ({ ...entry, totalKg: decimalToJsonNumber(entry.totalKg) }))
        .sort((left, right) => right.totalKg - left.totalKg),
      byWorker: Array.from(byWorker.values())
        .map((entry) => ({ ...entry, totalKg: decimalToJsonNumber(entry.totalKg) }))
        .sort((left, right) => right.totalKg - left.totalKg),
      stockMode: options.stockMode,
    },
    rows,
    okRows,
    canApply,
    requiresForce: canApply && duplicateRows > 0,
  };
}

/** Date bounds of the parseable rows (used to scope the duplicate lookup). */
export function collectDateBounds(parsed: ParsedCsv, today: Date = new Date()) {
  const index = parsed.headers.indexOf('data_coleta');
  if (index === -1) {
    return null;
  }

  let min: Date | null = null;
  let max: Date | null = null;
  parsed.rows.forEach((record) => {
    const result = parseCollectionDate(record.cells[index] ?? '', today);
    if (!result.ok) return;
    if (!min || result.date < min) min = result.date;
    if (!max || result.date > max) max = result.date;
  });

  if (!min || !max) {
    return null;
  }

  return { from: min as Date, toExclusive: new Date((max as Date).getTime() + 86_400_000) };
}

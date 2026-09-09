import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/**
 * Contract for the hidden admin historical import ("onboarding").
 * Column names are the template headers; the parser is tolerant with
 * delimiters, decimal separators and date formats produced by pt-BR Excel.
 */

export const ONBOARDING_COLUMNS = [
  { key: 'data_coleta', required: true, description: 'Data da coleta no formato DD/MM/AAAA (aceita AAAA-MM-DD)', example: '15/03/2024' },
  { key: 'coletor', required: true, description: 'Identificador do catador (WP005 ou 5) ou nome exato, se for único na cooperativa', example: 'WP005' },
  { key: 'material', required: true, description: 'Nome do material (sem diferenciar acento/caixa) ou ID', example: 'Papelão' },
  { key: 'peso_kg', required: true, description: 'Peso coletado em kg, maior que zero, até 2 casas (aceita vírgula)', example: '12,50' },
  { key: 'estado_sacola', required: true, description: 'cheia ou vazia (também sim/não, 1/0)', example: 'cheia' },
  { key: 'observacao', required: false, description: 'Texto livre; aparece só na pré-visualização e não é gravado', example: 'caderno 2024' },
] as const;

export type OnboardingColumnKey = (typeof ONBOARDING_COLUMNS)[number]['key'];

export const ONBOARDING_REQUIRED_COLUMNS = ONBOARDING_COLUMNS
  .filter((column) => column.required)
  .map((column) => column.key);

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 10_000;
export const OK_ROWS_PREVIEW_LIMIT = 500;
export const MIN_COLLECTION_DATE = new Date(Date.UTC(2000, 0, 1));
export const CONFIRMATION_TTL_MS = 30 * 60 * 1000;
export const TEMPLATE_DELIMITER = ';';
export const TEMPLATE_EXAMPLE_WORKER = 'WP000';
export const TEMPLATE_EXAMPLE_NOTE = 'EXEMPLO - apague esta linha antes de importar';
export const UTF8_BOM = '\uFEFF';

export type StockMode = 'collected_only' | 'collected_and_current';
export const STOCK_MODES: StockMode[] = ['collected_only', 'collected_and_current'];
export const DEFAULT_STOCK_MODE: StockMode = 'collected_only';

export type OnboardingMode = 'validate' | 'apply';

export interface RowIssue {
  field: string;
  code: string;
  message: string;
}

export interface OnboardingRowInput {
  data_coleta: string;
  coletor: string;
  material: string;
  peso_kg: string;
  estado_sacola: string;
  observacao: string;
}

export interface ResolvedOnboardingRow {
  line: number;
  date: Date;
  dateKey: string;
  workerId: bigint;
  wastepickerId: string;
  workerName: string;
  materialId: bigint;
  materialName: string;
  weightKg: Prisma.Decimal;
  weightKey: string;
  bagFilled: boolean;
}

export interface ValidationRowReport {
  line: number;
  status: 'ok' | 'error';
  errors: RowIssue[];
  warnings: RowIssue[];
  input: OnboardingRowInput;
  resolved: ResolvedOnboardingRow | null;
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  duplicateRows: number;
  totalKg: number;
  dateRange: { from: string; to: string } | null;
  affectedYearMonths: string[];
  byMaterial: Array<{ materialId: string; materialName: string; rows: number; totalKg: number }>;
  byWorker: Array<{ workerId: string; wastepickerId: string; workerName: string; rows: number; totalKg: number }>;
  stockMode: StockMode;
}

export interface ValidationReport {
  fileErrors: RowIssue[];
  fileWarnings: RowIssue[];
  summary: ValidationSummary;
  rows: ValidationRowReport[];
  okRows: ResolvedOnboardingRow[];
  canApply: boolean;
  requiresForce: boolean;
}

function escapeCsvCell(value: string) {
  if (/[";\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCsvRows(rows: string[][], delimiter = TEMPLATE_DELIMITER) {
  return rows.map((row) => row.map(escapeCsvCell).join(delimiter)).join('\r\n');
}

/** UTF-8 BOM + `sep=;` line so pt-BR Excel opens the file with the right delimiter. */
export function buildTemplateCsv() {
  const header = ONBOARDING_COLUMNS.map((column) => column.key);
  const example = ['15/03/2024', TEMPLATE_EXAMPLE_WORKER, 'Papelão', '12,50', 'cheia', TEMPLATE_EXAMPLE_NOTE];
  return `${UTF8_BOM}sep=${TEMPLATE_DELIMITER}\r\n${serializeCsvRows([header, example])}\r\n`;
}

export interface ReferenceWorker {
  wastepickerId: string;
  name: string;
  exitDate: Date | null;
}

export interface ReferenceMaterial {
  materialId: string;
  name: string;
  groupName: string | null;
}

function formatReferenceDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(date);
}

/** Reference sheet with the valid collectors and materials for the cooperative. No PII. */
export function buildReferenceCsv(workers: ReferenceWorker[], materials: ReferenceMaterial[]) {
  const rows: string[][] = [['tipo', 'id', 'nome', 'detalhe']];
  workers.forEach((worker) => {
    rows.push([
      'coletor',
      worker.wastepickerId,
      worker.name,
      worker.exitDate ? `desligado em ${formatReferenceDate(worker.exitDate)}` : 'ativo',
    ]);
  });
  materials.forEach((material) => {
    rows.push(['material', material.materialId, material.name, material.groupName ?? 'sem grupo']);
  });
  return `${UTF8_BOM}sep=${TEMPLATE_DELIMITER}\r\n${serializeCsvRows(rows)}\r\n`;
}

export interface ConfirmationPayload {
  sha256: string;
  cooperativeId: string;
  stockMode: StockMode;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

/**
 * Stateless confirmation token: apply only proceeds for the exact file,
 * cooperative and stock mode that were validated, within a short TTL.
 */
export function signConfirmationToken(payload: ConfirmationPayload, secret: string, now: Date = new Date()) {
  const expiresAt = now.getTime() + CONFIRMATION_TTL_MS;
  const encoded = base64UrlEncode(JSON.stringify({ ...payload, exp: expiresAt }));
  return { token: `${encoded}.${signPayload(encoded, secret)}`, expiresAt: new Date(expiresAt) };
}

export type ConfirmationVerification =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'mismatch' };

export function verifyConfirmationToken(
  token: string | null | undefined,
  expected: ConfirmationPayload,
  secret: string,
  now: Date = new Date(),
): ConfirmationVerification {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'invalid' };
  }

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) {
    return { ok: false, reason: 'invalid' };
  }

  const expectedSignature = signPayload(encoded, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: 'invalid' };
  }

  let decoded: Partial<ConfirmationPayload & { exp: number }>;
  try {
    decoded = JSON.parse(base64UrlDecode(encoded)) as Partial<ConfirmationPayload & { exp: number }>;
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (typeof decoded.exp !== 'number' || decoded.exp < now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  if (
    decoded.sha256 !== expected.sha256 ||
    decoded.cooperativeId !== expected.cooperativeId ||
    decoded.stockMode !== expected.stockMode
  ) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true };
}

export function isStockMode(value: unknown): value is StockMode {
  return typeof value === 'string' && (STOCK_MODES as string[]).includes(value);
}

export function isOnboardingMode(value: unknown): value is OnboardingMode {
  return value === 'validate' || value === 'apply';
}

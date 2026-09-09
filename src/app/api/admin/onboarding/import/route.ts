import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, requireScopedPermission, requireStrictAdmin } from '@/lib/auth/server';
import { getJwtSecret } from '@/lib/auth/secret';
import {
  apiErrorResponse,
  apiInternalErrorResponse,
  apiRequestErrorResponse,
  readJsonBody,
} from '@/lib/api/errors';
import { rebuildWorkerContributions } from '@/lib/contributions/rebuild';
import {
  DEFAULT_STOCK_MODE,
  MAX_CSV_BYTES,
  MAX_ROWS,
  OK_ROWS_PREVIEW_LIMIT,
  ONBOARDING_COLUMNS,
  STOCK_MODES,
  isOnboardingMode,
  isStockMode,
  signConfirmationToken,
  verifyConfirmationToken,
  type ValidationReport,
} from '@/lib/onboarding/contract';
import { CsvParseError, detectMojibake, parseCsv, sha256Hex } from '@/lib/onboarding/csv';
import {
  OnboardingImportError,
  applyOnboardingImport,
  buildOnboardingImportPlan,
  listGamificationFollowUps,
  serializeImportResult,
} from '@/lib/onboarding/import';
import {
  collectDateBounds,
  loadExistingMeasurementKeys,
  loadOnboardingReferenceData,
  validateOnboardingRows,
} from '@/lib/onboarding/validate';
import { createLogContext, logInfo, logWarn, type LogContext } from '@/lib/observability/logger';
import { StockDomainError } from '@/lib/stock/ledger';

export const runtime = 'nodejs';

type ImportBody = {
  cooperative_id?: unknown;
  csv?: unknown;
  mode?: unknown;
  stock_mode?: unknown;
  confirmation_token?: unknown;
  force?: unknown;
};

function serializeReport(report: ValidationReport) {
  const okRows = report.rows.filter((row) => row.status === 'ok' && row.warnings.length === 0);
  const flaggedRows = report.rows.filter((row) => row.status !== 'ok' || row.warnings.length > 0);
  const previewRows = [...flaggedRows, ...okRows.slice(0, OK_ROWS_PREVIEW_LIMIT)].sort((left, right) => left.line - right.line);

  return {
    file_errors: report.fileErrors,
    file_warnings: report.fileWarnings,
    summary: {
      total_rows: report.summary.totalRows,
      valid_rows: report.summary.validRows,
      invalid_rows: report.summary.invalidRows,
      warning_rows: report.summary.warningRows,
      duplicate_rows: report.summary.duplicateRows,
      total_kg: report.summary.totalKg,
      date_range: report.summary.dateRange,
      affected_year_months: report.summary.affectedYearMonths,
      by_material: report.summary.byMaterial.map((entry) => ({
        material_id: entry.materialId,
        material_name: entry.materialName,
        rows: entry.rows,
        total_kg: entry.totalKg,
      })),
      by_worker: report.summary.byWorker.map((entry) => ({
        worker_id: entry.workerId,
        wastepicker_id: entry.wastepickerId,
        worker_name: entry.workerName,
        rows: entry.rows,
        total_kg: entry.totalKg,
      })),
      stock_mode: report.summary.stockMode,
    },
    rows: previewRows.map((row) => ({
      line: row.line,
      status: row.status,
      errors: row.errors,
      warnings: row.warnings,
      input: row.input,
      resolved: row.resolved
        ? {
          date: row.resolved.dateKey,
          worker: { id: row.resolved.workerId.toString(), wastepicker_id: row.resolved.wastepickerId, name: row.resolved.workerName },
          material: { id: row.resolved.materialId.toString(), name: row.resolved.materialName },
          weight_kg: Number(row.resolved.weightKey),
          bag_filled: row.resolved.bagFilled,
        }
        : null,
    })),
    rows_truncated: okRows.length > OK_ROWS_PREVIEW_LIMIT,
    can_apply: report.canApply,
    requires_force: report.requiresForce,
  };
}

function rejected(context: LogContext, code: string, status: number, message: string, extra: Record<string, unknown> = {}) {
  logWarn('onboarding.import.rejected', context, { code, status, ...extra });
  return apiErrorResponse({ message, code, status, requestId: context.requestId });
}

export async function GET(request: Request) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/admin/onboarding/import' });

  try {
    const session = await requireStrictAdmin();
    requireScopedPermission(session, 'stock', 'manage', 'global');

    return NextResponse.json({
      enabled: true,
      limits: { max_bytes: MAX_CSV_BYTES, max_rows: MAX_ROWS, ok_rows_preview_limit: OK_ROWS_PREVIEW_LIMIT },
      stock_modes: STOCK_MODES,
      default_stock_mode: DEFAULT_STOCK_MODE,
      columns: ONBOARDING_COLUMNS,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao consultar a importação histórica',
      code: 'ONBOARDING_IMPORT_FAILED',
      context,
      event: 'onboarding.import.failed',
      error,
    });
  }
}

export async function POST(request: Request) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/admin/onboarding/import' });

  try {
    const session = await requireStrictAdmin();
    requireScopedPermission(session, 'stock', 'manage', 'global');

    const body = await readJsonBody(request) as ImportBody;

    let cooperativeId: bigint;
    try {
      if (body.cooperative_id === undefined || body.cooperative_id === null || body.cooperative_id === '') throw new Error('missing');
      cooperativeId = BigInt(String(body.cooperative_id));
    } catch {
      return rejected(context, 'ONBOARDING_COOPERATIVE_REQUIRED', 400, 'Informe a cooperativa (cooperative_id).');
    }

    if (!isOnboardingMode(body.mode)) {
      return rejected(context, 'ONBOARDING_INVALID_MODE', 400, 'mode deve ser "validate" ou "apply".');
    }
    const mode = body.mode;

    const stockMode = body.stock_mode === undefined || body.stock_mode === null || body.stock_mode === ''
      ? DEFAULT_STOCK_MODE
      : body.stock_mode;
    if (!isStockMode(stockMode)) {
      return rejected(context, 'ONBOARDING_INVALID_STOCK_MODE', 400, 'stock_mode inválido.');
    }

    if (typeof body.csv !== 'string' || body.csv.trim() === '') {
      return rejected(context, 'ONBOARDING_CSV_REQUIRED', 400, 'Envie o conteúdo do CSV em "csv".');
    }
    const csv = body.csv;
    const csvBytes = Buffer.byteLength(csv, 'utf8');
    if (csvBytes > MAX_CSV_BYTES) {
      return rejected(context, 'ONBOARDING_FILE_TOO_LARGE', 413, `Arquivo maior que ${Math.round(MAX_CSV_BYTES / 1024 / 1024)} MB.`, { bytes: csvBytes });
    }

    const reference = await loadOnboardingReferenceData(prisma, cooperativeId);
    if (!reference) {
      return rejected(context, 'COOPERATIVE_NOT_FOUND', 404, 'Cooperativa não encontrada');
    }

    const sha256 = sha256Hex(csv);
    const now = new Date();
    const encodingOk = !detectMojibake(csv);
    const cooperativeSummary = { id: reference.cooperative.id.toString(), name: reference.cooperative.name };
    let report: ValidationReport;
    let delimiter = ';';
    let rowCount = 0;

    try {
      const parsed = parseCsv(csv);
      delimiter = parsed.delimiter;
      rowCount = parsed.rows.length;

      if (parsed.rows.length > MAX_ROWS) {
        return rejected(context, 'ONBOARDING_TOO_MANY_ROWS', 413, `Arquivo com mais de ${MAX_ROWS} linhas.`, { rows: parsed.rows.length });
      }

      const bounds = collectDateBounds(parsed, now);
      const existingKeys = bounds
        ? await loadExistingMeasurementKeys(prisma, cooperativeId, bounds.from, bounds.toExclusive)
        : new Map<string, number>();
      report = validateOnboardingRows(parsed, reference, existingKeys, { today: now, stockMode });

      if (!encodingOk) {
        report.fileErrors.push({
          field: 'arquivo',
          code: 'ENCODING_INVALID',
          message: 'O arquivo parece estar em outra codificação. Salve o arquivo como CSV UTF-8 e envie novamente.',
        });
        report.canApply = false;
        report.requiresForce = false;
      }
    } catch (error) {
      if (error instanceof CsvParseError) {
        return NextResponse.json({
          mode,
          cooperative: cooperativeSummary,
          file: { delimiter, row_count: 0, sha256, encoding_ok: encodingOk },
          file_errors: [{ field: 'arquivo', code: error.code, message: error.message }],
          file_warnings: [],
          summary: null,
          rows: [],
          rows_truncated: false,
          can_apply: false,
          requires_force: false,
          confirmation_token: null,
          confirmation_expires_at: null,
        });
      }
      throw error;
    }

    const serialized = serializeReport(report);
    const fileSummary = { delimiter, row_count: rowCount, sha256, encoding_ok: encodingOk };
    const confirmationPayload = { sha256, cooperativeId: cooperativeId.toString(), stockMode };

    if (mode === 'validate') {
      const confirmation = report.canApply ? signConfirmationToken(confirmationPayload, getJwtSecret(), now) : null;

      logInfo('onboarding.import.validated', context, {
        cooperativeId: cooperativeId.toString(),
        totalRows: report.summary.totalRows,
        validRows: report.summary.validRows,
        invalidRows: report.summary.invalidRows,
        duplicateRows: report.summary.duplicateRows,
        totalKg: report.summary.totalKg,
      });

      return NextResponse.json({
        mode,
        cooperative: cooperativeSummary,
        file: fileSummary,
        ...serialized,
        confirmation_token: confirmation?.token ?? null,
        confirmation_expires_at: confirmation?.expiresAt.toISOString() ?? null,
      });
    }

    const verification = verifyConfirmationToken(
      typeof body.confirmation_token === 'string' ? body.confirmation_token : null,
      confirmationPayload,
      getJwtSecret(),
      now,
    );
    if (!verification.ok) {
      if (verification.reason === 'expired') {
        return rejected(context, 'ONBOARDING_CONFIRMATION_EXPIRED', 409, 'A confirmação expirou. Valide o arquivo novamente.');
      }
      if (verification.reason === 'mismatch') {
        return rejected(context, 'ONBOARDING_CONFIRMATION_MISMATCH', 409, 'O arquivo, a cooperativa ou o modo de estoque mudaram desde a validação. Valide novamente.');
      }
      return rejected(context, 'ONBOARDING_CONFIRMATION_REQUIRED', 400, 'Valide o arquivo antes de confirmar a importação.');
    }

    if (!report.canApply) {
      return rejected(
        context,
        'ONBOARDING_INVALID_ROWS',
        422,
        `O arquivo tem ${report.summary.invalidRows} linhas inválidas ou erros de arquivo; corrija e valide novamente.`,
        { invalidRows: report.summary.invalidRows, fileErrors: report.fileErrors.length },
      );
    }

    if (report.summary.duplicateRows > 0 && report.summary.duplicateRows === report.summary.validRows) {
      return rejected(context, 'ONBOARDING_ALREADY_IMPORTED', 409, 'Todas as linhas já existem no banco; este arquivo já foi importado.');
    }

    if (report.requiresForce && body.force !== true) {
      return rejected(
        context,
        'ONBOARDING_DUPLICATES_REQUIRE_FORCE',
        409,
        `${report.summary.duplicateRows} linhas já existem no banco. Confirme explicitamente a reimportação (force).`,
        { duplicateRows: report.summary.duplicateRows },
      );
    }

    const plan = buildOnboardingImportPlan(report, cooperativeId, stockMode);
    const result = await applyOnboardingImport(prisma, plan);

    logInfo('onboarding.import.applied', context, {
      cooperativeId: cooperativeId.toString(),
      measurementCount: result.measurementCount,
      totalKg: result.totalKg,
      stockMode,
      weightingIdFrom: result.weightingIds[0]?.toString() ?? null,
      weightingIdTo: result.weightingIds[result.weightingIds.length - 1]?.toString() ?? null,
    });

    let contributionsRebuild: Record<string, unknown>;
    try {
      const rebuild = await rebuildWorkerContributions(prisma);
      contributionsRebuild = { status: 'completed', scope: 'global', processed: rebuild.processed, statistics: rebuild.statistics };
      logInfo('onboarding.contributions.rebuilt', context, { processed: rebuild.processed });
    } catch (error) {
      logWarn('onboarding.contributions.failed', context, { error: error instanceof Error ? error.message : String(error) });
      contributionsRebuild = {
        status: 'failed',
        scope: 'global',
        message: 'A importação foi gravada, mas o recálculo de contribuições falhou. Rode POST /api/recalculate-contributions.',
      };
    }

    return NextResponse.json({
      mode,
      status: contributionsRebuild.status === 'completed' ? 'applied' : 'applied_with_warnings',
      cooperative: cooperativeSummary,
      file: fileSummary,
      import: serializeImportResult(result),
      contributions_rebuild: contributionsRebuild,
      gamification: {
        affected_year_months: report.summary.affectedYearMonths,
        jobs: listGamificationFollowUps(report.summary.affectedYearMonths, cooperativeId),
        note: 'Os jobs de gamificação não são disparados automaticamente: rode-os para períodos já fechados com o segredo de jobs.',
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, context);
    if (authResponse) return authResponse;

    if (error instanceof OnboardingImportError) {
      return rejected(context, error.code, error.status, error.message);
    }

    if (error instanceof StockDomainError) {
      return rejected(context, error.code, 422, error.message);
    }

    const requestResponse = apiRequestErrorResponse(error, context.requestId);
    if (requestResponse) return requestResponse;

    return apiInternalErrorResponse({
      message: 'Erro ao processar a importação histórica',
      code: 'ONBOARDING_IMPORT_FAILED',
      context,
      event: 'onboarding.import.failed',
      error,
    });
  }
}

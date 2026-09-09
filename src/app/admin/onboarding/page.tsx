'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileCsv,
  FaFileDownload,
  FaRedo,
  FaUpload,
} from 'react-icons/fa';

interface SessionUser {
  id: string;
  full_name: string;
  role: 'admin' | 'manager' | 'worker';
  cooperative_id: string;
}

interface CooperativeOption {
  cooperative_id: string;
  name: string;
}

interface Capability {
  enabled: boolean;
  limits: { max_bytes: number; max_rows: number; ok_rows_preview_limit: number };
  stock_modes: StockMode[];
  default_stock_mode: StockMode;
  columns: Array<{ key: string; required: boolean; description: string; example: string }>;
}

type StockMode = 'collected_only' | 'collected_and_current';

interface Issue {
  field: string;
  code: string;
  message: string;
}

interface PreviewRow {
  line: number;
  status: 'ok' | 'error';
  errors: Issue[];
  warnings: Issue[];
  input: Record<string, string>;
  resolved: {
    date: string;
    worker: { id: string; wastepicker_id: string; name: string };
    material: { id: string; name: string };
    weight_kg: number;
    bag_filled: boolean;
  } | null;
}

interface ValidationSummary {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  warning_rows: number;
  duplicate_rows: number;
  total_kg: number;
  date_range: { from: string; to: string } | null;
  affected_year_months: string[];
  by_material: Array<{ material_id: string; material_name: string; rows: number; total_kg: number }>;
  by_worker: Array<{ worker_id: string; wastepicker_id: string; worker_name: string; rows: number; total_kg: number }>;
  stock_mode: StockMode;
}

interface ValidationResponse {
  mode: 'validate';
  cooperative: { id: string; name: string };
  file: { delimiter: string; row_count: number; sha256: string; encoding_ok: boolean };
  file_errors: Issue[];
  file_warnings: Issue[];
  summary: ValidationSummary | null;
  rows: PreviewRow[];
  rows_truncated: boolean;
  can_apply: boolean;
  requires_force: boolean;
  confirmation_token: string | null;
  confirmation_expires_at: string | null;
}

interface ApplyResponse {
  mode: 'apply';
  status: 'applied' | 'applied_with_warnings';
  cooperative: { id: string; name: string };
  import: {
    cooperative_id: string;
    device_id: string;
    measurement_count: number;
    total_kg: number;
    stock_mode: StockMode;
    weighting_id_range: { from: string; to: string } | null;
    weighting_ids: string[];
    by_material: Array<{ material_id: string; added_collected_kg: number; stock_after: { total_collected_kg: number; total_sold_kg: number; current_stock_kg: number } }>;
  };
  contributions_rebuild: { status: string; processed?: number; message?: string };
  gamification: { affected_year_months: string[]; jobs: Array<{ name: string; method: string; path: string; body: Record<string, string>; auth: string }>; note: string };
}

interface ApiErrorPayload {
  message?: string;
  error?: string;
  code?: string;
}

type Step = 'cooperative' | 'template' | 'upload' | 'preview' | 'result';

const panelClass = 'surface-panel rounded-xl p-6';
const fieldClass = 'block h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0 disabled:bg-surface-elevated disabled:text-text-secondary';
const labelClass = 'mb-1 block text-sm font-medium text-text-secondary';
const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-outline/70 bg-surface px-4 text-sm font-semibold text-foreground hover:border-primary/40 hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-error/40 bg-error px-4 text-sm font-semibold text-background hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-60';

function formatWeight(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function formatDateKey(key: string) {
  const [year, month, day] = key.split('-');
  return year && month && day ? `${day}/${month}/${year}` : key;
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : fallbackMessage;
    const error = new Error(message) as Error & { payload?: ApiErrorPayload & Record<string, unknown>; status?: number };
    error.payload = data;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    reader.readAsText(file, 'UTF-8');
  });
}

function NotFoundPanel() {
  return (
    <Layout activePath="/admin/onboarding">
      <div className="mx-auto max-w-xl">
        <section className={panelClass}>
          <h1 className="text-2xl font-semibold text-foreground">Página não encontrada</h1>
          <p className="mt-2 text-sm text-text-secondary">
            A página que você procura não existe ou não está disponível.
          </p>
          <Link href="/" className={`${secondaryButtonClass} mt-5`}>
            Voltar ao painel
          </Link>
        </section>
      </div>
    </Layout>
  );
}

export default function AdminOnboardingPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [cooperatives, setCooperatives] = useState<CooperativeOption[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('cooperative');
  const [cooperativeId, setCooperativeId] = useState('');
  const [stockMode, setStockMode] = useState<StockMode>('collected_only');
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [forceDuplicates, setForceDuplicates] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResponse | null>(null);

  const loadReference = useCallback(async () => {
    setReferenceError(null);
    try {
      const sessionResponse = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (sessionResponse.status === 401) {
        router.push('/login');
        return;
      }
      const session = await readJson<SessionUser>(sessionResponse, 'Sessão indisponível');
      setSessionUser(session);
      setSessionChecked(true);

      if (session.role !== 'admin') {
        return;
      }

      const [capabilityResponse, cooperativesResponse] = await Promise.all([
        fetch('/api/admin/onboarding/import', { credentials: 'same-origin' }),
        fetch('/api/cooperatives', { credentials: 'same-origin' }),
      ]);
      const capabilityPayload = await readJson<Capability>(capabilityResponse, 'Importação histórica indisponível');
      const cooperativeRows = await readJson<CooperativeOption[]>(cooperativesResponse, 'Falha ao carregar cooperativas');
      setCapability(capabilityPayload);
      setStockMode(capabilityPayload.default_stock_mode);
      setCooperatives(Array.isArray(cooperativeRows) ? cooperativeRows : []);
    } catch (loadError) {
      setSessionChecked(true);
      setReferenceError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a ferramenta.');
    }
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReference();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReference]);

  const selectedCooperative = cooperatives.find((cooperative) => cooperative.cooperative_id === cooperativeId) ?? null;
  const templateUrl = `/api/admin/onboarding/template?cooperative_id=${encodeURIComponent(cooperativeId)}&kind=template`;
  const referenceUrl = `/api/admin/onboarding/template?cooperative_id=${encodeURIComponent(cooperativeId)}&kind=referencia`;
  const summary = validation?.summary ?? null;
  const previewRows = useMemo(() => {
    const rows = validation?.rows ?? [];
    return onlyProblems ? rows.filter((row) => row.status === 'error' || row.warnings.length > 0) : rows;
  }, [onlyProblems, validation]);

  const resetFlow = () => {
    setStep('cooperative');
    setFileName('');
    setCsvText('');
    setFileError(null);
    setValidation(null);
    setConfirmOpen(false);
    setReviewed(false);
    setForceDuplicates(false);
    setApplyError(null);
    setResult(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError(null);
    setValidation(null);
    if (!file) {
      setFileName('');
      setCsvText('');
      return;
    }
    if (capability && file.size > capability.limits.max_bytes) {
      setFileError(`Arquivo maior que ${Math.round(capability.limits.max_bytes / 1024 / 1024)} MB.`);
      return;
    }
    try {
      const text = await readFileAsText(file);
      setFileName(file.name);
      setCsvText(text);
    } catch (readError) {
      setFileError(readError instanceof Error ? readError.message : 'Não foi possível ler o arquivo.');
    }
  };

  const handleValidate = async () => {
    if (!cooperativeId || !csvText) return;
    setValidating(true);
    setFileError(null);
    setApplyError(null);
    try {
      const response = await fetch('/api/admin/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ cooperative_id: cooperativeId, csv: csvText, mode: 'validate', stock_mode: stockMode }),
      });
      const payload = await readJson<ValidationResponse>(response, 'Não foi possível validar o arquivo');
      setValidation(payload);
      setForceDuplicates(false);
      setReviewed(false);
      setStep('preview');
    } catch (validateError) {
      setFileError(validateError instanceof Error ? validateError.message : 'Não foi possível validar o arquivo');
    } finally {
      setValidating(false);
    }
  };

  const handleApply = async () => {
    if (!validation?.confirmation_token || !reviewed) return;
    setApplying(true);
    setApplyError(null);
    try {
      const response = await fetch('/api/admin/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          cooperative_id: cooperativeId,
          csv: csvText,
          mode: 'apply',
          stock_mode: stockMode,
          confirmation_token: validation.confirmation_token,
          force: forceDuplicates,
        }),
      });
      const payload = await readJson<ApplyResponse>(response, 'Não foi possível aplicar a importação');
      setResult(payload);
      setConfirmOpen(false);
      setStep('result');
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : 'Não foi possível aplicar a importação');
      setConfirmOpen(false);
    } finally {
      setApplying(false);
    }
  };

  const downloadReceipt = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `comprovante-importacao-coop-${result.cooperative.id}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!sessionChecked) {
    return (
      <Layout activePath="/admin/onboarding">
        <div className="flex min-h-40 items-center justify-center text-sm text-text-secondary">Validando sessão...</div>
      </Layout>
    );
  }

  if (!sessionUser || sessionUser.role !== 'admin') {
    return <NotFoundPanel />;
  }

  return (
    <Layout activePath="/admin/onboarding">
      <div className="space-y-6">
        <section className={panelClass}>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-warning/35 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase text-warning">
            <FaFileCsv className="h-3.5 w-3.5" />
            Ferramenta administrativa
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">Importação de dados históricos (CSV)</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Carrega coletas passadas de uma cooperativa a partir de um CSV padrão. Fluxo: escolher a cooperativa, baixar o modelo,
            enviar o arquivo, revisar a pré-visualização e confirmar. Nada é gravado antes da confirmação.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
            {(['cooperative', 'template', 'upload', 'preview', 'result'] as Step[]).map((item, index) => (
              <span
                key={item}
                className={`rounded-full border px-3 py-1 ${step === item ? 'border-primary/35 bg-primary/12 text-primary' : 'border-outline/70 bg-surface'}`}
              >
                {index + 1}. {{ cooperative: 'Cooperativa', template: 'Modelo', upload: 'Arquivo', preview: 'Pré-visualização', result: 'Resultado' }[item]}
              </span>
            ))}
          </div>
        </section>

        {referenceError ? (
          <div className="rounded-lg border border-error/35 bg-error/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
              <div>
                <p className="text-sm font-semibold text-error">Importação histórica indisponível</p>
                <p className="mt-1 text-sm text-text-secondary">{referenceError}</p>
                <button type="button" onClick={() => void loadReference()} className={`${secondaryButtonClass} mt-3`}>
                  <FaRedo className="h-4 w-4" />
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 'cooperative' ? (
          <section className={panelClass}>
            <h2 className="text-lg font-semibold text-foreground">1. Cooperativa de destino</h2>
            <p className="mt-1 text-sm text-text-secondary">Todas as linhas do CSV precisam referenciar catadores desta cooperativa.</p>
            <div className="mt-4 max-w-md">
              <label htmlFor="onboardingCooperative" className={labelClass}>Cooperativa *</label>
              <select
                id="onboardingCooperative"
                value={cooperativeId}
                onChange={(event) => setCooperativeId(event.target.value)}
                className={fieldClass}
                disabled={!capability}
              >
                <option value="">Selecione a cooperativa</option>
                {cooperatives.map((cooperative) => (
                  <option key={cooperative.cooperative_id} value={cooperative.cooperative_id}>{cooperative.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-5">
              <button type="button" onClick={() => setStep('template')} className={primaryButtonClass} disabled={!cooperativeId}>
                Continuar
              </button>
            </div>
          </section>
        ) : null}

        {step === 'template' ? (
          <section className={panelClass}>
            <h2 className="text-lg font-semibold text-foreground">2. Modelo e referência</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Baixe o modelo, preencha no Excel/LibreOffice e salve como <strong>CSV UTF-8</strong>. A referência lista os
              coletores (WP) e materiais válidos de {selectedCooperative?.name ?? 'cooperativa'}.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href={templateUrl} download className={primaryButtonClass}>
                <FaFileDownload className="h-4 w-4" />
                Baixar modelo CSV
              </a>
              <a href={referenceUrl} download className={secondaryButtonClass}>
                <FaFileDownload className="h-4 w-4" />
                Baixar referência (coletores e materiais)
              </a>
            </div>
            <div className="mt-5 overflow-x-auto rounded-lg border border-outline">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-surface-elevated text-xs uppercase text-text-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3">Coluna</th>
                    <th scope="col" className="px-4 py-3">Obrigatória</th>
                    <th scope="col" className="px-4 py-3">Formato</th>
                    <th scope="col" className="px-4 py-3">Exemplo</th>
                  </tr>
                </thead>
                <tbody>
                  {(capability?.columns ?? []).map((column) => (
                    <tr key={column.key} className="border-t border-outline/60">
                      <td className="px-4 py-3 font-mono text-foreground">{column.key}</td>
                      <td className="px-4 py-3 text-text-secondary">{column.required ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-3 text-text-secondary">{column.description}</td>
                      <td className="px-4 py-3 text-text-secondary">{column.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep('upload')} className={primaryButtonClass}>Continuar</button>
              <button type="button" onClick={() => setStep('cooperative')} className={secondaryButtonClass}>Voltar</button>
            </div>
          </section>
        ) : null}

        {step === 'upload' ? (
          <section className={panelClass}>
            <h2 className="text-lg font-semibold text-foreground">3. Arquivo</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="onboardingFile" className={labelClass}>Arquivo CSV *</label>
                <input
                  id="onboardingFile"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleFileChange(event)}
                  className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border file:border-outline file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  {fileName ? `Selecionado: ${fileName}` : `Até ${capability ? Math.round(capability.limits.max_bytes / 1024 / 1024) : 2} MB e ${formatInteger(capability?.limits.max_rows ?? 10000)} linhas.`}
                </p>
                {fileError ? <p className="mt-1 text-xs text-error">{fileError}</p> : null}
              </div>
              <fieldset>
                <legend className={labelClass}>Como somar ao estoque</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm">
                  <input type="radio" name="stockMode" value="collected_only" checked={stockMode === 'collected_only'} onChange={() => setStockMode('collected_only')} className="mt-1 accent-primary" />
                  <span>
                    <span className="font-semibold text-foreground">Somar apenas ao total coletado (recomendado)</span>
                    <span className="block text-xs text-text-secondary">Histórico entra em Total coletado; o estoque atual disponível para venda não muda.</span>
                  </span>
                </label>
                <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
                  <input type="radio" name="stockMode" value="collected_and_current" checked={stockMode === 'collected_and_current'} onChange={() => setStockMode('collected_and_current')} className="mt-1 accent-primary" />
                  <span>
                    <span className="font-semibold text-foreground">Somar ao total coletado e ao estoque atual</span>
                    <span className="block text-xs text-text-secondary">Também aumenta o estoque atual disponível para venda. Use só se o material importado ainda está no galpão.</span>
                  </span>
                </label>
              </fieldset>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => void handleValidate()} className={primaryButtonClass} disabled={!csvText || validating}>
                <FaUpload className="h-4 w-4" />
                {validating ? 'Validando...' : 'Validar arquivo'}
              </button>
              <button type="button" onClick={() => setStep('template')} className={secondaryButtonClass} disabled={validating}>Voltar</button>
            </div>
          </section>
        ) : null}

        {step === 'preview' && validation ? (
          <section className={panelClass}>
            <h2 className="text-lg font-semibold text-foreground">4. Pré-visualização</h2>
            <p className="mt-1 text-sm text-text-secondary">
              {validation.cooperative.name} · {fileName} · delimitador &quot;{validation.file.delimiter === '\t' ? 'tab' : validation.file.delimiter}&quot;
            </p>

            {validation.file_errors.length > 0 ? (
              <div className="mt-4 rounded-lg border border-error/35 bg-error/10 px-4 py-3 text-sm">
                <p className="font-semibold text-error">Problemas no arquivo</p>
                <ul className="mt-2 list-disc pl-5 text-text-secondary">
                  {validation.file_errors.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
                </ul>
              </div>
            ) : null}
            {validation.file_warnings.length > 0 ? (
              <div className="mt-4 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
                <p className="font-semibold text-warning">Avisos do arquivo</p>
                <ul className="mt-2 list-disc pl-5 text-text-secondary">
                  {validation.file_warnings.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
                </ul>
              </div>
            ) : null}

            {summary ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Linhas', formatInteger(summary.total_rows)],
                    ['Válidas', formatInteger(summary.valid_rows)],
                    ['Inválidas', formatInteger(summary.invalid_rows)],
                    ['Com avisos', formatInteger(summary.warning_rows)],
                    ['Duplicadas no banco', formatInteger(summary.duplicate_rows)],
                    ['Total (kg)', formatWeight(summary.total_kg)],
                    ['Período', summary.date_range ? `${formatDateKey(summary.date_range.from)} a ${formatDateKey(summary.date_range.to)}` : '—'],
                    ['Meses afetados', summary.affected_year_months.join(', ') || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                      <p className="text-xs uppercase text-text-secondary">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm">
                    <p className="font-semibold text-foreground">Por material</p>
                    <ul className="mt-2 space-y-1 text-text-secondary">
                      {summary.by_material.map((entry) => (
                        <li key={entry.material_id}>{entry.material_name}: {formatWeight(entry.total_kg)} kg em {formatInteger(entry.rows)} linhas</li>
                      ))}
                      {summary.by_material.length === 0 ? <li>Nenhuma linha válida.</li> : null}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm">
                    <p className="font-semibold text-foreground">Por catador</p>
                    <ul className="mt-2 space-y-1 text-text-secondary">
                      {summary.by_worker.map((entry) => (
                        <li key={entry.worker_id}>{entry.worker_name} ({entry.wastepicker_id}): {formatWeight(entry.total_kg)} kg em {formatInteger(entry.rows)} linhas</li>
                      ))}
                      {summary.by_worker.length === 0 ? <li>Nenhuma linha válida.</li> : null}
                    </ul>
                  </div>
                </div>
              </>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} className="accent-primary" />
                Mostrar apenas linhas com problemas
              </label>
              {validation.rows_truncated ? (
                <p className="text-xs text-text-secondary">Linhas válidas limitadas na prévia; erros e avisos aparecem sempre.</p>
              ) : null}
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-outline">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-surface-elevated text-xs uppercase text-text-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2">Linha</th>
                    <th scope="col" className="px-3 py-2">Status</th>
                    <th scope="col" className="px-3 py-2">Data</th>
                    <th scope="col" className="px-3 py-2">Catador</th>
                    <th scope="col" className="px-3 py-2">Material</th>
                    <th scope="col" className="px-3 py-2 text-right">kg</th>
                    <th scope="col" className="px-3 py-2">Sacola</th>
                    <th scope="col" className="px-3 py-2">Mensagens</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.line} className="border-t border-outline/60 align-top">
                      <td className="px-3 py-2 text-text-secondary">{row.line}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${row.status === 'error' ? 'border-error/35 bg-error/10 text-error' : row.warnings.length > 0 ? 'border-warning/35 bg-warning/10 text-warning' : 'border-success/35 bg-success/10 text-success'}`}>
                          {row.status === 'error' ? 'Erro' : row.warnings.length > 0 ? 'Aviso' : 'OK'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-foreground">{row.resolved ? formatDateKey(row.resolved.date) : row.input.data_coleta}</td>
                      <td className="px-3 py-2 text-foreground">{row.resolved ? `${row.resolved.worker.name} (${row.resolved.worker.wastepicker_id})` : row.input.coletor}</td>
                      <td className="px-3 py-2 text-foreground">{row.resolved ? row.resolved.material.name : row.input.material}</td>
                      <td className="px-3 py-2 text-right text-foreground">{row.resolved ? formatWeight(row.resolved.weight_kg) : row.input.peso_kg}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.resolved ? (row.resolved.bag_filled ? 'cheia' : 'vazia') : row.input.estado_sacola}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.errors.map((issue, index) => <p key={`e-${index}`} className="text-error">{issue.message}</p>)}
                        {row.warnings.map((issue, index) => <p key={`w-${index}`} className="text-warning">{issue.message}</p>)}
                      </td>
                    </tr>
                  ))}
                  {previewRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-4 text-center text-text-secondary">Nenhuma linha para exibir.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {applyError ? (
              <div className="mt-4 rounded-lg border border-error/35 bg-error/10 px-4 py-3 text-sm text-foreground">{applyError}</div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => setConfirmOpen(true)} className={primaryButtonClass} disabled={!validation.can_apply}>
                <FaCheckCircle className="h-4 w-4" />
                {validation.can_apply ? 'Confirmar importação' : 'Corrija o arquivo e valide novamente'}
              </button>
              <button type="button" onClick={() => { setStep('upload'); setValidation(null); }} className={secondaryButtonClass}>Enviar outro arquivo</button>
            </div>
          </section>
        ) : null}

        {step === 'result' && result ? (
          <section className={panelClass}>
            <div className="flex items-start gap-3">
              <FaCheckCircle className="mt-1 h-5 w-5 shrink-0 text-success" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">5. Importação {result.status === 'applied' ? 'concluída' : 'concluída com avisos'}</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {formatInteger(result.import.measurement_count)} pesagens gravadas para {result.cooperative.name}, somando {formatWeight(result.import.total_kg)} kg
                  {result.import.weighting_id_range ? ` (ids ${result.import.weighting_id_range.from} a ${result.import.weighting_id_range.to})` : ''}.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">Estoque por material</p>
                <ul className="mt-2 space-y-1 text-text-secondary">
                  {result.import.by_material.map((entry) => (
                    <li key={entry.material_id}>
                      Material {entry.material_id}: +{formatWeight(entry.added_collected_kg)} kg coletado · atual {formatWeight(entry.stock_after.current_stock_kg)} kg
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">Contribuições</p>
                <p className="mt-2 text-text-secondary">
                  {result.contributions_rebuild.status === 'completed'
                    ? `Recalculadas para todas as cooperativas (${formatInteger(result.contributions_rebuild.processed ?? 0)} registros).`
                    : result.contributions_rebuild.message}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm">
              <p className="font-semibold text-foreground">Próximos passos de gamificação</p>
              <p className="mt-1 text-xs text-text-secondary">{result.gamification.note}</p>
              <ul className="mt-2 space-y-1 font-mono text-xs text-text-secondary">
                {result.gamification.jobs.map((job) => (
                  <li key={`${job.path}-${job.body.yearMonth}`}>{job.method} {job.path} {JSON.stringify(job.body)}</li>
                ))}
                {result.gamification.jobs.length === 0 ? <li>Nenhum período afetado.</li> : null}
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={downloadReceipt} className={primaryButtonClass}>
                <FaFileDownload className="h-4 w-4" />
                Baixar comprovante (JSON)
              </button>
              <button type="button" onClick={resetFlow} className={secondaryButtonClass}>
                <FaRedo className="h-4 w-4" />
                Nova importação
              </button>
            </div>
          </section>
        ) : null}
      </div>

      {confirmOpen && validation && summary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4" role="dialog" aria-modal="true" aria-labelledby="onboardingConfirmTitle">
          <div className="w-full max-w-xl rounded-xl border border-outline bg-surface p-6 shadow-soft">
            <h3 id="onboardingConfirmTitle" className="text-lg font-semibold text-foreground">Confirmar importação histórica</h3>
            <p className="mt-3 text-sm text-text-secondary">
              Você vai inserir <strong className="text-foreground">{formatInteger(summary.valid_rows)}</strong> pesagens históricas na cooperativa{' '}
              <strong className="text-foreground">{validation.cooperative.name}</strong>, somar{' '}
              <strong className="text-foreground">{formatWeight(summary.total_kg)} kg</strong> ao total coletado de{' '}
              <strong className="text-foreground">{formatInteger(summary.by_material.length)}</strong> materiais{' '}
              {stockMode === 'collected_only' ? '(sem alterar o estoque atual)' : '(e também ao estoque atual)'} e recalcular as contribuições de{' '}
              <strong className="text-foreground">todas as cooperativas</strong>. Esta ação não pode ser desfeita pela interface.
            </p>
            {validation.requires_force ? (
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground">
                <input type="checkbox" checked={forceDuplicates} onChange={(event) => setForceDuplicates(event.target.checked)} className="mt-1 accent-primary" />
                <span>Entendo que <strong>{formatInteger(summary.duplicate_rows)}</strong> linhas já existem no banco e serão inseridas novamente.</span>
              </label>
            ) : null}
            <label className="mt-4 flex items-start gap-3 rounded-lg border border-outline/70 bg-surface-elevated px-4 py-3 text-sm text-foreground">
              <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 accent-primary" />
              <span>Confirmo que revisei a pré-visualização.</span>
            </label>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleApply()}
                className={dangerButtonClass}
                disabled={applying || !reviewed || (validation.requires_force && !forceDuplicates)}
              >
                {applying ? 'Importando...' : 'Confirmar importação'}
              </button>
              <button type="button" onClick={() => setConfirmOpen(false)} className={secondaryButtonClass} disabled={applying}>Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

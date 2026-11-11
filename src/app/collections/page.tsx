'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { DeleteCollectionDialog } from '@/components/collections/DeleteCollectionDialog';
import { SectionMessage } from '@/components/dashboard/SectionMessage';
import {
  FaBalanceScale,
  FaCheckCircle,
  FaExclamationTriangle,
  FaFilter,
  FaHistory,
  FaRedo,
  FaTrash,
} from 'react-icons/fa';

interface SessionUser {
  id: string;
  full_name: string;
  role: 'admin' | 'manager';
  cooperative_id: string;
  cooperative_name?: string | null;
}

interface WorkerOption {
  id?: string;
  _id?: string;
  wastepicker_id?: string;
  full_name?: string;
  worker_name?: string;
  exit_date?: string | null;
  user_type?: number;
}

interface MaterialOption {
  _id?: string;
  id?: string;
  material_id?: string | number;
  material?: string;
  name?: string;
  isGroup?: boolean;
}

interface BagStatePayload {
  material_id: string;
  is_begun: boolean;
  current_kg: number;
  last_updated: string | null;
}

interface CollectionRow {
  id: string;
  worker_id: string;
  wastepicker_id: string;
  worker_name: string;
  material_id: string;
  material_name: string;
  weight_kg: number;
  bag_full: boolean;
  date: string;
}

interface CollectionsPayload {
  collections?: CollectionRow[];
  count?: number;
  total_weight_kg?: number;
  from?: string;
  to?: string;
}

interface CreateCollectionResponse {
  success?: boolean;
  message?: string;
  worker_name?: string;
  collected_delta_kg?: number;
  bag_state?: { is_begun?: boolean; current_kg?: number };
  stock?: { current_stock_kg?: number } | null;
}

interface ApiErrorPayload {
  message?: string;
  error?: string;
  code?: string;
}

type FieldKey = 'worker' | 'material' | 'reading' | 'date';
type FieldErrors = Partial<Record<FieldKey, string>>;
type RangeDays = 1 | 7 | 30;

interface CollectionForm {
  workerId: string;
  materialId: string;
  reading: string;
  bagFull: boolean;
  date: string;
}

const fieldClass = 'block h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0 disabled:bg-surface-elevated disabled:text-text-secondary';
const labelClass = 'mb-1 block text-sm font-medium text-text-secondary';
const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-outline/70 bg-surface px-4 text-sm font-semibold text-foreground hover:border-primary/40 hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60';

const rangeOptions: Array<{ days: RangeDays; label: string }> = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
];

function localDateKey(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDateKey(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

function formatDateKey(key: string) {
  const [year, month, day] = key.split('-');
  if (!year || !month || !day) return key;
  return `${day}/${month}/${year}`;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function formatWeight(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAmount(value: string) {
  return value.trim().replace(',', '.');
}

function workerId(worker: WorkerOption) {
  return String(worker.id ?? worker._id ?? '');
}

function workerLabel(worker: WorkerOption) {
  const name = worker.full_name || worker.worker_name || 'Catador';
  return worker.wastepicker_id ? `${name} · ${worker.wastepicker_id}` : name;
}

function materialId(material: MaterialOption) {
  return String(material.material_id ?? material._id ?? material.id ?? '');
}

function materialName(material: MaterialOption) {
  return material.name || material.material || `Material ${materialId(material)}`;
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : fallbackMessage;
    const error = new Error(message) as Error & { payload?: ApiErrorPayload };
    error.payload = data as ApiErrorPayload;
    throw error;
  }
  return data as T;
}

function mapServerError(payload: ApiErrorPayload | undefined, fallback: string): { field?: FieldKey; message: string } {
  const message = payload?.message || payload?.error || fallback;
  const code = payload?.code ?? '';

  if (code === 'INVALID_MATERIAL_MEASUREMENT') {
    if (/acumulada/i.test(message)) {
      return { field: 'reading', message };
    }
    if (/posterior/i.test(message)) {
      return {
        field: 'date',
        message: 'Já existe leitura mais recente para este material. Use a data de hoje.',
      };
    }
    if (/amount/i.test(message)) {
      return { field: 'reading', message: 'Informe a leitura em kg com no máximo 2 casas decimais.' };
    }
    if (/measuredAt/i.test(message)) {
      return { field: 'date', message: 'Informe uma data válida que não esteja no futuro.' };
    }
    return { message };
  }

  if (['WORKER_SCOPE_DENIED', 'WORKER_NOT_FOUND', 'WORKER_INACTIVE', 'WORKER_ROLE_REQUIRED'].includes(code)) {
    return { field: 'worker', message };
  }

  if (code === 'MATERIAL_NOT_FOUND') {
    return { field: 'material', message };
  }

  return { message };
}

export default function CollectionsPage() {
  const todayKey = useMemo(() => localDateKey(), []);
  const requestSeq = useRef(0);
  const bagRequestSeq = useRef(0);
  const submitInFlight = useRef(false);
  const deleteInFlight = useRef(false);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [form, setForm] = useState<CollectionForm>({
    workerId: '',
    materialId: '',
    reading: '',
    bagFull: false,
    date: todayKey,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [bagState, setBagState] = useState<BagStatePayload | null>(null);
  const [bagStateLoading, setBagStateLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rangeDays, setRangeDays] = useState<RangeDays>(7);
  const [listWorkerFilter, setListWorkerFilter] = useState('');
  const [listMaterialFilter, setListMaterialFilter] = useState('');
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [collectionsTotal, setCollectionsTotal] = useState({ count: 0, weightKg: 0 });
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sessionCooperativeId = sessionUser?.cooperative_id ?? '';

  const scopedUrl = useCallback((path: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params);
    if (sessionCooperativeId) query.set('cooperative_id', sessionCooperativeId);
    const serialized = query.toString();
    return serialized ? `${path}?${serialized}` : path;
  }, [sessionCooperativeId]);

  const loadReferenceData = useCallback(async () => {
    setReferenceLoading(true);
    setReferenceError(null);

    try {
      const sessionResponse = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const session = await readJson<SessionUser>(sessionResponse, 'Sessão indisponível');
      setSessionUser(session);

      const params = new URLSearchParams();
      if (session.cooperative_id) params.set('cooperative_id', session.cooperative_id);
      const query = params.toString();

      const [workersResponse, materialsResponse] = await Promise.all([
        fetch(query ? `/api/users?${query}` : '/api/users', { credentials: 'same-origin' }),
        fetch('/api/materials', { credentials: 'same-origin' }),
      ]);
      const [workerRows, materialRows] = await Promise.all([
        readJson<WorkerOption[]>(workersResponse, 'Falha ao carregar catadores'),
        readJson<MaterialOption[]>(materialsResponse, 'Falha ao carregar materiais'),
      ]);

      setWorkers((Array.isArray(workerRows) ? workerRows : []).filter((worker) => !worker.exit_date && workerId(worker)));
      setMaterials((Array.isArray(materialRows) ? materialRows : []).filter((material) => !material.isGroup && materialId(material)));
    } catch (loadError) {
      setReferenceError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os dados da cooperativa.');
    } finally {
      setReferenceLoading(false);
    }
  }, []);

  const loadCollections = useCallback(async () => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setCollectionsLoading(true);
    setCollectionsError(null);

    const to = todayKey;
    const from = shiftDateKey(to, -(rangeDays - 1));
    const params: Record<string, string> = { from, to, limit: '200' };
    if (listWorkerFilter) params.worker_id = listWorkerFilter;
    if (listMaterialFilter) params.material_id = listMaterialFilter;

    try {
      const response = await fetch(scopedUrl('/api/collections', params), { credentials: 'same-origin' });
      const payload = await readJson<CollectionsPayload>(response, 'Falha ao carregar coletas recentes');
      if (requestId !== requestSeq.current) return;
      setCollections(payload.collections ?? []);
      setCollectionsTotal({
        count: payload.count ?? payload.collections?.length ?? 0,
        weightKg: payload.total_weight_kg ?? 0,
      });
    } catch (loadError) {
      if (requestId !== requestSeq.current) return;
      setCollections([]);
      setCollectionsTotal({ count: 0, weightKg: 0 });
      setCollectionsError(loadError instanceof Error ? loadError.message : 'Falha ao carregar coletas recentes');
    } finally {
      if (requestId === requestSeq.current) {
        setCollectionsLoading(false);
      }
    }
  }, [listMaterialFilter, listWorkerFilter, rangeDays, scopedUrl, todayKey]);

  const loadBagState = useCallback(async (selectedMaterialId: string) => {
    const requestId = ++bagRequestSeq.current;
    if (!selectedMaterialId) {
      setBagStateLoading(false);
      setBagState(null);
      return;
    }

    setBagStateLoading(true);
    try {
      const response = await fetch(scopedUrl('/api/collections/bag-state', { material_id: selectedMaterialId }), {
        credentials: 'same-origin',
      });
      const payload = await readJson<BagStatePayload>(response, 'Falha ao consultar o estado do saco');
      if (requestId === bagRequestSeq.current) setBagState(payload);
    } catch {
      if (requestId === bagRequestSeq.current) setBagState(null);
    } finally {
      if (requestId === bagRequestSeq.current) setBagStateLoading(false);
    }
  }, [scopedUrl]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReferenceData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReferenceData]);

  useEffect(() => {
    if (referenceLoading) return undefined;
    const timeoutId = window.setTimeout(() => {
      void loadCollections();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCollections, referenceLoading]);

  useEffect(() => {
    if (referenceLoading) return undefined;
    const timeoutId = window.setTimeout(() => {
      void loadBagState(form.materialId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [form.materialId, loadBagState, referenceLoading]);

  const handleDelete = async (reason: string) => {
    if (!deleteTarget || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(scopedUrl(`/api/collections/${deleteTarget.id}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason }),
      });
      const payload = await readJson<{ success: boolean; removed_current_stock_kg: number }>(response, 'Não foi possível excluir a pesagem');
      const stockMessage = payload.removed_current_stock_kg > 0
        ? `${formatWeight(payload.removed_current_stock_kg)} kg retirados do estoque.` : 'Estoque disponível preservado.';
      setSuccess(`Pesagem #${deleteTarget.id} de ${deleteTarget.worker_name} excluída dos totais de coleta. ${stockMessage}`);
      setError(null);
      setReviewing(false);
      setDeleteTarget(null);
      void loadCollections();
      void loadBagState(form.materialId);
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : 'Não foi possível excluir a pesagem.');
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  };

  const openDelete = (row: CollectionRow) => {
    setDeleteError(null);
    setDeleteTarget(row);
  };

  const selectedWorker = workers.find((worker) => workerId(worker) === form.workerId) ?? null;
  const selectedMaterial = materials.find((material) => materialId(material) === form.materialId) ?? null;
  const parsedReading = parseAmount(form.reading);
  const currentBagKg = bagState?.current_kg ?? 0;
  const estimatedDelta = parsedReading === null ? null : Math.max(parsedReading - currentBagKg, 0);
  const readingBelowBag = parsedReading !== null && !form.bagFull && parsedReading < currentBagKg;
  const dateChanged = form.date !== todayKey;

  const updateForm = <K extends keyof CollectionForm>(key: K, value: CollectionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      if (key === 'workerId') delete next.worker;
      if (key === 'materialId') delete next.material;
      if (key === 'reading' || key === 'bagFull') delete next.reading;
      if (key === 'date') delete next.date;
      return next;
    });
    setReviewing(false);
    setSuccess(null);
  };

  const validate = () => {
    const errors: FieldErrors = {};
    if (!form.workerId) errors.worker = 'Selecione o catador responsável pela coleta.';
    if (!form.materialId) errors.material = 'Selecione o material pesado.';
    if (parsedReading === null) {
      errors.reading = 'Informe a leitura da balança em kg, maior que zero e com até 2 casas decimais.';
    } else if (readingBelowBag) {
      errors.reading = `Leitura acumulada não pode ser menor que o saco atual (${formatWeight(currentBagKg)} kg). Marque "saco cheio" se o saco foi trocado.`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      errors.date = 'Informe uma data válida.';
    } else if (form.date > todayKey) {
      errors.date = 'A data da coleta não pode estar no futuro.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleReview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (validate()) {
      setReviewing(true);
    }
  };

  const handleConfirm = async () => {
    if (submitInFlight.current || !validate()) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const body: Record<string, unknown> = {
        worker_id: form.workerId,
        material_id: form.materialId,
        amount: normalizeAmount(form.reading),
        bag_full: form.bagFull,
      };
      if (dateChanged) {
        body.measured_at = form.date;
      }
      if (sessionCooperativeId) {
        body.cooperative_id = sessionCooperativeId;
      }

      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const payload = await readJson<CreateCollectionResponse>(response, 'Não foi possível registrar a coleta');
      const delta = Number(payload.collected_delta_kg ?? 0);
      const materialLabel = selectedMaterial ? materialName(selectedMaterial) : 'material';
      const workerName = payload.worker_name || (selectedWorker ? workerLabel(selectedWorker) : 'catador');
      const bagSummary = form.bagFull
        ? 'Saco zerado após o registro.'
        : `Saco atual: ${formatWeight(Number(payload.bag_state?.current_kg ?? parsedReading ?? 0))} kg.`;

      setSuccess(`Coleta de ${materialLabel} registrada: +${formatWeight(delta)} kg para ${workerName}. ${bagSummary}`);
      setForm((current) => ({ ...current, reading: '', bagFull: false, date: todayKey }));
      setReviewing(false);
      setFieldErrors({});
      void loadCollections();
      void loadBagState(form.materialId);
    } catch (submitError) {
      const payload = (submitError as Error & { payload?: ApiErrorPayload }).payload;
      const mapped = mapServerError(payload, submitError instanceof Error ? submitError.message : 'Não foi possível registrar a coleta');
      if (mapped.field) {
        setFieldErrors((current) => ({ ...current, [mapped.field as FieldKey]: mapped.message }));
        setReviewing(false);
      } else {
        setError(mapped.message);
      }
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Layout activePath="/collections">
      <div className="space-y-6">
        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold uppercase text-primary">
                <FaBalanceScale className="h-3.5 w-3.5" />
                Coletas
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Registrar coleta pelo painel</h1>
                <p className="mt-2 text-sm text-text-secondary">
                  Mesma regra do aplicativo: informe a leitura acumulada da balança para o material e marque
                  &quot;saco cheio&quot; quando o saco for encerrado. O sistema calcula a coleta do catador e atualiza o estoque.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {sessionUser?.cooperative_name || 'Cooperativa definida pela sessão'}
                </span>
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {workers.length} catadores ativos
                </span>
              </div>
            </div>
          </div>
        </section>

        {referenceError ? (
          <div className="rounded-lg border border-error/35 bg-error/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
              <div>
                <p className="text-sm font-semibold text-error">Dados da cooperativa indisponíveis</p>
                <p className="mt-1 text-sm text-text-secondary">{referenceError}</p>
                <button type="button" onClick={() => void loadReferenceData()} className={`${secondaryButtonClass} mt-3`}>
                  <FaRedo className="h-4 w-4" />
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {success ? (
          <div role="status" className="rounded-lg border border-success/35 bg-success/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <FaCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p className="text-sm text-foreground">{success}</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-error/35 bg-error/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
              <p className="text-sm text-foreground">{error}</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          <form onSubmit={handleReview} className="surface-panel rounded-xl p-6" noValidate>
            <h2 className="text-lg font-semibold text-foreground">Registrar coleta</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Escolha o catador, o material e informe a leitura da balança.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="collectionWorker" className={labelClass}>Catador *</label>
                <select
                  id="collectionWorker"
                  value={form.workerId}
                  onChange={(event) => updateForm('workerId', event.target.value)}
                  className={fieldClass}
                  disabled={referenceLoading || submitting}
                >
                  <option value="">Selecione o catador</option>
                  {workers.map((worker) => (
                    <option key={workerId(worker)} value={workerId(worker)}>
                      {workerLabel(worker)}
                    </option>
                  ))}
                </select>
                {fieldErrors.worker ? <p className="mt-1 text-xs text-error">{fieldErrors.worker}</p> : null}
              </div>

              <div>
                <label htmlFor="collectionMaterial" className={labelClass}>Material *</label>
                <select
                  id="collectionMaterial"
                  value={form.materialId}
                  onChange={(event) => updateForm('materialId', event.target.value)}
                  className={fieldClass}
                  disabled={referenceLoading || submitting}
                >
                  <option value="">Selecione o material</option>
                  {materials.map((material) => (
                    <option key={materialId(material)} value={materialId(material)}>
                      {materialName(material)}
                    </option>
                  ))}
                </select>
                {fieldErrors.material ? <p className="mt-1 text-xs text-error">{fieldErrors.material}</p> : null}
              </div>
            </div>

            {form.materialId ? (
              <div className="mt-4 rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm">
                {bagStateLoading ? (
                  <p className="text-text-secondary">Consultando o saco atual deste material...</p>
                ) : (
                  <>
                    <p className="font-semibold text-foreground">
                      Saco atual: {formatWeight(currentBagKg)} kg · {bagState?.is_begun ? 'Em andamento' : 'Vazio'}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {bagState?.last_updated
                        ? `Última leitura: ${formatDateTime(bagState.last_updated)}.`
                        : 'Nenhuma leitura registrada para este material ainda.'}
                      {currentBagKg > 0
                        ? ' Informe a leitura acumulada da balança (peso total do saco), não apenas o que foi adicionado.'
                        : ''}
                    </p>
                  </>
                )}
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="collectionReading" className={labelClass}>Leitura da balança (kg) *</label>
                <input
                  id="collectionReading"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex.: 12,50"
                  value={form.reading}
                  onChange={(event) => updateForm('reading', event.target.value)}
                  className={fieldClass}
                  disabled={referenceLoading || submitting}
                />
                {fieldErrors.reading ? (
                  <p className="mt-1 text-xs text-error">{fieldErrors.reading}</p>
                ) : estimatedDelta !== null ? (
                  <p className={`mt-1 text-xs ${readingBelowBag ? 'text-warning' : 'text-text-secondary'}`}>
                    {readingBelowBag
                      ? `Leitura menor que o saco atual (${formatWeight(currentBagKg)} kg). Marque "saco cheio" se o saco foi trocado.`
                      : `Coleta estimada: +${formatWeight(estimatedDelta)} kg`}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="collectionDate" className={labelClass}>Data da coleta</label>
                <input
                  id="collectionDate"
                  type="date"
                  max={todayKey}
                  value={form.date}
                  onChange={(event) => updateForm('date', event.target.value)}
                  className={fieldClass}
                  disabled={referenceLoading || submitting}
                />
                {fieldErrors.date ? (
                  <p className="mt-1 text-xs text-error">{fieldErrors.date}</p>
                ) : (
                  <p className="mt-1 text-xs text-text-secondary">
                    Datas anteriores só são aceitas se não houver leitura posterior para este material.
                  </p>
                )}
              </div>
            </div>

            <label htmlFor="collectionBagFull" className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm text-foreground">
              <input
                id="collectionBagFull"
                type="checkbox"
                checked={form.bagFull}
                onChange={(event) => updateForm('bagFull', event.target.checked)}
                className="h-4 w-4 accent-primary"
                disabled={referenceLoading || submitting}
              />
              <span>
                <span className="font-semibold">Saco cheio</span>
                <span className="block text-xs text-text-secondary">Zera o saco após registrar; a próxima leitura começa do zero.</span>
              </span>
            </label>

            {reviewing ? (
              <div className="mt-5 rounded-lg border border-primary/25 bg-primary/10 px-4 py-4 text-sm">
                <p className="font-semibold text-foreground">Revisar antes de confirmar</p>
                <ul className="mt-2 space-y-1 text-text-secondary">
                  <li>Catador: <span className="text-foreground">{selectedWorker ? workerLabel(selectedWorker) : '-'}</span></li>
                  <li>Material: <span className="text-foreground">{selectedMaterial ? materialName(selectedMaterial) : '-'}</span></li>
                  <li>Leitura da balança: <span className="text-foreground">{parsedReading !== null ? `${formatWeight(parsedReading)} kg` : '-'}</span></li>
                  <li>Coleta calculada: <span className="text-foreground">+{formatWeight(estimatedDelta ?? 0)} kg</span></li>
                  <li>Saco cheio: <span className="text-foreground">{form.bagFull ? 'Sim, o saco será zerado' : 'Não'}</span></li>
                  <li>Data: <span className="text-foreground">{formatDateKey(form.date)}{dateChanged ? '' : ' (hoje, com horário atual)'}</span></li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={() => void handleConfirm()} className={primaryButtonClass} disabled={submitting}>
                    <FaCheckCircle className="h-4 w-4" />
                    {submitting ? 'Registrando...' : 'Confirmar coleta'}
                  </button>
                  <button type="button" onClick={() => setReviewing(false)} className={secondaryButtonClass} disabled={submitting}>
                    Voltar e editar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="submit" className={primaryButtonClass} disabled={referenceLoading || submitting}>
                  <FaBalanceScale className="h-4 w-4" />
                  Revisar coleta
                </button>
              </div>
            )}
          </form>

          <div className="surface-panel rounded-xl p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Coletas recentes</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Coletas registradas pelo aplicativo ou pelo painel para a cooperativa. Exclua um registro feito por engano para corrigir os totais e o estoque.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {rangeOptions.map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => setRangeDays(option.days)}
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${rangeDays === option.days ? 'border-primary/35 bg-primary/14 text-primary' : 'border-outline/70 bg-surface text-text-secondary hover:text-foreground'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="collectionsWorkerFilter" className={labelClass}>
                  <FaFilter className="mr-1 inline h-3 w-3" />
                  Catador
                </label>
                <select
                  id="collectionsWorkerFilter"
                  value={listWorkerFilter}
                  onChange={(event) => setListWorkerFilter(event.target.value)}
                  className={fieldClass}
                >
                  <option value="">Todos os catadores</option>
                  {workers.map((worker) => (
                    <option key={workerId(worker)} value={workerId(worker)}>
                      {workerLabel(worker)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="collectionsMaterialFilter" className={labelClass}>Material</label>
                <select
                  id="collectionsMaterialFilter"
                  value={listMaterialFilter}
                  onChange={(event) => setListMaterialFilter(event.target.value)}
                  className={fieldClass}
                >
                  <option value="">Todos os materiais</option>
                  {materials.map((material) => (
                    <option key={materialId(material)} value={materialId(material)}>
                      {materialName(material)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <SectionMessage
                loading={collectionsLoading}
                error={collectionsError ?? undefined}
                empty={collections.length === 0}
                emptyTitle="Nenhuma coleta no período"
                emptyDescription="Registre uma coleta ao lado ou amplie o período para ver o histórico."
              >
                <div className="hidden overflow-x-auto rounded-lg border border-outline md:block">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="bg-surface-elevated text-xs uppercase text-text-secondary">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">Data</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Catador</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Material</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Coleta (kg)</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Saco cheio</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collections.map((row) => (
                        <tr key={row.id} className="border-t border-outline/60">
                          <td className="px-4 py-3 text-text-secondary">{formatDateKey(row.date)}</td>
                          <td className="px-4 py-3 text-foreground">
                            {row.worker_name}
                            <span className="block text-xs text-text-secondary">{row.wastepicker_id}</span>
                          </td>
                          <td className="px-4 py-3 text-foreground">{row.material_name}</td>
                          <td className="px-4 py-3 text-right font-semibold text-foreground">{formatWeight(row.weight_kg)}</td>
                          <td className="px-4 py-3 text-text-secondary">{row.bag_full ? 'Sim' : 'Não'}</td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => openDelete(row)} disabled={deleting || submitting}
                              aria-label={`Excluir pesagem #${row.id} de ${row.worker_name}`}
                              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-error hover:bg-error/10 disabled:opacity-60">
                              <FaTrash aria-hidden="true" className="h-3 w-3" /> Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-outline bg-surface-elevated/60">
                        <td className="px-4 py-3 text-xs uppercase text-text-secondary" colSpan={3}>
                          {collectionsTotal.count} coletas no período
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{formatWeight(collectionsTotal.weightKg)}</td>
                        <td className="px-4 py-3" colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {collections.map((row) => (
                    <article key={row.id} className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{row.material_name}</p>
                          <p className="text-xs text-text-secondary">{row.worker_name} · {row.wastepicker_id}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-foreground">{formatWeight(row.weight_kg)} kg</span>
                      </div>
                      <p className="mt-2 text-xs text-text-secondary">
                        <FaHistory className="mr-1 inline h-3 w-3" />
                        {formatDateKey(row.date)} · Saco cheio: {row.bag_full ? 'Sim' : 'Não'}
                      </p>
                      <button type="button" onClick={() => openDelete(row)} disabled={deleting || submitting}
                        aria-label={`Excluir pesagem #${row.id} de ${row.worker_name}`}
                        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-error hover:bg-error/10 disabled:opacity-60">
                        <FaTrash aria-hidden="true" className="h-3 w-3" /> Excluir pesagem
                      </button>
                    </article>
                  ))}
                  <p className="text-xs text-text-secondary">
                    {collectionsTotal.count} coletas · {formatWeight(collectionsTotal.weightKg)} kg no período
                  </p>
                </div>
              </SectionMessage>
            </div>
          </div>
        </section>
      </div>
      {deleteTarget ? (
        <DeleteCollectionDialog key={deleteTarget.id} collection={deleteTarget} pending={deleting} error={deleteError}
          onCancel={() => { if (!deleteInFlight.current) setDeleteTarget(null); }}
          onConfirm={(reason) => void handleDelete(reason)} />
      ) : null}
    </Layout>
  );
}

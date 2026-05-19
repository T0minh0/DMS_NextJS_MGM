'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import {
  FaBell,
  FaBoxOpen,
  FaCalendarAlt,
  FaChartLine,
  FaClipboardCheck,
  FaExclamationTriangle,
  FaFilter,
  FaHandshake,
  FaRedo,
  FaShoppingCart,
  FaSpinner,
  FaUsers,
  FaWarehouse,
} from 'react-icons/fa';

type PeriodFilter = 'weekly' | 'monthly' | 'yearly';
type DashboardSection =
  | 'session'
  | 'materials'
  | 'materialGroups'
  | 'workers'
  | 'stock'
  | 'earnings'
  | 'workerCollections'
  | 'priceFluctuation'
  | 'birthdays'
  | 'notices'
  | 'sales'
  | 'collectiveInvitations';

interface SessionUser {
  id: string;
  full_name: string;
  name: string;
  role: 'admin' | 'manager';
  userType: number;
  user_type: number;
  cooperative_id: string;
  cooperative_name: string | null;
}

interface MaterialItem {
  _id?: string;
  id?: string;
  material_id?: string | number;
  name?: string;
  material?: string;
  group?: string;
  isGroup?: boolean;
}

interface MaterialGroupItem {
  group_id: string;
  group: string;
}

interface WorkerItem {
  _id?: string;
  id?: string;
  worker_id?: string | number;
  full_name?: string;
  worker_name?: string;
}

interface StockPayload {
  [key: string]: number | string | boolean | undefined;
  noData?: boolean;
  message?: string;
}

interface EarningsItem {
  period?: string;
  earnings?: number;
  total_revenue?: number;
  revenue?: number;
}

interface WorkerCollectionItem {
  worker_name?: string;
  totalWeight?: number;
  total_weight?: number;
}

interface WorkerCollectionsPayload {
  grouped?: boolean;
  data?: WorkerCollectionItem[];
  workers?: WorkerCollectionItem[];
  noData?: boolean;
  message?: string;
}

interface PriceFluctuationPayload {
  noData?: boolean;
  message?: string;
  materials?: string[];
  priceData?: Array<Record<string, unknown>>;
}

interface BirthdayItem {
  name?: string;
  date?: string;
}

interface NoticeItem {
  _id?: string;
  id?: string;
  title?: string;
  priority?: number;
  is_global?: boolean;
  expires_at?: string | null;
}

interface SaleItem {
  _id?: string;
  id?: string;
  material_name?: string;
  buyer_name?: string;
  status?: string;
  sold_at?: string | null;
  cancelled_at?: string | null;
  total_weight?: number;
}

interface CollectiveInvitationItem {
  _id?: string;
  id?: string;
  material_name?: string;
  creator_cooperative_name?: string;
}

interface RequestError extends Error {
  status?: number;
}

const LOW_STOCK_KG = 25;

const initialLoading: Record<DashboardSection, boolean> = {
  session: true,
  materials: true,
  materialGroups: true,
  workers: true,
  stock: true,
  earnings: true,
  workerCollections: true,
  priceFluctuation: true,
  birthdays: true,
  notices: true,
  sales: true,
  collectiveInvitations: true,
};

const periodLabels: Record<PeriodFilter, string> = {
  weekly: 'Semana',
  monthly: 'Mês',
  yearly: 'Ano',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatWeight(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function getMaterialId(material: MaterialItem) {
  return String(material.material_id ?? material._id ?? material.id ?? '');
}

function getMaterialName(material: MaterialItem) {
  return material.name || material.material || `Material ${getMaterialId(material)}`;
}

function asArray<T>(value: unknown, keys: string[] = []) {
  if (Array.isArray(value)) return value as T[];

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }

  return [];
}

function getLatestEarnings(items: EarningsItem[]) {
  const latest = items.at(-1);
  return Number(latest?.earnings ?? latest?.total_revenue ?? latest?.revenue ?? 0);
}

function SectionMessage({
  loading,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  children,
}: {
  loading: boolean;
  error?: string;
  empty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-lg border border-outline/70 bg-surface px-4 py-6 text-sm text-text-secondary">
        <FaSpinner className="mr-3 h-4 w-4 animate-spin text-primary" />
        Carregando leitura operacional...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-error/35 bg-error/10 px-4 py-4">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <div>
            <p className="text-sm font-semibold text-error">Leitura indisponível</p>
            <p className="mt-1 text-sm text-text-secondary">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
        <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
        <p className="mt-1 text-sm text-text-secondary">{emptyDescription}</p>
      </div>
    );
  }

  return children;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'primary',
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'primary' | 'success' | 'warning' | 'secondary';
}) {
  const toneClass = {
    primary: 'border-primary/35 bg-primary/12 text-primary',
    success: 'border-success/35 bg-success/12 text-success',
    warning: 'border-warning/35 bg-warning/12 text-warning',
    secondary: 'border-secondary/35 bg-secondary/12 text-secondary',
  }[tone];

  return (
    <article className="surface-panel rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-text-secondary">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-sm text-text-secondary">{detail}</p>
    </article>
  );
}

export default function HomePage() {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('monthly');
  const [materialFilter, setMaterialFilter] = useState('');
  const [materialGroupFilter, setMaterialGroupFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroupItem[]>([]);
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [stockData, setStockData] = useState<StockPayload>({});
  const [earningsData, setEarningsData] = useState<EarningsItem[]>([]);
  const [workerCollections, setWorkerCollections] = useState<WorkerCollectionsPayload>({});
  const [priceFluctuation, setPriceFluctuation] = useState<PriceFluctuationPayload>({});
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [collectiveInvitations, setCollectiveInvitations] = useState<CollectiveInvitationItem[]>([]);
  const [loading, setLoading] = useState(initialLoading);
  const [errors, setErrors] = useState<Partial<Record<DashboardSection, string>>>({});
  const dashboardRequestSeq = useRef(0);

  const fetchJson = useCallback(async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { credentials: 'same-origin' });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
      const message = payload.message || payload.error || 'Não foi possível carregar esta seção.';
      const error = new Error(message) as RequestError;
      error.status = response.status;
      throw error;
    }

    return response.json() as Promise<T>;
  }, []);

  const effectiveMaterialFilter = useMemo(() => {
    if (materialFilter) return materialFilter;
    if (materialGroupFilter) return `group_${materialGroupFilter}`;
    return '';
  }, [materialFilter, materialGroupFilter]);

  const loadDashboard = useCallback(async () => {
    const requestId = dashboardRequestSeq.current + 1;
    dashboardRequestSeq.current = requestId;

    setLoading(initialLoading);
    setErrors({});

    const stockUrl = effectiveMaterialFilter
      ? `/api/stock?material_id=${encodeURIComponent(effectiveMaterialFilter)}`
      : '/api/stock';
    const earningsUrl = effectiveMaterialFilter
      ? `/api/earnings-comparison?period_type=${periodFilter}&material_id=${encodeURIComponent(effectiveMaterialFilter)}`
      : `/api/earnings-comparison?period_type=${periodFilter}`;
    const workerCollectionsUrl = new URLSearchParams({
      period_type: periodFilter,
    });

    if (workerFilter) workerCollectionsUrl.set('worker_id', workerFilter);
    if (effectiveMaterialFilter) workerCollectionsUrl.set('material_id', effectiveMaterialFilter);

    const [
      sessionResult,
      materialsResult,
      materialGroupsResult,
      workersResult,
      stockResult,
      earningsResult,
      workerCollectionsResult,
      priceFluctuationResult,
      birthdaysResult,
      noticesResult,
      salesResult,
      collectiveInvitationsResult,
    ] = await Promise.allSettled([
      fetchJson<SessionUser>('/api/auth/session'),
      fetchJson<unknown>('/api/materials'),
      fetchJson<unknown>('/api/material-groups'),
      fetchJson<unknown>('/api/users'),
      fetchJson<StockPayload>(stockUrl),
      fetchJson<unknown>(earningsUrl),
      fetchJson<WorkerCollectionsPayload>(`/api/worker-collections?${workerCollectionsUrl.toString()}`),
      fetchJson<PriceFluctuationPayload>(
        effectiveMaterialFilter
          ? `/api/price-fluctuation?material_id=${encodeURIComponent(effectiveMaterialFilter)}`
          : '/api/price-fluctuation',
      ),
      fetchJson<unknown>('/api/birthdays'),
      fetchJson<unknown>('/api/notices'),
      fetchJson<unknown>('/api/sales'),
      fetchJson<unknown>('/api/collective-sales/invitations'),
    ]);

    const nextErrors: Partial<Record<DashboardSection, string>> = {};
    const markError = (key: DashboardSection, result: PromiseSettledResult<unknown>) => {
      if (result.status === 'rejected') {
        nextErrors[key] = result.reason instanceof Error
          ? result.reason.message
          : 'Leitura indisponível para esta seção.';
      }
    };

    if (requestId !== dashboardRequestSeq.current) return;

    if (sessionResult.status === 'fulfilled') setSessionUser(sessionResult.value);
    else {
      setSessionUser(null);
      markError('session', sessionResult);
    }

    if (materialsResult.status === 'fulfilled') {
      setMaterials(asArray<MaterialItem>(materialsResult.value, ['materials', 'data']));
    } else {
      setMaterials([]);
      markError('materials', materialsResult);
    }

    if (materialGroupsResult.status === 'fulfilled') {
      setMaterialGroups(asArray<MaterialGroupItem>(materialGroupsResult.value, ['groups', 'data']));
    } else {
      setMaterialGroups([]);
      markError('materialGroups', materialGroupsResult);
    }

    if (workersResult.status === 'fulfilled') {
      setWorkers(asArray<WorkerItem>(workersResult.value, ['workers', 'data']));
    } else {
      setWorkers([]);
      markError('workers', workersResult);
    }

    if (stockResult.status === 'fulfilled') setStockData(stockResult.value);
    else {
      setStockData({});
      markError('stock', stockResult);
    }

    if (earningsResult.status === 'fulfilled') {
      setEarningsData(asArray<EarningsItem>(earningsResult.value, ['earnings', 'data']));
    } else {
      setEarningsData([]);
      markError('earnings', earningsResult);
    }

    if (workerCollectionsResult.status === 'fulfilled') setWorkerCollections(workerCollectionsResult.value);
    else {
      setWorkerCollections({});
      markError('workerCollections', workerCollectionsResult);
    }

    if (priceFluctuationResult.status === 'fulfilled') setPriceFluctuation(priceFluctuationResult.value);
    else {
      setPriceFluctuation({});
      markError('priceFluctuation', priceFluctuationResult);
    }

    if (birthdaysResult.status === 'fulfilled') {
      setBirthdays(asArray<BirthdayItem>(birthdaysResult.value, ['birthdays', 'data']));
    } else {
      setBirthdays([]);
      markError('birthdays', birthdaysResult);
    }

    if (noticesResult.status === 'fulfilled') {
      setNotices(asArray<NoticeItem>(noticesResult.value, ['notices', 'data']));
    } else {
      setNotices([]);
      markError('notices', noticesResult);
    }

    if (salesResult.status === 'fulfilled') {
      setSales(asArray<SaleItem>(salesResult.value, ['sales', 'data']));
    } else {
      setSales([]);
      markError('sales', salesResult);
    }

    if (collectiveInvitationsResult.status === 'fulfilled') {
      setCollectiveInvitations(
        asArray<CollectiveInvitationItem>(collectiveInvitationsResult.value, ['invitations', 'data']),
      );
    } else {
      setCollectiveInvitations([]);
      markError('collectiveInvitations', collectiveInvitationsResult);
    }

    setErrors(nextErrors);
    setLoading({
      session: false,
      materials: false,
      materialGroups: false,
      workers: false,
      stock: false,
      earnings: false,
      workerCollections: false,
      priceFluctuation: false,
      birthdays: false,
      notices: false,
      sales: false,
      collectiveInvitations: false,
    });
  }, [effectiveMaterialFilter, fetchJson, periodFilter, workerFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  const materialNameById = useMemo(() => {
    const map = new Map<string, string>();
    materials.forEach((material) => {
      const id = getMaterialId(material);
      if (id) map.set(id, getMaterialName(material));
    });
    return map;
  }, [materials]);
  const filterableMaterials = useMemo(
    () => materials.filter((material) => (
      !material.isGroup &&
      getMaterialId(material) &&
      (!materialGroupFilter || material.group === materialGroupFilter)
    )),
    [materialGroupFilter, materials],
  );

  useEffect(() => {
    if (!materialFilter) return;
    if (filterableMaterials.some((material) => getMaterialId(material) === materialFilter)) return;
    setMaterialFilter('');
  }, [filterableMaterials, materialFilter]);

  const stockEntries = useMemo(() => (
    Object.entries(stockData)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => {
        const materialId = key.replace('Material ', '');
        const label = key.startsWith('Material ')
          ? materialNameById.get(materialId) || key
          : key;

        return {
          key,
          label,
          weightKg: Number(value),
        };
      })
      .sort((left, right) => right.weightKg - left.weightKg)
  ), [materialNameById, stockData]);

  const totalStock = stockEntries.reduce((total, item) => total + item.weightKg, 0);
  const criticalStock = stockEntries
    .filter((item) => item.weightKg <= LOW_STOCK_KG)
    .sort((left, right) => left.weightKg - right.weightKg);
  const currentEarnings = getLatestEarnings(earningsData);
  const activeSales = sales.filter((sale) => !sale.sold_at && !sale.cancelled_at && sale.status !== 'SOLD');
  const priorityNotices = notices
    .filter((notice) => Number(notice.priority ?? 0) >= 3)
    .slice(0, 3);
  const workerCollectionRows = workerCollections.data ?? workerCollections.workers ?? [];
  const visibleWorkerCollections = workerCollectionRows.slice(0, 5);
  const pendingCount = criticalStock.length + collectiveInvitations.length + priorityNotices.length;
  const operationalErrorCount = Object.keys(errors).filter((key) => key !== 'session').length;
  const materialFilterLabel = materialFilter
    ? materialNameById.get(materialFilter) || 'Material selecionado'
    : materialGroupFilter
      ? `Grupo ${materialGroupFilter}`
      : 'Todos os materiais';

  return (
    <Layout activePath="/">
      <div className="space-y-6">
        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold uppercase text-primary">
                <FaClipboardCheck className="h-3.5 w-3.5" />
                Visão geral gerencial
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  Painel do dia da cooperativa
                </h1>
                <p className="mt-2 text-sm text-text-secondary">
                  Acompanhe estoque crítico, vendas ativas, receita, avisos e pendências operacionais sem comandos de suporte na superfície do gerente.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date())}
                </span>
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {sessionUser?.cooperative_name || 'Cooperativa definida pela sessão'}
                </span>
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {periodLabels[periodFilter]} em análise
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[28rem]">
              <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                <p className="text-xs uppercase text-text-secondary">Usuário</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {loading.session ? 'Validando sessão...' : sessionUser?.full_name || 'Sessão indisponível'}
                </p>
              </div>
              <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                <p className="text-xs uppercase text-text-secondary">Pendências</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {operationalErrorCount > 0 ? `${operationalErrorCount} leituras com erro` : `${pendingCount} itens em atenção`}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel rounded-xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <FaFilter className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Filtros operacionais</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="periodFilter" className="mb-2 block text-xs font-semibold uppercase text-text-secondary">
                Período
              </label>
              <select
                id="periodFilter"
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
                className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0"
              >
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </select>
            </div>

            <div>
              <label htmlFor="materialFilter" className="mb-2 block text-xs font-semibold uppercase text-text-secondary">
                Material
              </label>
              <select
                id="materialFilter"
                value={materialFilter}
                onChange={(event) => setMaterialFilter(event.target.value)}
                className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0"
              >
                <option value="">Todos os materiais</option>
                {filterableMaterials.map((material) => {
                  const id = getMaterialId(material);

                  return (
                    <option key={id} value={id}>
                      {getMaterialName(material)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="workerFilter" className="mb-2 block text-xs font-semibold uppercase text-text-secondary">
                Equipe
              </label>
              <select
                id="workerFilter"
                value={workerFilter}
                onChange={(event) => setWorkerFilter(event.target.value)}
                className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0"
              >
                <option value="">Todos os integrantes</option>
                {workers.map((worker) => {
                  const id = String(worker.id ?? worker._id ?? worker.worker_id ?? '');
                  if (!id) return null;

                  return (
                    <option key={id} value={id}>
                      {worker.full_name || worker.worker_name || `Integrante ${id}`}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="materialGroupFilter" className="mb-2 block text-xs font-semibold uppercase text-text-secondary">
                Grupo de materiais
              </label>
              <select
                id="materialGroupFilter"
                value={materialGroupFilter}
                onChange={(event) => setMaterialGroupFilter(event.target.value)}
                className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0"
              >
                <option value="">Todos os grupos</option>
                {materialGroups.map((materialGroup) => (
                  <option key={materialGroup.group_id} value={materialGroup.group}>
                    {materialGroup.group}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              Recorte atual: {periodLabels[periodFilter].toLowerCase()} · {materialFilterLabel}.
            </p>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90"
            >
              <FaRedo className="h-4 w-4" />
              Atualizar painel
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Receita do período"
            value={loading.earnings ? 'Carregando' : formatCurrency(currentEarnings)}
            detail="Valor consolidado pelo recorte selecionado."
            icon={FaChartLine}
            tone="success"
          />
          <MetricCard
            title="Estoque total"
            value={loading.stock ? 'Carregando' : `${formatWeight(totalStock)} kg`}
            detail={`${criticalStock.length} materiais em atenção operacional.`}
            icon={FaWarehouse}
          />
          <MetricCard
            title="Vendas ativas"
            value={loading.sales ? 'Carregando' : formatInteger(activeSales.length)}
            detail={`${collectiveInvitations.length} convites coletivos aguardando decisão.`}
            icon={FaShoppingCart}
            tone="secondary"
          />
          <MetricCard
            title="Equipe listada"
            value={loading.workers ? 'Carregando' : formatInteger(workers.length)}
            detail="Integrantes retornados pelo escopo da sessão."
            icon={FaUsers}
            tone="warning"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <div className="surface-panel rounded-xl p-6">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Pendências operacionais</h2>
                <p className="text-sm text-text-secondary">
                  Itens que ajudam o gerente a decidir a próxima ação da cooperativa.
                </p>
              </div>
              <span className="w-fit rounded-full border border-warning/35 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                {pendingCount} em atenção
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionMessage
                loading={loading.stock}
                error={errors.stock}
                empty={criticalStock.length === 0}
                emptyTitle="Nenhum estoque crítico no recorte"
                emptyDescription="Os materiais carregados estão acima do limite operacional de atenção."
              >
                <div className="space-y-3">
                  {criticalStock.slice(0, 5).map((item) => (
                    <div key={item.key} className="rounded-lg border border-warning/35 bg-warning/10 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.label}</p>
                          <p className="mt-1 text-xs text-text-secondary">Estoque abaixo de {LOW_STOCK_KG} kg.</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-warning">
                          {formatWeight(item.weightKg)} kg
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionMessage>

              <SectionMessage
                loading={loading.collectiveInvitations || loading.notices}
                error={errors.collectiveInvitations || errors.notices}
                empty={collectiveInvitations.length === 0 && priorityNotices.length === 0}
                emptyTitle="Nenhum aviso ou convite pendente"
                emptyDescription="Quando houver convites coletivos ou avisos prioritários, eles aparecem aqui."
              >
                <div className="space-y-3">
                  {collectiveInvitations.slice(0, 3).map((invitation) => (
                    <Link
                      key={invitation._id || invitation.id || invitation.material_name}
                      href="/collective-sales"
                      className="block rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 hover:border-primary/45"
                    >
                      <p className="text-sm font-semibold text-foreground">Convite de venda coletiva</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {invitation.material_name || 'Material a confirmar'} · {invitation.creator_cooperative_name || 'Cooperativa convidante'}
                      </p>
                    </Link>
                  ))}

                  {priorityNotices.map((notice) => (
                    <Link
                      key={notice._id || notice.id || notice.title}
                      href="/notices"
                      className="block rounded-lg border border-secondary/25 bg-secondary/10 px-4 py-3 hover:border-secondary/45"
                    >
                      <p className="text-sm font-semibold text-foreground">{notice.title || 'Aviso prioritário'}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        Prioridade {notice.priority ?? '-'} · {notice.is_global ? 'Global' : 'Cooperativa'}
                      </p>
                    </Link>
                  ))}
                </div>
              </SectionMessage>
            </div>
          </div>

          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">Próximas ações</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Atalhos para resolver o que apareceu no painel sem expor ferramentas internas.
            </p>

            <div className="mt-5 space-y-3">
              {[
                { href: '/materials', label: 'Revisar materiais e estoque', icon: FaBoxOpen },
                { href: '/sales', label: 'Acompanhar vendas', icon: FaShoppingCart },
                { href: '/collective-sales', label: 'Responder convites coletivos', icon: FaHandshake },
                { href: '/notices', label: 'Ver avisos relevantes', icon: FaBell },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-outline/70 bg-surface px-4 py-3 text-sm font-semibold text-foreground hover:border-primary/40 hover:bg-surface-elevated"
                >
                  <action.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span>{action.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">Estoque por material</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Leitura rápida dos saldos retornados pelo escopo atual.
            </p>

            <div className="mt-5">
              <SectionMessage
                loading={loading.stock}
                error={errors.stock}
                empty={stockEntries.length === 0}
                emptyTitle="Sem estoque carregado"
                emptyDescription={stockData.message || 'A API não retornou saldos para este recorte.'}
              >
                <div className="space-y-3">
                  {stockEntries.slice(0, 8).map((item) => {
                    const percent = totalStock > 0 ? Math.max(6, Math.round((item.weightKg / totalStock) * 100)) : 0;

                    return (
                      <div key={item.key}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-foreground">{item.label}</span>
                          <span className="shrink-0 font-semibold text-text-secondary">{formatWeight(item.weightKg)} kg</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-elevated">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionMessage>
            </div>
          </div>

          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">Receita e produtividade</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Indicadores de apoio, sem transformar o painel em ranking de equipe.
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <SectionMessage
                loading={loading.earnings || loading.priceFluctuation}
                error={errors.earnings || errors.priceFluctuation}
                empty={earningsData.length === 0 && !priceFluctuation.materials?.length}
                emptyTitle="Sem série financeira"
                emptyDescription="Selecione outro período ou material para revisar a variação disponível."
              >
                <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                  <p className="text-xs uppercase text-text-secondary">Última receita lida</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(currentEarnings)}</p>
                  <p className="mt-2 text-sm text-text-secondary">
                    {earningsData.at(-1)?.period || 'Período atual'} · {materialFilterLabel}
                  </p>
                </div>
              </SectionMessage>

              <SectionMessage
                loading={loading.workerCollections}
                error={errors.workerCollections}
                empty={visibleWorkerCollections.length === 0}
                emptyTitle="Sem produtividade listada"
                emptyDescription="A equipe aparece quando há medições consolidadas para o filtro."
              >
                <div className="space-y-3">
                  {visibleWorkerCollections.map((item, index) => (
                    <div key={`${item.worker_name}-${index}`} className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">{item.worker_name || 'Integrante da equipe'}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {formatWeight(Number(item.totalWeight ?? item.total_weight ?? 0))} kg no recorte
                      </p>
                    </div>
                  ))}
                </div>
              </SectionMessage>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">Avisos recentes</h2>
            <div className="mt-5">
              <SectionMessage
                loading={loading.notices}
                error={errors.notices}
                empty={notices.length === 0}
                emptyTitle="Nenhum aviso ativo"
                emptyDescription="Avisos globais e da cooperativa aparecerão aqui quando estiverem ativos."
              >
                <div className="space-y-3">
                  {notices.slice(0, 4).map((notice) => (
                    <Link
                      key={notice._id || notice.id || notice.title}
                      href="/notices"
                      className="block rounded-lg border border-outline/70 bg-surface px-4 py-3 hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{notice.title || 'Aviso'}</p>
                        <span className="shrink-0 rounded-full border border-outline/70 px-2 py-0.5 text-xs text-text-secondary">
                          P{notice.priority ?? '-'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </SectionMessage>
            </div>
          </div>

          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">Agenda da equipe</h2>
            <div className="mt-5">
              <SectionMessage
                loading={loading.birthdays}
                error={errors.birthdays}
                empty={birthdays.length === 0}
                emptyTitle="Sem aniversários no mês"
                emptyDescription="Datas relevantes da equipe aparecem como contexto leve para o gerente."
              >
                <div className="space-y-3">
                  {birthdays.slice(0, 4).map((birthday, index) => (
                    <div key={`${birthday.name}-${index}`} className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FaCalendarAlt className="h-4 w-4 text-secondary" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{birthday.name || 'Integrante da equipe'}</p>
                          <p className="text-xs text-text-secondary">{birthday.date || 'Data não informada'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionMessage>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

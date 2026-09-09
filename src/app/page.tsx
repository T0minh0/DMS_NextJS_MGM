'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { BarChart, LineChart } from '@/components/charts';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { SectionMessage } from '@/components/dashboard/SectionMessage';
import { LOW_STOCK_KG, classifyStockLevel, type StockLevel } from '@/lib/stock/thresholds';
import {
  FaBalanceScale,
  FaBell,
  FaBoxOpen,
  FaCalendarAlt,
  FaChartLine,
  FaChartPie,
  FaClipboardCheck,
  FaFilter,
  FaHandshake,
  FaRedo,
  FaShoppingCart,
  FaUsers,
  FaWarehouse,
} from 'react-icons/fa';

type PeriodFilter = 'weekly' | 'monthly' | 'yearly';
type StaticSection =
  | 'session'
  | 'materials'
  | 'materialGroups'
  | 'workers'
  | 'birthdays'
  | 'notices'
  | 'sales'
  | 'collectiveInvitations';
type FilteredSection = 'stock' | 'earnings' | 'workerCollections';
type DashboardSection = StaticSection | FilteredSection;

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
  exit_date?: string | null;
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

interface StockEntry {
  key: string;
  label: string;
  weightKg: number;
  level: StockLevel;
}

const STATIC_SECTIONS: StaticSection[] = [
  'session',
  'materials',
  'materialGroups',
  'workers',
  'birthdays',
  'notices',
  'sales',
  'collectiveInvitations',
];

const FILTERED_SECTIONS: FilteredSection[] = ['stock', 'earnings', 'workerCollections'];

const initialLoading: Record<DashboardSection, boolean> = {
  session: true,
  materials: true,
  materialGroups: true,
  workers: true,
  birthdays: true,
  notices: true,
  sales: true,
  collectiveInvitations: true,
  stock: true,
  earnings: true,
  workerCollections: true,
};

const periodLabels: Record<PeriodFilter, string> = {
  weekly: 'Semana',
  monthly: 'Mês',
  yearly: 'Ano',
};

const stockLevelCopy: Record<Exclude<StockLevel, 'stable'>, string> = {
  empty: 'Sem saldo em estoque.',
  critical: `Estoque abaixo de ${LOW_STOCK_KG} kg.`,
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

function getEarningsValue(item: EarningsItem | undefined) {
  return Number(item?.earnings ?? item?.total_revenue ?? item?.revenue ?? 0);
}

function getLatestEarnings(items: EarningsItem[]) {
  return getEarningsValue(items.at(-1));
}

function sectionsToRecord<T extends DashboardSection>(sections: T[], value: boolean) {
  return Object.fromEntries(sections.map((section) => [section, value])) as Record<T, boolean>;
}

function describeRejection(result: PromiseSettledResult<unknown>) {
  if (result.status !== 'rejected') return undefined;
  return result.reason instanceof Error
    ? result.reason.message
    : 'Leitura indisponível para esta seção.';
}

export default function HomePage() {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('monthly');
  const [materialFilter, setMaterialFilter] = useState('');
  const [materialGroupFilter, setMaterialGroupFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroupItem[]>([]);
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [stockData, setStockData] = useState<StockPayload>({});
  const [earningsData, setEarningsData] = useState<EarningsItem[]>([]);
  const [workerCollections, setWorkerCollections] = useState<WorkerCollectionsPayload>({});
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

  const sessionCooperativeId = sessionUser?.cooperative_id ?? '';

  const setSectionErrors = useCallback(
    (sections: DashboardSection[], nextErrors: Partial<Record<DashboardSection, string>>) => {
      setErrors((current) => {
        const merged = { ...current };
        sections.forEach((section) => {
          delete merged[section];
        });
        return { ...merged, ...nextErrors };
      });
    },
    [],
  );

  /**
   * Static sections depend only on the session (catalog, team, notices, sales,
   * invitations, birthdays). They load once on mount and on manual refresh so
   * period/material filters never make them flicker.
   */
  const loadStaticSections = useCallback(async () => {
    setLoading((current) => ({ ...current, ...sectionsToRecord(STATIC_SECTIONS, true) }));

    const nextErrors: Partial<Record<DashboardSection, string>> = {};
    let cooperativeId = '';

    try {
      const session = await fetchJson<SessionUser>('/api/auth/session');
      setSessionUser(session);
      cooperativeId = session.cooperative_id ?? '';
    } catch (error) {
      setSessionUser(null);
      nextErrors.session = error instanceof Error ? error.message : 'Sessão indisponível.';
    }

    const scoped = (path: string, extra?: Record<string, string>) => {
      const params = new URLSearchParams(extra);
      if (cooperativeId) params.set('cooperative_id', cooperativeId);
      const query = params.toString();
      return query ? `${path}?${query}` : path;
    };

    const [
      materialsResult,
      materialGroupsResult,
      workersResult,
      birthdaysResult,
      noticesResult,
      salesResult,
      collectiveInvitationsResult,
    ] = await Promise.allSettled([
      fetchJson<unknown>('/api/materials'),
      fetchJson<unknown>('/api/material-groups'),
      fetchJson<unknown>(scoped('/api/users')),
      fetchJson<unknown>(scoped('/api/birthdays')),
      fetchJson<unknown>('/api/notices'),
      fetchJson<unknown>(scoped('/api/sales', { status: 'ACTIVE', limit: '500' })),
      fetchJson<unknown>('/api/collective-sales/invitations'),
    ]);

    if (materialsResult.status === 'fulfilled') {
      setMaterials(asArray<MaterialItem>(materialsResult.value, ['materials', 'data']));
    } else {
      setMaterials([]);
      nextErrors.materials = describeRejection(materialsResult);
    }

    if (materialGroupsResult.status === 'fulfilled') {
      setMaterialGroups(asArray<MaterialGroupItem>(materialGroupsResult.value, ['groups', 'data']));
    } else {
      setMaterialGroups([]);
      nextErrors.materialGroups = describeRejection(materialGroupsResult);
    }

    if (workersResult.status === 'fulfilled') {
      setWorkers(asArray<WorkerItem>(workersResult.value, ['workers', 'data']));
    } else {
      setWorkers([]);
      nextErrors.workers = describeRejection(workersResult);
    }

    if (birthdaysResult.status === 'fulfilled') {
      setBirthdays(asArray<BirthdayItem>(birthdaysResult.value, ['birthdays', 'data']));
    } else {
      setBirthdays([]);
      nextErrors.birthdays = describeRejection(birthdaysResult);
    }

    if (noticesResult.status === 'fulfilled') {
      setNotices(asArray<NoticeItem>(noticesResult.value, ['notices', 'data']));
    } else {
      setNotices([]);
      nextErrors.notices = describeRejection(noticesResult);
    }

    if (salesResult.status === 'fulfilled') {
      setSales(asArray<SaleItem>(salesResult.value, ['sales', 'data']));
    } else {
      setSales([]);
      nextErrors.sales = describeRejection(salesResult);
    }

    if (collectiveInvitationsResult.status === 'fulfilled') {
      setCollectiveInvitations(
        asArray<CollectiveInvitationItem>(collectiveInvitationsResult.value, ['invitations', 'data']),
      );
    } else {
      setCollectiveInvitations([]);
      nextErrors.collectiveInvitations = describeRejection(collectiveInvitationsResult);
    }

    setSectionErrors(STATIC_SECTIONS, nextErrors);
    setLoading((current) => ({ ...current, ...sectionsToRecord(STATIC_SECTIONS, false) }));
    setSessionResolved(true);
  }, [fetchJson, setSectionErrors]);

  /**
   * Filtered sections react to period/material/team filters. A request
   * sequence guards against stale responses landing after a newer filter.
   */
  const loadFilteredSections = useCallback(async () => {
    const requestId = dashboardRequestSeq.current + 1;
    dashboardRequestSeq.current = requestId;

    setLoading((current) => ({ ...current, ...sectionsToRecord(FILTERED_SECTIONS, true) }));

    const stockParams = new URLSearchParams();
    if (effectiveMaterialFilter) stockParams.set('material_id', effectiveMaterialFilter);
    if (sessionCooperativeId) stockParams.set('cooperative_id', sessionCooperativeId);
    const stockQuery = stockParams.toString();
    const stockUrl = stockQuery ? `/api/stock?${stockQuery}` : '/api/stock';

    const earningsUrl = effectiveMaterialFilter
      ? `/api/earnings-comparison?period_type=${periodFilter}&material_id=${encodeURIComponent(effectiveMaterialFilter)}`
      : `/api/earnings-comparison?period_type=${periodFilter}`;
    const scopedEarningsUrl = sessionCooperativeId
      ? `${earningsUrl}&cooperative_id=${encodeURIComponent(sessionCooperativeId)}`
      : earningsUrl;

    const workerCollectionsUrl = new URLSearchParams({
      period_type: periodFilter,
    });

    if (workerFilter) workerCollectionsUrl.set('worker_id', workerFilter);
    if (effectiveMaterialFilter) workerCollectionsUrl.set('material_id', effectiveMaterialFilter);
    if (sessionCooperativeId) workerCollectionsUrl.set('cooperative_id', sessionCooperativeId);

    const [stockResult, earningsResult, workerCollectionsResult] = await Promise.allSettled([
      fetchJson<StockPayload>(stockUrl),
      fetchJson<unknown>(scopedEarningsUrl),
      fetchJson<WorkerCollectionsPayload>(`/api/worker-collections?${workerCollectionsUrl.toString()}`),
    ]);

    if (requestId !== dashboardRequestSeq.current) return;

    const nextErrors: Partial<Record<DashboardSection, string>> = {};

    if (stockResult.status === 'fulfilled') setStockData(stockResult.value);
    else {
      setStockData({});
      nextErrors.stock = describeRejection(stockResult);
    }

    if (earningsResult.status === 'fulfilled') {
      setEarningsData(asArray<EarningsItem>(earningsResult.value, ['earnings', 'data']));
    } else {
      setEarningsData([]);
      nextErrors.earnings = describeRejection(earningsResult);
    }

    if (workerCollectionsResult.status === 'fulfilled') setWorkerCollections(workerCollectionsResult.value);
    else {
      setWorkerCollections({});
      nextErrors.workerCollections = describeRejection(workerCollectionsResult);
    }

    setSectionErrors(FILTERED_SECTIONS, nextErrors);
    setLoading((current) => ({ ...current, ...sectionsToRecord(FILTERED_SECTIONS, false) }));
  }, [effectiveMaterialFilter, fetchJson, periodFilter, sessionCooperativeId, setSectionErrors, workerFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadStaticSections();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadStaticSections]);

  useEffect(() => {
    if (!sessionResolved) return undefined;

    const timeoutId = window.setTimeout(() => {
      void loadFilteredSections();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadFilteredSections, sessionResolved]);

  const refreshDashboard = useCallback(() => {
    void loadStaticSections();
    void loadFilteredSections();
  }, [loadFilteredSections, loadStaticSections]);

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
  const activeWorkers = useMemo(
    () => workers.filter((worker) => !worker.exit_date),
    [workers],
  );

  const stockEntries = useMemo<StockEntry[]>(() => (
    Object.entries(stockData)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => {
        const materialId = key.replace('Material ', '');
        const label = key.startsWith('Material ')
          ? materialNameById.get(materialId) || key
          : key;
        const weightKg = Number(value);

        return {
          key,
          label,
          weightKg,
          level: classifyStockLevel(weightKg),
        };
      })
      .sort((left, right) => right.weightKg - left.weightKg)
  ), [materialNameById, stockData]);

  const totalStock = stockEntries.reduce((total, item) => total + item.weightKg, 0);
  const attentionStock = stockEntries
    .filter((item) => item.level !== 'stable')
    .sort((left, right) => left.weightKg - right.weightKg);
  const topStock = stockEntries.slice(0, 8);
  const hasEarnings = earningsData.length > 0;
  const currentEarnings = getLatestEarnings(earningsData);
  const activeSales = sales.filter((sale) => (
    sale.status === 'ACTIVE' || (!sale.sold_at && !sale.cancelled_at && sale.status !== 'SOLD')
  ));
  const priorityNotices = notices
    .filter((notice) => Number(notice.priority ?? 0) >= 3)
    .slice(0, 3);
  const workerCollectionRows = workerCollections.data ?? workerCollections.workers ?? [];
  const visibleWorkerCollections = workerCollectionRows.slice(0, 5);
  const pendingCount = attentionStock.length + collectiveInvitations.length + priorityNotices.length;
  const operationalErrorCount = Object.keys(errors).filter((key) => key !== 'session').length;
  const hasMaterialFilter = Boolean(effectiveMaterialFilter);
  const materialFilterLabel = materialFilter
    ? materialNameById.get(materialFilter) || 'Material selecionado'
    : materialGroupFilter
      ? `Grupo ${materialGroupFilter}`
      : 'Todos os materiais';
  const invitationsDetail = `${collectiveInvitations.length} convites coletivos aguardando decisão.`;

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
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'America/Sao_Paulo' }).format(new Date())}
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
                <option value="">Todos os catadores ativos</option>
                {activeWorkers.map((worker) => {
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
                onChange={(event) => {
                  setMaterialGroupFilter(event.target.value);
                  setMaterialFilter('');
                }}
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
              onClick={refreshDashboard}
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
            value={loading.earnings ? 'Carregando' : hasEarnings ? formatCurrency(currentEarnings) : 'Sem vendas'}
            detail={hasEarnings ? 'Valor consolidado pelo recorte selecionado.' : 'Sem vendas no período selecionado.'}
            icon={FaChartLine}
            tone="success"
          />
          <MetricCard
            title="Estoque total"
            value={loading.stock ? 'Carregando' : `${formatWeight(totalStock)} kg`}
            detail={`${attentionStock.length} materiais em atenção operacional.`}
            icon={FaWarehouse}
          />
          <MetricCard
            title="Vendas ativas"
            value={loading.sales ? 'Carregando' : formatInteger(activeSales.length)}
            detail={hasMaterialFilter ? `Contagem sem filtro de material · ${invitationsDetail}` : invitationsDetail}
            icon={FaShoppingCart}
            tone="secondary"
          />
          <MetricCard
            title="Catadores ativos"
            value={loading.workers ? 'Carregando' : formatInteger(activeWorkers.length)}
            detail="Catadores ativos na cooperativa, sem desligados."
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
                empty={attentionStock.length === 0}
                emptyTitle="Nenhum estoque crítico no recorte"
                emptyDescription="Os materiais carregados estão acima do limite operacional de atenção."
              >
                <div className="space-y-3">
                  {attentionStock.slice(0, 5).map((item) => (
                    <div key={item.key} className="rounded-lg border border-warning/35 bg-warning/10 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.label}</p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {item.level === 'empty' ? stockLevelCopy.empty : stockLevelCopy.critical}
                          </p>
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
                { href: '/collections', label: 'Registrar coleta', icon: FaBalanceScale },
                { href: '/materials', label: 'Revisar materiais e estoque', icon: FaBoxOpen },
                { href: '/sales', label: 'Acompanhar vendas', icon: FaShoppingCart },
                { href: '/collective-sales', label: 'Responder convites coletivos', icon: FaHandshake },
                { href: '/dashboards', label: 'Ver dashboards e relatórios em PDF', icon: FaChartPie },
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
              Leitura rápida dos saldos retornados pelo escopo atual, em quilogramas.
            </p>

            <div className="mt-5">
              <SectionMessage
                loading={loading.stock}
                error={errors.stock}
                empty={stockEntries.length === 0}
                emptyTitle="Sem estoque carregado"
                emptyDescription={stockData.message || 'A API não retornou saldos para este recorte.'}
              >
                <BarChart
                  horizontal
                  title="Estoque atual dos principais materiais"
                  unit="kg"
                  labels={topStock.map((item) => item.label)}
                  datasets={[{ label: 'Estoque atual', data: topStock.map((item) => item.weightKg) }]}
                  ariaLabel="Gráfico de barras horizontais com o estoque atual dos principais materiais em quilogramas"
                  height={Math.max(180, topStock.length * 34)}
                  fallback="toggle"
                />
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
                loading={loading.earnings}
                error={errors.earnings}
                empty={!hasEarnings}
                emptyTitle="Sem série financeira"
                emptyDescription="Sem vendas no período. Selecione outro período ou material para revisar a variação disponível."
              >
                <div className="space-y-4">
                  <LineChart
                    title="Receita por período"
                    unit="R$"
                    labels={earningsData.map((item, index) => item.period || `Período ${index + 1}`)}
                    datasets={[{ label: 'Receita', data: earningsData.map(getEarningsValue), tone: 'success' }]}
                    ariaLabel="Gráfico de linha com a receita consolidada dos últimos períodos"
                    height={200}
                    fallback="toggle"
                  />
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                    <p className="text-xs uppercase text-text-secondary">Última receita lida</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(currentEarnings)}</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {earningsData.at(-1)?.period || 'Período atual'} · {materialFilterLabel}
                    </p>
                  </div>
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

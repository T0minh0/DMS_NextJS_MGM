'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { BarChart, DoughnutChart } from '@/components/charts';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { SectionMessage } from '@/components/dashboard/SectionMessage';
import {
  FaCalendarCheck,
  FaChartPie,
  FaClipboardList,
  FaFilePdf,
  FaFilter,
  FaMoneyBillWave,
  FaRedo,
  FaUsers,
  FaWarehouse,
  FaWeightHanging,
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
}

interface MaterialOption {
  _id?: string;
  id?: string;
  material_id?: string | number;
  material?: string;
  name?: string;
  group?: string;
  isGroup?: boolean;
}

interface MaterialGroupOption {
  group_id: string;
  group: string;
}

interface CooperativeOption {
  cooperative_id: string;
  name: string;
}

interface ReportMaterialRow {
  material_id: string;
  material_name: string;
  group_name: string | null;
  kg: number;
  share_pct: number;
  collections_count: number;
}

interface ReportWorkerRow {
  worker_id: string;
  wastepicker_id: string;
  worker_name: string;
  kg: number;
  collections_count: number;
  worked_days: number;
}

interface ReportDailyRow {
  date: string;
  kg: number;
  collections_count: number;
}

interface ReportSaleRow {
  sale_id: string;
  date: string;
  material_name: string;
  buyer_name: string;
  kg: number;
  price_kg: number;
  total_brl: number;
}

interface ReportStockRow {
  material_id: string;
  material_name: string;
  group_name: string | null;
  current_kg: number;
  total_collected_kg: number;
  total_sold_kg: number;
}

interface ReportWorkerDailyRow {
  date: string;
  material_id: string;
  material_name: string;
  kg: number;
  collections_count: number;
}

interface PeriodReport {
  kind: 'period' | 'worker-period';
  cooperative: { id: string; name: string };
  period: { year_month: string | null; from: string; to: string; label: string };
  generated_at: string;
  filters: {
    worker: { id: string; wastepicker_id: string; name: string } | null;
    material_label: string | null;
  };
  summary: {
    collected_kg: number;
    collections_count: number;
    active_workers: number;
    worked_days: number;
    sold_kg: number;
    sales_count: number;
    revenue_brl: number;
    stock_kg: number;
  };
  by_material: ReportMaterialRow[];
  by_worker: ReportWorkerRow[];
  daily: ReportDailyRow[];
  sales: ReportSaleRow[];
  stock: ReportStockRow[];
  worker_daily: ReportWorkerDailyRow[];
}

type PeriodMode = 'month' | 'range';

const fieldClass = 'block h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0 disabled:bg-surface-elevated disabled:text-text-secondary';
const labelClass = 'mb-1 block text-xs font-semibold uppercase text-text-secondary';
const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-outline/70 bg-surface px-4 text-sm font-semibold text-foreground hover:border-primary/40 hover:bg-surface-elevated';
const tableWrapClass = 'overflow-x-auto rounded-lg border border-outline';
const tableClass = 'w-full min-w-[32rem] text-left text-sm';
const theadClass = 'bg-surface-elevated text-xs uppercase text-text-secondary';
const cellClass = 'px-4 py-3';

function localDateKey(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateKey(key: string) {
  const [year, month, day] = key.split('-');
  if (!year || !month || !day) return key;
  return `${day}/${month}/${year}`;
}

function shortDateLabel(key: string) {
  const [, month, day] = key.split('-');
  return month && day ? `${day}/${month}` : key;
}

function formatWeight(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
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

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : fallbackMessage;
    throw new Error(message);
  }
  return data as T;
}

export default function DashboardsPage() {
  const todayKey = useMemo(() => localDateKey(), []);
  const currentMonth = todayKey.slice(0, 7);
  const reportRequestSeq = useRef(0);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroupOption[]>([]);
  const [cooperatives, setCooperatives] = useState<CooperativeOption[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [yearMonth, setYearMonth] = useState(currentMonth);
  const [fromDate, setFromDate] = useState(`${currentMonth}-01`);
  const [toDate, setToDate] = useState(todayKey);
  const [workerFilter, setWorkerFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [materialGroupFilter, setMaterialGroupFilter] = useState('');
  const [cooperativeFilter, setCooperativeFilter] = useState('');

  const [report, setReport] = useState<PeriodReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

  const isAdmin = sessionUser?.role === 'admin';
  const effectiveCooperativeId = (isAdmin && cooperativeFilter) || sessionUser?.cooperative_id || '';
  const effectiveMaterialFilter = materialFilter || (materialGroupFilter ? `group_${materialGroupFilter}` : '');

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

      const requests: Array<Promise<Response>> = [
        fetch(query ? `/api/users?${query}` : '/api/users', { credentials: 'same-origin' }),
        fetch('/api/materials', { credentials: 'same-origin' }),
        fetch('/api/material-groups', { credentials: 'same-origin' }),
      ];
      if (session.role === 'admin') {
        requests.push(fetch('/api/cooperatives', { credentials: 'same-origin' }));
      }

      const responses = await Promise.all(requests);
      const [workerRows, materialRows, groupRows] = await Promise.all([
        readJson<unknown>(responses[0], 'Falha ao carregar catadores'),
        readJson<unknown>(responses[1], 'Falha ao carregar materiais'),
        readJson<unknown>(responses[2], 'Falha ao carregar grupos de materiais'),
      ]);

      setWorkers(asArray<WorkerOption>(workerRows, ['workers', 'data']).filter((worker) => !worker.exit_date && workerId(worker)));
      setMaterials(asArray<MaterialOption>(materialRows, ['materials', 'data']).filter((material) => !material.isGroup && materialId(material)));
      setMaterialGroups(asArray<MaterialGroupOption>(groupRows, ['groups', 'data']));

      if (responses[3]) {
        const cooperativeRows = await readJson<unknown>(responses[3], 'Falha ao carregar cooperativas');
        setCooperatives(asArray<CooperativeOption>(cooperativeRows, ['cooperatives', 'data']));
      }
    } catch (loadError) {
      setReferenceError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os filtros.');
    } finally {
      setReferenceLoading(false);
    }
  }, []);

  const reportParams = useMemo(() => {
    const params = new URLSearchParams();
    if (periodMode === 'range') {
      params.set('from', fromDate);
      params.set('to', toDate);
    } else {
      params.set('year_month', yearMonth);
    }
    if (effectiveMaterialFilter) params.set('material_id', effectiveMaterialFilter);
    if (effectiveCooperativeId) params.set('cooperative_id', effectiveCooperativeId);
    return params;
  }, [effectiveCooperativeId, effectiveMaterialFilter, fromDate, periodMode, toDate, yearMonth]);

  const reportQuery = useMemo(() => {
    const params = new URLSearchParams(reportParams);
    if (workerFilter) params.set('worker_id', workerFilter);
    return params.toString();
  }, [reportParams, workerFilter]);

  const pdfPeriodUrl = `/api/reports/pdf/period?${reportParams.toString()}`;
  const pdfWorkerUrl = workerFilter
    ? `/api/reports/pdf/worker/${encodeURIComponent(workerFilter)}?${reportParams.toString()}`
    : null;

  const loadReport = useCallback(async () => {
    const requestId = reportRequestSeq.current + 1;
    reportRequestSeq.current = requestId;
    setReportLoading(true);
    setReportError(null);

    try {
      const response = await fetch(`/api/reports/period?${reportQuery}`, { credentials: 'same-origin' });
      const payload = await readJson<{ report?: PeriodReport }>(response, 'Não foi possível gerar a leitura do período');
      if (requestId !== reportRequestSeq.current) return;
      setReport(payload.report ?? null);
    } catch (loadError) {
      if (requestId !== reportRequestSeq.current) return;
      setReport(null);
      setReportError(loadError instanceof Error ? loadError.message : 'Não foi possível gerar a leitura do período');
    } finally {
      if (requestId === reportRequestSeq.current) {
        setReportLoading(false);
      }
    }
  }, [reportQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReferenceData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReferenceData]);

  useEffect(() => {
    if (referenceLoading) return undefined;
    const timeoutId = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReport, referenceLoading]);

  const filterableMaterials = useMemo(
    () => materials.filter((material) => !materialGroupFilter || material.group === materialGroupFilter),
    [materialGroupFilter, materials],
  );

  const isWorkerReport = report?.kind === 'worker-period';
  const summary = report?.summary;
  const hasCollections = (report?.summary.collections_count ?? 0) > 0;

  const dailyChart = useMemo(() => ({
    labels: (report?.daily ?? []).map((row) => shortDateLabel(row.date)),
    data: (report?.daily ?? []).map((row) => row.kg),
  }), [report]);

  const materialChart = useMemo(() => {
    const rows = report?.by_material ?? [];
    const top = rows.slice(0, 8);
    const rest = rows.slice(8);
    const labels = top.map((row) => row.material_name);
    const data = top.map((row) => row.kg);
    if (rest.length > 0) {
      labels.push('Outros');
      data.push(Number(rest.reduce((sum, row) => sum + row.kg, 0).toFixed(2)));
    }
    return { labels, data };
  }, [report]);

  const workerChart = useMemo(() => {
    const rows = (report?.by_worker ?? []).slice(0, 10);
    return {
      labels: rows.map((row) => `${row.worker_name} (${row.wastepicker_id})`),
      data: rows.map((row) => row.kg),
    };
  }, [report]);

  const revenueChart = useMemo(() => {
    const totals = new Map<string, number>();
    (report?.sales ?? []).forEach((sale) => {
      totals.set(sale.material_name, (totals.get(sale.material_name) ?? 0) + sale.total_brl);
    });
    const entries = Array.from(totals.entries()).sort((left, right) => right[1] - left[1]);
    return {
      labels: entries.map(([name]) => name),
      data: entries.map(([, value]) => Number(value.toFixed(2))),
    };
  }, [report]);

  const selectedWorker = workers.find((worker) => workerId(worker) === workerFilter) ?? null;
  const cooperativeLabel = report?.cooperative.name || sessionUser?.cooperative_name || 'Cooperativa definida pela sessão';

  return (
    <Layout activePath="/dashboards">
      <div className="space-y-6">
        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold uppercase text-primary">
                <FaChartPie className="h-3.5 w-3.5" />
                Dashboards
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Dashboards da cooperativa</h1>
                <p className="mt-2 text-sm text-text-secondary">
                  Coletas, vendas e estoque do período com gráficos e tabelas. Os relatórios em PDF usam exatamente os mesmos números desta leitura.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">{cooperativeLabel}</span>
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {report ? report.period.label : 'Período em análise'}
                </span>
                {report?.filters.material_label ? (
                  <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">{report.filters.material_label}</span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel rounded-xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <FaFilter className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Filtros do período</h2>
          </div>

          {referenceError ? (
            <div className="mb-4 rounded-lg border border-error/35 bg-error/10 px-4 py-3 text-sm text-foreground">
              {referenceError}
              <button type="button" onClick={() => void loadReferenceData()} className={`${secondaryButtonClass} ml-3`}>
                <FaRedo className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label htmlFor="periodMode" className={labelClass}>Tipo de período</label>
              <select
                id="periodMode"
                value={periodMode}
                onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}
                className={fieldClass}
              >
                <option value="month">Mês</option>
                <option value="range">Intervalo de datas</option>
              </select>
            </div>

            {periodMode === 'month' ? (
              <div>
                <label htmlFor="yearMonth" className={labelClass}>Mês</label>
                <input
                  id="yearMonth"
                  type="month"
                  value={yearMonth}
                  max={currentMonth}
                  onChange={(event) => setYearMonth(event.target.value || currentMonth)}
                  className={fieldClass}
                />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="fromDate" className={labelClass}>De</label>
                  <input
                    id="fromDate"
                    type="date"
                    value={fromDate}
                    max={toDate}
                    onChange={(event) => setFromDate(event.target.value || fromDate)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="toDate" className={labelClass}>Até</label>
                  <input
                    id="toDate"
                    type="date"
                    value={toDate}
                    min={fromDate}
                    max={todayKey}
                    onChange={(event) => setToDate(event.target.value || toDate)}
                    className={fieldClass}
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="workerFilter" className={labelClass}>Catador</label>
              <select
                id="workerFilter"
                value={workerFilter}
                onChange={(event) => setWorkerFilter(event.target.value)}
                className={fieldClass}
                disabled={referenceLoading}
              >
                <option value="">Toda a cooperativa</option>
                {workers.map((worker) => (
                  <option key={workerId(worker)} value={workerId(worker)}>
                    {workerLabel(worker)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="materialGroupFilter" className={labelClass}>Grupo de materiais</label>
              <select
                id="materialGroupFilter"
                value={materialGroupFilter}
                onChange={(event) => {
                  setMaterialGroupFilter(event.target.value);
                  setMaterialFilter('');
                }}
                className={fieldClass}
                disabled={referenceLoading}
              >
                <option value="">Todos os grupos</option>
                {materialGroups.map((group) => (
                  <option key={group.group_id} value={group.group}>{group.group}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="materialFilter" className={labelClass}>Material</label>
              <select
                id="materialFilter"
                value={materialFilter}
                onChange={(event) => setMaterialFilter(event.target.value)}
                className={fieldClass}
                disabled={referenceLoading}
              >
                <option value="">Todos os materiais</option>
                {filterableMaterials.map((material) => (
                  <option key={materialId(material)} value={materialId(material)}>{materialName(material)}</option>
                ))}
              </select>
            </div>

            {isAdmin ? (
              <div>
                <label htmlFor="cooperativeFilter" className={labelClass}>Cooperativa</label>
                <select
                  id="cooperativeFilter"
                  value={cooperativeFilter}
                  onChange={(event) => setCooperativeFilter(event.target.value)}
                  className={fieldClass}
                  disabled={referenceLoading}
                >
                  <option value="">Cooperativa da sessão</option>
                  {cooperatives.map((cooperative) => (
                    <option key={cooperative.cooperative_id} value={cooperative.cooperative_id}>{cooperative.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              {selectedWorker ? `Leitura individual: ${workerLabel(selectedWorker)}.` : 'Leitura consolidada da cooperativa.'}
            </p>
            <button type="button" onClick={() => void loadReport()} className={primaryButtonClass} disabled={reportLoading}>
              <FaRedo className="h-4 w-4" />
              Atualizar leitura
            </button>
          </div>
        </section>

        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Relatórios em PDF</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Dois documentos separados: o consolidado da cooperativa e o comprovante individual para entregar ao catador.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={pdfPeriodUrl} download className={primaryButtonClass}>
                <FaFilePdf className="h-4 w-4" />
                Baixar relatório consolidado (PDF)
              </a>
              {pdfWorkerUrl ? (
                <a href={pdfWorkerUrl} download className={secondaryButtonClass}>
                  <FaFilePdf className="h-4 w-4" />
                  Baixar comprovante do catador (PDF)
                </a>
              ) : (
                <button type="button" className={secondaryButtonClass} disabled title="Selecione um catador no filtro para gerar o comprovante">
                  <FaFilePdf className="h-4 w-4" />
                  Comprovante do catador: selecione um catador
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            title="Total coletado"
            value={reportLoading ? 'Carregando' : `${formatWeight(summary?.collected_kg ?? 0)} kg`}
            detail={`${formatInteger(summary?.collections_count ?? 0)} coletas registradas no período.`}
            icon={FaWeightHanging}
          />
          <MetricCard
            title={isWorkerReport ? 'Dias com coleta' : 'Catadores ativos'}
            value={reportLoading ? 'Carregando' : formatInteger(isWorkerReport ? summary?.worked_days ?? 0 : summary?.active_workers ?? 0)}
            detail={isWorkerReport ? 'Dias distintos com coleta registrada.' : 'Catadores com pelo menos uma coleta no período.'}
            icon={isWorkerReport ? FaCalendarCheck : FaUsers}
            tone="warning"
          />
          <MetricCard
            title="Coletas"
            value={reportLoading ? 'Carregando' : formatInteger(summary?.collections_count ?? 0)}
            detail="Registros com peso maior que zero."
            icon={FaClipboardList}
            tone="secondary"
          />
          {!isWorkerReport ? (
            <>
              <MetricCard
                title="Total vendido"
                value={reportLoading ? 'Carregando' : `${formatWeight(summary?.sold_kg ?? 0)} kg`}
                detail={`${formatInteger(summary?.sales_count ?? 0)} vendas concluídas pela data da venda.`}
                icon={FaChartPie}
                tone="secondary"
              />
              <MetricCard
                title="Receita"
                value={reportLoading ? 'Carregando' : formatCurrency(summary?.revenue_brl ?? 0)}
                detail="Soma de peso × preço/kg das vendas concluídas."
                icon={FaMoneyBillWave}
                tone="success"
              />
              <MetricCard
                title="Estoque atual"
                value={reportLoading ? 'Carregando' : `${formatWeight(summary?.stock_kg ?? 0)} kg`}
                detail="Saldo atual dos materiais no recorte (não é histórico)."
                icon={FaWarehouse}
              />
            </>
          ) : null}
        </section>

        <section className="surface-panel rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground">Gráficos do período</h2>
          <p className="mt-1 text-sm text-text-secondary">Cada gráfico tem a tabela de dados disponível para leitura de tela e nas seções abaixo.</p>

          <div className="mt-5">
            <SectionMessage
              loading={reportLoading}
              error={reportError ?? undefined}
              empty={!hasCollections}
              emptyTitle="Sem coletas no período"
              emptyDescription="Ajuste o período ou o filtro para ver gráficos e tabelas."
            >
              <div className="grid gap-6 xl:grid-cols-2">
                <BarChart
                  title="Coletas por dia"
                  unit="kg"
                  labels={dailyChart.labels}
                  datasets={[{ label: 'Coletado', data: dailyChart.data }]}
                  ariaLabel="Gráfico de barras com os quilos coletados por dia no período"
                  height={260}
                />
                <DoughnutChart
                  title="Coletas por material"
                  unit="kg"
                  labels={materialChart.labels}
                  series={{ label: 'Coletado', data: materialChart.data }}
                  ariaLabel="Gráfico de rosca com a participação de cada material nas coletas"
                  height={260}
                />
                {isWorkerReport ? (
                  <BarChart
                    title="Coletas por material do catador"
                    unit="kg"
                    labels={(report?.by_material ?? []).map((row) => row.material_name)}
                    datasets={[{ label: 'Coletado', data: (report?.by_material ?? []).map((row) => row.kg), tone: 'secondary' }]}
                    ariaLabel="Gráfico de barras com os quilos coletados por material pelo catador"
                    height={260}
                  />
                ) : (
                  <BarChart
                    horizontal
                    title="Top catadores"
                    unit="kg"
                    labels={workerChart.labels}
                    datasets={[{ label: 'Coletado', data: workerChart.data, tone: 'secondary' }]}
                    ariaLabel="Gráfico de barras horizontais com os catadores que mais coletaram no período"
                    height={Math.max(220, workerChart.labels.length * 30)}
                  />
                )}
                {!isWorkerReport ? (
                  <BarChart
                    title="Receita por material"
                    unit="R$"
                    labels={revenueChart.labels}
                    datasets={[{ label: 'Receita', data: revenueChart.data, tone: 'success' }]}
                    ariaLabel="Gráfico de barras com a receita das vendas concluídas por material"
                    height={260}
                  />
                ) : null}
              </div>
            </SectionMessage>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">Coletas por material</h2>
            <div className="mt-4">
              <SectionMessage
                loading={reportLoading}
                error={reportError ?? undefined}
                empty={(report?.by_material.length ?? 0) === 0}
                emptyTitle="Sem coletas no período"
                emptyDescription="Nenhum material foi coletado no recorte selecionado."
              >
                <div className={tableWrapClass}>
                  <table className={tableClass}>
                    <thead className={theadClass}>
                      <tr>
                        <th scope="col" className={cellClass}>Material</th>
                        <th scope="col" className={cellClass}>Grupo</th>
                        <th scope="col" className={`${cellClass} text-right`}>kg</th>
                        <th scope="col" className={`${cellClass} text-right`}>% do total</th>
                        <th scope="col" className={`${cellClass} text-right`}>Coletas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report?.by_material ?? []).map((row) => (
                        <tr key={row.material_id} className="border-t border-outline/60">
                          <td className={`${cellClass} text-foreground`}>{row.material_name}</td>
                          <td className={`${cellClass} text-text-secondary`}>{row.group_name ?? '—'}</td>
                          <td className={`${cellClass} text-right font-semibold text-foreground`}>{formatWeight(row.kg)}</td>
                          <td className={`${cellClass} text-right text-text-secondary`}>{formatPercent(row.share_pct)}</td>
                          <td className={`${cellClass} text-right text-text-secondary`}>{formatInteger(row.collections_count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionMessage>
            </div>
          </div>

          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">{isWorkerReport ? 'Coletas por dia e material' : 'Coletas por catador'}</h2>
            <div className="mt-4">
              <SectionMessage
                loading={reportLoading}
                error={reportError ?? undefined}
                empty={isWorkerReport ? (report?.worker_daily.length ?? 0) === 0 : (report?.by_worker.length ?? 0) === 0}
                emptyTitle="Sem coletas no período"
                emptyDescription="Nenhuma coleta registrada para o recorte selecionado."
              >
                <div className={tableWrapClass}>
                  {isWorkerReport ? (
                    <table className={tableClass}>
                      <thead className={theadClass}>
                        <tr>
                          <th scope="col" className={cellClass}>Data</th>
                          <th scope="col" className={cellClass}>Material</th>
                          <th scope="col" className={`${cellClass} text-right`}>kg</th>
                          <th scope="col" className={`${cellClass} text-right`}>Coletas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report?.worker_daily ?? []).map((row) => (
                          <tr key={`${row.date}-${row.material_id}`} className="border-t border-outline/60">
                            <td className={`${cellClass} text-text-secondary`}>{formatDateKey(row.date)}</td>
                            <td className={`${cellClass} text-foreground`}>{row.material_name}</td>
                            <td className={`${cellClass} text-right font-semibold text-foreground`}>{formatWeight(row.kg)}</td>
                            <td className={`${cellClass} text-right text-text-secondary`}>{formatInteger(row.collections_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className={tableClass}>
                      <thead className={theadClass}>
                        <tr>
                          <th scope="col" className={cellClass}>ID</th>
                          <th scope="col" className={cellClass}>Catador</th>
                          <th scope="col" className={`${cellClass} text-right`}>kg</th>
                          <th scope="col" className={`${cellClass} text-right`}>Coletas</th>
                          <th scope="col" className={`${cellClass} text-right`}>Dias</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report?.by_worker ?? []).map((row) => (
                          <tr key={row.worker_id} className="border-t border-outline/60">
                            <td className={`${cellClass} text-text-secondary`}>{row.wastepicker_id}</td>
                            <td className={`${cellClass} text-foreground`}>{row.worker_name}</td>
                            <td className={`${cellClass} text-right font-semibold text-foreground`}>{formatWeight(row.kg)}</td>
                            <td className={`${cellClass} text-right text-text-secondary`}>{formatInteger(row.collections_count)}</td>
                            <td className={`${cellClass} text-right text-text-secondary`}>{formatInteger(row.worked_days)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </SectionMessage>
            </div>
          </div>
        </section>

        {!isWorkerReport ? (
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="surface-panel rounded-xl p-6">
              <h2 className="text-lg font-semibold text-foreground">Vendas do período</h2>
              <p className="mt-1 text-sm text-text-secondary">Somente vendas concluídas, pela data da venda.</p>
              <div className="mt-4">
                <SectionMessage
                  loading={reportLoading}
                  error={reportError ?? undefined}
                  empty={(report?.sales.length ?? 0) === 0}
                  emptyTitle="Sem vendas concluídas"
                  emptyDescription="Nenhuma venda concluída no período selecionado."
                >
                  <div className={tableWrapClass}>
                    <table className={tableClass}>
                      <thead className={theadClass}>
                        <tr>
                          <th scope="col" className={cellClass}>Data</th>
                          <th scope="col" className={cellClass}>Material</th>
                          <th scope="col" className={cellClass}>Comprador</th>
                          <th scope="col" className={`${cellClass} text-right`}>kg</th>
                          <th scope="col" className={`${cellClass} text-right`}>R$/kg</th>
                          <th scope="col" className={`${cellClass} text-right`}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report?.sales ?? []).map((row) => (
                          <tr key={row.sale_id} className="border-t border-outline/60">
                            <td className={`${cellClass} text-text-secondary`}>{formatDateKey(row.date)}</td>
                            <td className={`${cellClass} text-foreground`}>{row.material_name}</td>
                            <td className={`${cellClass} text-text-secondary`}>{row.buyer_name}</td>
                            <td className={`${cellClass} text-right text-foreground`}>{formatWeight(row.kg)}</td>
                            <td className={`${cellClass} text-right text-text-secondary`}>{formatCurrency(row.price_kg)}</td>
                            <td className={`${cellClass} text-right font-semibold text-foreground`}>{formatCurrency(row.total_brl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionMessage>
              </div>
            </div>

            <div className="surface-panel rounded-xl p-6">
              <h2 className="text-lg font-semibold text-foreground">Estoque atual por material</h2>
              <p className="mt-1 text-sm text-text-secondary">Saldo atual em {report ? new Date(report.generated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}.</p>
              <div className="mt-4">
                <SectionMessage
                  loading={reportLoading}
                  error={reportError ?? undefined}
                  empty={(report?.stock.length ?? 0) === 0}
                  emptyTitle="Sem estoque registrado"
                  emptyDescription="Nenhum saldo de estoque para o recorte selecionado."
                >
                  <div className={tableWrapClass}>
                    <table className={tableClass}>
                      <thead className={theadClass}>
                        <tr>
                          <th scope="col" className={cellClass}>Material</th>
                          <th scope="col" className={cellClass}>Grupo</th>
                          <th scope="col" className={`${cellClass} text-right`}>Atual (kg)</th>
                          <th scope="col" className={`${cellClass} text-right`}>Coletado (kg)</th>
                          <th scope="col" className={`${cellClass} text-right`}>Vendido (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report?.stock ?? []).map((row) => (
                          <tr key={row.material_id} className="border-t border-outline/60">
                            <td className={`${cellClass} text-foreground`}>{row.material_name}</td>
                            <td className={`${cellClass} text-text-secondary`}>{row.group_name ?? '—'}</td>
                            <td className={`${cellClass} text-right font-semibold text-foreground`}>{formatWeight(row.current_kg)}</td>
                            <td className={`${cellClass} text-right text-text-secondary`}>{formatWeight(row.total_collected_kg)}</td>
                            <td className={`${cellClass} text-right text-text-secondary`}>{formatWeight(row.total_sold_kg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionMessage>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { GAMIFICATION_MANAGER_VIEW, isGamificationUiEnabled } from '@/lib/features/gamification';
import {
  FaCalendarAlt,
  FaChartLine,
  FaClock,
  FaExclamationTriangle,
  FaLayerGroup,
  FaMedal,
  FaRedo,
  FaSearch,
  FaSignal,
  FaSpinner,
  FaTasks,
  FaTrophy,
  FaUserCheck,
  FaUsers,
} from 'react-icons/fa';

type LeaderboardMode = 'current' | 'history';
type StoredUserRole = 'admin' | 'manager' | 'worker';

interface LeaderboardEntry {
  rankPosition: number;
  workerId: string;
  workerName: string;
  rawXP: number;
  finalXP: number;
  randomMultiplier: number;
}

interface LeaderboardResponse {
  yearMonth: string;
  weekNumber: number;
  computedAt: string | null;
  snapshotFound: boolean;
  entries: LeaderboardEntry[];
}

interface AchievementDefinition {
  achievementId: string;
  achievementKey: string;
  achievementName: string;
  description: string;
  category: string;
  thresholdValue: number;
  xpReward: number;
  difficulty: string;
  progressValue: number | null;
  unlocked: boolean;
  unlockedAt: string | null;
}

interface LevelDefinition {
  levelNumber: number;
  levelName: string;
  xpRequired: number;
  xpToNext: number;
}

interface WorkerSummary {
  id: string;
  full_name?: string;
  worker_name?: string;
  cooperative_name?: string | null;
}

interface WorkerLevelResponse {
  levelNumber: number;
  levelName: string;
  xpRequired: number;
  xpToNext: number;
  workerId: string;
  totalXp: number;
  currentLevel: boolean;
}

interface WorkerAchievementSummary {
  workerId: string;
  workerName: string;
  yearMonth: string;
  totalWeightKg: number;
  daysWorked: number;
  achievementsUnlocked: number;
  totalXpEarned: number;
  achievements: AchievementDefinition[];
}

interface StoredUser {
  full_name?: string;
  cooperative_name?: string | null;
  role?: StoredUserRole;
  userType?: number;
  user_type?: number;
}

const gamificationUiEnabled = isGamificationUiEnabled({
  NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI: process.env.NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI,
  NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION: process.env.NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION,
});

function readStoredUser() {
  if (typeof window === 'undefined') return null;

  const storedUser = localStorage.getItem('user');
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as StoredUser;
  } catch {
    return null;
  }
}

function getStoredUserRole(user: StoredUser | null): StoredUserRole | null {
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'worker') {
    return user.role;
  }

  const userType = user.userType ?? user.user_type;
  if (userType === 1) return 'worker';
  if (userType === 0) return 'manager';
  return null;
}

function getDefaultYearMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function formatDateTime(value: string | null) {
  if (!value) return 'Snapshot ainda não processado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDecimal(value: number, digits = 2) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function buildGamificationManagerUrl(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({
    view: GAMIFICATION_MANAGER_VIEW,
    ...params,
  });

  return `${path}?${query.toString()}`;
}

function buildLeaderboardUrl(mode: LeaderboardMode, yearMonth: string, weekNumber: string) {
  if (mode === 'current') return buildGamificationManagerUrl('/api/leaderboard');
  return buildGamificationManagerUrl('/api/leaderboard/history', { yearMonth, weekNumber });
}

function getSurfaceTone(status: 'neutral' | 'warning' | 'error' | 'success') {
  if (status === 'warning') return 'border-warning/35 bg-warning/10 text-warning';
  if (status === 'error') return 'border-error/35 bg-error/10 text-error';
  if (status === 'success') return 'border-success/35 bg-success/10 text-success';
  return 'border-outline/70 bg-surface text-foreground';
}

export default function GamificationPage() {
  const [mode, setMode] = useState<LeaderboardMode>('current');
  const [yearMonth, setYearMonth] = useState(getDefaultYearMonth);
  const [weekNumber, setWeekNumber] = useState('1');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [viewer, setViewer] = useState<StoredUser | null>(() => readStoredUser());
  const summaryRequestRef = useRef(0);
  const workerRequestRef = useRef(0);

  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [achievements, setAchievements] = useState<AchievementDefinition[]>([]);
  const [levels, setLevels] = useState<LevelDefinition[]>([]);
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [workerLevel, setWorkerLevel] = useState<WorkerLevelResponse | null>(null);
  const [workerMonth, setWorkerMonth] = useState<WorkerAchievementSummary | null>(null);

  const [loading, setLoading] = useState({
    summary: true,
    worker: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [featureUnavailable, setFeatureUnavailable] = useState(false);

  const viewerRole = getStoredUserRole(viewer);
  const canReadGamificationDashboard = gamificationUiEnabled && viewerRole !== 'worker';

  useEffect(() => {
    setViewer(readStoredUser());
  }, []);

  const fetchJson = useCallback(async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, {
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {
        message?: string;
        error?: string;
      };
      const message = payload.message || payload.error || 'Erro ao carregar dados da gamificação';
      const nextError = new Error(message) as Error & { status?: number };
      nextError.status = response.status;
      throw nextError;
    }

    return response.json() as Promise<T>;
  }, []);

  const loadSummary = useCallback(async () => {
    if (!canReadGamificationDashboard) {
      summaryRequestRef.current += 1;
      setLoading((current) => ({ ...current, summary: false }));
      return;
    }

    const requestId = summaryRequestRef.current + 1;
    summaryRequestRef.current = requestId;
    setLoading((current) => ({ ...current, summary: true }));
    setError(null);
    setFeatureUnavailable(false);

    try {
      const leaderboardUrl = buildLeaderboardUrl(mode, yearMonth, weekNumber);
      const [leaderboardData, achievementsData, levelsData, workersData] = await Promise.all([
        fetchJson<LeaderboardResponse>(leaderboardUrl),
        fetchJson<AchievementDefinition[]>(buildGamificationManagerUrl('/api/achievements')),
        fetchJson<LevelDefinition[]>(buildGamificationManagerUrl('/api/levels')),
        fetchJson<WorkerSummary[]>(buildGamificationManagerUrl('/api/users')),
      ]);

      if (summaryRequestRef.current !== requestId) return;

      setLeaderboard(leaderboardData);
      setAchievements(achievementsData);
      setLevels(levelsData);
      setWorkers(workersData);
      setSelectedWorkerId((currentWorkerId) => (
        currentWorkerId && !workersData.some((worker) => worker.id === currentWorkerId)
          ? ''
          : currentWorkerId
      ));
    } catch (requestError) {
      if (summaryRequestRef.current !== requestId) return;

      const nextError = requestError as Error & { status?: number };
      setError(nextError.message || 'Erro ao carregar a gamificação da cooperativa.');
      setFeatureUnavailable(nextError.status === 403 || nextError.status === 404);
      setLeaderboard(null);
      setAchievements([]);
      setLevels([]);
      setWorkers([]);
      setSelectedWorkerId('');
      setWorkerLevel(null);
      setWorkerMonth(null);
      setWorkerError(null);
    } finally {
      if (summaryRequestRef.current === requestId) {
        setLoading((current) => ({ ...current, summary: false }));
      }
    }
  }, [canReadGamificationDashboard, fetchJson, mode, weekNumber, yearMonth]);

  const loadWorkerDrilldown = useCallback(async () => {
    if (!canReadGamificationDashboard || !selectedWorkerId) {
      workerRequestRef.current += 1;
      setWorkerLevel(null);
      setWorkerMonth(null);
      setWorkerError(null);
      return;
    }

    const requestId = workerRequestRef.current + 1;
    workerRequestRef.current = requestId;
    setLoading((current) => ({ ...current, worker: true }));
    setWorkerError(null);

    try {
      const [workerLevelData, workerMonthData] = await Promise.all([
        fetchJson<WorkerLevelResponse>(`/api/levels/worker/${selectedWorkerId}`),
        fetchJson<WorkerAchievementSummary>(
          `/api/achievements/workers/${selectedWorkerId}/month?yearMonth=${yearMonth}`,
        ),
      ]);

      if (workerRequestRef.current !== requestId) return;

      setWorkerLevel(workerLevelData);
      setWorkerMonth(workerMonthData);
    } catch (requestError) {
      if (workerRequestRef.current !== requestId) return;

      const nextError = requestError as Error;
      setWorkerError(nextError.message || 'Erro ao carregar o detalhe do trabalhador.');
      setWorkerLevel(null);
      setWorkerMonth(null);
    } finally {
      if (workerRequestRef.current === requestId) {
        setLoading((current) => ({ ...current, worker: false }));
      }
    }
  }, [canReadGamificationDashboard, fetchJson, selectedWorkerId, yearMonth]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadWorkerDrilldown();
  }, [loadWorkerDrilldown]);

  const selectedWorker = useMemo(
    () => workers.find((worker) => worker.id === selectedWorkerId) ?? null,
    [selectedWorkerId, workers],
  );

  const scopedCooperativeName = workers.find((worker) => worker.cooperative_name)?.cooperative_name ?? null;

  const leaderboardTotalXp = useMemo(
    () => leaderboard?.entries.reduce((total, entry) => total + entry.finalXP, 0) ?? 0,
    [leaderboard],
  );

  const isSnapshotEmpty = Boolean(
    leaderboard &&
      leaderboard.snapshotFound === false &&
      leaderboard.entries.length === 0,
  );

  const noWorkers = !loading.summary && workers.length === 0;
  const summaryUnavailable = Boolean(error) || !canReadGamificationDashboard;
  const isWorkerBlocked = viewerRole === 'worker';
  const recorteLabel = mode === 'history' ? 'Recorte histórico' : 'Snapshot ativo';
  const recorteValue = leaderboard
    ? `${leaderboard.yearMonth} · semana ${leaderboard.weekNumber}`
    : summaryUnavailable
      ? 'Indisponível'
      : 'Aguardando leitura';
  const leaderboardStatus = summaryUnavailable
    ? 'Leitura indisponível'
    : leaderboard?.snapshotFound
      ? 'Snapshot disponível'
      : 'Snapshot pendente';

  if (!gamificationUiEnabled || isWorkerBlocked) {
    return (
      <Layout activePath="/gamification">
        <section className="surface-panel rounded-xl p-6">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-warning/35 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase text-warning">
              <FaExclamationTriangle className="h-3.5 w-3.5" />
              Gamificação indisponível
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Painel gerencial de gamificação indisponível
            </h1>
            <p className="text-sm text-text-secondary">
              {!gamificationUiEnabled
                ? 'A visualização gerencial de gamificação está desligada neste ambiente.'
                : 'Esta rota é reservada para gestores e administradores da cooperativa.'}
            </p>
            <p className="text-sm text-text-secondary">
              A experiência do trabalhador permanece fora do painel web gerencial, e os dados seguem protegidos pelas permissões do servidor.
            </p>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout activePath="/gamification">
      <div className="space-y-6">
        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold uppercase text-primary">
                <FaTrophy className="h-3.5 w-3.5" />
                Monitoramento de gamificação
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Desempenho da equipe e snapshots de XP</h1>
                <p className="max-w-3xl text-sm text-text-secondary">
                  Painel operacional para acompanhar ranking, níveis e achievements da cooperativa sem expor escopo fora da sessão autenticada.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-outline/70 bg-surface px-4 py-3">
                <p className="text-xs uppercase text-text-secondary">Cooperativa em foco</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {scopedCooperativeName || 'Escopo definido pelo servidor'}
                </p>
              </div>
              <div className="rounded-xl border border-outline/70 bg-surface px-4 py-3">
                <p className="text-xs uppercase text-text-secondary">{recorteLabel}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {recorteValue}
                </p>
              </div>
              <div className="rounded-xl border border-outline/70 bg-surface px-4 py-3">
                <p className="text-xs uppercase text-text-secondary">XP no ranking</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {summaryUnavailable ? 'Indisponível' : formatDecimal(leaderboardTotalXp)}
                </p>
              </div>
              <div className="rounded-xl border border-outline/70 bg-surface px-4 py-3">
                <p className="text-xs uppercase text-text-secondary">Equipe no ranking</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {summaryUnavailable ? 'Indisponível' : formatInteger(leaderboard?.entries.length ?? 0)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">Filtro de snapshots e recortes de análise</h2>
              <p className="text-sm text-text-secondary">
                Use o modo atual para o snapshot mais recente ou histórico para revisar uma janela específica de processamento semanal.
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:min-w-[44rem] xl:flex-row">
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border border-outline/70 bg-surface px-3 py-3 text-sm text-foreground">
                  <input
                    type="radio"
                    name="leaderboardMode"
                    value="current"
                    checked={mode === 'current'}
                    onChange={() => setMode('current')}
                    className="h-4 w-4 border-outline bg-surface text-primary focus:ring-primary"
                  />
                  Snapshot atual
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-outline/70 bg-surface px-3 py-3 text-sm text-foreground">
                  <input
                    type="radio"
                    name="leaderboardMode"
                    value="history"
                    checked={mode === 'history'}
                    onChange={() => setMode('history')}
                    className="h-4 w-4 border-outline bg-surface text-primary focus:ring-primary"
                  />
                  Histórico
                </label>
              </div>

              <div className="grid flex-[1.4] gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="yearMonth" className="mb-2 block text-xs font-semibold uppercase text-text-secondary">
                    Mês (AAAA-MM)
                  </label>
                  <input
                    id="yearMonth"
                    name="yearMonth"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}-\d{2}"
                    placeholder="AAAA-MM"
                    value={yearMonth}
                    onChange={(event) => setYearMonth(event.target.value)}
                    disabled={loading.summary}
                    className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-text-secondary"
                  />
                </div>
                <div>
                  <label htmlFor="weekNumber" className="mb-2 block text-xs font-semibold uppercase text-text-secondary">
                    Semana
                  </label>
                  <select
                    id="weekNumber"
                    name="weekNumber"
                    value={weekNumber}
                    onChange={(event) => setWeekNumber(event.target.value)}
                    disabled={mode === 'current' || loading.summary}
                    className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-text-secondary"
                  >
                    <option value="1">Semana 1</option>
                    <option value="2">Semana 2</option>
                    <option value="3">Semana 3</option>
                    <option value="4">Semana 4</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void loadSummary()}
                    disabled={loading.summary}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-outline disabled:bg-surface-elevated disabled:text-text-secondary disabled:shadow-none"
                  >
                    {loading.summary ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaSearch className="h-4 w-4" />}
                    Atualizar leitura
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
              <p className="text-xs uppercase text-text-secondary">Contexto de cálculo</p>
              <p className="mt-2 text-sm text-text-secondary">
                XP base consolida produtividade e achievements do período. XP final aplica o multiplicador aleatório registrado no snapshot para desempate e variação operacional auditável.
              </p>
            </div>
            <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
              <p className="text-xs uppercase text-text-secondary">Origem dos dados</p>
              <p className="mt-2 text-sm text-text-secondary">
                A rota usa apenas APIs escopadas no servidor: leaderboard, níveis, achievements e equipe da cooperativa visível para a sessão atual.
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                Catálogo de achievements: {summaryUnavailable ? 'indisponível' : formatInteger(achievements.length)}.
              </p>
            </div>
            <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
              <p className="text-xs uppercase text-text-secondary">Último processamento</p>
              <p className="mt-2 text-sm text-foreground">
                {summaryUnavailable ? 'Indisponível' : formatDateTime(leaderboard?.computedAt ?? null)}
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-xl border border-error/35 bg-error/10 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <FaExclamationTriangle className="mt-0.5 h-5 w-5 text-error" />
                <div>
                  <h2 className="text-base font-semibold text-error">Falha ao carregar a visão gerencial</h2>
                  <p className="text-sm text-foreground">{error}</p>
                  {featureUnavailable ? (
                    <p className="mt-1 text-sm text-text-secondary">
                      Funcionalidade indisponível para esta sessão ou ainda não habilitada no ambiente atual.
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadSummary()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-error/35 bg-surface px-4 text-sm font-semibold text-foreground hover:border-error/60 hover:bg-error/12"
              >
                <FaRedo className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="surface-panel rounded-xl p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Leaderboard da cooperativa</h2>
                <p className="text-sm text-text-secondary">
                  Ranking operacional dos snapshots processados por jobs semanais e mensais.
                </p>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${getSurfaceTone(summaryUnavailable ? 'error' : leaderboard?.snapshotFound ? 'success' : 'warning')}`}>
                <FaClock className="h-3.5 w-3.5" />
                {leaderboardStatus}
              </div>
            </div>

            {loading.summary ? (
              <div className="mt-6 flex min-h-64 items-center justify-center rounded-xl border border-outline/70 bg-surface">
                <div className="flex items-center gap-3 text-sm text-text-secondary">
                  <FaSpinner className="h-4 w-4 animate-spin" />
                  Carregando leaderboard, níveis e achievements...
                </div>
              </div>
            ) : summaryUnavailable || !leaderboard ? (
              <div className="mt-6 rounded-xl border border-error/35 bg-error/10 p-5">
                <div className="flex items-start gap-3">
                  <FaExclamationTriangle className="mt-0.5 h-5 w-5 text-error" />
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-error">Leitura de leaderboard indisponível</h3>
                    <p className="text-sm text-foreground">
                      Os indicadores foram ocultados até a leitura gerencial voltar a responder para esta sessão.
                    </p>
                    <p className="text-sm text-text-secondary">
                      Use a ação de tentar novamente no aviso acima ou valide se a feature e os jobs de gamificação estão ativos no ambiente.
                    </p>
                  </div>
                </div>
              </div>
            ) : isSnapshotEmpty ? (
              <div className="mt-6 rounded-xl border border-warning/35 bg-warning/10 p-5">
                <div className="flex items-start gap-3">
                  <FaTasks className="mt-0.5 h-5 w-5 text-warning" />
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-warning">Nenhum snapshot disponível para este recorte</h3>
                    <p className="text-sm text-foreground">
                      A API confirmou ausência de snapshot e a lista de entradas veio vazia. Os jobs de snapshot podem não ter rodado ainda ou ainda não havia medições consolidadas para o período.
                    </p>
                    <p className="text-sm text-text-secondary">
                      Verifique a execução dos jobs, aguarde o próximo processamento e recarregue a tela. Enquanto isso, a API continua escopada à cooperativa da sessão atual.
                    </p>
                  </div>
                </div>
              </div>
            ) : leaderboard && leaderboard.entries.length === 0 ? (
              <div className="mt-6 rounded-xl border border-outline/70 bg-surface p-5">
                <p className="text-sm font-semibold text-foreground">Nenhuma entrada encontrada</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Não há desempenho consolidado para o período selecionado. Revise filtros, snapshots e jobs pendentes antes de interpretar a ausência de dados.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-3 md:hidden">
                  {leaderboard?.entries.map((entry) => (
                    <article key={`${entry.workerId}-${entry.rankPosition}-mobile`} className="rounded-xl border border-outline/70 bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{entry.workerName}</p>
                          <p className="text-xs text-text-secondary">ID operacional {entry.workerId}</p>
                        </div>
                        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/12 px-2 text-sm font-semibold text-primary">
                          {entry.rankPosition}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs uppercase text-text-secondary">XP base</p>
                          <p className="mt-1 font-mono text-foreground">{formatDecimal(entry.rawXP)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-text-secondary">XP final</p>
                          <p className="mt-1 font-mono text-primary">{formatDecimal(entry.finalXP)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs uppercase text-text-secondary">Multiplicador</p>
                          <p className="mt-1 font-mono text-text-secondary">x{formatDecimal(entry.randomMultiplier, 3)}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-6 hidden overflow-x-auto rounded-xl border border-outline/70 md:block">
                  <div className="min-w-[44rem]">
                    <div className="grid grid-cols-[0.7fr_2fr_1fr_1fr_1fr] bg-surface-elevated px-4 py-3 text-xs font-semibold uppercase text-text-secondary">
                      <span>Posição</span>
                      <span>Equipe</span>
                      <span>XP base</span>
                      <span>XP final</span>
                      <span>Multiplicador</span>
                    </div>
                    <div className="divide-y divide-outline/70 bg-surface">
                      {leaderboard?.entries.map((entry) => (
                        <div
                          key={`${entry.workerId}-${entry.rankPosition}`}
                          className="grid grid-cols-[0.7fr_2fr_1fr_1fr_1fr] items-center gap-3 px-4 py-4 text-sm"
                        >
                          <div className="flex items-center gap-2 font-semibold text-foreground">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/12 text-primary">
                              {entry.rankPosition}
                            </span>
                            {entry.rankPosition <= 3 ? <FaMedal className="h-4 w-4 text-warning" /> : null}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{entry.workerName}</p>
                            <p className="text-xs text-text-secondary">ID operacional {entry.workerId}</p>
                          </div>
                          <span className="font-mono text-foreground">{formatDecimal(entry.rawXP)}</span>
                          <span className="font-mono text-primary">{formatDecimal(entry.finalXP)}</span>
                          <span className="font-mono text-text-secondary">x{formatDecimal(entry.randomMultiplier, 3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="surface-panel rounded-xl p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-primary/12 text-primary">
                <FaSignal className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Resumo de referência</h2>
                <p className="text-sm text-text-secondary">Leituras rápidas para gestão de equipe e calibragem do programa.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <FaUsers className="h-4 w-4 text-primary" />
                    Equipe listada
                  </span>
                  <strong className="text-lg text-foreground">
                    {summaryUnavailable ? 'Indisponível' : formatInteger(workers.length)}
                  </strong>
                </div>
              </div>
              <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <FaLayerGroup className="h-4 w-4 text-secondary" />
                    Níveis definidos
                  </span>
                  <strong className="text-lg text-foreground">
                    {summaryUnavailable ? 'Indisponível' : formatInteger(levels.length)}
                  </strong>
                </div>
              </div>
              <div className="rounded-lg border border-outline/70 bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <FaTrophy className="h-4 w-4 text-warning" />
                    Achievements do recorte
                  </span>
                  <strong className="text-lg text-foreground">
                    {summaryUnavailable
                      ? 'Indisponível'
                      : workerMonth
                        ? formatInteger(workerMonth.achievementsUnlocked)
                        : '-'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-outline/70 bg-surface px-4 py-4">
              <p className="text-xs uppercase text-text-secondary">Leitura operacional</p>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                <li>Use a variação entre XP base e XP final para auditar o impacto do multiplicador aleatório no snapshot.</li>
                <li>Compare níveis e achievements com o drill-down do trabalhador antes de tomar ação de acompanhamento com a equipe.</li>
                <li>Nenhuma seleção de cooperativa é exposta na UI; a autoridade permanece nas APIs escopadas do servidor.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="surface-panel rounded-xl p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Drill-down por trabalhador</h2>
                <p className="text-sm text-text-secondary">
                  Consulte o histórico mensal e o nível atual sem sair do escopo autorizado da cooperativa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadWorkerDrilldown()}
                disabled={!selectedWorkerId || loading.worker}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-outline/70 bg-surface px-4 text-sm font-semibold text-foreground hover:border-primary/40 hover:bg-surface-alt disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-text-secondary"
              >
                {loading.worker ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaRedo className="h-4 w-4" />}
                Atualizar detalhe
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label htmlFor="workerId" className="mb-2 block text-xs font-semibold uppercase text-text-secondary">
                  Trabalhador
                </label>
                <select
                  id="workerId"
                  name="workerId"
                  value={selectedWorkerId}
                  onChange={(event) => setSelectedWorkerId(event.target.value)}
                  disabled={loading.summary || noWorkers}
                  className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-text-secondary"
                >
                  <option value="">Selecione um trabalhador da equipe</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.full_name || worker.worker_name || `Worker ${worker.id}`}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-text-secondary">
                  A lista vem do escopo gerencial da cooperativa e não convida o usuário a navegar dados de terceiros fora desse contexto.
                </p>
              </div>

              {noWorkers ? (
                <div className="rounded-lg border border-warning/35 bg-warning/10 p-4">
                  <p className="text-sm font-semibold text-warning">Equipe indisponível para drill-down</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Nenhum trabalhador autorizado retornou para esta sessão. Sem equipe listada, o detalhe individual permanece desabilitado.
                  </p>
                </div>
              ) : null}

              {!selectedWorkerId ? (
                <div className="rounded-lg border border-outline/70 bg-surface-elevated p-4">
                  <p className="text-sm font-semibold text-foreground">Detalhe indisponível até selecionar um trabalhador</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Escolha um integrante da equipe para habilitar os painéis de nível, achievements mensais e indicadores de desempenho.
                  </p>
                </div>
              ) : null}

              {workerError ? (
                <div className="rounded-lg border border-error/35 bg-error/10 p-4">
                  <p className="text-sm font-semibold text-error">Erro no drill-down do trabalhador</p>
                  <p className="mt-1 text-sm text-foreground">{workerError}</p>
                  <button
                    type="button"
                    onClick={() => void loadWorkerDrilldown()}
                    className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-error/35 bg-surface px-4 text-sm font-semibold text-foreground hover:border-error/60 hover:bg-error/12"
                  >
                    <FaRedo className="h-4 w-4" />
                    Recarregar detalhe
                  </button>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                  <p className="flex items-center gap-2 text-xs uppercase text-text-secondary">
                    <FaUserCheck className="h-3.5 w-3.5 text-primary" />
                    Trabalhador em foco
                  </p>
                  <p className="mt-3 text-base font-semibold text-foreground">
                    {selectedWorker?.full_name || selectedWorker?.worker_name || 'Nenhum trabalhador selecionado'}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {selectedWorker?.cooperative_name || scopedCooperativeName || 'Cooperativa definida pelo servidor'}
                  </p>
                </div>
                <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                  <p className="flex items-center gap-2 text-xs uppercase text-text-secondary">
                    <FaCalendarAlt className="h-3.5 w-3.5 text-secondary" />
                    Recorte mensal
                  </p>
                  <p className="mt-3 text-base font-semibold text-foreground">{yearMonth}</p>
                  <p className="mt-1 text-sm text-text-secondary">O resumo mensal respeita o mesmo escopo aplicado ao leaderboard.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="surface-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground">Nível e achievements do trabalhador</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Use estas leituras para acompanhamento de desempenho, não como experiência lúdica para o gestor.
            </p>

            {loading.worker ? (
              <div className="mt-6 flex min-h-56 items-center justify-center rounded-xl border border-outline/70 bg-surface">
                <div className="flex items-center gap-3 text-sm text-text-secondary">
                  <FaSpinner className="h-4 w-4 animate-spin" />
                  Carregando nível e achievements mensais...
                </div>
              </div>
            ) : !selectedWorkerId ? (
              <div className="mt-6 rounded-xl border border-outline/70 bg-surface p-5">
                <p className="text-sm font-semibold text-foreground">Drill-down desabilitado</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Selecione um trabalhador para carregar nível atual, achievements mensais e indicadores do recorte escolhido.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                    <p className="flex items-center gap-2 text-xs uppercase text-text-secondary">
                      <FaLayerGroup className="h-3.5 w-3.5 text-primary" />
                      Nível atual
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-foreground">
                      {workerLevel ? `Nível ${workerLevel.levelNumber}` : 'Sem leitura'}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{workerLevel?.levelName || 'Aguardando dados do trabalhador'}</p>
                  </div>
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                    <p className="flex items-center gap-2 text-xs uppercase text-text-secondary">
                      <FaChartLine className="h-3.5 w-3.5 text-success" />
                      XP para próximo nível
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-foreground">
                      {workerLevel ? formatInteger(workerLevel.xpToNext) : '0'}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                      XP total do trabalhador: {workerLevel ? formatInteger(workerLevel.totalXp) : '0'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                    <p className="text-xs uppercase text-text-secondary">Peso no mês</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {workerMonth ? `${formatDecimal(workerMonth.totalWeightKg)} kg` : '0 kg'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                    <p className="text-xs uppercase text-text-secondary">Dias com trabalho</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {workerMonth ? formatInteger(workerMonth.daysWorked) : '0'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
                    <p className="text-xs uppercase text-text-secondary">XP mensal</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {workerMonth ? formatInteger(workerMonth.totalXpEarned) : '0'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-outline/70 bg-surface">
                  <div className="flex items-center justify-between border-b border-outline/70 px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Achievements do mês</h3>
                      <p className="text-xs text-text-secondary">
                        {workerMonth ? `${workerMonth.achievementsUnlocked} liberados em ${workerMonth.yearMonth}` : 'Sem achievements carregados'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${getSurfaceTone(workerMonth && workerMonth.achievements.length > 0 ? 'success' : 'neutral')}`}>
                      <FaTrophy className="h-3.5 w-3.5" />
                      {workerMonth ? formatInteger(workerMonth.achievements.length) : 0} registros
                    </span>
                  </div>

                  {workerMonth && workerMonth.achievements.length > 0 ? (
                    <div className="divide-y divide-outline/70">
                      {workerMonth.achievements.map((achievement) => (
                        <div key={achievement.achievementId} className="grid gap-3 px-4 py-4 md:grid-cols-[1.4fr_1fr_1fr]">
                          <div>
                            <p className="font-semibold text-foreground">{achievement.achievementName}</p>
                            <p className="mt-1 text-sm text-text-secondary">{achievement.description}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-text-secondary">Categoria</p>
                            <p className="mt-1 text-sm text-foreground">{achievement.category}</p>
                            <p className="mt-2 text-xs text-text-secondary">Progresso: {achievement.progressValue ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-text-secondary">Recompensa / status</p>
                            <p className="mt-1 text-sm text-foreground">{formatInteger(achievement.xpReward)} XP</p>
                            <p className={`mt-2 text-xs ${achievement.unlocked ? 'text-success' : 'text-text-secondary'}`}>
                              {achievement.unlocked ? `Liberado em ${formatDateTime(achievement.unlockedAt)}` : 'Ainda não liberado neste mês'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-5">
                      <p className="text-sm font-semibold text-foreground">Nenhum achievement mensal disponível</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        O trabalhador ainda não possui achievements para o recorte selecionado ou o processamento mensal ainda não foi concluído.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}

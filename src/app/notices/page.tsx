'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import {
  FaBell,
  FaPlus,
  FaTimes,
  FaEdit,
  FaTrash,
  FaSpinner,
  FaExclamationTriangle,
  FaRedo,
  FaGlobe,
  FaCheck,
} from 'react-icons/fa';

interface Notice {
  _id: string;
  cooperative_id: string | null;
  created_at: string;
  last_updated: string;
  created_by: string;
  priority: number;
  expires_at: string | null;
  title: string;
  content: string;
  is_global: boolean;
}

interface User {
  cooperative_id?: string;
  userType?: number;
}

const PRIORITY_LABELS: Record<number, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
  5: 'P5',
};

const PRIORITY_CLASSES: Record<number, string> = {
  // priority 1 → neutral-chip: bg-neutral text-on-surface, rounded-full, caption
  1: 'bg-neutral text-on-surface text-xs font-medium px-xs py-xxs rounded-full',
  // priority 2 → status-success: bg-success text-background, label-md
  2: 'bg-success text-background text-xs font-semibold px-xs py-xxs rounded-md',
  // priority 3 → status-warning: bg-warning text-background, label-md
  3: 'bg-warning text-background text-xs font-semibold px-xs py-xxs rounded-md',
  // priority 4 → status-danger: bg-error text-background, label-md
  4: 'bg-error text-background text-xs font-semibold px-xs py-xxs rounded-md',
  // priority 5 → status-danger bold: bg-error text-background + ring for extra emphasis
  5: 'bg-error text-background text-xs font-bold px-xs py-xxs rounded-md ring-2 ring-error/60 uppercase',
};

const PRIORITY_FILTER_LABELS: Record<number, string> = {
  1: 'Prioridade 1',
  2: 'Prioridade 2',
  3: 'Prioridade 3',
  4: 'Prioridade 4',
  5: 'Prioridade 5',
};

const formatDate = (s: string | null) => {
  if (!s) return null;
  const [year, month, day] = s.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
};

const isExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

export default function NoticesPage() {
  const [user, setUser] = useState<User>({});

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [priorityFilter, setPriorityFilter] = useState<number | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editNotice, setEditNotice] = useState<Notice | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Notice | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPriority, setFormPriority] = useState('3');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formIsGlobal, setFormIsGlobal] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isAdmin = (user.userType ?? 0) === 1;
  const canCreate = isAdmin || !!user.cooperative_id;

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch { /* ignore */ }
    }
  }, []);

  const fetchNotices = useCallback(async (priority?: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = priority != null
        ? `/api/notices/filter?priority=${priority}`
        : '/api/notices';
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      const data = await resp.json() as Notice[] | { notices?: Notice[] };
      const list: Notice[] = Array.isArray(data) ? data : ((data as { notices?: Notice[] }).notices ?? []);
      setNotices(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar avisos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotices(priorityFilter);
  }, [fetchNotices, priorityFilter]);

  const displayedNotices = activeOnly
    ? notices.filter((n) => !isExpired(n.expires_at))
    : notices;

  const canEdit = (notice: Notice) => {
    if (isAdmin) return true;
    if (notice.is_global) return false;
    return notice.cooperative_id === user.cooperative_id;
  };

  const canDelete = (notice: Notice) => canEdit(notice);

  // ── Open form ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditNotice(null);
    setFormTitle('');
    setFormContent('');
    setFormPriority('3');
    setFormExpiresAt('');
    setFormIsGlobal(false);
    setFormError(null);
    setShowFormModal(true);
  };

  const openEdit = (notice: Notice) => {
    setEditNotice(notice);
    setFormTitle(notice.title);
    setFormContent(notice.content);
    setFormPriority(String(notice.priority));
    setFormExpiresAt(notice.expires_at ? notice.expires_at.split('T')[0] : '');
    setFormIsGlobal(notice.is_global);
    setFormError(null);
    setShowFormModal(true);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setFormError(null);
    if (!formTitle.trim()) {
      setFormError('O título é obrigatório');
      return;
    }
    if (!formContent.trim()) {
      setFormError('O conteúdo é obrigatório');
      return;
    }
    const priority = parseInt(formPriority, 10);
    if (isNaN(priority) || priority < 1 || priority > 5) {
      setFormError('Prioridade deve ser entre 1 e 5');
      return;
    }

    setSaving(true);
    try {
      if (editNotice) {
        // PATCH
        const body: Record<string, unknown> = {
          title: formTitle.trim(),
          content: formContent.trim(),
          priority,
        };
        if (formExpiresAt) body.expires_at = new Date(formExpiresAt).toISOString();
        else body.expires_at = null;

        const resp = await fetch(`/api/notices/${editNotice._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({})) as { message?: string };
          setFormError(err.message ?? 'Erro ao editar aviso');
          return;
        }
        setActionMessage('Aviso atualizado com sucesso');
      } else {
        // POST
        const body: Record<string, unknown> = {
          title: formTitle.trim(),
          content: formContent.trim(),
          priority,
          cooperative_id: isAdmin && formIsGlobal ? null : (user.cooperative_id ?? null),
        };
        if (formExpiresAt) body.expires_at = new Date(formExpiresAt).toISOString();

        const resp = await fetch('/api/notices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({})) as { message?: string };
          setFormError(err.message ?? 'Erro ao criar aviso');
          return;
        }
        setActionMessage('Aviso criado com sucesso');
      }

      setShowFormModal(false);
      setEditNotice(null);
      setTimeout(() => setActionMessage(null), 4000);
      await fetchNotices(priorityFilter);
    } catch {
      setFormError('Erro de conexão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (notice: Notice) => {
    setShowDeleteConfirm(null);
    setDeleteLoading(notice._id);
    try {
      const resp = await fetch(`/api/notices/${notice._id}`, { method: 'DELETE' });
      if (!resp.ok && resp.status !== 204) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        setError(err.message ?? 'Erro ao deletar aviso');
        return;
      }
      setActionMessage('Aviso removido');
      setTimeout(() => setActionMessage(null), 4000);
      await fetchNotices(priorityFilter);
    } catch {
      setError('Erro ao deletar aviso');
    } finally {
      setDeleteLoading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderSkeleton = () => (
    <div className="space-y-md" aria-busy="true" aria-label="Carregando avisos">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-alt rounded-xl p-xl animate-pulse">
          <div className="flex items-start justify-between gap-md">
            <div className="flex-1 space-y-xs">
              <div className="h-4 bg-surface-elevated rounded-md w-1/3" />
              <div className="h-3 bg-surface-elevated rounded-md w-2/3" />
              <div className="h-3 bg-surface-elevated rounded-md w-1/2" />
            </div>
            <div className="h-6 w-16 bg-surface-elevated rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center py-xxl gap-md text-center">
      <FaBell className="h-12 w-12 text-text-secondary/50" />
      <div>
        <p className="text-base font-semibold text-on-surface">Nenhum aviso encontrado</p>
        <p className="text-sm text-text-secondary mt-xs">
          {priorityFilter != null
            ? `Nenhum aviso com prioridade ${priorityFilter} encontrado.`
            : activeOnly
            ? 'Não há avisos ativos no momento.'
            : 'Nenhum aviso cadastrado.'}
        </p>
      </div>
      {canCreate && (
        <button
          onClick={openCreate}
          className="flex items-center gap-xs bg-primary text-on-primary text-sm font-semibold px-md py-sm rounded-lg hover:opacity-90 transition-opacity"
        >
          <FaPlus className="h-3 w-3" />
          Criar Aviso
        </button>
      )}
    </div>
  );

  const renderNoticeCard = (notice: Notice) => {
    const expired = isExpired(notice.expires_at);
    return (
      <article
        key={notice._id}
        className={`bg-surface-alt rounded-xl p-xl border border-outline/60 transition-opacity ${expired ? 'opacity-60' : ''}`}
        aria-label={`Aviso: ${notice.title}`}
      >
        <div className="flex items-start justify-between gap-md flex-wrap">
          {/* Left: badges + title */}
          <div className="flex-1 min-w-0 space-y-xs">
            {/* Badge row */}
            <div className="flex items-center gap-xs flex-wrap">
              <span className={PRIORITY_CLASSES[notice.priority]} title={`Prioridade ${notice.priority}`}>
                {PRIORITY_LABELS[notice.priority]}
              </span>

              {notice.is_global && (
                <span
                  className="flex items-center gap-xxs bg-secondary text-background text-xs font-medium px-xs py-xxs rounded-md"
                  title="Aviso global"
                >
                  <FaGlobe className="h-3 w-3" />
                  Global
                </span>
              )}

              {expired && (
                <span className="flex items-center gap-xxs text-xs text-text-secondary">
                  <FaExclamationTriangle className="h-3 w-3" />
                  Expirado
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="text-base font-semibold text-on-surface leading-snug">{notice.title}</h2>

            {/* HTML content */}
            <div
              className="text-sm text-text-secondary leading-relaxed prose-notice"
              dangerouslySetInnerHTML={{ __html: notice.content }}
            />

            {/* Meta */}
            <div className="flex flex-wrap gap-sm text-xs text-text-secondary mt-xs">
              <span>Criado: {formatDate(notice.created_at)}</span>
              {notice.expires_at && (
                <span>
                  Expira: {formatDate(notice.expires_at)}
                </span>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          {(canEdit(notice) || canDelete(notice)) && (
            <div className="flex items-center gap-xs shrink-0">
              {canEdit(notice) && (
                <button
                  onClick={() => openEdit(notice)}
                  className="flex items-center gap-xxs text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-md px-sm py-xxs transition-colors"
                  title="Editar aviso"
                >
                  <FaEdit className="h-3 w-3" />
                  Editar
                </button>
              )}
              {canDelete(notice) && (
                <button
                  onClick={() => setShowDeleteConfirm(notice)}
                  disabled={deleteLoading === notice._id}
                  className="flex items-center gap-xxs text-xs font-medium text-error hover:text-error/80 border border-error/30 hover:border-error/60 rounded-md px-sm py-xxs transition-colors disabled:opacity-50"
                  title="Remover aviso"
                >
                  {deleteLoading === notice._id
                    ? <FaSpinner className="h-3 w-3 animate-spin" />
                    : <FaTrash className="h-3 w-3" />}
                  Remover
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <Layout activePath="/notices">
      <div className="space-y-xl">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="bg-surface-alt rounded-xl p-xl border-l-4 border-primary">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
            <div>
              <div className="flex items-center gap-sm mb-xs">
                <FaBell className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-semibold text-on-surface">Mural de Avisos</h1>
              </div>
              <p className="text-sm text-text-secondary">
                Comunicados globais e da cooperativa. Avisos expirados ficam ocultos por padrão.
              </p>
            </div>
            {canCreate && (
              <button
                onClick={openCreate}
                className="flex items-center gap-xs bg-primary text-on-primary text-sm font-semibold h-11 px-md rounded-lg hover:opacity-90 transition-opacity shrink-0"
              >
                <FaPlus className="h-3.5 w-3.5" />
                Novo Aviso
              </button>
            )}
          </div>
        </div>

        {/* ── Success toast ───────────────────────────────────────────────────── */}
        {actionMessage && (
          <div className="flex items-center justify-between gap-md px-md py-sm bg-success/10 border border-success/30 rounded-lg text-success text-sm font-medium">
            <div className="flex items-center gap-xs">
              <FaCheck className="h-4 w-4 shrink-0" />
              {actionMessage}
            </div>
            <button onClick={() => setActionMessage(null)} className="text-success/70 hover:text-success shrink-0">
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Filters bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-sm flex-wrap">
          {/* Priority filter buttons */}
          <div className="flex items-center gap-xs flex-wrap">
            <span className="text-xs text-text-secondary font-medium mr-xs">Prioridade:</span>
            <button
              onClick={() => setPriorityFilter(null)}
              className={`text-xs font-medium px-sm py-xxs rounded-full border transition-colors ${
                priorityFilter === null
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-alt text-text-secondary border-outline/60 hover:border-primary/40 hover:text-on-surface'
              }`}
            >
              Todos
            </button>
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
                className={`text-xs font-medium px-sm py-xxs rounded-full border transition-colors ${
                  priorityFilter === p
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-alt text-text-secondary border-outline/60 hover:border-primary/40 hover:text-on-surface'
                }`}
                title={PRIORITY_FILTER_LABELS[p]}
              >
                P{p}
              </button>
            ))}
          </div>

          {/* Active-only toggle — API already returns only active notices; this toggle
              hides items that became expired during the current session fetch */}
          <label
            className="flex items-center gap-xs cursor-pointer ml-auto select-none"
            title="Oculta avisos cujo prazo de expiração já passou"
          >
            <span className="text-xs text-text-secondary font-medium">Apenas ativos</span>
            <button
              role="switch"
              aria-checked={activeOnly}
              aria-label="Exibir apenas avisos não expirados"
              onClick={() => setActiveOnly((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                activeOnly ? 'bg-primary border-primary' : 'bg-surface-elevated border-outline'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
                  activeOnly ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center justify-between gap-md px-md py-sm bg-error/10 border border-error/30 rounded-lg text-error text-sm">
            <div className="flex items-center gap-xs">
              <FaExclamationTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
            <button
              onClick={() => { setError(null); void fetchNotices(priorityFilter); }}
              className="flex items-center gap-xxs text-xs font-medium text-error hover:text-error/80 border border-error/40 rounded-md px-sm py-xxs transition-colors shrink-0"
            >
              <FaRedo className="h-3 w-3" />
              Tentar novamente
            </button>
          </div>
        )}

        {/* ── Notices list ────────────────────────────────────────────────────── */}
        <div>
          {loading
            ? renderSkeleton()
            : displayedNotices.length === 0
            ? renderEmpty()
            : (
              <div className="space-y-md">
                {displayedNotices.map(renderNoticeCard)}
              </div>
            )}
        </div>
      </div>

      {/* ── Form Modal (Create / Edit) ─────────────────────────────────────── */}
      {showFormModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-md">
          <div className="bg-surface-alt rounded-xl shadow-soft border border-outline w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-xl py-md border-b border-outline">
              <h2 className="text-lg font-semibold text-on-surface">
                {editNotice ? 'Editar Aviso' : 'Novo Aviso'}
              </h2>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-text-secondary hover:text-on-surface transition-colors"
                aria-label="Fechar modal"
              >
                <FaTimes className="h-4 w-4" />
              </button>
            </div>

            <div className="p-xl space-y-md">
              {formError && (
                <div className="flex items-center gap-xs px-md py-sm bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                  <FaExclamationTriangle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-xs" htmlFor="notice-title">
                  Título <span className="text-error" aria-hidden="true">*</span>
                </label>
                <input
                  id="notice-title"
                  type="text"
                  className="w-full h-11 px-sm bg-surface text-on-surface border border-outline rounded-md text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-text-secondary"
                  placeholder="Título do aviso"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={200}
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-xs" htmlFor="notice-content">
                  Conteúdo <span className="text-error" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="notice-content"
                  rows={6}
                  className="w-full px-sm py-sm bg-surface text-on-surface border border-outline rounded-md text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-text-secondary resize-y"
                  placeholder="Conteúdo do aviso (HTML permitido)"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>

              {/* Priority + Expires row */}
              <div className="grid sm:grid-cols-2 gap-md">
                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-xs" htmlFor="notice-priority">
                    Prioridade <span className="text-error" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="notice-priority"
                    type="number"
                    min={1}
                    max={5}
                    className="w-full h-11 px-sm bg-surface text-on-surface border border-outline rounded-md text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                  />
                  <p className="text-xs text-text-secondary mt-xxs">1 = informativo, 5 = crítico</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-xs" htmlFor="notice-expires">
                    Expiração <span className="text-text-secondary font-normal">(opcional)</span>
                  </label>
                  <input
                    id="notice-expires"
                    type="date"
                    className="w-full h-11 px-sm bg-surface text-on-surface border border-outline rounded-md text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              {/* Admin-only: global checkbox */}
              {isAdmin && !editNotice && (
                <label className="flex items-center gap-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-outline bg-surface text-primary focus:ring-primary"
                    checked={formIsGlobal}
                    onChange={(e) => setFormIsGlobal(e.target.checked)}
                  />
                  <span className="text-sm text-on-surface">
                    Aviso global
                    <span className="ml-xs text-xs text-text-secondary">(visível para todas as cooperativas)</span>
                  </span>
                </label>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-sm pt-xs border-t border-outline">
                <button
                  onClick={() => setShowFormModal(false)}
                  className="h-11 px-md bg-surface-elevated text-on-surface text-sm font-semibold rounded-lg border border-outline hover:border-primary/30 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-xs h-11 px-md bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaCheck className="h-4 w-4" />}
                  {editNotice ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-md">
          <div className="bg-surface-alt rounded-xl shadow-soft border border-outline w-full max-w-md">
            <div className="flex items-center justify-between px-xl py-md border-b border-outline">
              <h2 className="text-lg font-semibold text-on-surface">Remover Aviso</h2>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="text-text-secondary hover:text-on-surface transition-colors"
                aria-label="Fechar"
              >
                <FaTimes className="h-4 w-4" />
              </button>
            </div>

            <div className="p-xl space-y-md">
              <div className="flex items-start gap-sm">
                <FaExclamationTriangle className="h-5 w-5 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-on-surface font-medium mb-xxs">
                    Tem certeza que deseja remover este aviso?
                  </p>
                  <p className="text-sm text-text-secondary">
                    <strong className="text-on-surface">{showDeleteConfirm.title}</strong> será removido permanentemente.
                    Esta ação não pode ser desfeita.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-sm pt-xs border-t border-outline">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="h-11 px-md bg-surface-elevated text-on-surface text-sm font-semibold rounded-lg border border-outline hover:border-primary/30 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="flex items-center gap-xs h-11 px-md bg-error text-background text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                >
                  <FaTrash className="h-4 w-4" />
                  Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

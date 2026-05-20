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
  FaCalendarAlt,
  FaClock,
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
  1: 'bg-text-secondary/15 text-text-secondary text-xs font-semibold px-2.5 py-0.5 rounded-full border border-outline shadow-sm',
  2: 'bg-success/15 text-success text-xs font-semibold px-2.5 py-0.5 rounded-full border border-success/20 shadow-sm',
  3: 'bg-warning/15 text-warning text-xs font-semibold px-2.5 py-0.5 rounded-full border border-warning/20 shadow-sm',
  4: 'bg-energy/15 text-energy text-xs font-semibold px-2.5 py-0.5 rounded-full border border-energy/20 shadow-sm',
  5: 'bg-error/15 text-error text-xs font-bold px-2.5 py-0.5 rounded-full border border-error/30 ring-1 ring-error/25 uppercase',
};

const PRIORITY_FILTER_LABELS: Record<number, string> = {
  1: 'Prioridade 1',
  2: 'Prioridade 2',
  3: 'Prioridade 3',
  4: 'Prioridade 4',
  5: 'Prioridade 5',
};

const panelClass = 'surface-panel rounded-xl p-6';
const chipBaseClass = 'inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors';
const chipInactiveClass = 'border-outline bg-surface text-text-secondary hover:border-primary/40 hover:text-foreground';
const chipActiveClass = 'border-primary bg-primary text-on-primary shadow-glow';

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

  const displayedNotices = notices;

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
        if (formExpiresAt) body.expires_at = new Date(`${formExpiresAt}T23:59:59`).toISOString();
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
        if (formExpiresAt) body.expires_at = new Date(`${formExpiresAt}T23:59:59`).toISOString();

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
    <div className="space-y-4" aria-busy="true" aria-label="Carregando avisos">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-alt rounded-xl p-6 animate-pulse">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
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
    <div className="surface-panel flex min-h-56 flex-col items-center justify-center rounded-xl p-8 text-center">
      <FaBell className="h-12 w-12 text-text-secondary/50" />
      <div>
        <p className="text-base font-semibold text-on-surface">Nenhum aviso encontrado</p>
        <p className="text-sm text-text-secondary mt-2">
          {priorityFilter != null
            ? `Nenhum aviso com prioridade ${priorityFilter} encontrado.`
            : 'Não há avisos ativos no momento.'}
        </p>
      </div>
      {canCreate && (
        <button
          onClick={openCreate}
          className="mt-4 flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary shadow-glow hover:bg-primary/90"
        >
          <FaPlus className="h-3 w-3" />
          Criar Aviso
        </button>
      )}
    </div>
  );

  const renderNoticeCard = (notice: Notice) => {
    const expired = isExpired(notice.expires_at);

    const priorityBorders: Record<number, string> = {
      1: 'border-l-text-secondary/40 hover:border-l-text-secondary',
      2: 'border-l-success/40 hover:border-l-success',
      3: 'border-l-warning/40 hover:border-l-warning',
      4: 'border-l-energy/40 hover:border-l-energy',
      5: 'border-l-error/60 hover:border-l-error',
    };

    return (
      <article
        key={notice._id}
        className={`bg-surface-alt rounded-xl p-4 sm:p-5 border border-outline/60 border-l-4 ${priorityBorders[notice.priority]} transition-all duration-300 hover:border-outline hover:shadow-glow ${expired ? 'opacity-50' : ''}`}
        aria-label={`Aviso: ${notice.title}`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left: badges + title */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Badge row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={PRIORITY_CLASSES[notice.priority]} title={`Prioridade ${notice.priority}`}>
                {PRIORITY_LABELS[notice.priority]}
              </span>

              {notice.is_global && (
                <span
                  className="flex items-center gap-2 bg-secondary/15 text-primary text-xs font-semibold px-2.5 py-0.5 rounded-full border border-secondary/30"
                  title="Aviso global"
                >
                  <FaGlobe className="h-3.5 w-3.5" />
                  Global
                </span>
              )}

              {expired && (
                <span className="flex items-center gap-2 bg-outline/20 text-text-secondary text-xs font-medium px-2.5 py-0.5 rounded-full border border-outline">
                  <FaExclamationTriangle className="h-3.5 w-3.5 text-warning" />
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
            <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary mt-3 pt-2 border-t border-outline/20">
              <span className="flex items-center gap-2">
                <FaCalendarAlt className="h-3.5 w-3.5 opacity-70" />
                Criado: {formatDate(notice.created_at)}
              </span>
              {notice.expires_at && (
                <span className="flex items-center gap-2 text-text-secondary/80">
                  <FaClock className="h-3.5 w-3.5 opacity-70" />
                  Expira: {formatDate(notice.expires_at)}
                </span>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          {(canEdit(notice) || canDelete(notice)) && (
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
              {canEdit(notice) && (
                <button
                  onClick={() => openEdit(notice)}
                  className="flex items-center gap-2 text-xs font-medium text-primary hover:text-on-primary bg-primary/10 border border-primary/20 hover:bg-primary rounded-md px-3 py-1.5 transition-all cursor-pointer"
                  title="Editar aviso"
                >
                  <FaEdit className="h-3.5 w-3.5" />
                  Editar
                </button>
              )}
              {canDelete(notice) && (
                <button
                  onClick={() => setShowDeleteConfirm(notice)}
                  disabled={deleteLoading === notice._id}
                  className="flex items-center gap-2 text-xs font-medium text-error hover:text-background bg-error/10 border border-error/20 hover:bg-error rounded-md px-3 py-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Remover aviso"
                >
                  {deleteLoading === notice._id
                    ? <FaSpinner className="h-3.5 w-3.5 animate-spin" />
                    : <FaTrash className="h-3.5 w-3.5" />}
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
    <>
      <Layout activePath="/notices">
        <div className="space-y-6">

          {/* ── Header ─────────────────────────────────────────────────────────── */}
          <div className={panelClass}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
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
                  className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary shadow-glow hover:bg-primary/90 shrink-0"
                >
                  <FaPlus className="h-3.5 w-3.5" />
                  Novo Aviso
                </button>
              )}
            </div>
          </div>

          {/* ── Success toast ───────────────────────────────────────────────────── */}
          {actionMessage && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-success/10 border border-success/30 rounded-lg text-success text-sm font-medium">
              <div className="flex items-center gap-2">
                <FaCheck className="h-4 w-4 shrink-0" />
                {actionMessage}
              </div>
              <button onClick={() => setActionMessage(null)} className="text-success/70 hover:text-success shrink-0">
                <FaTimes className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── Filters bar ─────────────────────────────────────────────────────── */}
          <div className="surface-panel flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Priority filter buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary font-semibold uppercase">Prioridade</span>
              <button
                onClick={() => setPriorityFilter(null)}
                className={`${chipBaseClass} ${
                  priorityFilter === null
                    ? chipActiveClass
                    : chipInactiveClass
                }`}
              >
                Todos
              </button>
              {[1, 2, 3, 4, 5].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
                  className={`${chipBaseClass} ${
                    priorityFilter === p
                      ? chipActiveClass
                      : chipInactiveClass
                  }`}
                  title={PRIORITY_FILTER_LABELS[p]}
                >
                  P{p}
                </button>
              ))}
            </div>

            <span className="text-xs text-text-secondary" title="Avisos expirados são ocultados automaticamente pelo servidor">
              Exibindo apenas avisos ativos
            </span>
          </div>

          {/* ── Error banner ────────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
              <div className="flex items-center gap-2">
                <FaExclamationTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
              <button
                onClick={() => { setError(null); void fetchNotices(priorityFilter); }}
                className="flex items-center gap-1 text-xs font-medium text-error hover:text-error/80 border border-error/40 rounded-md px-3 py-1 transition-colors shrink-0"
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
                <div className="space-y-4">
                  {displayedNotices.map(renderNoticeCard)}
                </div>
              )}
          </div>
        </div>
      </Layout>

      {/* ── Form Modal (Create / Edit) ─────────────────────────────────────── */}
      {showFormModal && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300">
          <div className="bg-surface-alt rounded-xl shadow-soft border border-outline w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline">
              <div className="flex items-center gap-2">
                <FaBell className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-on-surface">
                  {editNotice ? 'Editar Aviso' : 'Novo Aviso'}
                </h2>
              </div>
              <button
                onClick={() => setShowFormModal(false)}
                className="flex items-center justify-center h-8 w-8 rounded-full border border-outline bg-surface hover:bg-surface-elevated text-text-secondary hover:text-on-surface transition-all cursor-pointer"
                aria-label="Fechar modal"
              >
                <FaTimes className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                  <FaExclamationTriangle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-2" htmlFor="notice-title">
                  Título <span className="text-error" aria-hidden="true">*</span>
                </label>
                <input
                  id="notice-title"
                  type="text"
                  className="w-full h-11 px-3 bg-surface text-on-surface border border-outline rounded-md text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-text-secondary"
                  placeholder="Título do aviso"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={200}
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-2" htmlFor="notice-content">
                  Conteúdo <span className="text-error" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="notice-content"
                  rows={6}
                  className="w-full px-3 py-3 bg-surface text-on-surface border border-outline rounded-md text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-text-secondary resize-y"
                  placeholder="Conteúdo do aviso (HTML permitido)"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>

              {/* Priority + Expires row */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-2">
                    Prioridade <span className="text-error" aria-hidden="true">*</span>
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((p) => {
                      const isActive = formPriority === String(p);
                      const activeStyles: Record<number, string> = {
                        1: 'border-text-secondary bg-text-secondary/15 text-text-secondary shadow-glow',
                        2: 'border-success bg-success/15 text-success shadow-glow',
                        3: 'border-warning bg-warning/15 text-warning shadow-glow',
                        4: 'border-energy bg-energy/15 text-energy shadow-glow',
                        5: 'border-error bg-error/15 text-error shadow-glow',
                      };
                      const hoverStyles: Record<number, string> = {
                        1: 'hover:border-text-secondary/50 hover:bg-text-secondary/5 text-text-secondary/80',
                        2: 'hover:border-success/50 hover:bg-success/5 text-text-secondary/80',
                        3: 'hover:border-warning/50 hover:bg-warning/5 text-text-secondary/80',
                        4: 'hover:border-energy/50 hover:bg-energy/5 text-text-secondary/80',
                        5: 'hover:border-error/50 hover:bg-error/5 text-text-secondary/80',
                      };
                      const labelText: Record<number, string> = {
                        1: 'Informativo',
                        2: 'Baixo',
                        3: 'Médio',
                        4: 'Alto',
                        5: 'Crítico',
                      };

                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFormPriority(String(p))}
                          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all cursor-pointer ${
                            isActive
                              ? activeStyles[p]
                              : `border-outline bg-surface ${hoverStyles[p]}`
                          }`}
                          title={`Prioridade ${p}: ${labelText[p]}`}
                        >
                          <span className="text-sm font-bold">P{p}</span>
                          <span className="text-[10px] opacity-75 mt-1 font-medium hidden md:block">
                            {labelText[p]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-2" htmlFor="notice-expires">
                    Expiração <span className="text-text-secondary font-normal">(opcional)</span>
                  </label>
                  <input
                    id="notice-expires"
                    type="date"
                    className="w-full h-11 px-3 bg-surface text-on-surface border border-outline rounded-md text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 cursor-pointer"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              {/* Admin-only: global checkbox */}
              {isAdmin && !editNotice && (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-outline bg-surface text-primary focus:ring-primary cursor-pointer"
                    checked={formIsGlobal}
                    onChange={(e) => setFormIsGlobal(e.target.checked)}
                  />
                  <span className="text-sm text-on-surface">
                    Aviso global
                    <span className="ml-2 text-xs text-text-secondary">(visível para todas as cooperativas)</span>
                  </span>
                </label>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-outline">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="h-11 px-4 bg-surface-elevated text-on-surface text-sm font-semibold rounded-lg border border-outline hover:border-primary/30 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 h-11 px-4 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-glow hover:shadow-glow-hover"
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
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-alt rounded-xl shadow-soft border border-outline w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline">
              <h2 className="text-lg font-semibold text-on-surface">Remover Aviso</h2>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="text-text-secondary hover:text-on-surface transition-colors"
                aria-label="Fechar"
              >
                <FaTimes className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <FaExclamationTriangle className="h-5 w-5 text-error shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface font-medium mb-1">
                    Tem certeza que deseja remover este aviso?
                  </p>
                  <p className="text-sm text-text-secondary">
                    <strong className="text-on-surface">{showDeleteConfirm.title}</strong> será removido permanentemente.
                    Esta ação não pode ser desfeita.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-outline">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="h-11 px-4 bg-surface-elevated text-on-surface text-sm font-semibold rounded-lg border border-outline hover:border-primary/30 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="flex items-center gap-2 h-11 px-4 bg-error text-background text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                >
                  <FaTrash className="h-4 w-4" />
                  Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

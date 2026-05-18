"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  FaCheckCircle,
  FaEdit,
  FaExclamationCircle,
  FaEye,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaTrash,
  FaUser,
  FaUserPlus,
  FaUsers,
} from 'react-icons/fa';

interface ManagedUser {
  _id: string;
  id: string;
  full_name: string;
  CPF?: string;
  cpf?: string;
  email?: string | null;
  phone?: string;
  user_type: number;
  role?: 'admin' | 'manager' | 'worker';
  PIS?: string;
  RG?: string;
  pis?: string;
  rg?: string;
  birthdate?: string;
  birth_date?: string;
  enter_date?: string;
  exit_date?: string | null;
  gender?: string | null;
  cooperative_id?: string;
  cooperative?: string;
  cooperative_name?: string | null;
  can_reveal_documents?: boolean;
  documents_revealed?: boolean;
}

interface Cooperative {
  _id: string;
  cooperative_id: string;
  name: string;
}

interface SessionUser {
  id: string;
  full_name: string;
  role: 'admin' | 'manager';
  cooperative_id: string;
  cooperative_name?: string | null;
}

type FieldErrors = Partial<Record<
  | 'fullName'
  | 'cpf'
  | 'pis'
  | 'rg'
  | 'birthDate'
  | 'enterDate'
  | 'cooperativeId'
  | 'password'
  | 'confirmPassword',
  string
>>;

const fieldClass = "block h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0 disabled:bg-surface-elevated disabled:text-text-secondary";
const labelClass = "mb-1 block text-sm font-medium text-text-secondary";

function getUserId(user: ManagedUser) {
  return user._id || user.id;
}

function formatDateForInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().split('T')[0];
}

function formatDateForDisplay(value?: string | null) {
  const input = formatDateForInput(value);
  if (!input) return '-';
  const [year, month, day] = input.split('-');
  return `${day}/${month}/${year}`;
}

function formatCpf(value?: string | null) {
  if (!value) return '-';
  if (value.includes('*')) return value;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function documentValue(user: ManagedUser, upperKey: 'CPF' | 'PIS' | 'RG', lowerKey: 'cpf' | 'pis' | 'rg') {
  return user[upperKey] || user[lowerKey] || '';
}

function documentDigits(value: string) {
  return value.replace(/\D/g, '');
}

function hasCompleteCpf(value: string) {
  return documentDigits(value).length === 11;
}

function hasCompletePis(value: string) {
  return documentDigits(value).length === 11;
}

function hasCompleteRg(value: string) {
  const length = documentDigits(value).length;
  return length >= 8 && length <= 9;
}

function roleLabel(userType: number) {
  return userType === 0 ? 'Gestão' : 'Operação';
}

function roleTone(userType: number) {
  return userType === 0
    ? 'border-secondary/35 bg-secondary/12 text-secondary'
    : 'border-success/35 bg-success/12 text-success';
}

function statusLabel(user: ManagedUser) {
  return user.exit_date ? 'Desligado' : 'Ativo';
}

function statusTone(user: ManagedUser) {
  return user.exit_date
    ? 'border-warning/35 bg-warning/12 text-warning'
    : 'border-primary/35 bg-primary/12 text-primary';
}

function containsMaskedDocument(value: string) {
  return value.includes('*');
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : fallbackMessage;
    throw new Error(message);
  }
  return data as T;
}

export default function ManageWorkersPage() {
  const router = useRouter();
  const requestSeq = useRef(0);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCooperatives, setLoadingCooperatives] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentUserId, setCurrentUserId] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [documentsRevealed, setDocumentsRevealed] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pis, setPis] = useState('');
  const [rg, setRg] = useState('');
  const [userType, setUserType] = useState<number>(1);
  const [birthDate, setBirthDate] = useState('');
  const [enterDate, setEnterDate] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [gender, setGender] = useState('');
  const [cooperativeId, setCooperativeId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [pendingDeleteUser, setPendingDeleteUser] = useState<ManagedUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const defaultCooperativeId = cooperativeId || cooperatives[0]?.cooperative_id || '';
  const isEditing = modalMode === 'edit';
  const documentsLocked = isEditing && !documentsRevealed;

  const loadPageData = useCallback(async (initialLoading = true) => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;

    if (initialLoading) setLoading(true);
    setLoadingCooperatives(true);
    setError(null);

    try {
      const [sessionResponse, usersResponse, cooperativesResponse] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/users?view=team-management'),
        fetch('/api/cooperatives'),
      ]);

      if (sessionResponse.status === 401) {
        router.push('/login');
        return;
      }

      const [sessionData, usersData, cooperativesData] = await Promise.all([
        readJson<SessionUser>(sessionResponse, 'Sessão indisponível'),
        readJson<ManagedUser[]>(usersResponse, 'Falha ao carregar equipe'),
        readJson<Cooperative[]>(cooperativesResponse, 'Falha ao carregar cooperativas'),
      ]);

      if (requestId !== requestSeq.current) return;

      setSessionUser(sessionData);
      setUsers(usersData);
      setCooperatives(cooperativesData);
      setCooperativeId((current) => current || cooperativesData[0]?.cooperative_id || '');
    } catch (err) {
      if (requestId !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'Erro ao carregar gestão de equipe');
    } finally {
      if (requestId === requestSeq.current) {
        setLoading(false);
        setLoadingCooperatives(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      const values = [
        user.full_name,
        user.email,
        user.cooperative_name,
        roleLabel(user.user_type),
        documentValue(user, 'CPF', 'cpf'),
      ];

      return values.some((value) => value?.toLowerCase().includes(query));
    });
  }, [searchTerm, users]);

  const activeUsers = users.filter((user) => !user.exit_date).length;
  const offboardedUsers = users.length - activeUsers;
  const managementUsers = users.filter((user) => user.user_type === 0).length;

  const resetForm = () => {
    setCurrentUserId('');
    setFullName('');
    setCpf('');
    setEmail('');
    setPhone('');
    setPis('');
    setRg('');
    setUserType(1);
    setBirthDate('');
    setEnterDate('');
    setExitDate('');
    setGender('');
    setCooperativeId(defaultCooperativeId);
    setPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setDocumentsRevealed(false);
  };

  const closeModal = () => {
    setShowModal(false);
    setError(null);
    resetForm();
  };

  const openCreateModal = () => {
    setModalMode('create');
    resetForm();
    setCooperativeId(defaultCooperativeId);
    setShowModal(true);
  };

  const applyUserToForm = (user: ManagedUser) => {
    setFullName(user.full_name || '');
    setCpf(documentValue(user, 'CPF', 'cpf'));
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setPis(documentValue(user, 'PIS', 'pis'));
    setRg(documentValue(user, 'RG', 'rg'));
    setUserType(user.user_type);
    setBirthDate(formatDateForInput(user.birthdate || user.birth_date));
    setEnterDate(formatDateForInput(user.enter_date));
    setExitDate(formatDateForInput(user.exit_date));
    setGender(user.gender || '');
    setCooperativeId(user.cooperative_id || user.cooperative || defaultCooperativeId);
    setPassword('');
    setConfirmPassword('');
    setDocumentsRevealed(Boolean(user.documents_revealed));
  };

  const openEditModal = async (user: ManagedUser) => {
    const userId = getUserId(user);
    setModalMode('edit');
    setCurrentUserId(userId);
    setFieldErrors({});
    setError(null);

    try {
      const response = await fetch(`/api/user?id=${encodeURIComponent(userId)}`);
      const detail = await readJson<ManagedUser>(response, 'Erro ao carregar dados do integrante');
      applyUserToForm({
        ...user,
        ...detail,
        _id: userId,
        id: detail.id ?? userId,
        birthdate: detail.birth_date ?? user.birthdate,
      });
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do integrante');
    }
  };

  const revealDocuments = async () => {
    if (!currentUserId) return;
    setDocumentsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/user?id=${encodeURIComponent(currentUserId)}&reveal=documents`);
      const detail = await readJson<ManagedUser>(response, 'Não foi possível revelar documentos');
      setCpf(documentValue(detail, 'CPF', 'cpf'));
      setPis(documentValue(detail, 'PIS', 'pis'));
      setRg(documentValue(detail, 'RG', 'rg'));
      setDocumentsRevealed(true);
      setSuccess('Documentos liberados para edição nesta sessão.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível revelar documentos');
    } finally {
      setDocumentsLoading(false);
    }
  };

  const validateForm = () => {
    const nextErrors: FieldErrors = {};

    if (!fullName.trim()) nextErrors.fullName = 'Informe o nome completo.';
    if (!birthDate) nextErrors.birthDate = 'Informe a data de nascimento.';
    if (!enterDate) nextErrors.enterDate = 'Informe a data de entrada.';
    if (!cooperativeId) nextErrors.cooperativeId = 'Selecione a cooperativa.';

    if (!isEditing) {
      if (!cpf.trim()) nextErrors.cpf = 'Informe o CPF.';
      else if (!hasCompleteCpf(cpf)) nextErrors.cpf = 'CPF precisa ter 11 dígitos.';
      if (!pis.trim()) nextErrors.pis = 'Informe o PIS/NIS.';
      else if (!hasCompletePis(pis)) nextErrors.pis = 'PIS/NIS precisa ter 11 dígitos.';
      if (!rg.trim()) nextErrors.rg = 'Informe o RG.';
      else if (!hasCompleteRg(rg)) nextErrors.rg = 'RG precisa ter 8 ou 9 dígitos.';
      if (password.length < 6) nextErrors.password = 'Use pelo menos 6 caracteres.';
      if (password !== confirmPassword) nextErrors.confirmPassword = 'As senhas precisam coincidir.';
    } else {
      if (documentsRevealed) {
        if (!pis.trim() || containsMaskedDocument(pis) || !hasCompletePis(pis)) {
          nextErrors.pis = 'Revele e informe o PIS/NIS com 11 dígitos.';
        }
        if (!rg.trim() || containsMaskedDocument(rg) || !hasCompleteRg(rg)) {
          nextErrors.rg = 'Revele e informe o RG com 8 ou 9 dígitos.';
        }
      }

      if (password && password.length < 6) nextErrors.password = 'Use pelo menos 6 caracteres.';
      if (password && password !== confirmPassword) nextErrors.confirmPassword = 'As senhas precisam coincidir.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) {
      setError('Revise os campos destacados antes de salvar.');
      return;
    }

    setFormSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        user_type: userType,
        birth_date: birthDate,
        enter_date: enterDate,
        exit_date: exitDate || undefined,
        gender: gender || undefined,
        cooperative_id: cooperativeId,
      };

      if (isEditing) {
        payload.id = currentUserId;
        if (documentsRevealed) {
          payload.PIS = pis;
          payload.RG = rg;
        }
        if (password) payload.password = password;
      } else {
        payload.CPF = cpf;
        payload.PIS = pis;
        payload.RG = rg;
        payload.password = password;
      }

      const endpoint = isEditing ? '/api/users/update' : '/api/users/create';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      await readJson(response, 'Operação não concluída');
      closeModal();
      setSuccess(isEditing ? 'Integrante atualizado com sucesso.' : 'Integrante cadastrado com sucesso.');
      await loadPageData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar integrante');
    } finally {
      setFormSubmitting(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!pendingDeleteUser) return;
    setDeleteSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: getUserId(pendingDeleteUser) }),
      });

      await readJson(response, 'Remoção não concluída');
      setPendingDeleteUser(null);
      setSuccess('Cadastro removido com sucesso.');
      await loadPageData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover cadastro');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const renderFieldError = (field: keyof FieldErrors) => (
    fieldErrors[field] ? <p className="mt-1 text-xs text-error">{fieldErrors[field]}</p> : null
  );

  const renderUserActions = (user: ManagedUser, variant: 'desktop' | 'mobile' = 'desktop') => {
    if (variant === 'mobile') {
      return (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void openEditModal(user)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/35 px-3 text-sm font-semibold text-primary hover:bg-primary/12"
          >
            <FaEdit className="h-4 w-4" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setPendingDeleteUser(user)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-error/35 px-3 text-sm font-semibold text-error hover:bg-error/12"
          >
            <FaTrash className="h-4 w-4" />
            Remover
          </button>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => void openEditModal(user)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/35 text-primary hover:bg-primary/12"
        aria-label={`Editar ${user.full_name}`}
        title="Editar integrante"
      >
        <FaEdit />
      </button>
      <button
        type="button"
        onClick={() => setPendingDeleteUser(user)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-error/35 text-error hover:bg-error/12"
        aria-label={`Remover ${user.full_name}`}
        title="Remover cadastro sem histórico operacional"
      >
        <FaTrash />
      </button>
    </div>
    );
  };

  return (
    <Layout activePath="/manage-workers">
      <main className="mx-auto max-w-6xl space-y-6">
        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold uppercase text-primary">
                <FaUsers className="h-3.5 w-3.5" />
                Equipe
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Equipe gerenciada</h1>
                <p className="mt-2 max-w-3xl text-sm text-text-secondary">
                  Pessoas, papeis e documentos da cooperativa no escopo autorizado.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {sessionUser?.cooperative_name || 'Escopo da sessão'}
                </span>
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {sessionUser?.role === 'admin' ? 'Admin' : 'Gerente'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90"
            >
              <FaUserPlus className="h-4 w-4" />
              Adicionar integrante
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-outline bg-surface p-4">
            <p className="text-xs uppercase text-text-secondary">Ativos</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? '...' : activeUsers}</p>
          </div>
          <div className="rounded-xl border border-outline bg-surface p-4">
            <p className="text-xs uppercase text-text-secondary">Gestão</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? '...' : managementUsers}</p>
          </div>
          <div className="rounded-xl border border-outline bg-surface p-4">
            <p className="text-xs uppercase text-text-secondary">Desligados</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? '...' : offboardedUsers}</p>
          </div>
        </section>

        {(error || success) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              error
                ? 'border-error/35 bg-error/12 text-foreground'
                : 'border-success/35 bg-success/12 text-foreground'
            }`}
          >
            <div className="flex items-start gap-2">
              {error ? <FaExclamationCircle className="mt-0.5 text-error" /> : <FaCheckCircle className="mt-0.5 text-success" />}
              <span>{error || success}</span>
            </div>
          </div>
        )}

        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                className="h-11 w-full rounded-lg border border-outline bg-surface px-10 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0"
                placeholder="Buscar nome ou documento"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-foreground"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpar busca"
                >
                  <FaTimes />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void loadPageData(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-outline bg-surface px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
            >
              Atualizar lista
            </button>
          </div>

          {loading ? (
            <div className="mt-6 rounded-lg border border-outline bg-surface p-8 text-center text-sm text-text-secondary">
              Carregando equipe...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-outline bg-surface p-8 text-center">
              <p className="text-sm font-semibold text-foreground">
                {searchTerm ? 'Nenhum integrante encontrado' : 'Nenhum integrante cadastrado'}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {searchTerm ? 'Ajuste a busca ou recarregue a lista.' : 'Cadastre o primeiro integrante para este escopo.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 hidden overflow-x-auto rounded-lg border border-outline md:block">
                <table className="min-w-[56rem] w-full divide-y divide-outline bg-surface">
                  <thead className="bg-surface-elevated">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Integrante</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">CPF</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Papel</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Cooperativa</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Entrada / saída</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-text-secondary">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline">
                    {filteredUsers.map((user) => (
                      <tr key={getUserId(user)} className="hover:bg-surface-alt">
                        <td className="px-4 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/12 text-primary">
                              <FaUser />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{user.full_name}</p>
                              <p className="truncate text-xs text-text-secondary">{user.email || 'Email não informado'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-text-secondary">{formatCpf(documentValue(user, 'CPF', 'cpf'))}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${roleTone(user.user_type)}`}>
                            {roleLabel(user.user_type)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(user)}`}>
                            {statusLabel(user)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-text-secondary">{user.cooperative_name || user.cooperative_id || '-'}</td>
                        <td className="px-4 py-4 text-sm text-text-secondary">
                          {formatDateForDisplay(user.enter_date)}
                          <span className="mx-1">/</span>
                          {formatDateForDisplay(user.exit_date)}
                        </td>
                        <td className="px-4 py-4">{renderUserActions(user)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 grid gap-3 md:hidden">
                {filteredUsers.map((user) => (
                  <article key={getUserId(user)} className="rounded-lg border border-outline bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{user.full_name}</p>
                        <p className="mt-1 truncate text-xs text-text-secondary">{user.email || 'Email não informado'}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${roleTone(user.user_type)}`}>
                          {roleLabel(user.user_type)}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(user)}`}>
                          {statusLabel(user)}
                        </span>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">CPF</dt>
                        <dd className="text-right text-foreground">{formatCpf(documentValue(user, 'CPF', 'cpf'))}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Cooperativa</dt>
                        <dd className="text-right text-foreground">{user.cooperative_name || user.cooperative_id || '-'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Entrada</dt>
                        <dd className="text-right text-foreground">{formatDateForDisplay(user.enter_date)}</dd>
                      </div>
                      {user.exit_date && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-text-secondary">Saída</dt>
                          <dd className="text-right text-warning">{formatDateForDisplay(user.exit_date)}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-4">{renderUserActions(user, 'mobile')}</div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4">
          <div className="my-8 w-full max-w-3xl overflow-hidden rounded-xl border border-outline bg-surface shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-outline bg-surface-elevated px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {isEditing ? 'Editar integrante' : 'Adicionar integrante'}
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  {isEditing ? 'Cadastro e desligamento dentro do escopo autorizado.' : 'Novo cadastro na equipe da cooperativa.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-foreground"
                aria-label="Fechar modal"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="max-h-[78vh] overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="fullName" className={labelClass}>Nome completo *</label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className={fieldClass}
                  />
                  {renderFieldError('fullName')}
                </div>

                <div>
                  <label htmlFor="email" className={labelClass}>Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="phone" className={labelClass}>Telefone</label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="(00) 00000-0000"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className={`mt-5 rounded-lg border p-4 ${
                documentsRevealed
                  ? 'border-warning/45 bg-warning/10'
                  : 'border-outline bg-surface-alt'
              }`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <FaShieldAlt className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Documentos pessoais</p>
                      <p className="text-xs text-text-secondary">
                        {documentsRevealed || !isEditing ? 'Campos liberados para cadastro ou edição.' : 'Valores mascarados na leitura atual.'}
                      </p>
                    </div>
                  </div>
                  {isEditing && !documentsRevealed && (
                    <button
                      type="button"
                      onClick={() => void revealDocuments()}
                      disabled={documentsLoading}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/35 px-3 text-sm font-semibold text-primary hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <FaEye className="h-4 w-4" />
                      {documentsLoading ? 'Liberando...' : 'Revelar para editar'}
                    </button>
                  )}
                </div>

                {documentsRevealed && (
                  <div className="mt-4 rounded-lg border border-warning/35 bg-background/35 px-3 py-2 text-sm text-warning">
                    <div className="flex items-start gap-2">
                      <FaExclamationCircle className="mt-0.5 shrink-0" />
                      <p>
                        Dados sensíveis expostos nesta sessão. Confira somente o necessário e feche o modal para voltar à leitura mascarada.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="cpf" className={labelClass}>CPF *</label>
                    <input
                      id="cpf"
                      type="text"
                      value={cpf}
                      onChange={(event) => setCpf(event.target.value)}
                      placeholder="000.000.000-00"
                      className={fieldClass}
                      disabled={isEditing}
                    />
                    {renderFieldError('cpf')}
                  </div>
                  <div>
                    <label htmlFor="pis" className={labelClass}>PIS/NIS *</label>
                    <input
                      id="pis"
                      type="text"
                      value={pis}
                      onChange={(event) => setPis(event.target.value)}
                      placeholder="000.00000.00-0"
                      className={fieldClass}
                      disabled={documentsLocked}
                    />
                    {renderFieldError('pis')}
                  </div>
                  <div>
                    <label htmlFor="rg" className={labelClass}>RG *</label>
                    <input
                      id="rg"
                      type="text"
                      value={rg}
                      onChange={(event) => setRg(event.target.value)}
                      placeholder="00.000.000-0"
                      className={fieldClass}
                      disabled={documentsLocked}
                    />
                    {renderFieldError('rg')}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="cooperative" className={labelClass}>Cooperativa *</label>
                  <select
                    id="cooperative"
                    value={cooperativeId}
                    onChange={(event) => setCooperativeId(event.target.value)}
                    className={fieldClass}
                    disabled={loadingCooperatives || cooperatives.length === 0}
                  >
                    {loadingCooperatives && <option>Carregando...</option>}
                    {!loadingCooperatives && cooperatives.length === 0 && <option>Nenhuma cooperativa cadastrada</option>}
                    {!loadingCooperatives && cooperatives.map((cooperative) => (
                      <option key={cooperative.cooperative_id} value={cooperative.cooperative_id}>
                        {cooperative.name}
                      </option>
                    ))}
                  </select>
                  {renderFieldError('cooperativeId')}
                </div>

                <div>
                  <label htmlFor="userType" className={labelClass}>Papel *</label>
                  <select
                    id="userType"
                    value={userType}
                    onChange={(event) => setUserType(Number(event.target.value))}
                    className={fieldClass}
                  >
                    <option value={1}>Operação de coleta</option>
                    <option value={0}>Gestão da cooperativa</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="birthDate" className={labelClass}>Data de nascimento *</label>
                  <input
                    id="birthDate"
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                    className={fieldClass}
                  />
                  {renderFieldError('birthDate')}
                </div>

                <div>
                  <label htmlFor="enterDate" className={labelClass}>Data de entrada *</label>
                  <input
                    id="enterDate"
                    type="date"
                    value={enterDate}
                    onChange={(event) => setEnterDate(event.target.value)}
                    className={fieldClass}
                  />
                  {renderFieldError('enterDate')}
                </div>

                <div>
                  <label htmlFor="exitDate" className={labelClass}>Data de saída</label>
                  <input
                    id="exitDate"
                    type="date"
                    value={exitDate}
                    onChange={(event) => setExitDate(event.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="gender" className={labelClass}>Gênero</label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Não informar</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="password" className={labelClass}>
                    {isEditing ? 'Nova senha' : 'Senha *'}
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={fieldClass}
                    minLength={6}
                  />
                  {renderFieldError('password')}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className={labelClass}>
                    {isEditing ? 'Confirmar nova senha' : 'Confirmar senha *'}
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={fieldClass}
                    minLength={6}
                  />
                  {renderFieldError('confirmPassword')}
                </div>
              </div>

              <div className="sticky bottom-0 mt-6 flex flex-col gap-3 border-t border-outline bg-surface pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="min-h-11 rounded-lg border border-outline px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-background hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {formSubmitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar integrante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-outline bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-error/35 bg-error/12 text-error">
                <FaTrash />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Confirmar remoção</h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {pendingDeleteUser.full_name} só será removido se não houver vendas, medições ou contribuições associadas.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDeleteUser(null)}
                className="min-h-11 rounded-lg border border-outline px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteUser()}
                disabled={deleteSubmitting}
                className="min-h-11 rounded-lg bg-error px-4 text-sm font-semibold text-background hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteSubmitting ? 'Removendo...' : 'Remover cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

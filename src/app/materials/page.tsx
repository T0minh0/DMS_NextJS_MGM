'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  FaBoxes,
  FaCheckCircle,
  FaEdit,
  FaExclamationTriangle,
  FaFilter,
  FaLayerGroup,
  FaPlus,
  FaRedo,
  FaSave,
  FaSearch,
  FaTimes,
  FaTrash,
  FaWarehouse,
} from 'react-icons/fa';

interface Material {
  _id: string;
  material_id: string;
  material: string;
  name?: string;
  group: string;
  isGroup?: boolean;
}

interface SessionUser {
  id: string;
  full_name: string;
  role: 'admin' | 'manager';
  cooperative_id: string;
  cooperative_name?: string | null;
}

interface CooperativeMaterialStock {
  material_id: string;
  name: string;
  group: string;
  cooperative_id: string;
  stock_kg: number;
  total_collected_kg: number;
  total_sold_kg: number;
}

interface CooperativeMaterialsPayload {
  materials?: CooperativeMaterialStock[];
  count?: number;
  total?: number;
  limit?: number;
  has_more?: boolean;
  truncated?: boolean;
}

interface MaterialGroup {
  group_id: string;
  group: string;
}

interface MaterialGroupsPayload {
  groups?: MaterialGroup[];
  count?: number;
}

type FieldErrors = Partial<Record<'material' | 'group' | 'groupName' | 'amount', string>>;
type StockStatus = 'empty' | 'critical' | 'stable' | 'unavailable';
type MaterialRow = Material & {
  stockKg: number | null;
  totalCollectedKg: number | null;
  totalSoldKg: number | null;
  status: StockStatus;
};

const LOW_STOCK_KG = 25;
const fieldClass = 'block h-11 w-full rounded-lg border border-outline bg-surface px-3 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0 disabled:bg-surface-elevated disabled:text-text-secondary';
const labelClass = 'mb-1 block text-sm font-medium text-text-secondary';

function materialId(material: Material) {
  return material.material_id || material._id;
}

function materialName(material: Material) {
  return material.name || material.material || `Material ${materialId(material)}`;
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatWeight(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStockWeight(value: number | null) {
  return value === null ? 'Indisponível' : `${formatWeight(value)} kg`;
}

function statusForStock(stockKg: number): StockStatus {
  if (stockKg <= 0) return 'empty';
  if (stockKg <= LOW_STOCK_KG) return 'critical';
  return 'stable';
}

function statusLabel(status: StockStatus) {
  return {
    empty: 'Sem saldo',
    critical: 'Crítico',
    stable: 'Operacional',
    unavailable: 'Indisponível',
  }[status];
}

function statusTone(status: StockStatus) {
  return {
    empty: 'border-outline bg-surface-elevated text-text-secondary',
    critical: 'border-warning/35 bg-warning/12 text-warning',
    stable: 'border-success/35 bg-success/12 text-success',
    unavailable: 'border-error/35 bg-error/10 text-error',
  }[status];
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : fallbackMessage;
    throw new Error(message);
  }
  return data as T;
}

export default function MaterialsPage() {
  const router = useRouter();
  const requestSeq = useRef(0);
  const stockSubmitInFlight = useRef(false);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([]);
  const [stockRows, setStockRows] = useState<CooperativeMaterialStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialSubmitting, setMaterialSubmitting] = useState(false);
  const [materialForm, setMaterialForm] = useState({ material: '', groupId: '' });
  const [groupForm, setGroupForm] = useState({ group: '' });
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [stockMaterial, setStockMaterial] = useState<MaterialRow | null>(null);
  const [stockAmount, setStockAmount] = useState('');
  const [stockConfirming, setStockConfirming] = useState(false);
  const [stockSubmitting, setStockSubmitting] = useState(false);
  const [stockSubmitError, setStockSubmitError] = useState<string | null>(null);

  const [deleteMaterial, setDeleteMaterial] = useState<Material | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const canManageMaterials = sessionUser?.role === 'admin' || sessionUser?.role === 'manager';
  const canAdjustStock = Boolean(sessionUser);
  const stockReadAvailable = !stockError;

  const loadMaterials = useCallback(async (initial = false) => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;

    if (initial) setLoading(true);
    else setRefreshing(true);
    setPageError(null);
    setStockError(null);

    try {
      const [sessionResponse, materialsResponse, groupsResponse] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/materials'),
        fetch('/api/material-groups'),
      ]);

      if (sessionResponse.status === 401) {
        router.push('/login');
        return;
      }

      const [sessionData, materialsData, groupsData] = await Promise.all([
        readJson<SessionUser>(sessionResponse, 'Sessão indisponível'),
        readJson<Material[]>(materialsResponse, 'Falha ao carregar materiais'),
        readJson<MaterialGroupsPayload>(groupsResponse, 'Falha ao carregar grupos de materiais'),
      ]);

      let nextStockRows: CooperativeMaterialStock[] = [];
      let nextStockError: string | null = null;
      try {
        const stockParams = new URLSearchParams({ cooperative_id: sessionData.cooperative_id });
        const stockResponse = await fetch(`/api/cooperative/materials?${stockParams.toString()}`);
        const stockPayload = await readJson<CooperativeMaterialsPayload>(stockResponse, 'Falha ao carregar estoque');
        nextStockRows = Array.isArray(stockPayload.materials) ? stockPayload.materials : [];
        const stockTruncated = stockPayload.truncated === true ||
          stockPayload.has_more === true ||
          (typeof stockPayload.total === 'number' &&
            typeof stockPayload.count === 'number' &&
            stockPayload.total > stockPayload.count);
        if (stockTruncated) {
          nextStockRows = [];
          nextStockError = 'Leitura parcial do estoque. Recarregue antes de ajustar saldos.';
        }
      } catch (error) {
        nextStockError = error instanceof Error ? error.message : 'Falha ao carregar estoque';
      }

      if (requestId !== requestSeq.current) return;

      setSessionUser(sessionData);
      setMaterials(materialsData.filter((item) => item.material_id && !item.isGroup));
      setMaterialGroups(Array.isArray(groupsData.groups) ? groupsData.groups : []);
      setStockRows(nextStockRows);
      setStockError(nextStockError);
    } catch (error) {
      if (requestId !== requestSeq.current) return;
      setPageError(error instanceof Error ? error.message : 'Não foi possível carregar materiais e estoque');
      setMaterials([]);
      setMaterialGroups([]);
      setStockRows([]);
    } finally {
      if (requestId === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void loadMaterials(true);
  }, [loadMaterials]);

  const groups = useMemo(() => materialGroups.map((materialGroup) => materialGroup.group), [materialGroups]);

  const groupByName = useMemo(() => {
    const map = new Map<string, MaterialGroup>();
    materialGroups.forEach((materialGroup) => {
      map.set(materialGroup.group.toLocaleLowerCase('pt-BR'), materialGroup);
    });
    return map;
  }, [materialGroups]);

  const stockByMaterialId = useMemo(() => {
    const map = new Map<string, CooperativeMaterialStock>();
    stockRows.forEach((row) => {
      map.set(row.material_id, row);
    });
    return map;
  }, [stockRows]);

  const materialRows = useMemo(() => materials.map((material) => {
    const stock = stockByMaterialId.get(material.material_id);
    const stockKg = stockReadAvailable ? stock?.stock_kg ?? 0 : null;
    const status = stockKg === null ? 'unavailable' : statusForStock(stockKg);

    return {
      ...material,
      stockKg,
      totalCollectedKg: stockReadAvailable ? stock?.total_collected_kg ?? 0 : null,
      totalSoldKg: stockReadAvailable ? stock?.total_sold_kg ?? 0 : null,
      status,
    };
  }), [materials, stockByMaterialId, stockReadAvailable]);

  const filteredMaterials = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');

    return materialRows.filter((material) => {
      const matchesGroup = !groupFilter || material.group === groupFilter;
      const matchesSearch = !query ||
        materialName(material).toLocaleLowerCase('pt-BR').includes(query) ||
        material.group.toLocaleLowerCase('pt-BR').includes(query) ||
        material.material_id.includes(query);

      return matchesGroup && matchesSearch;
    });
  }, [groupFilter, materialRows, searchTerm]);

  const totalStock = stockReadAvailable
    ? materialRows.reduce((sum, material) => sum + (material.stockKg ?? 0), 0)
    : null;
  const criticalCount = stockReadAvailable
    ? materialRows.filter((material) => material.status === 'critical').length
    : null;
  const emptyCount = stockReadAvailable
    ? materialRows.filter((material) => material.status === 'empty').length
    : null;

  const resetMaterialForm = () => {
    setEditingMaterial(null);
    setMaterialForm({ material: '', groupId: '' });
    setFieldErrors({});
    setShowMaterialModal(false);
  };

  const openCreateMaterial = () => {
    if (!canManageMaterials) return;
    if (materialGroups.length === 0) {
      setPageError('Crie pelo menos um grupo de materiais antes de cadastrar materiais.');
      setSuccess(null);
      return;
    }

    const selectedGroup = groupFilter
      ? materialGroups.find((materialGroup) => materialGroup.group === groupFilter)
      : materialGroups[0];

    setEditingMaterial(null);
    setMaterialForm({ material: '', groupId: selectedGroup?.group_id ?? '' });
    setFieldErrors({});
    setShowMaterialModal(true);
  };

  const openEditMaterial = (material: Material) => {
    if (!canManageMaterials) return;
    const currentGroup = groupByName.get(material.group.toLocaleLowerCase('pt-BR'));
    setEditingMaterial(material);
    setMaterialForm({ material: materialName(material), groupId: currentGroup?.group_id ?? '' });
    setFieldErrors({});
    setShowMaterialModal(true);
  };

  const openStockModal = (material: MaterialRow) => {
    if (stockError) return;
    setStockMaterial(material);
    setStockAmount('');
    setStockConfirming(false);
    setStockSubmitError(null);
    setFieldErrors({});
    setSuccess(null);
    setPageError(null);
  };

  const closeStockModal = () => {
    setStockMaterial(null);
    setStockAmount('');
    setStockConfirming(false);
    setStockSubmitError(null);
    stockSubmitInFlight.current = false;
    setFieldErrors({});
  };

  const validateMaterialForm = () => {
    const nextErrors: FieldErrors = {};
    if (!materialForm.material.trim()) nextErrors.material = 'Informe o nome do material.';
    if (!materialForm.groupId) nextErrors.group = 'Selecione um grupo cadastrado.';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleMaterialSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSuccess(null);
    setPageError(null);

    if (!canManageMaterials) {
      setPageError('Apenas gestores podem alterar o catalogo de materiais.');
      return;
    }

    if (!validateMaterialForm()) return;

    setMaterialSubmitting(true);
    try {
      const endpoint = editingMaterial ? `/api/materials/${materialId(editingMaterial)}` : '/api/materials';
      const response = await fetch(endpoint, {
        method: editingMaterial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material: materialForm.material.trim(),
          group_id: materialForm.groupId,
        }),
      });

      await readJson(response, 'Não foi possível salvar o material');
      resetMaterialForm();
      setSuccess(editingMaterial ? 'Material atualizado com sucesso.' : 'Material criado com sucesso.');
      await loadMaterials(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não foi possível salvar o material');
    } finally {
      setMaterialSubmitting(false);
    }
  };

  const handleGroupSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSuccess(null);
    setPageError(null);

    if (!canManageMaterials) {
      setPageError('Apenas gestores podem criar grupos de materiais.');
      return;
    }

    const groupName = groupForm.group.trim();
    if (!groupName) {
      setFieldErrors({ groupName: 'Informe o nome do grupo.' });
      return;
    }

    setFieldErrors({});
    setGroupSubmitting(true);
    try {
      const response = await fetch('/api/material-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: groupName }),
      });

      await readJson(response, 'Nao foi possivel criar o grupo de materiais');
      setGroupForm({ group: '' });
      setShowGroupModal(false);
      setSuccess('Grupo de materiais criado com sucesso.');
      await loadMaterials(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Nao foi possivel criar o grupo de materiais');
    } finally {
      setGroupSubmitting(false);
    }
  };

  const handleStockSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stockMaterial || stockSubmitInFlight.current) return;

    setSuccess(null);
    setPageError(null);
    setStockSubmitError(null);
    const parsedAmount = parseAmount(stockAmount);
    if (!parsedAmount) {
      setFieldErrors({ amount: 'Informe um peso positivo com até 2 casas decimais.' });
      return;
    }

    setFieldErrors({});
    if (!stockConfirming) {
      setStockConfirming(true);
      return;
    }

    stockSubmitInFlight.current = true;
    setStockSubmitting(true);
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: materialId(stockMaterial),
          cooperative_id: sessionUser?.cooperative_id,
          amount: parsedAmount.toFixed(2),
        }),
      });

      await readJson(response, 'Não foi possível ajustar o estoque');
      closeStockModal();
      setSuccess(`Estoque de ${materialName(stockMaterial)} ajustado com sucesso.`);
      await loadMaterials(false);
    } catch (error) {
      setStockSubmitError(error instanceof Error ? error.message : 'Não foi possível ajustar o estoque');
    } finally {
      stockSubmitInFlight.current = false;
      setStockSubmitting(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deleteMaterial || !canManageMaterials) return;

    setDeleteSubmitting(true);
    setSuccess(null);
    setPageError(null);
    try {
      const response = await fetch(`/api/materials/${materialId(deleteMaterial)}`, {
        method: 'DELETE',
      });

      await readJson(response, 'Não foi possível excluir o material');
      setSuccess('Material excluído com sucesso.');
      setDeleteMaterial(null);
      await loadMaterials(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não foi possível excluir o material');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const renderFieldError = (field: keyof FieldErrors) => (
    fieldErrors[field] ? <p className="mt-1 text-xs text-error">{fieldErrors[field]}</p> : null
  );

  const stockImpact = stockMaterial && stockMaterial.stockKg !== null && parseAmount(stockAmount)
    ? stockMaterial.stockKg + (parseAmount(stockAmount) ?? 0)
    : null;

  return (
    <Layout activePath="/materials">
      <main className="mx-auto max-w-6xl space-y-6">
        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold uppercase text-primary">
                <FaWarehouse className="h-3.5 w-3.5" />
                Materiais e estoque
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Operação de materiais</h1>
                <p className="mt-2 max-w-3xl text-sm text-text-secondary">
                  Saldo atual, grupos, ações permitidas e ajustes de estoque dentro do escopo da cooperativa.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {sessionUser?.cooperative_name || 'Escopo da sessão'}
                </span>
                <span className="rounded-full border border-outline/70 bg-surface px-3 py-1">
                  {canManageMaterials ? 'Catálogo administrável' : 'Catálogo somente leitura'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void loadMaterials(false)}
                disabled={refreshing}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-outline bg-surface px-4 text-sm font-semibold text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-70"
              >
                <FaRedo className="h-4 w-4" />
                {refreshing ? 'Atualizando...' : 'Atualizar'}
              </button>
              {canManageMaterials && (
                <button
                  type="button"
                  onClick={openCreateMaterial}
                  disabled={materialGroups.length === 0}
                  title={materialGroups.length === 0 ? 'Crie um grupo antes de cadastrar materiais' : 'Novo material'}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FaPlus className="h-4 w-4" />
                  Novo material
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-outline bg-surface p-4">
            <p className="text-xs uppercase text-text-secondary">Materiais</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? '...' : materialRows.length}</p>
          </div>
          <div className="rounded-xl border border-outline bg-surface p-4">
            <p className="text-xs uppercase text-text-secondary">Grupos</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? '...' : groups.length}</p>
          </div>
          <div className="rounded-xl border border-outline bg-surface p-4">
            <p className="text-xs uppercase text-text-secondary">Estoque total</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? '...' : formatStockWeight(totalStock)}</p>
          </div>
          <div className="rounded-xl border border-outline bg-surface p-4">
            <p className="text-xs uppercase text-text-secondary">Atenção</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {loading ? '...' : criticalCount === null || emptyCount === null ? 'Indisponível' : criticalCount + emptyCount}
            </p>
          </div>
        </section>

        {(pageError || stockError || success) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              pageError || stockError
                ? 'border-error/35 bg-error/12 text-foreground'
                : 'border-success/35 bg-success/12 text-foreground'
            }`}
          >
            <div className="flex items-start gap-2">
              {pageError || stockError ? (
                <FaExclamationTriangle className="mt-0.5 shrink-0 text-error" />
              ) : (
                <FaCheckCircle className="mt-0.5 shrink-0 text-success" />
              )}
              <span>{pageError || stockError || success}</span>
            </div>
          </div>
        )}

        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase text-primary">
                <FaLayerGroup className="h-4 w-4" />
                Grupos de materiais
              </div>
              <h2 className="mt-2 text-lg font-semibold text-foreground">Cadastro controlado de grupos</h2>
              <p className="mt-1 max-w-2xl text-sm text-text-secondary">
                Materiais novos devem usar um grupo existente para evitar nomes duplicados por erro de digitacao.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!canManageMaterials) {
                  setPageError('Apenas gestores podem criar grupos de materiais.');
                  setSuccess(null);
                  return;
                }

                setGroupForm({ group: '' });
                setFieldErrors({});
                setPageError(null);
                setShowGroupModal(true);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-background shadow-glow hover:bg-primary/90 sm:w-auto"
            >
              <FaPlus className="h-4 w-4" />
              Novo grupo
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {materialGroups.length === 0 ? (
              <span className="rounded-lg border border-dashed border-outline bg-surface px-3 py-2 text-sm text-text-secondary">
                Nenhum grupo cadastrado. Crie o primeiro grupo antes de cadastrar materiais.
              </span>
            ) : (
              materialGroups.map((materialGroup) => (
                <span
                  key={materialGroup.group_id}
                  className="inline-flex items-center gap-2 rounded-full border border-outline/70 bg-surface px-3 py-1.5 text-sm font-semibold text-foreground"
                >
                  <FaLayerGroup className="h-3.5 w-3.5 text-primary" />
                  {materialGroup.group}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="surface-panel rounded-xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                className="h-11 w-full rounded-lg border border-outline bg-surface px-10 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0"
                placeholder="Buscar material, grupo ou ID"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <FaTimes />
                </button>
              )}
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <FaFilter className="h-4 w-4 text-primary" />
                Grupo
              </div>
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className="h-11 rounded-lg border border-outline bg-surface px-3 text-foreground focus:border-primary focus:ring-0"
              >
                <option value="">Todos os grupos</option>
                {groups.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>
          </div>


          {loading ? (
            <div className="mt-6 flex min-h-40 items-center justify-center rounded-lg border border-outline bg-surface text-sm text-text-secondary">
              Carregando materiais e estoque...
            </div>
          ) : pageError && materialRows.length === 0 ? (
            <div className="mt-6 rounded-lg border border-error/35 bg-error/10 p-8 text-center">
              <p className="text-sm font-semibold text-error">Materiais indisponíveis</p>
              <p className="mt-2 text-sm text-text-secondary">{pageError}</p>
              <button
                type="button"
                onClick={() => void loadMaterials(false)}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-outline px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-outline bg-surface p-8 text-center">
              <FaBoxes className="mx-auto h-10 w-10 text-text-secondary" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                {searchTerm || groupFilter ? 'Nenhum material encontrado' : 'Nenhum material cadastrado'}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {searchTerm || groupFilter ? 'Ajuste os filtros ou recarregue a lista.' : 'O catálogo aparecerá aqui quando houver material ativo.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 hidden overflow-x-auto rounded-lg border border-outline md:block">
                <table className="min-w-[64rem] w-full divide-y divide-outline bg-surface">
                  <thead className="bg-surface-elevated">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Material</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Grupo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Saldo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Coletado / vendido</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-text-secondary">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline">
                    {filteredMaterials.map((material) => (
                      <tr key={materialId(material)} className="hover:bg-surface-alt">
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-foreground">{materialName(material)}</p>
                          <p className="mt-1 text-xs text-text-secondary">ID {material.material_id} · unidade kg</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-2 rounded-full border border-outline/70 bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary">
                            <FaLayerGroup className="h-3 w-3" />
                            {material.group || 'Sem grupo'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-foreground">
                          {formatStockWeight(material.stockKg)}
                        </td>
                        <td className="px-4 py-4 text-sm text-text-secondary">
                          {material.totalCollectedKg === null || material.totalSoldKg === null
                            ? 'Indisponível'
                            : `${formatWeight(material.totalCollectedKg)} kg / ${formatWeight(material.totalSoldKg)} kg`}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(material.status)}`}>
                            {statusLabel(material.status)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {canAdjustStock && (
                              <button
                                type="button"
                                disabled={Boolean(stockError)}
                                title={stockError ? 'Recarregue o estoque antes de ajustar' : 'Ajustar estoque'}
                                onClick={() => openStockModal(material)}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-primary/35 px-3 text-sm font-semibold text-primary hover:bg-primary/12 disabled:cursor-not-allowed disabled:border-outline disabled:text-text-secondary disabled:opacity-70"
                              >
                                <FaPlus className="h-3.5 w-3.5" />
                                Ajustar
                              </button>
                            )}
                            {canManageMaterials && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditMaterial(material)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-secondary/35 text-secondary hover:bg-secondary/12"
                                  aria-label={`Editar ${materialName(material)}`}
                                  title="Editar material"
                                >
                                  <FaEdit />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteMaterial(material)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-error/35 text-error hover:bg-error/12"
                                  aria-label={`Excluir ${materialName(material)}`}
                                  title="Excluir material sem dependências"
                                >
                                  <FaTrash />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 grid gap-3 md:hidden">
                {filteredMaterials.map((material) => (
                  <article key={materialId(material)} className="rounded-lg border border-outline bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{materialName(material)}</p>
                        <p className="mt-1 text-xs text-text-secondary">ID {material.material_id} · kg</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(material.status)}`}>
                        {statusLabel(material.status)}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Grupo</dt>
                        <dd className="text-right text-foreground">{material.group || 'Sem grupo'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Saldo</dt>
                        <dd className="text-right font-semibold text-foreground">{formatStockWeight(material.stockKg)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Coletado</dt>
                        <dd className="text-right text-foreground">
                          {material.totalCollectedKg === null ? 'Indisponível' : `${formatWeight(material.totalCollectedKg)} kg`}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Vendido</dt>
                        <dd className="text-right text-foreground">
                          {material.totalSoldKg === null ? 'Indisponível' : `${formatWeight(material.totalSoldKg)} kg`}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 grid gap-2">
                      {canAdjustStock && (
                        <button
                          type="button"
                          disabled={Boolean(stockError)}
                          title={stockError ? 'Recarregue o estoque antes de ajustar' : 'Ajustar estoque'}
                          onClick={() => openStockModal(material)}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/35 px-3 text-sm font-semibold text-primary hover:bg-primary/12 disabled:cursor-not-allowed disabled:border-outline disabled:text-text-secondary disabled:opacity-70"
                        >
                          <FaPlus className="h-4 w-4" />
                          Ajustar estoque
                        </button>
                      )}
                      {canManageMaterials && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => openEditMaterial(material)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-secondary/35 px-3 text-sm font-semibold text-secondary hover:bg-secondary/12"
                          >
                            <FaEdit className="h-4 w-4" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteMaterial(material)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-error/35 px-3 text-sm font-semibold text-error hover:bg-error/12"
                          >
                            <FaTrash className="h-4 w-4" />
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {showMaterialModal && canManageMaterials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-outline bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-outline bg-surface-elevated px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {editingMaterial ? 'Editar material' : 'Novo material'}
                </h2>
                <p className="mt-1 text-xs text-text-secondary">Catálogo global usado por vendas, pesagens e relatórios.</p>
              </div>
              <button
                type="button"
                onClick={resetMaterialForm}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-foreground"
                aria-label="Fechar modal"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleMaterialSubmit} className="space-y-4 p-6">
              <div>
                <label htmlFor="materialName" className={labelClass}>Nome do material *</label>
                <input
                  id="materialName"
                  type="text"
                  value={materialForm.material}
                  onChange={(event) => setMaterialForm((current) => ({ ...current, material: event.target.value }))}
                  className={fieldClass}
                  placeholder="Ex.: Papelao, PET transparente"
                />
                {renderFieldError('material')}
              </div>

              <div>
                <label htmlFor="materialGroup" className={labelClass}>Grupo *</label>
                <select
                  id="materialGroup"
                  value={materialForm.groupId}
                  onChange={(event) => setMaterialForm((current) => ({ ...current, groupId: event.target.value }))}
                  className={fieldClass}
                >
                  <option value="">Selecione um grupo</option>
                  {materialGroups.map((materialGroup) => (
                    <option key={materialGroup.group_id} value={materialGroup.group_id}>
                      {materialGroup.group}
                    </option>
                  ))}
                </select>
                {renderFieldError('group')}
              </div>

              <div className="rounded-lg border border-outline/70 bg-surface-alt px-4 py-3 text-sm text-text-secondary">
                Alterar nome ou grupo afeta filtros, vendas, estoque e relatórios que usam este material.
              </div>

              <div className="flex flex-col gap-3 border-t border-outline pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetMaterialForm}
                  className="min-h-11 rounded-lg border border-outline px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={materialSubmitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-background hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FaSave className="h-4 w-4" />
                  {materialSubmitting ? 'Salvando...' : editingMaterial ? 'Salvar alterações' : 'Criar material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGroupModal && canManageMaterials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-outline bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-outline bg-surface-elevated px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Novo grupo de materiais</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Cadastre grupos antes de criar materiais para manter a lista padronizada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowGroupModal(false);
                  setGroupForm({ group: '' });
                  setFieldErrors({});
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-foreground"
                aria-label="Fechar modal"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleGroupSubmit} className="space-y-4 p-6">
              <div>
                <label htmlFor="materialGroupName" className={labelClass}>Nome do grupo *</label>
                <input
                  id="materialGroupName"
                  type="text"
                  value={groupForm.group}
                  onChange={(event) => setGroupForm({ group: event.target.value })}
                  className={fieldClass}
                  placeholder="Ex.: Papeis"
                  autoFocus
                />
                {renderFieldError('groupName')}
              </div>

              <div className="rounded-lg border border-outline/70 bg-surface-alt px-4 py-3 text-sm text-text-secondary">
                Depois de criado, o grupo fica disponivel no dropdown de cadastro e edicao de materiais.
              </div>

              <div className="flex flex-col gap-3 border-t border-outline pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupModal(false);
                    setGroupForm({ group: '' });
                    setFieldErrors({});
                  }}
                  className="min-h-11 rounded-lg border border-outline px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={groupSubmitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-background hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FaSave className="h-4 w-4" />
                  {groupSubmitting ? 'Criando...' : 'Criar grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stockMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-outline bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-outline bg-surface-elevated px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Ajustar estoque</h2>
                <p className="mt-1 text-xs text-text-secondary">{materialName(stockMaterial)} · {sessionUser?.cooperative_name || 'cooperativa da sessão'}</p>
              </div>
              <button
                type="button"
                onClick={closeStockModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-foreground"
                aria-label="Fechar ajuste de estoque"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-4 p-6">
              <div className="grid gap-3 rounded-lg border border-outline/70 bg-surface-alt p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-text-secondary">Saldo atual</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{formatStockWeight(stockMaterial.stockKg)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-text-secondary">Status</p>
                  <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(stockMaterial.status)}`}>
                    {statusLabel(stockMaterial.status)}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="stockAmount" className={labelClass}>Peso a adicionar (kg) *</label>
                <input
                  id="stockAmount"
                  type="text"
                  inputMode="decimal"
                  value={stockAmount}
                  onChange={(event) => {
                    setStockAmount(event.target.value);
                    setStockConfirming(false);
                  }}
                  className={fieldClass}
                  placeholder="Ex.: 12,50"
                />
                {renderFieldError('amount')}
              </div>

              {stockConfirming && stockImpact !== null && (
                <div className="rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground">
                  <div className="flex items-start gap-2">
                    <FaExclamationTriangle className="mt-0.5 shrink-0 text-warning" />
                    <p>
                      Confirmar este ajuste elevará o saldo de {formatStockWeight(stockMaterial.stockKg)} para {formatWeight(stockImpact)} kg.
                    </p>
                  </div>
                </div>
              )}

              {stockSubmitError && (
                <div className="rounded-lg border border-error/35 bg-error/10 px-4 py-3 text-sm text-foreground">
                  <div className="flex items-start gap-2">
                    <FaExclamationTriangle className="mt-0.5 shrink-0 text-error" />
                    <p>{stockSubmitError}</p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-outline/70 bg-surface-alt px-4 py-3 text-sm text-text-secondary">
                A API efetiva limita o ajuste à cooperativa da sessão e rejeita valores inválidos ou invariantes de estoque.
              </div>

              <div className="flex flex-col gap-3 border-t border-outline pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeStockModal}
                  className="min-h-11 rounded-lg border border-outline px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={stockSubmitting}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-background hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {stockSubmitting ? 'Ajustando...' : stockConfirming ? 'Confirmar ajuste' : 'Revisar impacto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteMaterial && canManageMaterials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-outline bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-error/35 bg-error/12 text-error">
                <FaTrash />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Excluir material</h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {materialName(deleteMaterial)} só será excluído se não houver vendas, estoque, medições ou contribuições associadas.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteMaterial(null)}
                className="min-h-11 rounded-lg border border-outline px-4 text-sm font-semibold text-foreground hover:bg-surface-alt"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteMaterial()}
                disabled={deleteSubmitting}
                className="min-h-11 rounded-lg bg-error px-4 text-sm font-semibold text-background hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteSubmitting ? 'Excluindo...' : 'Excluir material'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

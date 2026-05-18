'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import Layout from '@/components/Layout';
import {
  FaPlus,
  FaTimes,
  FaCheck,
  FaBan,
  FaSignInAlt,
  FaSignOutAlt,
  FaUserPlus,
  FaWeight,
  FaFilePdf,
  FaFileAlt,
  FaSpinner,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';

type ContribStatus = 'INVITED' | 'ACCEPTED' | 'LEFT';
type SaleStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED';
type ActiveTab = 'ACTIVE' | 'INVITED' | 'SOLD' | 'CANCELLED';

interface Participant {
  contribution_id: string;
  cooperative_id: string;
  cooperative_name: string;
  status: ContribStatus;
  contributed_weight: number | null;
}

interface CollectiveSale {
  _id: string;
  material_id: string;
  material_name: string;
  buyer_name: string;
  'price/kg': number;
  total_weight: number | null;
  expected_sale_date: string;
  created_at: string;
  sold_at: string | null;
  cancelled_at: string | null;
  status: SaleStatus;
  creator_cooperative_id: string;
  creator_cooperative_name: string;
  my_participation: ContribStatus | null;
  participants: Participant[];
}

interface Invitation {
  contribution_id: string;
  collective_sale_id: string;
  material_name: string;
  buyer_name: string;
  'price/kg': number;
  expected_sale_date: string;
  creator_cooperative_name: string;
  status: 'INVITED';
}

interface Material {
  _id: string;
  material_id: string;
  material?: string;
  name?: string;
}

interface Buyer {
  _id: string;
  name: string;
}

const STATUS_LABELS: Record<SaleStatus, string> = {
  ACTIVE: 'Ativa',
  SOLD: 'Concluída',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASSES: Record<SaleStatus, string> = {
  ACTIVE: 'bg-blue-100 text-blue-800',
  SOLD: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const CONTRIB_LABELS: Record<ContribStatus, string> = {
  INVITED: 'Convidada',
  ACCEPTED: 'Participando',
  LEFT: 'Saiu',
};

const TAB_LABELS: Record<ActiveTab, string> = {
  ACTIVE: 'Ativas',
  INVITED: 'Convites',
  SOLD: 'Concluídas',
  CANCELLED: 'Canceladas',
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatKg = (v: number | null) =>
  v == null ? '—' : `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} kg`;

const formatDate = (s: string | null) => {
  if (!s) return '—';
  const [year, month, day] = s.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
};

export default function CollectiveSalesPage() {
  const [myCoopId, setMyCoopId] = useState('');
  const [myCoopName, setMyCoopName] = useState('');

  const [activeTab, setActiveTab] = useState<ActiveTab>('ACTIVE');
  const [sales, setSales] = useState<CollectiveSale[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState<string | null>(null); // saleId
  const [showContribModal, setShowContribModal] = useState<string | null>(null); // saleId
  const [showConfirmModal, setShowConfirmModal] = useState<{
    action: 'join' | 'leave' | 'cancel' | 'complete';
    saleId: string;
    title: string;
    message: string;
  } | null>(null);

  // Form state
  const [createForm, setCreateForm] = useState({
    material_id: '',
    buyer: '',
    price_per_kg: '',
    expected_sale_date: '',
  });
  const [newBuyerName, setNewBuyerName] = useState('');
  const [showBuyerSubform, setShowBuyerSubform] = useState(false);
  const [inviteCoopId, setInviteCoopId] = useState('');
  const [contribWeight, setContribWeight] = useState('');

  // Error state
  const [createError, setCreateError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [contribError, setContribError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Loading state
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as Record<string, string>;
        if (parsed.cooperative_id) setMyCoopId(parsed.cooperative_id);
        if (parsed.cooperative_name) setMyCoopName(parsed.cooperative_name);
      } catch { /* ignore */ }
    }
  }, []);

  const fetchSales = useCallback(async (tab: ActiveTab) => {
    if (tab === 'INVITED') return;
    setLoadingSales(true);
    try {
      const resp = await fetch(`/api/collective-sales?status=${tab}`);
      if (!resp.ok) throw new Error();
      const data = await resp.json() as { collective_sales: CollectiveSale[] };
      setSales(data.collective_sales ?? []);
    } catch { setSales([]); }
    finally { setLoadingSales(false); }
  }, []);

  const fetchInvitations = useCallback(async () => {
    setLoadingSales(true);
    try {
      const resp = await fetch('/api/collective-sales/invitations');
      if (!resp.ok) throw new Error();
      const data = await resp.json() as { invitations: Invitation[] };
      setInvitations(data.invitations ?? []);
    } catch { setInvitations([]); }
    finally { setLoadingSales(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'INVITED') {
      void fetchInvitations();
    } else {
      void fetchSales(activeTab);
    }
    setExpandedSaleId(null);
    setActionError(null);
  }, [activeTab, fetchSales, fetchInvitations]);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [matResp, buyResp] = await Promise.all([
          fetch('/api/materials'),
          fetch('/api/buyers'),
        ]);
        if (matResp.ok) {
          const matData = await matResp.json() as unknown[];
          const mats = matData.filter((m): m is Material =>
            typeof m === 'object' && m !== null &&
            typeof (m as { material_id?: unknown }).material_id === 'string',
          );
          setMaterials(mats);
        }
        if (buyResp.ok) {
          const buyData = await buyResp.json() as { buyers?: Buyer[] };
          setBuyers(buyData.buyers ?? []);
        }
      } catch { /* silent */ }
      finally { setLoadingMeta(false); }
    };
    void fetchMeta();
  }, []);

  const getMaterialName = (id: string) => {
    const m = materials.find((mat) => mat.material_id === id || mat._id === id);
    return m?.material ?? m?.name ?? id;
  };

  // ── Create sale ──────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError(null);
    if (!createForm.material_id || !createForm.buyer || !createForm.price_per_kg || !createForm.expected_sale_date) {
      setCreateError('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch('/api/collective-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: createForm.material_id,
          Buyer: createForm.buyer,
          'price/kg': parseFloat(createForm.price_per_kg),
          expected_sale_date: new Date(createForm.expected_sale_date).toISOString(),
          cooperative_id: myCoopId,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        setCreateError(err.message ?? 'Erro ao criar venda coletiva');
        return;
      }
      setShowCreateModal(false);
      setCreateForm({ material_id: '', buyer: '', price_per_kg: '', expected_sale_date: '' });
      await fetchSales('ACTIVE');
      setActiveTab('ACTIVE');
    } catch { setCreateError('Erro ao criar venda coletiva'); }
    finally { setSaving(false); }
  };

  const handleAddBuyer = async () => {
    if (!newBuyerName.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch('/api/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBuyerName.trim() }),
      });
      if (!resp.ok) return;
      const data = await resp.json() as { buyer?: { name?: string } };
      const addedName = data.buyer?.name ?? newBuyerName.trim();
      const buyResp = await fetch('/api/buyers');
      if (buyResp.ok) {
        const buyData = await buyResp.json() as { buyers?: Buyer[] };
        setBuyers(buyData.buyers ?? []);
      }
      setCreateForm((prev) => ({ ...prev, buyer: addedName }));
      setNewBuyerName('');
      setShowBuyerSubform(false);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  // ── Invite ────────────────────────────────────────────────────────────────────

  const handleInvite = async (saleId: string) => {
    setInviteError(null);
    if (!inviteCoopId.trim()) {
      setInviteError('ID da cooperativa é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch(`/api/collective-sales/${saleId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cooperative_id: inviteCoopId.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        setInviteError(err.message ?? 'Erro ao convidar cooperativa');
        return;
      }
      setShowInviteModal(null);
      setInviteCoopId('');
      await fetchSales(activeTab);
    } catch { setInviteError('Erro ao convidar cooperativa'); }
    finally { setSaving(false); }
  };

  // ── Contribution ─────────────────────────────────────────────────────────────

  const handleContrib = async (saleId: string) => {
    setContribError(null);
    const w = parseFloat(contribWeight);
    if (isNaN(w) || w < 0) {
      setContribError('Peso deve ser maior ou igual a zero');
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch(`/api/collective-sales/${saleId}/contribution`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributed_weight: w }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        setContribError(err.message ?? 'Erro ao atualizar peso');
        return;
      }
      setShowContribModal(null);
      setContribWeight('');
      await fetchSales(activeTab);
    } catch { setContribError('Erro ao atualizar peso'); }
    finally { setSaving(false); }
  };

  // ── Confirm actions ───────────────────────────────────────────────────────────

  const handleConfirmAction = async () => {
    if (!showConfirmModal) return;
    const { action, saleId } = showConfirmModal;
    setShowConfirmModal(null);
    setActionError(null);
    setActionLoading(saleId);

    const endpointMap: Record<typeof action, { method: string; path: string }> = {
      join: { method: 'POST', path: 'join' },
      leave: { method: 'POST', path: 'leave' },
      cancel: { method: 'POST', path: 'cancel' },
      complete: { method: 'POST', path: 'complete' },
    };

    const { method, path } = endpointMap[action];

    try {
      const resp = await fetch(`/api/collective-sales/${saleId}/${path}`, { method });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        setActionError(err.message ?? `Erro ao executar ação`);
        return;
      }
      if (action === 'join') {
        await fetchInvitations();
        await fetchSales('ACTIVE');
        setActiveTab('ACTIVE');
      } else {
        await fetchSales(activeTab);
      }
    } catch { setActionError(`Erro ao executar ação`); }
    finally { setActionLoading(null); }
  };

  const confirmJoin = (inv: Invitation) =>
    setShowConfirmModal({
      action: 'join',
      saleId: inv.collective_sale_id,
      title: 'Confirmar entrada',
      message: `Entrar na venda coletiva de ${inv.material_name} (${inv.creator_cooperative_name})? Você poderá registrar sua contribuição de peso após entrar.`,
    });

  const confirmLeave = (sale: CollectiveSale) =>
    setShowConfirmModal({
      action: 'leave',
      saleId: sale._id,
      title: 'Confirmar saída',
      message: `Sair da venda coletiva de ${sale.material_name}? ${sale.my_participation === 'ACCEPTED' ? 'O peso contribuído será devolvido ao estoque.' : ''}`,
    });

  const confirmCancel = (sale: CollectiveSale) =>
    setShowConfirmModal({
      action: 'cancel',
      saleId: sale._id,
      title: 'Cancelar venda coletiva',
      message: `Cancelar a venda de ${sale.material_name}? O peso reservado por todas as cooperativas participantes será devolvido ao estoque. Esta ação não pode ser desfeita.`,
    });

  const confirmComplete = (sale: CollectiveSale) => {
    const totalW = sale.participants.reduce((s, p) => s + (p.contributed_weight ?? 0), 0);
    const totalR = totalW * sale['price/kg'];
    setShowConfirmModal({
      action: 'complete',
      saleId: sale._id,
      title: 'Concluir venda coletiva',
      message: `Concluir a venda de ${sale.material_name}? Peso total: ${formatKg(totalW)}. Receita estimada: ${formatCurrency(totalR)}. O revenue_share será calculado e distribuído proporcionalmente. Esta ação não pode ser desfeita.`,
    });
  };

  const isCreator = (sale: CollectiveSale) => sale.creator_cooperative_id === myCoopId;
  const isParticipant = (sale: CollectiveSale) => sale.my_participation === 'ACCEPTED';

  // ── Render ────────────────────────────────────────────────────────────────────

  const renderInvitations = () => (
    <div className="overflow-x-auto">
      {loadingSales ? (
        <div className="p-12 text-center flex items-center justify-center gap-2 text-gray-500">
          <FaSpinner className="animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : invitations.length === 0 ? (
        <div className="p-12 text-center text-gray-500">Nenhum convite pendente</div>
      ) : (
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Material', 'Comprador', 'Criador', 'Preço/kg', 'Data prevista', 'Ação'].map((h) => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invitations.map((inv) => (
              <tr key={inv.contribution_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.material_name}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{inv.buyer_name}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{inv.creator_cooperative_name}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{formatCurrency(inv['price/kg'])}/kg</td>
                <td className="px-6 py-4 text-sm text-gray-700">{formatDate(inv.expected_sale_date)}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => confirmJoin(inv)}
                    disabled={actionLoading === inv.collective_sale_id}
                    className="flex items-center gap-1 bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <FaSignInAlt />
                    Entrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderSales = () => (
    <div className="overflow-x-auto">
      {loadingSales ? (
        <div className="p-12 text-center flex items-center justify-center gap-2 text-gray-500">
          <FaSpinner className="animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : sales.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          Nenhuma venda {TAB_LABELS[activeTab].toLowerCase()} encontrada
        </div>
      ) : (
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Material', 'Criador', 'Comprador', 'Preço/kg', 'Peso total', 'Data prevista', 'Status', 'Minha participação', 'Ações'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sales.map((sale) => {
              const expanded = expandedSaleId === sale._id;
              const creator = isCreator(sale);
              const participant = isParticipant(sale);
              const active = sale.status === 'ACTIVE';

              return (
                <Fragment key={sale._id}>
                  <tr
                    className={`hover:bg-gray-50 ${expanded ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-4 text-sm font-medium text-gray-900">{sale.material_name}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{sale.creator_cooperative_name}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{sale.buyer_name}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatCurrency(sale['price/kg'])}/kg</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatKg(sale.total_weight)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatDate(sale.expected_sale_date)}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_CLASSES[sale.status]}`}>
                        {STATUS_LABELS[sale.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {creator ? (
                        <span className="text-[#7a1c44] font-semibold">Criadora</span>
                      ) : sale.my_participation ? (
                        <span>{CONTRIB_LABELS[sale.my_participation]}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {active && creator && (
                          <>
                            <button
                              title="Convidar cooperativa"
                              onClick={() => { setShowInviteModal(sale._id); setInviteError(null); setInviteCoopId(''); }}
                              className="p-1.5 text-blue-600 hover:text-blue-800"
                            >
                              <FaUserPlus />
                            </button>
                            <button
                              title="Concluir venda"
                              onClick={() => confirmComplete(sale)}
                              disabled={actionLoading === sale._id}
                              className="p-1.5 text-green-600 hover:text-green-800 disabled:opacity-50"
                            >
                              {actionLoading === sale._id ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                            </button>
                            <button
                              title="Cancelar venda"
                              onClick={() => confirmCancel(sale)}
                              disabled={actionLoading === sale._id}
                              className="p-1.5 text-red-500 hover:text-red-700 disabled:opacity-50"
                            >
                              <FaBan />
                            </button>
                          </>
                        )}
                        {active && participant && !creator && (
                          <>
                            <button
                              title="Atualizar peso contribuído"
                              onClick={() => {
                                const myWeight = sale.participants.find(
                                  (p) => p.cooperative_id === myCoopId,
                                )?.contributed_weight;
                                setContribWeight(myWeight != null ? String(myWeight) : '');
                                setContribError(null);
                                setShowContribModal(sale._id);
                              }}
                              className="p-1.5 text-[#c15079] hover:text-[#a03d63]"
                            >
                              <FaWeight />
                            </button>
                            <button
                              title="Sair da venda"
                              onClick={() => confirmLeave(sale)}
                              disabled={actionLoading === sale._id}
                              className="p-1.5 text-orange-500 hover:text-orange-700 disabled:opacity-50"
                            >
                              <FaSignOutAlt />
                            </button>
                          </>
                        )}
                        {/* Reports */}
                        <a
                          href={`/api/reports/sales/collective/${sale._id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver relatório JSON"
                          className="p-1.5 text-gray-500 hover:text-gray-700"
                        >
                          <FaFileAlt />
                        </a>
                        <a
                          href={`/api/reports/pdf/collective-sale/${sale._id}`}
                          download
                          title="Baixar PDF"
                          className="p-1.5 text-red-400 hover:text-red-600"
                        >
                          <FaFilePdf />
                        </a>
                        <button
                          onClick={() => setExpandedSaleId(expanded ? null : sale._id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600"
                          title="Ver participantes"
                        >
                          {expanded ? <FaChevronUp /> : <FaChevronDown />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="bg-blue-50">
                      <td colSpan={9} className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-700 mb-2">Participantes</div>
                        {sale.participants.length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhuma participação registrada</p>
                        ) : (
                          <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                            <thead className="bg-white">
                              <tr>
                                {['Cooperativa', 'Status', 'Peso (kg)', 'Revenue share'].map((h) => (
                                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sale.participants.map((p) => (
                                <tr key={p.contribution_id} className="border-t border-gray-200">
                                  <td className="px-4 py-2 text-sm text-gray-900">{p.cooperative_name}</td>
                                  <td className="px-4 py-2 text-sm">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      p.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                                      p.status === 'INVITED' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {CONTRIB_LABELS[p.status as ContribStatus]}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-700">{formatKg(p.contributed_weight)}</td>
                                  <td className="px-4 py-2 text-sm text-gray-700">
                                    {p.contributed_weight != null && sale.status === 'SOLD'
                                      ? formatCurrency(p.contributed_weight * sale['price/kg'])
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <Layout activePath="/collective-sales">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-[#c15079]">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-[#7a1c44] mb-2">Vendas Coletivas</h1>
              <p className="text-gray-600">Gerencie vendas coletivas, convites, contribuições e relatórios</p>
              {myCoopName && (
                <p className="text-sm text-gray-500 mt-1">Cooperativa: {myCoopName}</p>
              )}
            </div>
            <button
              onClick={() => { setCreateError(null); setShowCreateModal(true); }}
              className="bg-[#c15079] text-white px-6 py-3 rounded-lg hover:bg-[#a03d63] transition-colors flex items-center gap-2"
            >
              <FaPlus />
              Nova Venda Coletiva
            </button>
          </div>
        </div>

        {/* Tabs + Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="flex border-b border-gray-200">
            {(['ACTIVE', 'INVITED', 'SOLD', 'CANCELLED'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab
                    ? 'border-b-2 border-[#c15079] text-[#c15079]'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {TAB_LABELS[tab]}
                {tab === 'INVITED' && invitations.length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {invitations.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Action error */}
          {actionError && (
            <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex justify-between items-center">
              <span className="text-red-700 text-sm">{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700 ml-2">
                <FaTimes />
              </button>
            </div>
          )}

          {activeTab === 'INVITED' ? renderInvitations() : renderSales()}
        </div>
      </div>

      {/* ── Create Modal ─────────────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#7a1c44]">Nova Venda Coletiva</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-700">
                <FaTimes size={20} />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{createError}</div>
            )}

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">Material *</label>
                  <select
                    className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                    value={createForm.material_id}
                    onChange={(e) => setCreateForm((p) => ({ ...p, material_id: e.target.value }))}
                  >
                    <option value="">Selecione um material</option>
                    {materials.map((m) => (
                      <option key={m._id} value={m.material_id}>{m.material ?? m.name}</option>
                    ))}
                  </select>
                  {loadingMeta && <p className="text-xs text-gray-400 mt-1">Carregando materiais...</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">Cooperativa</label>
                  <div className="w-full py-2 px-3 border border-gray-200 rounded-lg bg-gray-100 text-gray-700">
                    {myCoopName || 'Cooperativa não identificada'}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">Preço/kg (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                    value={createForm.price_per_kg}
                    onChange={(e) => setCreateForm((p) => ({ ...p, price_per_kg: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">Data prevista de venda *</label>
                  <input
                    type="date"
                    className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                    value={createForm.expected_sale_date}
                    onChange={(e) => setCreateForm((p) => ({ ...p, expected_sale_date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#7a1c44] mb-2">Comprador *</label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                    value={createForm.buyer}
                    onChange={(e) => setCreateForm((p) => ({ ...p, buyer: e.target.value }))}
                  >
                    <option value="">Selecione um comprador</option>
                    {buyers.map((b) => (
                      <option key={b._id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowBuyerSubform(true)}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    title="Adicionar comprador"
                  >
                    <FaUserPlus />
                  </button>
                </div>
              </div>

              {showBuyerSubform && (
                <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      className="flex-1 py-2 px-3 border border-gray-300 rounded-lg text-sm"
                      placeholder="Nome do comprador"
                      value={newBuyerName}
                      onChange={(e) => setNewBuyerName(e.target.value)}
                    />
                    <button onClick={handleAddBuyer} className="px-3 py-2 bg-[#c15079] text-white rounded-lg text-sm hover:bg-[#a03d63]">
                      Adicionar
                    </button>
                    <button onClick={() => setShowBuyerSubform(false)} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="px-6 py-2 bg-[#c15079] text-white rounded-lg hover:bg-[#a03d63] disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <FaSpinner className="animate-spin" /> : <FaPlus />}
                  Criar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite Modal ──────────────────────────────────────────────────────── */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[#7a1c44]">Convidar Cooperativa</h2>
              <button onClick={() => setShowInviteModal(null)} className="text-gray-500 hover:text-gray-700">
                <FaTimes />
              </button>
            </div>

            {inviteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{inviteError}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#7a1c44] mb-2">ID da cooperativa *</label>
                <input
                  type="text"
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                  placeholder="Ex: 12345"
                  value={inviteCoopId}
                  onChange={(e) => setInviteCoopId(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Digite o ID numérico da cooperativa a convidar</p>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowInviteModal(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={() => showInviteModal && handleInvite(showInviteModal)}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <FaSpinner className="animate-spin" /> : <FaUserPlus />}
                  Convidar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Contribution Modal ────────────────────────────────────────────────── */}
      {showContribModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[#7a1c44]">Atualizar Contribuição de Peso</h2>
              <button onClick={() => setShowContribModal(null)} className="text-gray-500 hover:text-gray-700">
                <FaTimes />
              </button>
            </div>

            {contribError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{contribError}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#7a1c44] mb-2">Peso contribuído (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                  value={contribWeight}
                  onChange={(e) => setContribWeight(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-400 mt-1">A diferença em relação ao valor atual será reservada/devolvida do estoque</p>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowContribModal(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={() => showContribModal && handleContrib(showContribModal)}
                  disabled={saving}
                  className="px-4 py-2 bg-[#c15079] text-white rounded-lg hover:bg-[#a03d63] disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <FaSpinner className="animate-spin" /> : <FaWeight />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ─────────────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[#7a1c44]">{showConfirmModal.title}</h2>
              <button onClick={() => setShowConfirmModal(null)} className="text-gray-500 hover:text-gray-700">
                <FaTimes />
              </button>
            </div>

            <p className="text-gray-700 mb-6">{showConfirmModal.message}</p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-white rounded-lg flex items-center gap-2 ${
                  showConfirmModal.action === 'cancel' || showConfirmModal.action === 'leave'
                    ? 'bg-red-600 hover:bg-red-700'
                    : showConfirmModal.action === 'complete'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <FaCheck />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

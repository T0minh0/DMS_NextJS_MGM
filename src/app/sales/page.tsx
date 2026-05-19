'use client';

import { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import {
  FaPlus,
  FaEdit,
  FaSearch,
  FaSave,
  FaTimes,
  FaShoppingCart,
  FaUserPlus,
  FaCalendarAlt,
  FaWeight,
  FaDollarSign,
  FaCheck,
  FaBan,
} from 'react-icons/fa';

// Backend getSaleLifecycleStatus returns 'SOLD' (not 'HISTORY') — type must match
type SaleStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED';
type LifecycleTab = 'ACTIVE' | 'HISTORY' | 'CANCELLED';

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

interface Sale {
  _id: string;
  material_id: string;
  cooperative_id: string;
  status: SaleStatus;
  'price/kg': number;
  weight_sold: number;
  date: string;
  created_at: string;
  sold_at: string | null;
  cancelled_at: string | null;
  expected_sale_date: string;
  Buyer: string;
}

interface StockData {
  [materialName: string]: number;
}

interface SaleFormData {
  material_id: string;
  price_per_kg: number;
  weight_sold: number;
  date: string;
  buyer: string;
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

const TAB_LABELS: Record<LifecycleTab, string> = {
  ACTIVE: 'Ativas',
  HISTORY: 'Concluídas',
  CANCELLED: 'Canceladas',
};

const panelClass = 'surface-panel rounded-xl p-6';
const tablePanelClass = 'surface-panel rounded-xl overflow-hidden';
const fieldClass = 'rounded-lg border border-outline bg-surface-alt px-3 py-2 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0';
const labelClass = 'block text-sm font-semibold text-on-surface mb-2';
const modalClass = 'surface-panel rounded-xl p-6 w-full shadow-2xl';
const primaryButtonClass = 'rounded-lg bg-primary px-6 py-3 font-semibold text-on-primary shadow-glow hover:bg-primary/90 disabled:opacity-50';
const secondaryButtonClass = 'rounded-lg border border-outline px-4 py-2 font-semibold text-foreground hover:bg-surface-alt';
const tableHeaderClass = 'bg-surface-elevated';
const tableHeadCellClass = 'px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider';
const tableCellClass = 'px-6 py-4 whitespace-nowrap text-sm text-foreground';

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stock, setStock] = useState<StockData>({});
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [managerCooperativeId, setManagerCooperativeId] = useState<string>('');
  const [managerCooperativeName, setManagerCooperativeName] = useState<string>('');

  const [activeTab, setActiveTab] = useState<LifecycleTab>('ACTIVE');
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [newBuyerName, setNewBuyerName] = useState('');

  const [formData, setFormData] = useState<SaleFormData>({
    material_id: '',
    price_per_kg: 0,
    weight_sold: 0,
    date: new Date().toISOString().split('T')[0],
    buyer: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [buyerFormError, setBuyerFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');

  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [savingForm, setSavingForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Ref keeps activeTab current inside async handlers (avoids stale closure)
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.cooperative_id) setManagerCooperativeId(parsed.cooperative_id);
        if (parsed.cooperative_name) setManagerCooperativeName(parsed.cooperative_name);
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
    fetchStock();
    fetchBuyers();
  }, []);

  useEffect(() => {
    fetchSales(activeTab);
  }, [activeTab]);

  const fetchSales = async (status: LifecycleTab) => {
    setLoadingSales(true);
    try {
      const response = await fetch(`/api/sales?status=${status}`);
      if (!response.ok) throw new Error('Failed to fetch sales');
      const data = await response.json();
      setSales(data.sales ?? []);
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoadingSales(false);
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await fetch('/api/materials');
      if (!response.ok) throw new Error();
      const data: unknown[] = await response.json();
      const items = data.filter((item): item is Material => {
        if (typeof item !== 'object' || item === null) return false;
        return typeof (item as { material_id?: unknown }).material_id === 'string';
      });
      setMaterials(items);
    } catch {
      // silent — table shows IDs as fallback
    } finally {
      setLoadingMeta(false);
    }
  };

  const fetchStock = async () => {
    try {
      const response = await fetch('/api/stock');
      if (!response.ok) throw new Error();
      const data = await response.json();
      setStock(data);
    } catch {
      // silent
    }
  };

  const fetchBuyers = async () => {
    try {
      const response = await fetch('/api/buyers');
      if (!response.ok) throw new Error();
      const data = await response.json();
      setBuyers(data.buyers ?? []);
    } catch {
      // silent
    }
  };

  const getMaterialName = (materialId: string) => {
    const m = materials.find(
      (mat) => mat.material_id === materialId || mat.material_id?.toString() === materialId,
    );
    return m?.material ?? m?.name ?? `Material ${materialId}`;
  };

  const getAvailableStock = (materialId: string) => {
    const name = getMaterialName(materialId);
    return stock[name] ?? 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.material_id || !formData.buyer) {
      setFormError('Material e comprador são obrigatórios');
      return;
    }
    if (!managerCooperativeId) {
      setFormError('Cooperativa não identificada. Refaça o login.');
      return;
    }
    if (formData.weight_sold <= 0 || formData.price_per_kg <= 0) {
      setFormError('Peso e preço devem ser maiores que zero');
      return;
    }
    if (!editingSale) {
      const available = getAvailableStock(formData.material_id);
      if (formData.weight_sold > available) {
        setFormError(`Estoque insuficiente. Disponível: ${available.toFixed(2)} kg`);
        return;
      }
    }

    setSavingForm(true);
    try {
      const body = {
        material_id: formData.material_id,
        cooperative_id: managerCooperativeId,
        'price/kg': formData.price_per_kg,
        weight_sold: formData.weight_sold,
        date: new Date(formData.date).toISOString(),
        Buyer: formData.buyer,
      };

      const url = editingSale ? `/api/sales/${editingSale._id}` : '/api/sales';
      const method = editingSale ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setFormError((err as { message?: string }).message ?? 'Erro ao salvar venda');
        return;
      }

      await fetchSales(activeTabRef.current);
      await fetchStock();
      resetForm();
    } catch {
      setFormError('Erro ao salvar venda');
    } finally {
      setSavingForm(false);
    }
  };

  const handleComplete = async (sale: Sale) => {
    setActionError(null);
    setActionLoading(sale._id);
    try {
      const response = await fetch(`/api/sales/${sale._id}/complete`, { method: 'PATCH' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setActionError({
          id: sale._id,
          message: (err as { message?: string }).message ?? 'Erro ao concluir venda',
        });
        return;
      }
      await fetchSales(activeTabRef.current);
      await fetchStock();
    } catch {
      setActionError({ id: sale._id, message: 'Erro ao concluir venda' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (sale: Sale) => {
    setActionError(null);
    setActionLoading(sale._id);
    try {
      const response = await fetch(`/api/sales/${sale._id}/cancel`, { method: 'PATCH' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setActionError({
          id: sale._id,
          message: (err as { message?: string }).message ?? 'Erro ao cancelar venda',
        });
        return;
      }
      await fetchSales(activeTabRef.current);
    } catch {
      setActionError({ id: sale._id, message: 'Erro ao cancelar venda' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    setFormData({
      material_id: sale.material_id,
      price_per_kg: sale['price/kg'],
      weight_sold: sale.weight_sold,
      date: sale.date.split('T')[0],
      buyer: sale.Buyer,
    });
    setFormError(null);
    setShowSaleForm(true);
  };

  const handleAddBuyer = async () => {
    setBuyerFormError(null);
    if (!newBuyerName.trim()) {
      setBuyerFormError('Digite o nome do comprador');
      return;
    }
    try {
      const response = await fetch('/api/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBuyerName.trim() }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setBuyerFormError((err as { message?: string }).message ?? 'Erro ao adicionar comprador');
        return;
      }
      const data = await response.json();
      await fetchBuyers();
      const addedName =
        (data as { buyer?: { name?: string } }).buyer?.name ?? newBuyerName.trim();
      setFormData((prev) => ({ ...prev, buyer: addedName }));
      setNewBuyerName('');
      setShowBuyerForm(false);
    } catch {
      setBuyerFormError('Erro ao adicionar comprador');
    }
  };

  const resetForm = () => {
    setFormData({
      material_id: '',
      price_per_kg: 0,
      weight_sold: 0,
      date: new Date().toISOString().split('T')[0],
      buyer: '',
    });
    setEditingSale(null);
    setFormError(null);
    setShowSaleForm(false);
  };

  const filteredSales = sales.filter((sale) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      getMaterialName(sale.material_id).toLowerCase().includes(term) ||
      sale.Buyer.toLowerCase().includes(term);
    const matchesDate = !filterStartDate || new Date(sale.date) >= new Date(filterStartDate);
    return matchesSearch && matchesDate;
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatDate = (s: string) => {
    // Parse as UTC to avoid off-by-one day in UTC-3 (Brazil)
    const [year, month, day] = s.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
  };

  return (
    <Layout activePath="/sales">
      <div className="space-y-6">
        {/* Header */}
        <div className={panelClass}>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-primary mb-2">Gestão de Vendas</h1>
              <p className="text-text-secondary">Registre vendas e acompanhe o ciclo de vida</p>
            </div>
            <button
              onClick={() => {
                setFormError(null);
                setEditingSale(null);
                setShowSaleForm(true);
              }}
              className={`${primaryButtonClass} flex items-center`}
            >
              <FaPlus className="mr-2" />
              Nova Venda
            </button>
          </div>
        </div>

        {/* Lifecycle Tabs + Table */}
        <div className={tablePanelClass}>
          <div className="grid grid-cols-3 gap-2 border-b border-outline bg-surface-alt p-2">
            {(['ACTIVE', 'HISTORY', 'CANCELLED'] as LifecycleTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setActionError(null);
                }}
                className={`min-h-11 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? 'border-primary/50 bg-primary/12 text-primary shadow-glow'
                    : 'border-transparent text-text-secondary hover:border-outline hover:bg-surface hover:text-foreground'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-outline flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Material, comprador..."
                className={`${fieldClass} w-full pl-10 pr-4`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <input
              type="date"
              className={fieldClass}
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>

          {/* Action error banner */}
          {actionError && (
            <div className="mx-4 mt-4 rounded-lg border border-error/35 bg-error/10 p-3 flex justify-between items-center">
              <span className="text-error text-sm">{actionError.message}</span>
              <button
                onClick={() => setActionError(null)}
                className="text-red-500 hover:text-red-700 ml-2"
              >
                <FaTimes />
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={tableHeaderClass}>
                <tr>
                  <th className={tableHeadCellClass}>
                    <FaShoppingCart className="inline mr-1" />
                    Data
                  </th>
                  <th className={tableHeadCellClass}>
                    Material
                  </th>
                  <th className={tableHeadCellClass}>
                    Peso (kg)
                  </th>
                  <th className={tableHeadCellClass}>
                    Preço/kg
                  </th>
                  <th className={tableHeadCellClass}>
                    Total
                  </th>
                  <th className={tableHeadCellClass}>
                    Comprador
                  </th>
                  <th className={tableHeadCellClass}>
                    Status
                  </th>
                  <th className={tableHeadCellClass}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline bg-surface">
                {loadingSales ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c15079]" />
                        <span className="ml-2 text-text-secondary">Carregando...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-text-secondary">
                      Nenhuma venda {TAB_LABELS[activeTab].toLowerCase()} encontrada
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => (
                    <tr key={sale._id} className="hover:bg-surface-alt">
                      <td className={tableCellClass}>
                        {formatDate(sale.date)}
                      </td>
                      <td className={tableCellClass}>
                        {loadingMeta ? '...' : getMaterialName(sale.material_id)}
                      </td>
                      <td className={tableCellClass}>
                        {sale.weight_sold.toFixed(2)}
                      </td>
                      <td className={tableCellClass}>
                        {formatCurrency(sale['price/kg'])}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {formatCurrency(sale.weight_sold * sale['price/kg'])}
                      </td>
                      <td className={tableCellClass}>
                        {sale.Buyer}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_CLASSES[sale.status]}`}
                        >
                          {STATUS_LABELS[sale.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {sale.status === 'ACTIVE' ? (
                          <div className="flex space-x-2 items-center">
                            <button
                              onClick={() => handleEdit(sale)}
                              title="Editar"
                              className="text-[#c15079] hover:text-[#a03d63] transition-colors"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleComplete(sale)}
                              disabled={actionLoading === sale._id}
                              title="Concluir"
                              className="text-green-600 hover:text-green-800 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === sale._id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600" />
                              ) : (
                                <FaCheck />
                              )}
                            </button>
                            <button
                              onClick={() => handleCancel(sale)}
                              disabled={actionLoading === sale._id}
                              title="Cancelar"
                              className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === sale._id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-500" />
                              ) : (
                                <FaBan />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-secondary text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sale Form Modal */}
        {showSaleForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${modalClass} max-w-2xl max-h-[90vh] overflow-y-auto`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary">
                  {editingSale ? 'Editar Venda' : 'Nova Venda'}
                </h2>
                <button onClick={resetForm} className="text-text-secondary hover:text-foreground">
                  <FaTimes size={24} />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>
                      Material *
                    </label>
                    <select
                      required
                      className={`${fieldClass} w-full`}
                      value={formData.material_id}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, material_id: e.target.value }));
                        setFormError(null);
                      }}
                    >
                      <option value="">Selecione um material</option>
                      {materials.map((m) => (
                        <option key={m._id} value={m.material_id}>
                          {m.material ?? m.name}
                        </option>
                      ))}
                    </select>
                    {formData.material_id && (
                      <p className="text-sm text-text-secondary mt-1">
                        Estoque disponível: {getAvailableStock(formData.material_id).toFixed(2)} kg
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>
                      Cooperativa
                    </label>
                    <div className="w-full rounded-lg border border-outline bg-surface-elevated px-3 py-2 text-text-secondary">
                      {managerCooperativeName || 'Cooperativa não identificada'}
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>
                      <FaWeight className="inline mr-1" />
                      Peso (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className={`${fieldClass} w-full`}
                      value={formData.weight_sold || ''}
                      onChange={(e) => {
                        setFormData((prev) => ({
                          ...prev,
                          weight_sold: parseFloat(e.target.value) || 0,
                        }));
                        setFormError(null);
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      <FaDollarSign className="inline mr-1" />
                      Preço/kg (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className={`${fieldClass} w-full`}
                      value={formData.price_per_kg || ''}
                      onChange={(e) => {
                        setFormData((prev) => ({
                          ...prev,
                          price_per_kg: parseFloat(e.target.value) || 0,
                        }));
                        setFormError(null);
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      <FaCalendarAlt className="inline mr-1" />
                      Data *
                    </label>
                    <input
                      type="date"
                      required
                      className={`${fieldClass} w-full`}
                      value={formData.date}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, date: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Comprador *
                  </label>
                  <div className="flex gap-2">
                    <select
                      className={`${fieldClass} flex-1`}
                      value={formData.buyer}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, buyer: e.target.value }));
                        setFormError(null);
                      }}
                    >
                      <option value="">Selecione um comprador</option>
                      {buyers.map((b) => (
                        <option key={b._id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setBuyerFormError(null);
                        setShowBuyerForm(true);
                      }}
                      className="rounded-lg border border-outline bg-surface-elevated px-4 py-2 text-foreground hover:bg-surface-alt"
                      title="Adicionar comprador"
                    >
                      <FaUserPlus />
                    </button>
                  </div>
                </div>

                {formData.weight_sold > 0 && formData.price_per_kg > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-green-800 font-semibold">
                      Total estimado:{' '}
                      {formatCurrency(formData.weight_sold * formData.price_per_kg)}
                    </p>
                  </div>
                )}

                <div className="flex justify-end space-x-4 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className={secondaryButtonClass}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingForm}
                    className={`${primaryButtonClass} flex items-center py-2`}
                  >
                    {savingForm ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <FaSave className="mr-2" />
                        {editingSale ? 'Atualizar' : 'Salvar'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Buyer Modal */}
        {showBuyerForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${modalClass} max-w-md`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-primary">Adicionar Comprador</h3>
                <button
                  onClick={() => { setBuyerFormError(null); setShowBuyerForm(false); }}
                  className="text-text-secondary hover:text-foreground"
                >
                  <FaTimes />
                </button>
              </div>

              {buyerFormError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{buyerFormError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>
                    Nome do Comprador
                  </label>
                  <input
                    type="text"
                    className={`${fieldClass} w-full`}
                    value={newBuyerName}
                    onChange={(e) => {
                      setNewBuyerName(e.target.value);
                      setBuyerFormError(null);
                    }}
                    placeholder="Nome do comprador"
                  />
                </div>
                <div className="flex justify-end space-x-4">
                  <button
                    onClick={() => { setBuyerFormError(null); setShowBuyerForm(false); }}
                    className={secondaryButtonClass}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddBuyer}
                    className="rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary hover:bg-primary/90"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

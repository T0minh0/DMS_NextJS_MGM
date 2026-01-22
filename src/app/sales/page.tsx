'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaSearch,
  FaFilter,
  FaSave,
  FaTimes,
  FaShoppingCart,
  FaUserPlus,
  FaBuilding,
  FaCalendarAlt,
  FaWeight,
  FaDollarSign
} from 'react-icons/fa';

interface Material {
  _id: string;
  material_id: string;
  material?: string;
  name?: string;
  group?: string;
  price_per_kg?: number;
}

interface Cooperative {
  _id: string;
  cooperative_id: string;
  name: string;
  contact?: string;
  address?: string;
}

interface Sale {
  _id?: string;
  material_id: string;
  cooperative_id: string;
  'price/kg': number;
  weight_sold: number;
  date: string;
  Buyer: string;
}

interface StockData {
  [materialName: string]: number;
}

interface SaleFormData {
  material_id: string;
  cooperative_id: string;
  price_per_kg: number;
  weight_sold: number;
  date: string;
  buyer: string;
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([]);
  const [stock, setStock] = useState<StockData>({});
  const [buyers, setBuyers] = useState<string[]>([]);
  const [managerCooperativeId, setManagerCooperativeId] = useState<string>('');
  const [managerCooperativeName, setManagerCooperativeName] = useState<string>('');

  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [newBuyer, setNewBuyer] = useState('');

  const [formData, setFormData] = useState<SaleFormData>({
    material_id: '',
    cooperative_id: '',
    price_per_kg: 0,
    weight_sold: 0,
    date: new Date().toISOString().split('T')[0],
    buyer: ''
  });

  const [filters, setFilters] = useState({
    material_id: '',
    cooperative_id: '',
    buyer: '',
    start_date: '',
    end_date: ''
  });

  const [loading, setLoading] = useState({
    sales: true,
    materials: true,
    cooperatives: true,
    stock: true,
    saving: false
  });

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSales();
    fetchMaterials();
    fetchCooperatives();
    fetchStock();
    fetchBuyers();
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.cooperative_id) {
          setManagerCooperativeId(parsed.cooperative_id);
        }
        if (parsed.cooperative_name) {
          setManagerCooperativeName(parsed.cooperative_name);
        }
      } catch (error) {
        console.error('Failed to parse stored user:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (managerCooperativeId && cooperatives.length > 0) {
      const coop = cooperatives.find(
        (c) =>
          c.cooperative_id === managerCooperativeId ||
          c.cooperative_id?.toString() === managerCooperativeId,
      );
      if (coop) {
        setManagerCooperativeName(coop.name);
      }
    }
  }, [managerCooperativeId, cooperatives]);

  useEffect(() => {
    if (managerCooperativeId && !editingSale) {
      setFormData((prev) => ({
        ...prev,
        cooperative_id: managerCooperativeId,
      }));
    }
  }, [managerCooperativeId, editingSale]);

  const fetchSales = async () => {
    try {
      const response = await fetch('/api/sales');
      if (!response.ok) throw new Error('Failed to fetch sales');
      const data = await response.json();
      setSales(data.sales || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(prev => ({ ...prev, sales: false }));
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await fetch('/api/materials');
      if (!response.ok) throw new Error('Failed to fetch materials');
      const data: unknown[] = await response.json();
      const materialsOnly = data.filter((item): item is Material => {
        if (typeof item !== 'object' || item === null) {
          return false;
        }
        const candidate = item as { material_id?: unknown };
        return typeof candidate.material_id === 'string' && candidate.material_id.length > 0;
      });
      setMaterials(materialsOnly);
    } catch (error) {
      console.error('Error fetching materials:', error);
    } finally {
      setLoading(prev => ({ ...prev, materials: false }));
    }
  };

  const fetchCooperatives = async () => {
    try {
      const response = await fetch('/api/cooperatives');
      if (!response.ok) throw new Error('Failed to fetch cooperatives');
      const data = await response.json();
      setCooperatives(data);
    } catch (error) {
      console.error('Error fetching cooperatives:', error);
    } finally {
      setLoading(prev => ({ ...prev, cooperatives: false }));
    }
  };

  const fetchStock = async () => {
    try {
      const response = await fetch('/api/stock');
      if (!response.ok) throw new Error('Failed to fetch stock');
      const data = await response.json();
      setStock(data);
    } catch (error) {
      console.error('Error fetching stock:', error);
    } finally {
      setLoading(prev => ({ ...prev, stock: false }));
    }
  };

  const fetchBuyers = async () => {
    try {
      const response = await fetch('/api/sales/buyers');
      if (!response.ok) throw new Error('Failed to fetch buyers');
      const data = await response.json();
      setBuyers(data.buyers || []);
    } catch (error) {
      console.error('Error fetching buyers:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.material_id || !formData.buyer) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    if (!managerCooperativeId) {
      alert('Não foi possível identificar a cooperativa do gestor. Refaça o login.');
      return;
    }

    if (formData.weight_sold <= 0 || formData.price_per_kg <= 0) {
      alert('Peso e preço devem ser maiores que zero');
      return;
    }

    // Check stock availability
    const selectedMaterial = materials.find(m => m.material_id === formData.material_id);
    const materialName = selectedMaterial?.material || selectedMaterial?.name || `Material ${formData.material_id}`;
    const availableStock = stock[materialName] || 0;

    if (formData.weight_sold > availableStock) {
      alert(`Estoque insuficiente! Disponível: ${availableStock.toFixed(2)} kg`);
      return;
    }

    setLoading(prev => ({ ...prev, saving: true }));

    try {
      const saleData = {
        material_id: formData.material_id,
        cooperative_id: managerCooperativeId,
        'price/kg': formData.price_per_kg,
        weight_sold: formData.weight_sold,
        date: new Date(formData.date).toISOString(),
        Buyer: formData.buyer
      };

      const url = editingSale ? `/api/sales/${editingSale._id}` : '/api/sales';
      const method = editingSale ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saleData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save sale');
      }

      await fetchSales();
      await fetchStock(); // Refresh stock after sale
      resetForm();

    } catch (error) {
      console.error('Error saving sale:', error);
      alert(error instanceof Error ? error.message : 'Erro ao salvar venda');
    } finally {
      setLoading(prev => ({ ...prev, saving: false }));
    }
  };

  const handleAddBuyer = async () => {
    if (!newBuyer.trim()) {
      alert('Por favor, digite o nome do comprador');
      return;
    }

    if (buyers.includes(newBuyer.trim())) {
      alert('Este comprador já existe na lista');
      return;
    }

    try {
      const response = await fetch('/api/sales/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer: newBuyer.trim() })
      });

      if (!response.ok) throw new Error('Failed to add buyer');

      await fetchBuyers();
      setFormData(prev => ({ ...prev, buyer: newBuyer.trim() }));
      setNewBuyer('');
      setShowBuyerForm(false);

    } catch (error) {
      console.error('Error adding buyer:', error);
      alert('Erro ao adicionar comprador');
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    setManagerCooperativeId(sale.cooperative_id);
    setFormData({
      material_id: sale.material_id,
      cooperative_id: sale.cooperative_id,
      price_per_kg: sale['price/kg'],
      weight_sold: sale.weight_sold,
      date: new Date(sale.date).toISOString().split('T')[0],
      buyer: sale.Buyer
    });
    setShowSaleForm(true);
  };

  const handleDelete = async (saleId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta venda?')) return;

    try {
      const response = await fetch(`/api/sales/${saleId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete sale');

      await fetchSales();
      await fetchStock(); // Refresh stock after deletion

    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Erro ao excluir venda');
    }
  };

  const resetForm = () => {
    setFormData({
      material_id: '',
      cooperative_id: managerCooperativeId,
      price_per_kg: 0,
      weight_sold: 0,
      date: new Date().toISOString().split('T')[0],
      buyer: ''
    });
    setEditingSale(null);
    setShowSaleForm(false);
  };

  const getMaterialName = (materialId: string) => {
    // Handle both string and number comparisons since materials might have numeric IDs
    const material = materials.find(m =>
      m.material_id === materialId ||
      m.material_id?.toString() === materialId
    );
    return material?.material || material?.name || `Material ${materialId}`;
  };

  const getCooperativeName = (cooperativeId: string) => {
    // Handle both string and number comparisons since cooperatives might have numeric IDs
    const cooperative = cooperatives.find(c =>
      c.cooperative_id === cooperativeId ||
      c.cooperative_id?.toString() === cooperativeId
    );
    return cooperative?.name || `Cooperativa ${cooperativeId}`;
  };

  const getAvailableStock = (materialId: string) => {
    const materialName = getMaterialName(materialId);
    return stock[materialName] || 0;
  };

  const filteredSales = sales.filter(sale => {
    const matchesSearch = searchTerm === '' ||
      getMaterialName(sale.material_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.Buyer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCooperativeName(sale.cooperative_id).toLowerCase().includes(searchTerm.toLowerCase());

    const matchesMaterial = filters.material_id === '' || sale.material_id === filters.material_id;
    const matchesCooperative = filters.cooperative_id === '' || sale.cooperative_id === filters.cooperative_id;
    const matchesBuyer = filters.buyer === '' || sale.Buyer.toLowerCase().includes(filters.buyer.toLowerCase());

    const saleDate = new Date(sale.date);
    const matchesStartDate = filters.start_date === '' || saleDate >= new Date(filters.start_date);
    const matchesEndDate = filters.end_date === '' || saleDate <= new Date(filters.end_date);

    return matchesSearch && matchesMaterial && matchesCooperative && matchesBuyer && matchesStartDate && matchesEndDate;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <Layout activePath="/sales">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-[#c15079]">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-[#7a1c44] mb-2">
                Gestão de Vendas
              </h1>
              <p className="text-gray-600">
                Registre vendas e gerencie compradores
              </p>
            </div>
            <button
              onClick={() => setShowSaleForm(true)}
              className="bg-[#c15079] text-white px-6 py-3 rounded-lg hover:bg-[#a03d63] transition-colors flex items-center"
            >
              <FaPlus className="mr-2" />
              Nova Venda
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-[#7a1c44] mb-4 flex items-center">
            <FaFilter className="mr-2 text-[#c15079]" />
            Filtros
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                Buscar
              </label>
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Material, comprador, cooperativa..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                Material
              </label>
              <select
                className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                value={filters.material_id}
                onChange={(e) => setFilters(prev => ({ ...prev, material_id: e.target.value }))}
              >
                <option value="">Todos os materiais</option>
                {materials.map((material) => (
                  <option key={material._id} value={material.material_id}>
                    {material.material || material.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                Data Inicial
              </label>
              <input
                type="date"
                className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                value={filters.start_date}
                onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Sales Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-[#7a1c44] flex items-center">
              <FaShoppingCart className="mr-2 text-[#c15079]" />
              Histórico de Vendas ({filteredSales.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Material
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Peso (kg)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Preço/kg
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comprador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cooperativa
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading.sales ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c15079]"></div>
                        <span className="ml-2 text-gray-500">Carregando vendas...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      Nenhuma venda encontrada
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => (
                    <tr key={sale._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(sale.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getMaterialName(sale.material_id)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.weight_sold.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(sale['price/kg'])}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {formatCurrency(sale.weight_sold * sale['price/kg'])}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.Buyer}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getCooperativeName(sale.cooperative_id)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(sale)}
                            className="text-[#c15079] hover:text-[#a03d63] transition-colors"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => sale._id && handleDelete(sale._id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            <FaTrash />
                          </button>
                        </div>
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
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#7a1c44]">
                  {editingSale ? 'Editar Venda' : 'Nova Venda'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <FaTimes size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                      Material *
                    </label>
                    <select
                      required
                      className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                      value={formData.material_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, material_id: e.target.value }))}
                    >
                      <option value="">Selecione um material</option>
                      {materials.map((material) => (
                        <option key={material._id} value={material.material_id}>
                          {material.material || material.name}
                          {formData.material_id === material.material_id && (
                            ` (Estoque: ${getAvailableStock(material.material_id).toFixed(2)} kg)`
                          )}
                        </option>
                      ))}
                    </select>
                    {formData.material_id && (
                      <p className="text-sm text-gray-600 mt-1">
                        Estoque disponível: {getAvailableStock(formData.material_id).toFixed(2)} kg
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                      Cooperativa responsável
                    </label>
                    <div className="w-full py-2 px-3 border border-gray-200 rounded-lg bg-gray-100 text-gray-700">
                      {managerCooperativeName ||
                        getCooperativeName(formData.cooperative_id || managerCooperativeId) ||
                        'Cooperativa não definida'}
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                      <FaWeight className="inline mr-1" />
                      Peso Vendido (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                      value={formData.weight_sold}
                      onChange={(e) => setFormData(prev => ({ ...prev, weight_sold: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                      <FaDollarSign className="inline mr-1" />
                      Preço por kg (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                      value={formData.price_per_kg}
                      onChange={(e) => setFormData(prev => ({ ...prev, price_per_kg: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                      <FaCalendarAlt className="inline mr-1" />
                      Data da Venda *
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                    <FaBuilding className="inline mr-1" />
                    Comprador *
                  </label>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                      value={formData.buyer}
                      onChange={(e) => setFormData(prev => ({ ...prev, buyer: e.target.value }))}
                    >
                      <option value="">Selecione um comprador</option>
                      {buyers.map((buyer) => (
                        <option key={buyer} value={buyer}>
                          {buyer}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowBuyerForm(true)}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center"
                    >
                      <FaUserPlus />
                    </button>
                  </div>
                </div>

                {formData.weight_sold > 0 && formData.price_per_kg > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-green-800 font-semibold">
                      Valor Total: {formatCurrency(formData.weight_sold * formData.price_per_kg)}
                    </p>
                  </div>
                )}

                <div className="flex justify-end space-x-4 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading.saving}
                    className="px-6 py-2 bg-[#c15079] text-white rounded-lg hover:bg-[#a03d63] transition-colors disabled:opacity-50 flex items-center"
                  >
                    {loading.saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-[#7a1c44]">
                  Adicionar Comprador
                </h3>
                <button
                  onClick={() => setShowBuyerForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                    Nome do Comprador
                  </label>
                  <input
                    type="text"
                    className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                    value={newBuyer}
                    onChange={(e) => setNewBuyer(e.target.value)}
                    placeholder="Digite o nome do comprador"
                  />
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    onClick={() => setShowBuyerForm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddBuyer}
                    className="px-4 py-2 bg-[#c15079] text-white rounded-lg hover:bg-[#a03d63] transition-colors"
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
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
  FaBoxes,
  FaLayerGroup,
  FaTag
} from 'react-icons/fa';

interface Material {
  _id: string;
  material_id: number;
  material: string;
  group: string;
}

interface MaterialFormData {
  material: string;
  group: string;
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [newGroup, setNewGroup] = useState('');
  
  const [formData, setFormData] = useState<MaterialFormData>({
    material: '',
    group: ''
  });
  
  const [filters, setFilters] = useState({
    group: '',
    search: ''
  });
  
  const [loading, setLoading] = useState({
    materials: true,
    saving: false
  });

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      const response = await fetch('/api/materials');
      if (!response.ok) throw new Error('Failed to fetch materials');
      const data = await response.json();
      
      // Filter out groups and get only materials
      const materialsOnly = data.filter((item: any) => item.material_id && !item.isGroup);
      const uniqueGroups = [...new Set(materialsOnly.map((m: Material) => m.group))].sort();
      
      setMaterials(materialsOnly);
      setGroups(uniqueGroups);
    } catch (error) {
      console.error('Error fetching materials:', error);
    } finally {
      setLoading(prev => ({ ...prev, materials: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.material.trim() || !formData.group.trim()) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }
    
    setLoading(prev => ({ ...prev, saving: true }));
    
    try {
      const materialData = {
        material: formData.material.trim(),
        group: formData.group.trim()
      };
      
      const url = editingMaterial ? `/api/materials/${editingMaterial._id}` : '/api/materials';
      const method = editingMaterial ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(materialData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save material');
      }
      
      await fetchMaterials();
      resetForm();
      
    } catch (error) {
      console.error('Error saving material:', error);
      alert(error instanceof Error ? error.message : 'Erro ao salvar material');
    } finally {
      setLoading(prev => ({ ...prev, saving: false }));
    }
  };

  const handleAddGroup = async () => {
    if (!newGroup.trim()) {
      alert('Por favor, digite o nome do grupo');
      return;
    }
    
    if (groups.includes(newGroup.trim().toLowerCase())) {
      alert('Este grupo já existe');
      return;
    }
    
    // Just add to local state - groups are created when materials are saved
    setGroups(prev => [...prev, newGroup.trim()].sort());
    setFormData(prev => ({ ...prev, group: newGroup.trim() }));
    setNewGroup('');
    setShowGroupForm(false);
  };

  const handleEdit = (material: Material) => {
    setEditingMaterial(material);
    setFormData({
      material: material.material,
      group: material.group
    });
    setShowMaterialForm(true);
  };

  const handleDelete = async (materialId: string) => {
    if (!confirm('Tem certeza que deseja excluir este material?')) return;
    
    try {
      const response = await fetch(`/api/materials/${materialId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete material');
      
      await fetchMaterials();
      
    } catch (error) {
      console.error('Error deleting material:', error);
      alert('Erro ao excluir material');
    }
  };

  const resetForm = () => {
    setFormData({
      material: '',
      group: ''
    });
    setEditingMaterial(null);
    setShowMaterialForm(false);
  };

  const filteredMaterials = materials.filter(material => {
    const matchesGroup = filters.group === '' || material.group === filters.group;
    const matchesSearch = filters.search === '' || 
      material.material.toLowerCase().includes(filters.search.toLowerCase()) ||
      material.group.toLowerCase().includes(filters.search.toLowerCase());
    
    return matchesGroup && matchesSearch;
  });

  const materialsByGroup = filteredMaterials.reduce((acc, material) => {
    if (!acc[material.group]) {
      acc[material.group] = [];
    }
    acc[material.group].push(material);
    return acc;
  }, {} as Record<string, Material[]>);

  return (
    <Layout activePath="/materials">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-[#c15079]">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-[#7a1c44] mb-2">
                Gestão de Materiais
              </h1>
              <p className="text-gray-600">
                Gerencie materiais e grupos do sistema
              </p>
            </div>
            <button
              onClick={() => setShowMaterialForm(true)}
              className="bg-[#c15079] text-white px-6 py-3 rounded-lg hover:bg-[#a03d63] transition-colors flex items-center"
            >
              <FaPlus className="mr-2" />
              Novo Material
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-[#7a1c44] mb-4 flex items-center">
            <FaFilter className="mr-2 text-[#c15079]" />
            Filtros
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                Buscar
              </label>
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nome do material ou grupo..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                Grupo
              </label>
              <select
                className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                value={filters.group}
                onChange={(e) => setFilters(prev => ({ ...prev, group: e.target.value }))}
              >
                <option value="">Todos os grupos</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Materials by Group */}
        <div className="space-y-6">
          {Object.keys(materialsByGroup).sort().map((group) => (
            <div key={group} className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-[#7a1c44] flex items-center">
                  <FaLayerGroup className="mr-2 text-[#c15079]" />
                  {group} ({materialsByGroup[group].length})
                </h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {materialsByGroup[group].map((material) => (
                      <tr key={material._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {material.material_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {material.material}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEdit(material)}
                              className="text-[#c15079] hover:text-[#a03d63] transition-colors"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleDelete(material._id)}
                              className="text-red-600 hover:text-red-900 transition-colors"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          
          {Object.keys(materialsByGroup).length === 0 && !loading.materials && (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <FaBoxes className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum material encontrado
              </h3>
              <p className="text-gray-500">
                {filters.search || filters.group ? 'Tente ajustar os filtros' : 'Adicione o primeiro material'}
              </p>
            </div>
          )}
        </div>

        {/* Material Form Modal */}
        {showMaterialForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#7a1c44]">
                  {editingMaterial ? 'Editar Material' : 'Novo Material'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <FaTimes size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                    <FaTag className="inline mr-1" />
                    Nome do Material *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                    value={formData.material}
                    onChange={(e) => setFormData(prev => ({ ...prev, material: e.target.value }))}
                    placeholder="Ex: papel branco, pet colorido..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                    <FaLayerGroup className="inline mr-1" />
                    Grupo *
                  </label>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                      value={formData.group}
                      onChange={(e) => setFormData(prev => ({ ...prev, group: e.target.value }))}
                    >
                      <option value="">Selecione um grupo</option>
                      {groups.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowGroupForm(true)}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      <FaPlus />
                    </button>
                  </div>
                </div>

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
                        {editingMaterial ? 'Atualizar' : 'Salvar'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Group Modal */}
        {showGroupForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-[#7a1c44]">
                  Novo Grupo
                </h3>
                <button
                  onClick={() => setShowGroupForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#7a1c44] mb-2">
                    Nome do Grupo
                  </label>
                  <input
                    type="text"
                    className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="Ex: papéis, plásticos, metais..."
                  />
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    onClick={() => setShowGroupForm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddGroup}
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
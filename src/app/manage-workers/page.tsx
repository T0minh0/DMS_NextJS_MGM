"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  FaUser,
  FaExclamationCircle,
  FaUserPlus,
  FaEdit,
  FaTrash,
  FaSearch,
  FaTimes,
} from 'react-icons/fa';

interface User {
  _id: string;
  id: string;
  full_name: string;
  CPF?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  user_type: number;
  PIS?: string;
  RG?: string;
  birthdate?: string;
  enter_date?: string;
  exit_date?: string | null;
  gender?: string | null;
  cooperative_id?: string;
  cooperative?: string;
  cooperative_name?: string | null;
}

interface Cooperative {
  _id: string;
  cooperative_id: string;
  name: string;
}

export default function ManageWorkersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([]);
  const [loadingCooperatives, setLoadingCooperatives] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form fields
  const [currentUserId, setCurrentUserId] = useState('');
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pis, setPis] = useState('');
  const [rg, setRg] = useState('');
  const [userType, setUserType] = useState<number>(1); // Default: Catador (1)
  const [birthDate, setBirthDate] = useState('');
  const [enterDate, setEnterDate] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [gender, setGender] = useState('');
  const [cooperativeId, setCooperativeId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const formatDateForInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value.slice(0, 10);
    }
    return date.toISOString().split('T')[0];
  };

  // Load users on component mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // Check if user is logged in
        const userData = localStorage.getItem('user');
        if (!userData) {
          router.push('/login');
          return;
        }
        
        // No need to check user type since only managers can access the dashboard
        await loadUsers();
      } catch (error) {
        console.error('Error fetching users:', error);
        setError('Erro ao carregar usuários');
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, [router]);

  useEffect(() => {
    const fetchCooperatives = async () => {
      try {
        setLoadingCooperatives(true);
        const response = await fetch('/api/cooperatives');
        if (!response.ok) {
          throw new Error('Erro ao carregar cooperativas');
        }
        const data = await response.json();
        setCooperatives(data);
        if (data.length > 0) {
          setCooperativeId((current) => current || data[0].cooperative_id);
        }
      } catch (err) {
        console.error('Error loading cooperatives:', err);
        setError((prev) => prev || 'Erro ao carregar cooperativas');
      } finally {
        setLoadingCooperatives(false);
      }
    };

    fetchCooperatives();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/users/all');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Falha ao carregar usuários' }));
        throw new Error(errorData.message || `Error ${response.status}: Falha ao carregar usuários`);
      }
      
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
      setError(error instanceof Error ? error.message : 'Erro ao carregar lista de usuários');
    } finally {
      setLoading(false);
    }
  };
  
  // Format CPF for display
  const formatCPF = (cpf: string): string => {
    if (!cpf) return '';
    const numericCPF = cpf.replace(/\D/g, '');
    if (numericCPF.length !== 11) return cpf;
    
    return numericCPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };
  
  // Open modal to create a new user
  const openCreateModal = () => {
    setModalMode('create');
    resetForm();
    setShowModal(true);
  };
  
  // Open modal to edit an existing user
  const openEditModal = (user: User) => {
    setModalMode('edit');
    setCurrentUserId(user._id || user.id);
    setFullName(user.full_name || '');
    setCpf(user.CPF || user.cpf || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setPis(user.PIS || '');
    setRg(user.RG || '');
    setUserType(user.user_type);
    setBirthDate(formatDateForInput(user.birthdate));
    setEnterDate(formatDateForInput(user.enter_date));
    setExitDate(formatDateForInput(user.exit_date));
    setGender(user.gender || '');
    setCooperativeId(user.cooperative_id || cooperatives[0]?.cooperative_id || cooperativeId);
    setPassword('');
    setConfirmPassword('');
    setShowModal(true);
  };
  
  // Reset form fields
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
    setCooperativeId(cooperatives[0]?.cooperative_id || '');
    setPassword('');
    setConfirmPassword('');
  };
  
  // Close modal
  const closeModal = () => {
    setShowModal(false);
    resetForm();
    setError(null);
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    // Validate form
    if (!fullName.trim()) {
      setError('Nome completo é obrigatório');
      return;
    }
    
    if (!cpf.trim()) {
      setError('CPF é obrigatório');
      return;
    }
    
    if (!birthDate) {
      setError('Data de nascimento é obrigatória');
      return;
    }

    if (!enterDate) {
      setError('Data de entrada é obrigatória');
      return;
    }

    if (!cooperativeId) {
      setError('Selecione uma cooperativa');
      return;
    }

    if (!pis.trim()) {
      setError('PIS/NIS é obrigatório');
      return;
    }

    if (!rg.trim()) {
      setError('RG é obrigatório');
      return;
    }

    // Validate password for new users
    if (modalMode === 'create') {
      if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres');
        return;
      }
      
      if (password !== confirmPassword) {
        setError('As senhas não coincidem');
        return;
      }
    } else if (password && password.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres');
      return;
    } else if (password && password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    
    try {
      const endpoint = modalMode === 'create' 
        ? '/api/users/create' 
        : '/api/users/update';
        
      const payload: Record<string, unknown> = {
        full_name: fullName,
        CPF: cpf,
        email: email || undefined,
        phone: phone || undefined,
        PIS: pis || undefined,
        RG: rg || undefined,
        user_type: userType,
        birth_date: birthDate,
        enter_date: enterDate,
        exit_date: exitDate || undefined,
        gender: gender || undefined,
        cooperative_id: cooperativeId
      };
      
      // Add ID for updates
      if (modalMode === 'edit') {
        payload.id = currentUserId;
      }
      
      // Add password for creation or if changing password
      if (modalMode === 'create' || (modalMode === 'edit' && password)) {
        payload.password = password;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Operação falhou');
      }
      
      // Show success message and close modal
      setSuccess(modalMode === 'create' 
        ? 'Usuário criado com sucesso!' 
        : 'Usuário atualizado com sucesso!');
      
      // Reset form and close modal
      closeModal();
      
      // Reload users list
      loadUsers();
      
    } catch (error) {
      console.error('Form submission error:', error);
      setError(error instanceof Error ? error.message : 'Erro ao processar requisição');
    }
  };

  // Handle user deletion
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/users/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Falha ao excluir usuário');
      }
      
      setSuccess('Usuário excluído com sucesso!');
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      setError(error instanceof Error ? error.message : 'Erro ao excluir usuário');
    }
  };
  
  // Filter users based on search term
  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (user.full_name && user.full_name.toLowerCase().includes(searchLower)) ||
      (user.CPF && user.CPF.toLowerCase().includes(searchLower)) ||
      (user.cpf && user.cpf.toLowerCase().includes(searchLower)) ||
      (user.email && user.email.toLowerCase().includes(searchLower))
    );
  });
  
  return (
    <Layout activePath="/manage-workers">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-dms-primary">Gerenciar Usuários</h1>
          <button
            onClick={openCreateModal}
            className="bg-[#5C1D2E] hover:bg-[#8A2736] text-white px-4 py-2 rounded-lg flex items-center transition-colors duration-200"
          >
            <FaUserPlus className="mr-2" />
            Novo Usuário
          </button>
        </div>
        
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
            <FaExclamationCircle className="text-red-500 mt-0.5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}
        
        {/* Search Bar */}
        <div className="mb-6 relative">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg"
              placeholder="Buscar por nome, CPF ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearchTerm('')}
              >
                <FaTimes />
              </button>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin text-dms-secondary">
              <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CPF
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                        {searchTerm ? 'Nenhum usuário encontrado para esta busca' : 'Nenhum usuário cadastrado'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(user => (
                      <tr key={user._id || user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-[#5C1D2E] flex items-center justify-center text-white">
                                <FaUser />
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.full_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatCPF(user.CPF || user.cpf || '')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.email || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            user.user_type === 0 
                              ? 'bg-purple-100 text-purple-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {user.user_type === 0 ? 'Gerência' : 'Catador'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-indigo-600 hover:text-indigo-900 mr-3"
                            title="Editar usuário"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user._id || user.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir usuário"
                          >
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {/* User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-auto my-8 overflow-hidden">
            <div className="px-6 py-4 bg-[#5C1D2E] text-white flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-lg font-medium">
                {modalMode === 'create' ? 'Novo Usuário' : 'Editar Usuário'}
              </h3>
              <button
                onClick={closeModal}
                className="text-white hover:text-gray-200"
              >
                <FaTimes />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
                  <FaExclamationCircle className="text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">
                    CPF *
                  </label>
                  <input
                    id="cpf"
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                    placeholder="000.000.000-00"
                    required
                    disabled={modalMode === 'edit'} // Cannot edit CPF for existing users
                  />
                  {modalMode === 'edit' && (
                    <p className="mt-1 text-xs text-gray-500">CPF não pode ser alterado</p>
                  )}
                </div>
                
                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="pis" className="block text-sm font-medium text-gray-700 mb-1">
                    PIS/NIS *
                  </label>
                  <input
                    id="pis"
                    type="text"
                    value={pis}
                    onChange={(e) => setPis(e.target.value)}
                    placeholder="000.00000.00-0"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="rg" className="block text-sm font-medium text-gray-700 mb-1">
                    RG *
                  </label>
                  <input
                    id="rg"
                    type="text"
                    value={rg}
                    onChange={(e) => setRg(e.target.value)}
                    placeholder="00.000.000-0"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="cooperative" className="block text-sm font-medium text-gray-700 mb-1">
                    Cooperativa *
                  </label>
                  <div className="relative">
                    <select
                      id="cooperative"
                      value={cooperativeId}
                      onChange={(e) => setCooperativeId(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736] appearance-none disabled:bg-gray-100"
                      disabled={loadingCooperatives || cooperatives.length === 0}
                    >
                      {loadingCooperatives && <option>Carregando...</option>}
                      {!loadingCooperatives && cooperatives.length === 0 && (
                        <option>Nenhuma cooperativa cadastrada</option>
                      )}
                      {!loadingCooperatives &&
                        cooperatives.map((coop) => (
                          <option key={coop.cooperative_id} value={coop.cooperative_id}>
                            {coop.name}
                          </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="mb-4">
                    <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Nascimento *
                    </label>
                    <input
                      id="birthDate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="enterDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Entrada *
                    </label>
                    <input
                      id="enterDate"
                      type="date"
                      value={enterDate}
                      onChange={(e) => setEnterDate(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="mb-4">
                    <label htmlFor="exitDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Saída
                    </label>
                    <input
                      id="exitDate"
                      type="date"
                      value={exitDate}
                      onChange={(e) => setExitDate(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                      Gênero
                    </label>
                    <div className="relative">
                      <select
                        id="gender"
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736] appearance-none"
                      >
                        <option value="">Não informar</option>
                        <option value="Feminino">Feminino</option>
                        <option value="Masculino">Masculino</option>
                        <option value="Outro">Outro</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="userType" className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Usuário *
                  </label>
                  <div className="relative">
                    <select
                      id="userType"
                      value={userType}
                      onChange={(e) => setUserType(Number(e.target.value))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736] appearance-none"
                    >
                      <option value={1}>Catador</option>
                      <option value={0}>Gerência (Acesso ao Dashboard)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    {modalMode === 'create' ? 'Senha *' : 'Nova Senha (deixe em branco para manter)'}
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736]"
                    minLength={6}
                    required={modalMode === 'create'}
                  />
                  <p className="mt-1 text-xs text-gray-500">Mínimo de 6 caracteres</p>
                </div>
                
                <div className="mb-6">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    {modalMode === 'create' ? 'Confirmar Senha *' : 'Confirmar Nova Senha'}
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-lg focus:ring-[#8A2736] focus:border-[#8A2736] ${
                      confirmPassword && confirmPassword !== password
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    }`}
                    required={modalMode === 'create'}
                  />
                  {confirmPassword && confirmPassword !== password && (
                    <p className="mt-1 text-xs text-red-500">As senhas não coincidem</p>
                  )}
                </div>
                
                <div className="sticky bottom-0 pt-4 bg-white mt-6 border-t border-gray-100">
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#5C1D2E] text-white rounded-lg hover:bg-[#8A2736] transition-colors duration-200"
                      disabled={
                        loadingCooperatives ||
                        (modalMode === 'create' && (
                          !fullName.trim() || 
                          !cpf.trim() ||
                          !pis.trim() ||
                          !rg.trim() ||
                          !birthDate ||
                          !enterDate ||
                          !cooperativeId ||
                          password.length < 6 || 
                          password !== confirmPassword
                        ))
                      }
                    >
                      {modalMode === 'create' ? 'Criar Usuário' : 'Salvar Alterações'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
} 
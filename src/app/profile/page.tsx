"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { FaUser, FaIdCard, FaPhone, FaEnvelope, FaLock, FaSave, FaExclamationCircle } from 'react-icons/fa';

interface UserProfile {
  _id: string;
  full_name?: string;
  name?: string;
  CPF?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  user_type: number;
  PIS?: string;
  RG?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pis, setPis] = useState('');
  const [rg, setRg] = useState('');
  
  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userData = localStorage.getItem('user');
        if (!userData) {
          // Redirect to login if user not logged in
          router.push('/login');
          return;
        }
        
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        
        // Fetch full user data from API
        const response = await fetch(`/api/user?id=${parsedUser.id}`);
        if (response.ok) {
          const userData = await response.json();
          
          // Update state with user data
          setFullName(userData.full_name || userData.name || '');
          setEmail(userData.email || '');
          setPhone(userData.phone || '');
          setPis(userData.PIS || '');
          setRg(userData.RG || '');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        setError('Erro ao carregar dados do usuário');
      } finally {
        setLoading(false);
      }
    };
    
    loadUserData();
  }, [router]);
  
  // Handle profile form submission
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      if (!user?.id) {
        throw new Error('ID de usuário não encontrado');
      }
      
      const response = await fetch(`/api/user/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          full_name: fullName,
          email,
          phone,
          PIS: pis,
          RG: rg
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess('Perfil atualizado com sucesso!');
        
        // Update local storage with new name
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        storedUser.full_name = fullName;
        localStorage.setItem('user', JSON.stringify(storedUser));
      } else {
        throw new Error(data.message || 'Erro ao atualizar perfil');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      setError(error instanceof Error ? error.message : 'Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };
  
  // Handle password change
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      if (!user?.id) {
        throw new Error('ID de usuário não encontrado');
      }
      
      // Validate passwords
      if (newPassword.length < 6) {
        throw new Error('A nova senha deve ter pelo menos 6 caracteres');
      }
      
      if (newPassword !== confirmPassword) {
        throw new Error('As senhas não coincidem');
      }
      
      const response = await fetch(`/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          currentPassword,
          newPassword
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess('Senha atualizada com sucesso!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        throw new Error(data.message || 'Erro ao atualizar senha');
      }
    } catch (error) {
      console.error('Password update error:', error);
      setError(error instanceof Error ? error.message : 'Erro ao atualizar senha');
    } finally {
      setSaving(false);
    }
  };
  
  // Format CPF for display
  const formatCPF = (cpf: string): string => {
    if (!cpf) return '';
    const numericCPF = cpf.replace(/\D/g, '');
    if (numericCPF.length !== 11) return cpf;
    
    return numericCPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };
  
  // Format PIS for display (similar to CPF)
  const formatPIS = (pis: string): string => {
    if (!pis) return '';
    const numericPIS = pis.replace(/\D/g, '');
    if (numericPIS.length !== 11) return pis;
    
    return numericPIS.replace(/(\d{3})(\d{5})(\d{2})(\d{1})/, '$1.$2.$3-$4');
  };
  
  // Format RG for display
  const formatRG = (rg: string): string => {
    if (!rg) return '';
    const numericRG = rg.replace(/\D/g, '');
    if (numericRG.length < 8) return rg;
    
    if (numericRG.length === 8) {
      return numericRG.replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2.$3');
    } else if (numericRG.length === 9) {
      return numericRG.replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, '$1.$2.$3-$4');
    }
    
    return rg;
  };
  
  // Get CPF from user object 
  const userCPF = user?.CPF || user?.cpf || '';
  
  return (
    <Layout activePath="/profile">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-dms-primary mb-6">Perfil do Usuário</h1>
        
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Profile Information Section */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-dms-primary mb-4 flex items-center">
                <FaUser className="mr-2 text-dms-secondary" />
                Informações Pessoais
              </h2>
              
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
              
              <form onSubmit={handleProfileSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CPF
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaIdCard className="text-gray-400" />
                    </div>
                    <input 
                      type="text"
                      value={formatCPF(userCPF)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                      disabled
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">CPF não pode ser alterado</p>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome Completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-dms-secondary focus:border-dms-secondary"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="text-gray-400" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-dms-secondary focus:border-dms-secondary"
                    />
                  </div>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaPhone className="text-gray-400" />
                    </div>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-dms-secondary focus:border-dms-secondary"
                    />
                  </div>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="pis" className="block text-sm font-medium text-gray-700 mb-1">
                    PIS/NIS
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaIdCard className="text-gray-400" />
                    </div>
                    <input
                      id="pis"
                      type="text"
                      value={pis}
                      onChange={(e) => setPis(e.target.value)}
                      placeholder="000.00000.00-0"
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-dms-secondary focus:border-dms-secondary"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Programa de Integração Social</p>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="rg" className="block text-sm font-medium text-gray-700 mb-1">
                    RG
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaIdCard className="text-gray-400" />
                    </div>
                    <input
                      id="rg"
                      type="text"
                      value={rg}
                      onChange={(e) => setRg(e.target.value)}
                      placeholder="00.000.000-0"
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-dms-secondary focus:border-dms-secondary"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Registro Geral</p>
                </div>
                
                <button
                  type="submit"
                  disabled={saving}
                  className={`w-full mt-2 bg-[#5C1D2E] text-white font-medium py-2 px-4 rounded-lg hover:bg-[#8A2736] transition-colors duration-200 flex justify-center items-center ${
                    saving ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <FaSave className="mr-2" />
                      Salvar Alterações
                    </>
                  )}
                </button>
              </form>
            </div>
            
            {/* Change Password Section */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-dms-primary mb-4 flex items-center">
                <FaLock className="mr-2 text-dms-secondary" />
                Alterar Senha
              </h2>
              
              <form onSubmit={handlePasswordSubmit}>
                <div className="mb-4">
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Senha Atual
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-dms-secondary focus:border-dms-secondary"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Nova Senha
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-dms-secondary focus:border-dms-secondary"
                    required
                    minLength={6}
                  />
                  <p className="mt-1 text-xs text-gray-500">Mínimo de 6 caracteres</p>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar Nova Senha
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-lg focus:ring-dms-secondary focus:border-dms-secondary ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    }`}
                    required
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="mt-1 text-xs text-red-500">As senhas não coincidem</p>
                  )}
                </div>
                
                <button
                  type="submit"
                  disabled={saving || (newPassword !== confirmPassword) || newPassword.length < 6}
                  className={`w-full mt-2 bg-[#5C1D2E] text-white font-medium py-2 px-4 rounded-lg hover:bg-[#8A2736] transition-colors duration-200 flex justify-center items-center ${
                    saving || (newPassword !== confirmPassword) || newPassword.length < 6
                      ? 'opacity-70 cursor-not-allowed'
                      : ''
                  }`}
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Atualizando...
                    </>
                  ) : (
                    'Alterar Senha'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 
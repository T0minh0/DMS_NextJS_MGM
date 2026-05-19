"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { FaUser, FaIdCard, FaPhone, FaEnvelope, FaLock, FaSave, FaExclamationCircle } from 'react-icons/fa';

interface UserProfile {
  _id: string;
  id?: string;
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

  // Format PIS for display (similar to CPF) - kept for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatPIS = (pis: string): string => {
    if (!pis) return '';
    const numericPIS = pis.replace(/\D/g, '');
    if (numericPIS.length !== 11) return pis;

    return numericPIS.replace(/(\d{3})(\d{5})(\d{2})(\d{1})/, '$1.$2.$3-$4');
  };

  // Format RG for display - kept for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatRG = (rg: string): string => {
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
  const panelClass = 'surface-panel rounded-xl p-6';
  const labelClass = 'block text-sm font-semibold text-on-surface mb-1';
  const fieldClass = 'block w-full rounded-lg border border-outline bg-surface-alt px-3 py-2 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0';
  const iconFieldClass = `${fieldClass} pl-10`;
  const disabledFieldClass = 'block w-full rounded-lg border border-outline bg-surface-elevated px-3 py-2 pl-10 text-text-secondary disabled:cursor-not-allowed';
  const helpTextClass = 'mt-1 text-xs text-text-secondary';
  const primaryButtonClass = 'w-full mt-2 rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary shadow-glow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center';

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
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-dms-primary mb-4 flex items-center">
                <FaUser className="mr-2 text-dms-secondary" />
                Informações Pessoais
              </h2>

              {error && (
                <div className="mb-4 rounded-lg border border-error/35 bg-error/10 px-4 py-3 text-error flex items-start">
                  <FaExclamationCircle className="mt-0.5 mr-2 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="mb-4 rounded-lg border border-success/35 bg-success/10 px-4 py-3 text-success">
                  {success}
                </div>
              )}

              <form onSubmit={handleProfileSubmit}>
                <div className="mb-4">
                  <label className={labelClass}>
                    CPF
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaIdCard className="text-text-secondary" />
                    </div>
                    <input
                      type="text"
                      value={formatCPF(userCPF)}
                      className={disabledFieldClass}
                      disabled
                    />
                  </div>
                  <p className={helpTextClass}>CPF não pode ser alterado</p>
                </div>

                <div className="mb-4">
                  <label htmlFor="fullName" className={labelClass}>
                    Nome Completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={fieldClass}
                    required
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="email" className={labelClass}>
                    Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="text-text-secondary" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={iconFieldClass}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="phone" className={labelClass}>
                    Telefone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaPhone className="text-text-secondary" />
                    </div>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className={iconFieldClass}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="pis" className={labelClass}>
                    PIS/NIS
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaIdCard className="text-text-secondary" />
                    </div>
                    <input
                      id="pis"
                      type="text"
                      value={pis}
                      onChange={(e) => setPis(e.target.value)}
                      placeholder="000.00000.00-0"
                      className={iconFieldClass}
                    />
                  </div>
                  <p className={helpTextClass}>Programa de Integração Social</p>
                </div>

                <div className="mb-4">
                  <label htmlFor="rg" className={labelClass}>
                    RG
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaIdCard className="text-text-secondary" />
                    </div>
                    <input
                      id="rg"
                      type="text"
                      value={rg}
                      onChange={(e) => setRg(e.target.value)}
                      placeholder="00.000.000-0"
                      className={iconFieldClass}
                    />
                  </div>
                  <p className={helpTextClass}>Registro Geral</p>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className={primaryButtonClass}
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
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-dms-primary mb-4 flex items-center">
                <FaLock className="mr-2 text-dms-secondary" />
                Alterar Senha
              </h2>

              <form onSubmit={handlePasswordSubmit}>
                <div className="mb-4">
                  <label htmlFor="currentPassword" className={labelClass}>
                    Senha Atual
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={fieldClass}
                    required
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="newPassword" className={labelClass}>
                    Nova Senha
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={fieldClass}
                    required
                    minLength={6}
                  />
                  <p className={helpTextClass}>Mínimo de 6 caracteres</p>
                </div>

                <div className="mb-4">
                  <label htmlFor="confirmPassword" className={labelClass}>
                    Confirmar Nova Senha
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${fieldClass} ${confirmPassword && confirmPassword !== newPassword
                      ? 'border-error bg-error/10'
                      : ''
                      }`}
                    required
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="mt-1 text-xs text-error">As senhas não coincidem</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving || (newPassword !== confirmPassword) || newPassword.length < 6}
                  className={primaryButtonClass}
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

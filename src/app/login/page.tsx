"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaLock, FaIdCard, FaExclamationCircle } from 'react-icons/fa';

export default function LoginPage() {
  const [cpf, setCpf] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [logoSrc, setLogoSrc] = useState<string>('/logo.svg');
  const router = useRouter();

  // Handle CPF input with formatting
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Remove non-digits
    
    if (value.length <= 11) {
      // Format as CPF: 000.000.000-00
      let formattedValue = value;
      if (value.length > 3) {
        formattedValue = value.replace(/^(\d{3})/, '$1.');
      }
      if (value.length > 6) {
        formattedValue = formattedValue.replace(/^(\d{3}\.)(\d{3})/, '$1$2.');
      }
      if (value.length > 9) {
        formattedValue = formattedValue.replace(/^(\d{3}\.\d{3}\.)(\d{3})/, '$1$2-');
      }
      
      setCpf(formattedValue);
    }
  };

  const handleLogoError = () => {
    // Try fallbacks in order
    if (logoSrc === '/logo.svg') {
      setLogoSrc('/simple-logo.svg');
    } else if (logoSrc === '/simple-logo.svg') {
      setLogoSrc('/dms-text.svg');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          cpf: cpf.replace(/\D/g, ''), // Remove formatting before sending
          password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store user data in localStorage
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Successful login
        router.push('/');
      } else {
        // Handle specific error messages from the API
        const errorMessages = {
          401: 'CPF ou senha incorretos. Verifique suas credenciais.',
          403: 'Acesso restrito. Apenas gerentes podem acessar o sistema.',
          500: 'Erro no servidor. Tente novamente mais tarde.',
        };
        
        // Use the API message or fallback to status-specific message or general error
        setError(
          data.message || 
          errorMessages[response.status as keyof typeof errorMessages] || 
          'Falha na autenticação. Verifique suas credenciais.'
        );
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Erro de conexão. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8eef1] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <img 
                src={logoSrc}
                alt="DMS Logo" 
                width={128}
                height={128}
                className="h-32 w-32 object-contain"
                onError={handleLogoError}
              />
            </div>
            <h2 className="text-2xl font-bold text-[#7a1c44]">Sistema de Gestão DMS</h2>
            <p className="text-gray-500 mt-2">Faça login para acessar o dashboard</p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
              <FaExclamationCircle className="text-red-500 mt-0.5 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label htmlFor="cpf" className="block text-sm font-medium text-[#333333] mb-1">
                CPF
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaIdCard className="text-gray-400" />
                </div>
                <input
                  id="cpf"
                  type="text"
                  value={cpf}
                  onChange={handleCpfChange}
                  placeholder="000.000.000-00"
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-[#c15079] focus:border-[#c15079]"
                  required
                />
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-[#333333] mb-1">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaLock className="text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-[#c15079] focus:border-[#c15079]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-[#7a1c44] text-white font-medium py-3 px-4 rounded-lg hover:bg-[#c15079] transition-colors duration-200 flex justify-center items-center ${
                loading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Autenticando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>
      </div>
      
      <p className="mt-8 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} DMS - Todos os direitos reservados
      </p>
    </div>
  );
} 
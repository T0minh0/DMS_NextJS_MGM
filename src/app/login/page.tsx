"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaExclamationCircle, FaIdCard, FaLock, FaRecycle, FaSignInAlt, FaSpinner } from 'react-icons/fa';

export default function LoginPage() {
  const [cpf, setCpf] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground sm:p-6">
      <div className="surface-panel w-full max-w-md overflow-hidden rounded-xl">
        <div className="p-6 sm:p-8">
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/35 bg-primary/14 text-primary shadow-glow">
                <FaRecycle className="h-9 w-9" aria-hidden="true" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Sistema de Gestão DMS</h2>
            <p className="mt-2 text-sm text-text-secondary">Acesso de gestores ao painel operacional</p>
          </div>

          {error && (
            <div className="mb-6 flex items-start rounded-lg border border-error/35 bg-error/12 px-4 py-3 text-sm text-foreground">
              <FaExclamationCircle className="mr-2 mt-0.5 flex-shrink-0 text-error" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label htmlFor="cpf" className="mb-1 block text-sm font-medium text-foreground">
                CPF
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <FaIdCard className="text-text-secondary" />
                </div>
                <input
                  id="cpf"
                  type="text"
                  value={cpf}
                  onChange={handleCpfChange}
                  placeholder="000.000.000-00"
                  className="block min-h-[52px] w-full rounded-lg border border-outline bg-surface px-3 py-3 pl-10 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0"
                  required
                />
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
                Senha
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <FaLock className="text-text-secondary" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="block min-h-[52px] w-full rounded-lg border border-outline bg-surface px-3 py-3 pl-10 text-foreground placeholder:text-text-secondary/45 focus:border-primary focus:ring-0"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary px-4 py-3 font-semibold text-background shadow-glow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 ${loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
            >
              {loading ? (
                <>
                  <FaSpinner className="h-4 w-4 animate-spin" />
                  Autenticando...
                </>
              ) : (
                <>
                  <FaSignInAlt className="h-4 w-4" />
                  Entrar
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-text-secondary">
        © {new Date().getFullYear()} DMS - Todos os direitos reservados
      </p>
    </div>
  );
}

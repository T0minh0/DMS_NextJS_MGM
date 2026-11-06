'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { recoveryPasswordError } from '@/lib/recovery-password';
const field =
  'mt-2 min-h-14 w-full rounded-xl border border-text-secondary bg-surface px-4 py-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-primary';
const button =
  'min-h-14 w-full rounded-xl bg-primary px-5 py-4 text-base font-semibold text-on-primary disabled:opacity-60';
export function RecoveryForm({
  token,
  confirmEmail = false,
}: {
  token?: string;
  confirmEmail?: boolean;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [numeric, setNumeric] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('O link está incompleto. Peça um novo link no aplicativo.');
      return;
    }
    const passwordError = confirmEmail
      ? null
      : recoveryPasswordError(password, confirmation);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/mobile-auth/${confirmEmail ? 'verify-recovery-email' : 'reset-password'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            confirmEmail ? { token } : { token, newPassword: password },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message ??
            data.error ??
            'Link inválido ou expirado. Peça um novo link.',
        );
      setDone(true);
      setPassword('');
      setConfirmation('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Não conseguimos conectar. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <section className="surface-panel w-full max-w-lg rounded-2xl p-6 sm:p-8">
        <p className="text-sm font-semibold text-primary">Recicla Mais</p>
        <h1 className="mt-3 text-2xl font-bold">
          {confirmEmail ? 'Confirmar meu e-mail' : 'Criar nova senha'}
        </h1>
        {done ? (
          <div role="status" className="mt-6 space-y-5 text-sm leading-relaxed">
            <p>
              {confirmEmail
                ? 'Seu e-mail foi confirmado. Volte ao aplicativo e atualize sua conta.'
                : 'Sua senha foi alterada. Volte ao aplicativo e entre com a senha nova.'}
            </p>
            <p>Você já pode fechar esta página.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <p className="text-sm leading-relaxed text-text-secondary">
              {confirmEmail
                ? 'Toque no botão abaixo para confirmar que você consegue acessar este e-mail.'
                : 'Escolha uma senha individual. Use 8 números, evitando todos iguais ou uma sequência simples. Se usar letras, escolha pelo menos 6 caracteres.'}
            </p>
            {!confirmEmail ? (
              <>
                <label className="block text-sm font-medium">
                  Nova senha
                  <input
                    autoComplete="new-password"
                    inputMode={numeric ? 'numeric' : 'text'}
                    required
                    maxLength={128}
                    className={field}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? 'text' : 'password'}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Repita a nova senha
                  <input
                    autoComplete="new-password"
                    inputMode={numeric ? 'numeric' : 'text'}
                    required
                    maxLength={128}
                    className={field}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    type={show ? 'text' : 'password'}
                  />
                </label>
                <button
                  type="button"
                  className="min-h-14 text-sm text-foreground underline"
                  onClick={() => setNumeric(!numeric)}
                >
                  {numeric ? 'Minha senha tem letras' : 'Usar só números'}
                </button>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 text-sm">
                  <input
                    className="h-6 w-6"
                    type="checkbox"
                    checked={show}
                    onChange={(e) => setShow(e.target.checked)}
                  />
                  Mostrar senha
                </label>
              </>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            ) : null}
            <button type="submit" className={button} disabled={busy || !token}>
              {busy
                ? 'Aguarde…'
                : confirmEmail
                  ? 'Confirmar meu e-mail'
                  : 'Salvar nova senha'}
            </button>
            {!token ? (
              <p role="alert" className="text-sm">
                Abra o link recebido por e-mail. Se ele expirou, solicite outro
                no aplicativo.
              </p>
            ) : null}
            <p className="text-base leading-relaxed text-text-secondary">
              Precisa de ajuda? Procure a equipe da cooperativa.
            </p>
          </form>
        )}
        <Link
          className="mt-6 flex min-h-14 items-center text-sm text-foreground underline"
          href="/login"
        >
          Acesso da gerência
        </Link>
      </section>
    </main>
  );
}

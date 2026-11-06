'use client';
import { FormEvent, useState, useEffect } from 'react';
import Layout from '@/components/Layout';
export default function AssistedRecoveryPage() {
  const [workers, setWorkers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [workerId, setWorkerId] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/mobile-auth/assisted-recovery', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'Não foi possível carregar a equipe. Atualize a página.',
          );
        return response.json();
      })
      .then(setWorkers)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setCode('');
    if (!checked) {
      setError('Confira a identidade da pessoa antes de continuar.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/mobile-auth/assisted-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId, currentPassword: password, reason }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? result.error ?? 'Não foi possível emitir o código.',
        );
      setCode(result.code);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não conseguimos conectar.');
    } finally {
      setBusy(false);
    }
  }
  const field =
    'mt-2 min-h-14 w-full rounded-lg border border-outline bg-surface px-4 py-3 text-lg';
  return (
    <Layout activePath="/recuperacao-acesso">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold">Ajudar a recuperar acesso</h1>
        <p className="text-lg leading-relaxed text-text-secondary">
          Atendimento presencial para catadores da sua cooperativa que não
          conseguem recuperar pelo próprio e-mail. O código permite criar uma
          senha; não dá acesso aos dados da conta.
        </p>
        <form
          className="surface-panel space-y-5 rounded-xl p-6"
          onSubmit={submit}
        >
          <label className="block text-lg">
            Pessoa atendida
            <select
              required
              className={field}
              value={workerId}
              disabled={busy}
              onChange={(e) => {
                setWorkerId(e.target.value);
                setChecked(false);
                setCode('');
                setPassword('');
              }}
            >
              <option value="">Escolha o catador</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-base text-text-secondary">
            A lista mostra somente catadores ativos da sua cooperativa. Confira
            o nome com a pessoa atendida.
          </p>
          <label className="block text-lg">
            Motivo do atendimento
            <textarea
              required
              minLength={3}
              maxLength={500}
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="block text-lg">
            Sua senha de gestor
            <input
              required
              autoComplete="current-password"
              type="password"
              maxLength={128}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="flex min-h-14 items-center gap-3 text-lg">
            <input
              required
              className="h-6 w-6"
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            Conferi presencialmente a identidade da pessoa.
          </label>
          {error ? (
            <p role="alert" className="text-lg text-error">
              {error}
            </p>
          ) : null}
          <button
            disabled={busy}
            className="min-h-14 w-full rounded-xl bg-primary px-5 py-4 text-lg font-semibold text-background disabled:opacity-60"
          >
            {busy ? 'Emitindo código…' : 'Emitir código de recuperação'}
          </button>
        </form>
        {code ? (
          <div role="status" className="surface-panel space-y-4 rounded-xl p-6">
            <h2 className="text-xl font-semibold">
              Entregue este código à pessoa atendida
            </h2>
            <p className="break-all font-mono text-4xl tracking-wider">
              {code}
            </p>
            <p className="text-lg">
              Válido por 15 minutos, para uma única recuperação. No app, escolha
              “Esqueci minha senha” e “Recebi um código da cooperativa”. A senha
              final deve ser escolhida pela própria pessoa.
            </p>
            <button
              className="min-h-14 text-lg text-primary underline"
              onClick={() => setCode('')}
            >
              Ocultar código da tela
            </button>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

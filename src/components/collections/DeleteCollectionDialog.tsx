'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  collection: { id: string; worker_name: string; material_name: string; weight_kg: number; date: string };
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function DeleteCollectionDialog({ collection, pending, error, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const weight = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(collection.weight_kg);
  const date = collection.date.split('-').reverse().join('/');
  return (
    <dialog ref={dialog} aria-labelledby="deleteCollectionTitle" aria-describedby="deleteCollectionDescription"
      onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-outline bg-surface p-6 text-foreground shadow-xl backdrop:bg-background/80">
      <form onSubmit={(event) => { event.preventDefault(); if (!pending && reason.trim().length >= 3) onConfirm(reason.trim()); }}>
        <h2 id="deleteCollectionTitle" className="text-lg font-semibold">Excluir pesagem?</h2>
        <p id="deleteCollectionDescription" className="mt-2 text-sm text-text-secondary">
          Confira os dados. A exclusão corrige os totais de coleta e o estoque conforme o registro original. O motivo e o responsável ficam registrados.
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-outline p-4 text-sm">
          <dt className="text-text-secondary">Catador</dt><dd className="break-words">{collection.worker_name}</dd>
          <dt className="text-text-secondary">Material</dt><dd className="break-words">{collection.material_name}</dd>
          <dt className="text-text-secondary">Peso</dt><dd className="font-semibold">{weight} kg</dd>
          <dt className="text-text-secondary">Data</dt><dd>{date}</dd>
          <dt className="text-text-secondary">Registro</dt><dd>#{collection.id}</dd>
        </dl>
        <label htmlFor="deleteCollectionReason" className="mb-1 mt-4 block text-sm font-medium">Motivo da exclusão *</label>
        <textarea id="deleteCollectionReason" value={reason} onChange={(event) => setReason(event.target.value)}
          required minLength={3} maxLength={500} rows={3} disabled={pending}
          className="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm text-foreground focus:border-primary"
          placeholder="Ex.: pesagem registrada por engano" />
        {error ? <p role="alert" className="mt-3 text-sm text-error">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" autoFocus onClick={onCancel} disabled={pending}
            className="min-h-11 rounded-lg border border-outline px-4 text-sm font-semibold disabled:opacity-60">Voltar</button>
          <button type="submit" disabled={pending || reason.trim().length < 3}
            className="min-h-11 rounded-lg border border-error/50 bg-error/15 px-4 text-sm font-semibold text-error hover:bg-error/25 disabled:opacity-60">
            {pending ? 'Excluindo...' : 'Confirmar exclusão'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

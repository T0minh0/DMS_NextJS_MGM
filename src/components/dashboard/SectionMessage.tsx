'use client';

import { FaExclamationTriangle, FaSpinner } from 'react-icons/fa';

export interface SectionMessageProps {
  loading: boolean;
  error?: string;
  empty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
}

export function SectionMessage({
  loading,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  children,
}: SectionMessageProps) {
  if (loading) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-lg border border-outline/70 bg-surface px-4 py-6 text-sm text-text-secondary">
        <FaSpinner className="mr-3 h-4 w-4 animate-spin text-primary" />
        Carregando leitura operacional...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-error/35 bg-error/10 px-4 py-4">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <div>
            <p className="text-sm font-semibold text-error">Leitura indisponível</p>
            <p className="mt-1 text-sm text-text-secondary">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-lg border border-outline/70 bg-surface px-4 py-4">
        <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
        <p className="mt-1 text-sm text-text-secondary">{emptyDescription}</p>
      </div>
    );
  }

  return children;
}

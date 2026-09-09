'use client';

export type MetricCardTone = 'primary' | 'success' | 'warning' | 'secondary';

export interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: MetricCardTone;
}

export function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'primary',
}: MetricCardProps) {
  const toneClass = {
    primary: 'border-primary/35 bg-primary/12 text-primary',
    success: 'border-success/35 bg-success/12 text-success',
    warning: 'border-warning/35 bg-warning/12 text-warning',
    secondary: 'border-secondary/35 bg-secondary/12 text-secondary',
  }[tone];

  return (
    <article className="surface-panel rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-text-secondary">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-sm text-text-secondary">{detail}</p>
    </article>
  );
}

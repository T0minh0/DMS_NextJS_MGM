'use client';

import { Doughnut } from 'react-chartjs-2';
import { ChartFallbackTable } from './ChartFallbackTable';
import {
  BaseChartProps,
  buildDoughnutDataset,
  buildDoughnutOptions,
  resolveValueFormatter,
} from './chart-config';
import { useChartTheme } from './chart-theme';

export type DoughnutChartProps = Omit<BaseChartProps, 'datasets'> & {
  series: BaseChartProps['datasets'][number];
};

export function DoughnutChart({
  title,
  unit,
  labels,
  series,
  ariaLabel,
  height = 260,
  fallback = 'sr-only',
  formatValue,
  className,
}: DoughnutChartProps) {
  const theme = useChartTheme();
  const format = resolveValueFormatter(unit, formatValue);

  return (
    <figure className={className}>
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs uppercase text-text-secondary">{unit}</span>
      </figcaption>
      {theme ? (
        <div role="img" aria-label={ariaLabel} style={{ height }}>
          <Doughnut
            data={{ labels, datasets: [buildDoughnutDataset(theme, series)] }}
            options={buildDoughnutOptions(theme, format)}
          />
        </div>
      ) : null}
      <ChartFallbackTable
        caption={title}
        unit={unit}
        labels={labels}
        datasets={[series]}
        mode={fallback}
        formatValue={formatValue}
      />
    </figure>
  );
}

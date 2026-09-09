'use client';

import { Bar } from 'react-chartjs-2';
import { ChartFallbackTable } from './ChartFallbackTable';
import {
  BaseChartProps,
  buildBarDatasets,
  buildCartesianOptions,
  resolveValueFormatter,
} from './chart-config';
import { useChartTheme } from './chart-theme';

export interface BarChartProps extends BaseChartProps {
  horizontal?: boolean;
  stacked?: boolean;
}

export function BarChart({
  title,
  unit,
  labels,
  datasets,
  ariaLabel,
  height = 260,
  fallback = 'sr-only',
  formatValue,
  className,
  horizontal = false,
  stacked = false,
}: BarChartProps) {
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
          <Bar
            data={{ labels, datasets: buildBarDatasets(theme, datasets) }}
            options={buildCartesianOptions(theme, unit, format, { horizontal, stacked })}
          />
        </div>
      ) : null}
      <ChartFallbackTable
        caption={title}
        unit={unit}
        labels={labels}
        datasets={datasets}
        mode={fallback}
        formatValue={formatValue}
      />
    </figure>
  );
}

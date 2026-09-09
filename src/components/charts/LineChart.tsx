'use client';

import { Line } from 'react-chartjs-2';
import { ChartFallbackTable } from './ChartFallbackTable';
import {
  BaseChartProps,
  buildCartesianOptions,
  buildLineDatasets,
  resolveValueFormatter,
} from './chart-config';
import { useChartTheme } from './chart-theme';

export type LineChartProps = BaseChartProps;

export function LineChart({
  title,
  unit,
  labels,
  datasets,
  ariaLabel,
  height = 260,
  fallback = 'sr-only',
  formatValue,
  className,
}: LineChartProps) {
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
          <Line
            data={{ labels, datasets: buildLineDatasets(theme, datasets) }}
            options={buildCartesianOptions(theme, unit, format)}
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

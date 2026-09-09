'use client';

import type { ChartOptions, TooltipItem } from 'chart.js';
import { ChartTheme, hexToRgba, toneColor, type ChartTone } from './chart-theme';

export type ChartUnit = 'kg' | 'R$' | 'coletas' | '%' | 'dias';

export interface ChartSeries {
  label: string;
  data: number[];
  tone?: ChartTone;
}

export interface BaseChartProps {
  title: string;
  unit: ChartUnit;
  labels: string[];
  datasets: ChartSeries[];
  ariaLabel: string;
  height?: number;
  fallback?: 'sr-only' | 'toggle';
  formatValue?: (value: number) => string;
  className?: string;
}

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatChartValue(value: number, unit: ChartUnit) {
  if (unit === 'R$') {
    return currencyFormatter.format(value);
  }

  if (unit === 'coletas' || unit === 'dias') {
    return `${integerFormatter.format(value)} ${unit}`;
  }

  if (unit === '%') {
    return `${numberFormatter.format(value)}%`;
  }

  return `${numberFormatter.format(value)} ${unit}`;
}

export function resolveValueFormatter(unit: ChartUnit, formatValue?: (value: number) => string) {
  return formatValue ?? ((value: number) => formatChartValue(value, unit));
}

function tickFormatter(unit: ChartUnit) {
  return (value: string | number) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(numeric)) {
      return String(value);
    }

    if (unit === 'R$') {
      return currencyFormatter.format(numeric);
    }

    if (unit === 'coletas' || unit === 'dias') {
      return integerFormatter.format(numeric);
    }

    return `${numberFormatter.format(numeric)} ${unit}`;
  };
}

export function buildCartesianOptions(
  theme: ChartTheme,
  unit: ChartUnit,
  format: (value: number) => string,
  options: { horizontal?: boolean; stacked?: boolean } = {},
): ChartOptions<'bar'> & ChartOptions<'line'> {
  const valueAxis = {
    beginAtZero: true,
    stacked: options.stacked ?? false,
    grid: { color: hexToRgba(theme.outline, 0.7) },
    ticks: { callback: tickFormatter(unit), color: theme.textSecondary },
    title: { display: true, text: unit === 'R$' ? 'R$' : unit, color: theme.textSecondary },
  };
  const categoryAxis = {
    stacked: options.stacked ?? false,
    grid: { display: false },
    ticks: { color: theme.textSecondary, autoSkip: true, maxRotation: 0 },
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: options.horizontal ? 'y' : 'x',
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { color: theme.textSecondary, font: { size: 12 }, boxWidth: 12 },
      },
      tooltip: {
        backgroundColor: theme.surfaceElevated,
        titleColor: theme.text,
        bodyColor: theme.text,
        borderColor: theme.outline,
        borderWidth: 1,
        callbacks: {
          label: (item: TooltipItem<'bar'> | TooltipItem<'line'>) => {
            const raw = typeof item.raw === 'number' ? item.raw : Number(item.raw ?? 0);
            return `${item.dataset.label ?? ''}: ${format(raw)}`;
          },
        },
      },
    },
    scales: options.horizontal
      ? { x: valueAxis, y: categoryAxis }
      : { x: categoryAxis, y: valueAxis },
  };
}

export function buildDoughnutOptions(
  theme: ChartTheme,
  format: (value: number) => string,
): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { color: theme.textSecondary, font: { size: 12 }, boxWidth: 12 },
      },
      tooltip: {
        backgroundColor: theme.surfaceElevated,
        titleColor: theme.text,
        bodyColor: theme.text,
        borderColor: theme.outline,
        borderWidth: 1,
        callbacks: {
          label: (item: TooltipItem<'doughnut'>) => {
            const raw = typeof item.raw === 'number' ? item.raw : Number(item.raw ?? 0);
            const total = (item.dataset.data as number[]).reduce((sum, value) => sum + Number(value ?? 0), 0);
            const share = total > 0 ? ` (${numberFormatter.format((raw / total) * 100)}%)` : '';
            return `${item.label ?? ''}: ${format(raw)}${share}`;
          },
        },
      },
    },
  };
}

export function buildBarDatasets(theme: ChartTheme, datasets: ChartSeries[]) {
  return datasets.map((series, index) => {
    const color = toneColor(theme, series.tone, index);
    return {
      label: series.label,
      data: series.data,
      backgroundColor: hexToRgba(color, 0.72),
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 36,
    };
  });
}

export function buildLineDatasets(theme: ChartTheme, datasets: ChartSeries[]) {
  return datasets.map((series, index) => {
    const color = toneColor(theme, series.tone, index);
    return {
      label: series.label,
      data: series.data,
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.18),
      pointBackgroundColor: color,
      pointBorderColor: color,
      pointRadius: 3,
      borderWidth: 2,
      tension: 0.3,
      fill: true,
    };
  });
}

export function buildDoughnutDataset(theme: ChartTheme, series: ChartSeries) {
  const colors = series.data.map((_, index) => toneColor(theme, undefined, index));
  return {
    label: series.label,
    data: series.data,
    backgroundColor: colors.map((color) => hexToRgba(color, 0.78)),
    borderColor: theme.surfaceElevated,
    borderWidth: 2,
    hoverOffset: 6,
  };
}

'use client';

import dynamic from 'next/dynamic';

export type { ChartSeries, ChartUnit, BaseChartProps } from './chart-config';
export type { BarChartProps } from './BarChart';
export type { LineChartProps } from './LineChart';
export type { DoughnutChartProps } from './DoughnutChart';
export { ChartFallbackTable } from './ChartFallbackTable';
export { formatChartValue } from './chart-config';

/**
 * Chart wrappers are loaded lazily on the client so pages that only show a
 * chart or two (like the overview) do not pay for chart.js on first paint.
 * While the chunk loads nothing is rendered; the wrappers themselves always
 * render the textual fallback table once mounted.
 */
export const BarChart = dynamic(() => import('./BarChart').then((mod) => mod.BarChart), {
  ssr: false,
  loading: () => null,
});

export const LineChart = dynamic(() => import('./LineChart').then((mod) => mod.LineChart), {
  ssr: false,
  loading: () => null,
});

export const DoughnutChart = dynamic(
  () => import('./DoughnutChart').then((mod) => mod.DoughnutChart),
  {
    ssr: false,
    loading: () => null,
  },
);

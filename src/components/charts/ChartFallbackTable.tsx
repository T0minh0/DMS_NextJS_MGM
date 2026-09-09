'use client';

import { useId, useState } from 'react';
import type { ChartSeries, ChartUnit } from './chart-config';
import { resolveValueFormatter } from './chart-config';

export interface ChartFallbackTableProps {
  caption: string;
  unit: ChartUnit;
  labels: string[];
  datasets: ChartSeries[];
  mode?: 'sr-only' | 'toggle';
  formatValue?: (value: number) => string;
}

/**
 * Textual representation of a chart. The design contract requires every chart
 * to ship a textual fallback with an explicit unit, so wrappers always render
 * this component either visually hidden (`sr-only`) or behind a toggle.
 */
export function ChartFallbackTable({
  caption,
  unit,
  labels,
  datasets,
  mode = 'sr-only',
  formatValue,
}: ChartFallbackTableProps) {
  const [open, setOpen] = useState(false);
  const tableId = useId();
  const format = resolveValueFormatter(unit, formatValue);
  const visible = mode === 'sr-only' || open;

  const table = (
    <div className={mode === 'sr-only' ? 'sr-only' : 'mt-3 overflow-x-auto'}>
      <table id={tableId} className="w-full min-w-[20rem] text-left text-sm">
        <caption className="mb-2 text-left text-xs font-semibold uppercase text-text-secondary">
          {caption} (unidade: {unit})
        </caption>
        <thead>
          <tr className="border-b border-outline/70 text-xs uppercase text-text-secondary">
            <th scope="col" className="py-2 pr-3 font-semibold">Categoria</th>
            {datasets.map((series) => (
              <th key={series.label} scope="col" className="py-2 pr-3 text-right font-semibold">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, rowIndex) => (
            <tr key={`${label}-${rowIndex}`} className="border-b border-outline/40">
              <th scope="row" className="py-2 pr-3 font-medium text-foreground">{label}</th>
              {datasets.map((series) => (
                <td key={`${series.label}-${rowIndex}`} className="py-2 pr-3 text-right text-text-secondary">
                  {format(Number(series.data[rowIndex] ?? 0))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (mode === 'sr-only') {
    return table;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={tableId}
        className="inline-flex min-h-9 items-center rounded-lg border border-outline/70 bg-surface px-3 text-xs font-semibold text-text-secondary hover:border-primary/40 hover:text-foreground"
      >
        {open ? 'Ocultar dados em tabela' : 'Ver dados em tabela'}
      </button>
      {visible ? table : null}
    </div>
  );
}

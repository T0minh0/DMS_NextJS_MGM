/**
 * Shared operational stock thresholds used by the overview and the materials
 * page so both surfaces classify balances the same way.
 */
export const LOW_STOCK_KG = 25;

export type StockLevel = 'empty' | 'critical' | 'stable';

export function classifyStockLevel(stockKg: number): StockLevel {
  if (!Number.isFinite(stockKg) || stockKg <= 0) {
    return 'empty';
  }

  if (stockKg <= LOW_STOCK_KG) {
    return 'critical';
  }

  return 'stable';
}

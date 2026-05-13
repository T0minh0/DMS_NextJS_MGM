export type SaleLifecycleStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED';

export type SaleLifecycleDates = {
  soldAt?: Date | string | null;
  sold_at?: Date | string | null;
  cancelledAt?: Date | string | null;
  cancelled_at?: Date | string | null;
};

export type SaleSummaryInput = SaleLifecycleDates & {
  weight_sold: number;
  'price/kg': number;
};

export const SOLD_SALE_WHERE = {
  soldAt: { not: null },
  cancelledAt: null,
} as const;

function getSoldAt(sale: SaleLifecycleDates) {
  return sale.soldAt ?? sale.sold_at ?? null;
}

function getCancelledAt(sale: SaleLifecycleDates) {
  return sale.cancelledAt ?? sale.cancelled_at ?? null;
}

export function getSaleLifecycleStatus(sale: SaleLifecycleDates): SaleLifecycleStatus {
  if (getCancelledAt(sale)) {
    return 'CANCELLED';
  }

  if (getSoldAt(sale)) {
    return 'SOLD';
  }

  return 'ACTIVE';
}

export function isSaleStockConsolidated(sale: SaleLifecycleDates) {
  return getSaleLifecycleStatus(sale) === 'SOLD';
}

export function getLegacyStockMutationGuard(sale: SaleLifecycleDates) {
  const status = getSaleLifecycleStatus(sale);

  return {
    allowed: status === 'SOLD',
    status,
  };
}

export function summarizeSoldSales(sales: SaleSummaryInput[]) {
  const soldSales = sales.filter(isSaleStockConsolidated);
  const totalWeight = soldSales.reduce((sum, sale) => sum + sale.weight_sold, 0);
  const totalValue = soldSales.reduce(
    (sum, sale) => sum + sale.weight_sold * sale['price/kg'],
    0,
  );

  return {
    totalSoldSales: soldSales.length,
    totalWeight: Number(totalWeight.toFixed(2)),
    totalValue: Number(totalValue.toFixed(2)),
  };
}

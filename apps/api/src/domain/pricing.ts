import Decimal from 'decimal.js';
import type { QuoteLine } from '@briochett/contracts';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const minor = (v: string | Decimal) => new Decimal(v).mul(100).toDecimalPlaces(0).toNumber();
export const major = (v: number) => new Decimal(v).div(100).toFixed(2);
export function calculateLine(
  p: { id: string; name: string; sku: string; priceCop: string },
  quantity: number,
  rate: string,
  copPerUsd?: string,
): QuoteLine {
  const base = new Decimal(p.priceCop);
  const unit = base.mul(rate).toDecimalPlaces(2);
  return {
    productId: p.id,
    name: p.name,
    sku: p.sku,
    quantity,
    priceCop: base.toFixed(2),
    priceUsd: copPerUsd ? base.div(copPerUsd).toFixed(2) : null,
    unitPrice: unit.toFixed(2),
    subtotal: unit.mul(quantity).toFixed(2),
  };
}

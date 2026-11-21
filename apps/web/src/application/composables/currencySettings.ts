import type { Rate } from '@briochett/contracts';

export type EditableCurrency = 'USD' | 'VES';

export function ratePayload(currency: EditableCurrency, value: string) {
  return currency === 'USD'
    ? ({ currency: 'COP', rate: value } as const)
    : ({ currency: 'VES', rate: value, rateUnit: 'COP_per_VES' } as const);
}

export function currencySettings(rates: Rate[]) {
  return {
    usd: rates.find((item) => item.currency === 'COP'),
    ves: rates.find((item) => item.currency === 'VES' && item.rateBase === 'VES'),
  };
}

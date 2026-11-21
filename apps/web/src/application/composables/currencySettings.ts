import type { Rate } from '@briochett/contracts';

export type EditableCurrency = 'USD' | 'VES';

// The API stores both exchange rates as units per USD.
export function ratePayload(currency: EditableCurrency, value: string) {
  return { currency: currency === 'USD' ? 'COP' : 'VES', rate: value } as const;
}

export function currencySettings(rates: Rate[]) {
  const usd = rates.find((item) => item.currency === 'COP');
  const ves = rates.find((item) => item.currency === 'VES');
  const copPerVes = usd && ves ? Number(usd.rate) / Number(ves.rate) : null;
  return { usd, ves, copPerVes };
}

import { describe, expect, it } from 'vitest';
import type { Rate } from '@briochett/contracts';
import {
  currencySettings,
  ratePayload,
} from '../apps/web/src/application/composables/currencySettings';

const rate = (currency: Rate['currency'], value: string): Rate => ({
  id: currency,
  currency,
  rate: value,
  createdAt: '2026-01-01',
  createdBy: 'Administración',
});
describe('configuración de monedas', () => {
  it('guarda las cotizaciones de dólar y bolívar con sus unidades correctas', () => {
    expect(ratePayload('USD', '4000')).toEqual({ currency: 'COP', rate: '4000' });
    expect(ratePayload('VES', '100')).toEqual({ currency: 'VES', rate: '100' });
  });
  it('muestra la equivalencia del bolívar en pesos solo si existen ambas tasas', () => {
    expect(currencySettings([rate('COP', '4000'), rate('VES', '100')]).copPerVes).toBe(40);
    expect(currencySettings([rate('VES', '100')]).copPerVes).toBeNull();
  });
});

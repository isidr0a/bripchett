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
  rateBase: currency === 'VES' ? 'VES' : 'USD',
});
describe('configuración de monedas', () => {
  it('guarda las cotizaciones de dólar y bolívar con sus unidades correctas', () => {
    expect(ratePayload('USD', '4000')).toEqual({ currency: 'COP', rate: '4000' });
    expect(ratePayload('VES', '100')).toEqual({
      currency: 'VES',
      rate: '100',
      rateUnit: 'COP_per_VES',
    });
  });
  it('usa tasas independientes en pesos para cada moneda', () => {
    expect(currencySettings([rate('COP', '4000'), rate('VES', '40')]).ves?.rate).toBe('40');
    expect(currencySettings([rate('VES', '40')]).ves?.rate).toBe('40');
    expect(currencySettings([{ ...rate('VES', '100'), rateBase: 'USD' }]).ves).toBeUndefined();
  });
});

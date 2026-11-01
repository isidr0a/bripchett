import { describe, expect, it } from 'vitest';
import { recurringRouteDates, routeSchema, addCalendarDays } from '@briochett/contracts';

describe('Calendario de rutas recurrentes', () => {
  it('mantiene los días semanales al cruzar meses y años', () => {
    expect(
      recurringRouteDates('2026-12-28', { frequency: 'semanal', until: '2027-01-11' }),
    ).toEqual(['2026-12-28', '2027-01-04', '2027-01-11']);
    expect(
      recurringRouteDates('2028-02-21', { frequency: 'quincenal', until: '2028-03-06' }),
    ).toEqual(['2028-02-21', '2028-03-06']);
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('repite el mismo día y posición del mes, omitiendo meses sin quinta ocurrencia', () => {
    expect(
      recurringRouteDates('2026-11-02', { frequency: 'mensual', until: '2027-02-28' }),
    ).toEqual(['2026-11-02', '2026-12-07', '2027-01-04', '2027-02-01']);
    expect(
      recurringRouteDates('2026-11-30', { frequency: 'mensual', until: '2027-03-31' }),
    ).toEqual(['2026-11-30', '2027-03-29']);
    expect(
      recurringRouteDates('2028-01-31', { frequency: 'mensual', until: '2028-05-31' }),
    ).toEqual(['2028-01-31', '2028-05-29']);
  });
  it('valida la fecha final, el mínimo de fechas y el límite de un año', () => {
    const input = {
      name: 'Ruta de prueba',
      sellerId: 'seller',
      date: '2027-01-04',
      stops: [{ clientId: 'client', time: '09:00' }],
    };
    expect(routeSchema.parse(input).recurrence).toBeNull();
    for (const until of ['2027-01-03', '2027-01-05', '2030-01-01'])
      expect(
        routeSchema.safeParse({ ...input, recurrence: { frequency: 'semanal', until } }).success,
      ).toBe(false);
    expect(recurringRouteDates(input.date, { frequency: 'semanal', until: '2030-01-01' })).toEqual(
      [],
    );
    expect(
      routeSchema.safeParse({ ...input, recurrence: { frequency: 'semanal', until: '2028-01-04' } })
        .success,
    ).toBe(true);
  });
});

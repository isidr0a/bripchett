import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { visitDaysSchema, type Client } from '@briochett/contracts';
import {
  useVisitAvailability,
  visitPresets,
} from '../apps/web/src/application/composables/useVisitAvailability';
import { visitFits } from '../apps/api/src/domain/scheduling';

const sample: Client = {
  id: 'sample',
  code: 'SAMPLE',
  name: 'Comercio',
  rif: '',
  contact: '',
  phone: '',
  address: '',
  zoneId: 'centro',
  zone: 'Centro',
  sellerId: null,
  sellerName: null,
  active: true,
  geo: null,
  visitDays: [1],
  recurrence: 'quincenal',
  recurrenceStart: '2026-11-02',
  updatedAt: '2026-11-01T00:00:00Z',
};
describe('Días de visita', () => {
  it.each(visitPresets)('$name aplica solo sus días sin crear franjas', ({ days }) => {
    const selected = ref<number[]>([]);
    const calendar = useVisitAvailability(selected);
    calendar.applyPreset(days);
    expect(calendar.week.value.filter((day) => day.selected).map((day) => day.day)).toEqual(days);
    calendar.toggleDay(days[0]);
    expect(calendar.presetSelected(days)).toBe(false);
  });
  it('acepta cualquier hora del día en Caracas y rechaza los otros días y semanas', () => {
    expect(visitFits(sample, '2026-11-02T04:00:00Z')).toBe(true);
    expect(visitFits(sample, '2026-11-03T03:59:59Z')).toBe(true);
    expect(visitFits(sample, '2026-11-03T04:00:00Z')).toBe(false);
    expect(visitFits(sample, '2026-11-09T04:00:00Z')).toBe(false);
    expect(visitFits({ ...sample, visitDays: [] }, '2026-11-16T13:00:00Z')).toBe(false);
    expect(visitDaysSchema.safeParse([1, 1]).success).toBe(false);
  });
});

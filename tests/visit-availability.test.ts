import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { slotSchema, type Client, type VisitSlot } from '@briochett/contracts';
import {
  useVisitAvailability,
  visitPresets,
  anyTimeSlot,
} from '../apps/web/src/application/composables/useVisitAvailability';
import { visitFits } from '../apps/api/src/domain/scheduling';
import { visitSlotTime } from '../apps/web/src/shared/formatters';

describe('Disponibilidad semanal', () => {
  it.each(visitPresets)(
    '$name habilita únicamente los días del grupo, sin restringir horarios',
    ({ days }) => {
      const slots = ref<VisitSlot[]>([]);
      const grid = useVisitAvailability(slots);
      grid.applyPreset(days);
      expect(grid.week.value.filter((day) => day.selected).map((day) => day.day)).toEqual(days);
      expect(slots.value.every((slot) => slot.allDay)).toBe(true);
      expect(grid.presetSelected(days)).toBe(true);
      for (const slot of slots.value) expect(slotSchema.safeParse(slot).success).toBe(true);
    },
  );

  it('conserva las franjas existentes al abrir la grilla y aplicar un grupo', () => {
    const existing = [
      { day: 1, start: '08:00', end: '12:00' },
      { day: 1, start: '14:00', end: '18:00' },
    ];
    const slots = ref<VisitSlot[]>(structuredClone(existing));
    const grid = useVisitAvailability(slots);
    expect(grid.week.value.find((day) => day.day === 1)?.allDay).toBe(false);
    grid.applyPreset([1, 2, 3, 4, 5]);
    expect(slots.value.filter((slot) => slot.day === 1)).toEqual(existing);
    expect(slots.value.filter((slot) => slot.day !== 1).every((slot) => slot.allDay)).toBe(true);
    grid.toggleAnyTime(1);
    expect(slots.value.filter((slot) => slot.day === 1)).toEqual([anyTimeSlot(1)]);
    grid.toggleAnyTime(1);
    expect(slots.value.filter((slot) => slot.day === 1)).toEqual([
      { day: 1, start: '08:00', end: '18:00' },
    ]);
  });

  it('agrega y quita días y franjas sin modificar los otros días', () => {
    const slots = ref<VisitSlot[]>([anyTimeSlot(2)]);
    const grid = useVisitAvailability(slots);
    grid.toggleDay(1);
    grid.toggleAnyTime(1);
    grid.addSlot(1);
    expect(grid.week.value.find((day) => day.day === 1)?.entries).toHaveLength(2);
    grid.removeSlot(slots.value.at(-1)!);
    expect(grid.week.value.find((day) => day.day === 1)?.entries).toHaveLength(1);
    grid.toggleDay(1);
    expect(slots.value).toEqual([anyTimeSlot(2)]);
    expect(grid.presetSelected([1, 2, 3, 4, 5])).toBe(false);
  });

  it('respeta el límite de franjas sin borrar horarios existentes', () => {
    const slots = ref<VisitSlot[]>(
      Array.from({ length: 21 }, () => ({ day: 1, start: '08:00', end: '12:00' })),
    );
    const grid = useVisitAvailability(slots);
    grid.applyPreset([1, 2, 3, 4, 5]);
    expect(slots.value).toHaveLength(21);
    expect(grid.error.value).toContain('21 franjas');
    grid.toggleDay(2);
    expect(slots.value).toHaveLength(21);
    grid.addSlot(1);
    expect(slots.value).toHaveLength(21);
    grid.removeSlot(slots.value[0]);
    expect(slots.value).toHaveLength(20);
    expect(grid.error.value).toBe('');
  });

  const client: Client = {
    id: 'test',
    code: 'test',
    name: 'Negocio de prueba',
    rif: '',
    contact: '',
    phone: '',
    address: '',
    zone: '',
    sellerId: null,
    sellerName: null,
    active: true,
    geo: null,
    slots: [anyTimeSlot(1)],
    recurrence: 'semanal',
    recurrenceStart: '2026-11-02',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  it('cualquier horario incluye medianoche y el último minuto, únicamente en el día permitido de Caracas', () => {
    expect(visitFits(client, '2026-11-02T04:00:00Z')).toBe(true);
    expect(visitFits(client, '2026-11-03T03:59:59Z')).toBe(true);
    expect(visitFits(client, '2026-11-03T04:00:00Z')).toBe(false);
    expect(visitFits(client, '2026-11-02T03:59:59Z')).toBe(false);
    expect(visitSlotTime(client.slots[0])).toBe('Cualquier horario');
  });
  it('mantiene las restricciones de franjas y recurrencia', () => {
    const restricted = { ...client, slots: [{ day: 1, start: '08:00', end: '12:00' }] };
    expect(visitFits(restricted, '2026-11-02T11:59:00Z')).toBe(false);
    expect(visitFits(restricted, '2026-11-02T12:00:00Z')).toBe(true);
    expect(visitFits(restricted, '2026-11-02T16:00:00Z')).toBe(false);
    expect(visitFits({ ...client, recurrence: 'quincenal' }, '2026-11-09T13:00:00Z')).toBe(false);
    expect(slotSchema.safeParse({ day: 1, start: '12:00', end: '08:00' }).success).toBe(false);
  });
});

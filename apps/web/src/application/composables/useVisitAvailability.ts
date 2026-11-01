import { computed, ref, type Ref } from 'vue';
import type { VisitSlot } from '@briochett/contracts';

export const visitDays = [
  { day: 1, name: 'Lunes' },
  { day: 2, name: 'Martes' },
  { day: 3, name: 'Miércoles' },
  { day: 4, name: 'Jueves' },
  { day: 5, name: 'Viernes' },
  { day: 6, name: 'Sábado' },
  { day: 0, name: 'Domingo' },
];
export const visitPresets = [
  { name: 'Todos los días', days: [1, 2, 3, 4, 5, 6, 0] },
  { name: 'Entre semana', days: [1, 2, 3, 4, 5] },
  { name: 'Fines de semana', days: [6, 0] },
];
export const anyTimeSlot = (day: number): VisitSlot => ({
  day,
  allDay: true,
  start: '00:00',
  end: '23:59',
});

export function useVisitAvailability(slots: Ref<VisitSlot[]>) {
  const error = ref('');
  function replaceSlots(next: VisitSlot[]) {
    error.value = '';
    if (next.length > 21) {
      error.value = 'Se permiten hasta 21 franjas. Quita alguna antes de agregar más días.';
      return;
    }
    slots.value = next;
  }
  const week = computed(() =>
    visitDays.map((day) => {
      const entries = slots.value.filter((slot) => slot.day === day.day);
      return {
        ...day,
        entries,
        selected: entries.length > 0,
        allDay: entries.some((slot) => slot.allDay),
      };
    }),
  );
  function toggleDay(day: number) {
    replaceSlots(
      slots.value.some((slot) => slot.day === day)
        ? slots.value.filter((slot) => slot.day !== day)
        : [...slots.value, anyTimeSlot(day)],
    );
  }
  function applyPreset(days: number[]) {
    replaceSlots(
      days.flatMap((day) => {
        const existing = slots.value.filter((slot) => slot.day === day);
        return existing.length ? existing : [anyTimeSlot(day)];
      }),
    );
  }
  function presetSelected(days: number[]) {
    const selected = week.value.filter((day) => day.selected).map((day) => day.day);
    return selected.length === days.length && days.every((day) => selected.includes(day));
  }
  function toggleAnyTime(day: number) {
    const allDay = slots.value.some((slot) => slot.day === day && slot.allDay);
    replaceSlots([
      ...slots.value.filter((slot) => slot.day !== day),
      ...(allDay ? [{ day, start: '08:00', end: '18:00' }] : [anyTimeSlot(day)]),
    ]);
  }
  function addSlot(day: number) {
    replaceSlots([...slots.value, { day, start: '08:00', end: '18:00' }]);
  }
  function removeSlot(slot: VisitSlot) {
    replaceSlots(slots.value.filter((entry) => entry !== slot));
  }
  return {
    week,
    error,
    toggleDay,
    applyPreset,
    presetSelected,
    toggleAnyTime,
    addSlot,
    removeSlot,
  };
}
